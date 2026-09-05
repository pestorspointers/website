/**
 * Everything tunable lives here. Every value can also be overridden with an
 * environment variable or a CLI flag, so you rarely need to edit this file.
 *
 *   KAJABI_SITE=https://www.pestorspointers.com npm run crawl
 *   node crawl.js --max-pages 400 --concurrency 2
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Parse `--flag value` and `--flag=value` out of argv. */
function flags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      out[arg.slice(2)] = next && !next.startsWith('--') ? next : 'true';
      if (next && !next.startsWith('--')) i += 1;
    }
  }
  return out;
}

const cli = flags(process.argv.slice(2));

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  /**
   * The Kajabi site to mirror, with protocol and no trailing slash.
   * This is the ONE thing you must set before running anything.
   */
  site: (cli.site ?? process.env.KAJABI_SITE ?? '').replace(/\/+$/, ''),

  /** Where everything lands. Sits outside the repo by default — it will be big. */
  outDir: path.resolve(cli.out ?? process.env.KAJABI_OUT ?? path.join(HERE, 'export')),

  /** Saved browser session from `npm run login`. */
  statePath: path.join(HERE, '.auth', 'storageState.json'),

  /**
   * Use an existing Chrome profile you're already logged into, instead of
   * `npm run login`. Pass the profile *directory* name — "Default",
   * "Profile 5" — not the display name shown in Chrome's avatar menu.
   *
   *   node crawl.js --chrome-profile Default
   *
   * Chrome must be fully quit first: it holds an exclusive lock on the profile.
   * Nothing reads or copies your cookies — Chrome decrypts its own, as usual.
   */
  chromeProfile: cli['chrome-profile'] ?? process.env.KAJABI_CHROME_PROFILE ?? '',

  chromeUserDataDir:
    cli['chrome-user-data-dir'] ??
    process.env.KAJABI_CHROME_USER_DATA_DIR ??
    path.join(
      process.env.HOME ?? '',
      'Library',
      'Application Support',
      'Google',
      'Chrome'
    ),

  /** Show the browser window. Forced on for `login`; handy for debugging. */
  headed: (cli.headed ?? 'false') !== 'false',

  /** Extra URLs to seed the crawl with, beyond the homepage. */
  seeds: (cli.seeds ?? process.env.KAJABI_SEEDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /**
   * Kajabi member-area entry points. Harmless if they 404 — the crawler skips
   * anything that doesn't resolve, and these are where the programs live.
   */
  memberSeeds: ['/library', '/products', '/dashboard', '/blog', '/store'],

  /** Stop after this many pages. Raise it if the crawl reports a truncated queue. */
  maxPages: num(cli['max-pages'] ?? process.env.KAJABI_MAX_PAGES, 600),

  /** Parallel browser tabs. 3 is polite and plenty fast for a site this size. */
  concurrency: num(cli.concurrency ?? process.env.KAJABI_CONCURRENCY, 3),

  /** Pause between page loads per worker, milliseconds. */
  delayMs: num(cli.delay ?? process.env.KAJABI_DELAY, 400),

  /** Per-page navigation timeout. Kajabi VSL pages can be slow. */
  timeoutMs: num(cli.timeout ?? process.env.KAJABI_TIMEOUT, 45000),

  /** Full-page screenshots. Invaluable when rebuilding layouts; costs disk. */
  screenshots: (cli.screenshots ?? process.env.KAJABI_SCREENSHOTS ?? 'true') !== 'false',

  /** Skip pages already saved, so an interrupted run resumes where it stopped. */
  resume: (cli.resume ?? 'true') !== 'false',

  /** Only crawl paths matching this regex (optional). */
  include: cli.include ?? process.env.KAJABI_INCLUDE ?? '',

  /**
   * Never crawl paths matching this. Logout is the big one — following it kills
   * the session mid-crawl and every subsequent member page comes back empty.
   */
  exclude:
    cli.exclude ??
    process.env.KAJABI_EXCLUDE ??
    '(logout|sign_out|/admin/|/api/|\\.(zip|dmg|exe)$|/cart|checkout/.*\\?)',

  /** Asset extensions worth pulling down. */
  assetExtensions: [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.ico',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.mp3', '.wav', '.m4a', '.zip', '.csv', '.txt',
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
  ],

  /** Hosts we're willing to download assets from (substring match). */
  assetHosts: ['kajabi-cdn.com', 'kajabi.com', 'kajabi-storefronts-production'],

  /** Video download quality when several renditions exist. */
  videoQuality: cli['video-quality'] ?? 'best', // 'best' | 'original' | 'medium'

  /**
   * Catalogue the videos without downloading a byte. Use when you already hold
   * the masters: you still get every Wistia id resolved to a title, duration
   * and the lessons it appears on, which is the mapping you need to attach
   * existing files to courses.
   */
  inventoryOnly: (cli['inventory-only'] ?? 'false') !== 'false',

  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

export const paths = {
  pages: path.join(config.outDir, 'pages'),
  assets: path.join(config.outDir, 'assets'),
  videos: path.join(config.outDir, 'videos'),
  manifest: path.join(config.outDir, 'manifest.json'),
  report: path.join(config.outDir, 'REPORT.md'),
  findings: path.join(config.outDir, 'findings.json'),
};

/** Fail loudly and early rather than crawling `undefined`. */
export function requireSite() {
  if (!config.site || !/^https?:\/\//.test(config.site)) {
    console.error(
      '\n  ✗ No site configured.\n\n' +
        '    Set it once for the shell:\n' +
        '      export KAJABI_SITE=https://www.yourkajabisite.com\n\n' +
        '    …or pass it per command:\n' +
        '      node crawl.js --site https://www.yourkajabisite.com\n'
    );
    process.exit(1);
  }
  return config.site;
}
