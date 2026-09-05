/**
 * Opens a browser window so you can log into Kajabi by hand, then saves the
 * resulting session to `.auth/storageState.json` for the crawler to reuse.
 *
 * Your password never touches this code, and 2FA / "confirm it's you" emails /
 * Cloudflare checks all just work — you're the one clicking through them.
 *
 * The session is written continuously while the window is open, so there is
 * nothing to press when you're done: just close the browser.
 *
 *   npm run login
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { config, requireSite } from './config.js';
import { ensureDir, readJson, c } from './lib/util.js';

const site = requireSite();

console.log(`
${c.bold('Kajabi session capture')}

  A browser window is opening at ${c.cyan(site)}.

  ${c.bold('1.')} Log in as the site owner ${c.dim('(an admin account sees every program)')}
  ${c.bold('2.')} Open ${c.dim('Library / My Products')} and click into one lesson, so Kajabi
     issues the member-area cookies too
  ${c.bold('3.')} Close the browser window

  That's it — the session saves itself as you go. Nothing to press here.
  Only cookies are stored, in ${c.dim(path.relative(process.cwd(), config.statePath))}.
`);

await ensureDir(path.dirname(config.statePath));

// A fresh profile, deliberately. Chrome blocks DevTools automation against its
// default user-data-dir, so driving your everyday profile is not an option —
// this window is its own separate browser with its own separate login.
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  userAgent: config.userAgent,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

try {
  await page.goto(site, { waitUntil: 'domcontentloaded', timeout: 60000 });
} catch {
  console.log(c.yellow(`  Couldn't auto-open ${site} — navigate there manually in the window.`));
}

let lastCount = 0;

// Save continuously rather than at the end: if the window is closed abruptly,
// or the browser crashes, whatever was captured up to a few seconds ago is
// already on disk.
const timer = setInterval(async () => {
  try {
    const cookies = await context.cookies();
    await context.storageState({ path: config.statePath });
    if (cookies.length !== lastCount) {
      lastCount = cookies.length;
      process.stdout.write(c.dim(`  ${cookies.length} cookies saved — close the window when done\r`));
    }
  } catch {
    /* context torn down mid-save; the close handler covers it */
  }
}, 2000);

await new Promise((resolve) => browser.on('disconnected', resolve));
clearInterval(timer);

const saved = await readJson(config.statePath);
const cookieCount = saved?.cookies?.length ?? 0;

if (cookieCount === 0) {
  console.log(c.red('\n  ✗ No session captured — nothing was saved.\n'));
  process.exit(1);
}

// ── Prove the session actually works ─────────────────────────────────────────
//
// Counting cookies proves nothing: Kajabi hands `_kjb_session` to anonymous
// visitors too, so a failed login still produces a plausible-looking jar. The
// only trustworthy check is to request a members-only page and see whether it
// serves content or bounces to the login form.

process.stdout.write(c.dim('\n  verifying member access… '));

const probe = await chromium.launch({ headless: true });
const probeCtx = await probe.newContext({ storageState: config.statePath });
const probePage = await probeCtx.newPage();

let authed = false;
let detail = '';
try {
  const res = await probePage.goto(new URL('/library', site).toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  const status = res?.status() ?? 0;
  const landedOn = new URL(probePage.url()).pathname;
  const bounced = /login|sign[_-]?in/i.test(landedOn);
  authed = status < 400 && !bounced;
  detail = `HTTP ${status} → ${landedOn}`;
} catch (err) {
  detail = String(err).split('\n')[0];
}
await probe.close();

if (authed) {
  console.log(c.green('ok\n'));
  console.log(`${c.green(c.bold('  ✓ Signed in'))} — ${cookieCount} cookies, member area reachable.

  Next:
    ${c.bold('node crawl.js')}     ${c.dim('mirror every page, image, PDF and form')}
    ${c.bold('node videos.js --inventory-only')}
    ${c.bold('node report.js')}
`);
} else {
  console.log(c.red('failed\n'));
  console.log(`${c.red(c.bold('  ✗ Not signed in.'))} ${c.dim(`(${detail})`)}

  ${cookieCount} cookies were saved, but they are an ${c.bold('anonymous')} session — the
  member area still redirects to the login form. Crawling now would quietly
  produce a public-only export.

  ${c.bold('Most likely cause:')} ${c.cyan(new URL(site).host)}/login is the ${c.bold('student')} login.
  Your Kajabi owner account lives at ${c.cyan('app.kajabi.com')} and its password does
  not work here. To get a member session:

    1. Sign in to ${c.cyan('app.kajabi.com')} as the site owner
    2. People → find or create a contact using your own email
    3. Grant that contact all three programs (Offers → Grant offer)
    4. Set a password for it, then re-run ${c.bold('node login.js')} using those details

  ${c.dim('Kajabi admin may also offer "Log in as customer" from the contact page,')}
  ${c.dim('which achieves the same thing without a second password.')}
`);
  process.exit(1);
}
