import { db, unwrap } from '../config/supabase.js';

/**
 * Every "can this person watch this?" decision in the platform funnels through
 * this file. The rules, in one place:
 *
 *   public   video → anyone
 *   purchase video → only a user holding a video_entitlement for it
 *   course   video → a user holding a course_entitlement for its course,
 *                    OR a paying subscriber on a tier that unlocks that course
 *
 * The SQL functions `can_access_course` / `can_access_video` implement the same
 * rules for RLS. Keep the two in sync if you change one.
 */

const PAYING_STATUSES = new Set(['active', 'trialing']);

/** True when the user's subscription is currently in good standing. */
export function isSubscriptionActive(profile) {
  return PAYING_STATUSES.has(profile?.subscriptionStatus);
}

/** Course ids unlocked by the user's subscription tier (empty if not paying). */
export async function tierCourseIds(profile) {
  if (!isSubscriptionActive(profile) || !profile?.subscriptionTierId) return [];

  const rows = unwrap(
    await db()
      .from('tier_courses')
      .select('course_id')
      .eq('tier_id', profile.subscriptionTierId),
    'tier courses'
  );

  return rows.map((r) => r.course_id);
}

/** Course ids the user bought outright. */
export async function purchasedCourseIds(userId) {
  if (!userId) return [];
  const rows = unwrap(
    await db().from('course_entitlements').select('course_id').eq('user_id', userId),
    'course entitlements'
  );
  return rows.map((r) => r.course_id);
}

/** Video ids the user bought individually. */
export async function purchasedVideoIds(userId) {
  if (!userId) return [];
  const rows = unwrap(
    await db().from('video_entitlements').select('video_id').eq('user_id', userId),
    'video entitlements'
  );
  return rows.map((r) => r.video_id);
}

/**
 * The user's full entitlement picture in one shot — used by the dashboard and
 * by any page that needs to mark items locked/unlocked.
 */
export async function getEntitlements(profile) {
  if (!profile) {
    return {
      subscriptionStatus: 'none',
      isSubscribed: false,
      courseIds: [],
      videoIds: [],
      purchasedCourseIds: [],
      tierCourseIds: [],
    };
  }

  const [purchased, viaTier, videos] = await Promise.all([
    purchasedCourseIds(profile.id),
    tierCourseIds(profile),
    purchasedVideoIds(profile.id),
  ]);

  return {
    subscriptionStatus: profile.subscriptionStatus ?? 'none',
    isSubscribed: isSubscriptionActive(profile),
    courseIds: [...new Set([...purchased, ...viaTier])],
    videoIds: videos,
    purchasedCourseIds: purchased,
    tierCourseIds: viaTier,
  };
}

/** Can this user access everything inside `courseId`? */
export async function canAccessCourse(profile, courseId) {
  if (!profile || !courseId) return false;

  const owned = unwrap(
    await db()
      .from('course_entitlements')
      .select('course_id')
      .eq('user_id', profile.id)
      .eq('course_id', courseId)
      .maybeSingle(),
    'course entitlement check'
  );
  if (owned) return true;

  if (!isSubscriptionActive(profile) || !profile.subscriptionTierId) return false;

  const viaTier = unwrap(
    await db()
      .from('tier_courses')
      .select('course_id')
      .eq('tier_id', profile.subscriptionTierId)
      .eq('course_id', courseId)
      .maybeSingle(),
    'tier unlock check'
  );
  return Boolean(viaTier);
}

/**
 * Can this user play `video`? `video` is a row with access_type / course_id.
 * A course purchase unlocks that course's videos and nothing else — the
 * course_id on the video row is what scopes it.
 */
export async function canAccessVideo(profile, video) {
  if (!video) return false;
  if (video.access_type === 'public') return true;
  if (!profile) return false;

  if (video.access_type === 'purchase') {
    const owned = unwrap(
      await db()
        .from('video_entitlements')
        .select('video_id')
        .eq('user_id', profile.id)
        .eq('video_id', video.id)
        .maybeSingle(),
      'video entitlement check'
    );
    return Boolean(owned);
  }

  if (video.access_type === 'course') {
    return canAccessCourse(profile, video.course_id);
  }

  return false;
}

/**
 * Records a purchase and grants the matching entitlement. Idempotent: Stripe
 * retries webhooks, and the unique constraint on the checkout session id plus
 * the upserts below make a replay a no-op.
 */
export async function grantPurchase({
  userId,
  type,
  courseId = null,
  videoId = null,
  tierId = null,
  amountCents = 0,
  currency = 'usd',
  checkoutSessionId = null,
  paymentIntentId = null,
  subscriptionId = null,
}) {
  const purchase = unwrap(
    await db()
      .from('purchases')
      .upsert(
        {
          user_id: userId,
          type,
          course_id: courseId,
          video_id: videoId,
          tier_id: tierId,
          amount_cents: amountCents,
          currency,
          stripe_checkout_session_id: checkoutSessionId,
          stripe_payment_intent_id: paymentIntentId,
          stripe_subscription_id: subscriptionId,
        },
        { onConflict: 'stripe_checkout_session_id', ignoreDuplicates: false }
      )
      .select('id')
      .single(),
    'record purchase'
  );

  if (type === 'course' && courseId) {
    unwrap(
      await db()
        .from('course_entitlements')
        .upsert(
          { user_id: userId, course_id: courseId, source: 'purchase', purchase_id: purchase.id },
          { onConflict: 'user_id,course_id', ignoreDuplicates: true }
        ),
      'grant course access'
    );
  }

  if (type === 'video' && videoId) {
    unwrap(
      await db()
        .from('video_entitlements')
        .upsert(
          { user_id: userId, video_id: videoId, source: 'purchase', purchase_id: purchase.id },
          { onConflict: 'user_id,video_id', ignoreDuplicates: true }
        ),
      'grant video access'
    );
  }

  return purchase;
}

/**
 * Logs a recurring subscription payment. Renewals come through as invoices
 * rather than checkout sessions, so without this the ledger would only ever
 * show the first month of every subscription.
 *
 * Idempotent via the unique index on stripe_invoice_id.
 */
export async function recordInvoicePayment({
  userId,
  invoiceId,
  subscriptionId = null,
  tierId = null,
  amountCents = 0,
  currency = 'usd',
}) {
  if (!invoiceId) return null;

  return unwrap(
    await db()
      .from('purchases')
      .upsert(
        {
          user_id: userId,
          type: 'subscription',
          tier_id: tierId,
          amount_cents: amountCents,
          currency,
          stripe_invoice_id: invoiceId,
          stripe_subscription_id: subscriptionId,
        },
        { onConflict: 'stripe_invoice_id', ignoreDuplicates: true }
      )
      .select('id')
      .maybeSingle(),
    'record invoice payment'
  );
}
