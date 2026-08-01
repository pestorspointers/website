import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import { db, unwrap } from '../config/supabase.js';
import { camelize } from '../lib/case.js';
import { unauthorized } from '../lib/http.js';

/**
 * Verifies a Supabase access token and attaches the caller's profile to
 * `req.user` as { id, email, role, subscriptionStatus, subscriptionTierId }.
 *
 * Supabase projects sign tokens one of two ways:
 *   • asymmetric (ES256/RS256) — verified against the project's JWKS endpoint
 *   • legacy symmetric (HS256) — verified with SUPABASE_JWT_SECRET
 * The token header tells us which, so both work without configuration.
 */

let _jwks;
function jwks() {
  if (!_jwks) {
    const url = process.env.SUPABASE_URL;
    if (!url) throw new Error('SUPABASE_URL is not set');
    _jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  }
  return _jwks;
}

let _legacySecret;
function legacySecret() {
  if (_legacySecret === undefined) {
    const secret = process.env.SUPABASE_JWT_SECRET;
    _legacySecret = secret ? new TextEncoder().encode(secret) : null;
  }
  return _legacySecret;
}

async function verifyToken(token) {
  const issuer = `${process.env.SUPABASE_URL}/auth/v1`;
  const options = { issuer, audience: 'authenticated' };

  const { alg } = decodeProtectedHeader(token);

  if (alg?.startsWith('HS')) {
    const secret = legacySecret();
    if (!secret) {
      throw new Error(
        'Token is HS256-signed but SUPABASE_JWT_SECRET is not set. Copy it from ' +
          'Supabase → Project Settings → API → JWT Settings.'
      );
    }
    return jwtVerify(token, secret, options);
  }

  return jwtVerify(token, jwks(), options);
}

/**
 * Roles live in `profiles`, not in the JWT, so they stay correct the instant an
 * admin changes one. A short TTL cache keeps that from costing a round trip on
 * every single request.
 */
const PROFILE_TTL_MS = 30_000;
const PROFILE_COLUMNS =
  'id, email, full_name, role, subscription_status, subscription_tier_id, stripe_customer_id, current_period_end, cancel_at_period_end';

const profileCache = new Map();

export function invalidateProfile(userId) {
  profileCache.delete(userId);
}

async function loadProfile(userId) {
  const cached = profileCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.profile;

  const row = unwrap(
    await db().from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle(),
    'load profile'
  );

  const profile = row ? camelize(row) : null;
  profileCache.set(userId, { profile, expires: Date.now() + PROFILE_TTL_MS });
  return profile;
}

/**
 * Populates `req.user` when a valid bearer token is present. Never rejects —
 * use it on endpoints whose response varies by login state.
 */
export const optionalAuth = async (req, _res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();

  try {
    const { payload } = await verifyToken(token);
    req.user = (await loadProfile(payload.sub)) ?? undefined;
  } catch {
    // Anonymous is a valid outcome here.
  }
  next();
};

/** Rejects anything without a valid Supabase session. */
export const authenticate = async (req, _res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) throw unauthorized('No access token provided');

  let payload;
  try {
    ({ payload } = await verifyToken(token));
  } catch {
    throw unauthorized('Invalid or expired session');
  }

  let profile = await loadProfile(payload.sub);

  if (!profile) {
    // The auth user exists but has no profile row — possible if the account was
    // created before the trigger was installed. Heal it rather than 500.
    profile = camelize(
      unwrap(
        await db()
          .from('profiles')
          .insert({ id: payload.sub, email: payload.email ?? '' })
          .select(PROFILE_COLUMNS)
          .single(),
        'backfill profile'
      )
    );
    profileCache.set(payload.sub, { profile, expires: Date.now() + PROFILE_TTL_MS });
  }

  req.user = profile;
  next();
};
