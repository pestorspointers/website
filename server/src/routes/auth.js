import { Router } from 'express';
import { db, unwrap } from '../config/supabase.js';
import { authenticate, invalidateProfile } from '../middleware/authenticate.js';
import { camelize, pickSnake } from '../lib/case.js';
import { getEntitlements } from '../services/access.js';

const router = Router();

/**
 * Sign-up / sign-in / password reset are handled by Supabase Auth directly
 * from the browser. What the API owns is everything that hangs off the
 * account: role, billing state, and what the user is entitled to watch.
 */

router.use(authenticate);

// Current user, with their full entitlement picture.
router.get('/me', async (req, res) => {
  const entitlements = await getEntitlements(req.user);

  let tier = null;
  if (req.user.subscriptionTierId) {
    const row = unwrap(
      await db()
        .from('subscription_tiers')
        .select('id, name, description, price_monthly, price_annual')
        .eq('id', req.user.subscriptionTierId)
        .maybeSingle(),
      'load tier'
    );
    tier = row ? camelize(row) : null;
  }

  res.json({ user: { ...req.user, tier }, entitlements });
});

// Let a user edit their own display name. Role and billing columns are not in
// the allowlist, so they can't be escalated through this endpoint.
router.patch('/me', async (req, res) => {
  const updates = pickSnake(req.body, ['fullName']);

  const updated = unwrap(
    await db()
      .from('profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select('id, email, full_name, role')
      .single(),
    'update profile'
  );

  invalidateProfile(req.user.id);
  res.json(camelize(updated));
});

export default router;
