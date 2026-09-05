/**
 * Mirrors the Kajabi site to disk.
 *
 * For every page it reaches it saves the rendered HTML, a readable markdown
 * copy, a full-page screenshot and a structured JSON record (images, links,
 * PDFs, forms, video embeds, tracking tags, lesson syllabus, quiz questions).
 * Then it downloads every asset those pages referenced.
 *
 *   npm run crawl
 *   node crawl.js --max-pages 800 --no-screenshots
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { config, paths, requireSite } from './config.js';
import { pageExtractor } from './lib/extract.js';
import {
  ensureDir, exists, readJson, writeJson, writeText, slugForUrl, normalizeUrl,
  localPathForAsset, download, pool, humanBytes, sleep, c,
} from './lib/util.js';

const site = requireSite();
const origin = new URL(site).origin;
const includeRe = config.include ? new RegExp(config.include, 'i') : null;
const excludeRe = config.exclude ? new RegExp(config.exclude, 'i') : null;

// ── State ────────────────────────────────────────────────────────────────────

const queue = [];
const queued = new Set();
const visited = new Map(); // url -> record summary
const failures = [];
const assetUrls = new Map(); // url -> {url, from[], kind}
const networkHosts = new Map(); // third-party host -> hit count

function enqueue(rawUrl, depth = 0, from = null) {
  const url = normalizeUrl(rawUrl, site);
  if (!url) return;
  if (queued.has(url)) return;
  if (new URL(url).origin !== origin) return;
  const p = new URL(url).pathname + new URL(url).search;
  if (excludeRe?.test(p)) return;
  if (includeRe && !includeRe.test(p)) return;
  queued.add(url);
  queue.push({ url, depth, from });
}

function noteAsset(rawUrl, kind, from) {
  if (!rawUrl) return;
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return;
  }
  if (!/^https?:$/.test(u.protocol)) return;
  const key = u.toString();
  const ext = path.extname(u.pathname).toLowerCase();
  const hostAllowed =
    u.origin === origin || config.assetHosts.some((h) => u.hostname.includes(h));
  const extAllowed = config.assetExtensions.includes(ext);
  // Kajabi image URLs often carry no extension; allow them from known hosts.
  if (!hostAllowed && !extAllowed) return;
  if (!extAllowed && !hostAllowed) return;

  const existing = assetUrls.get(key);
  if (existing) {
    if (from && !existing.from.includes(from)) existing.from.push(from);
    return;
  }
  assetUrls.set(key, { url: key, kind, from: from ? [from] : [] });
}

// ── Browser ──────────────────────────────────────────────────────────────────

await ensureDir(config.outDir);

const usingChromeProfile = Boolean(config.chromeProfile);
const savedSession = await exists(config.statePath);
const hasSession = usingChromeProfile || savedSession;

if (!hasSession) {
  console.log(
    c.yellow(
      '  ! No saved session (.auth/storageState.json).\n' +
        '    Public pages will export fine, but member programs, lessons and\n' +
        '    videos will be missed. Run `npm run login` first for a full export,\n' +
        '    or reuse a Chrome profile with --chrome-profile "Default".\n'
    )
  );
}

console.log(`${c.bold('Crawling')} ${c.cyan(site)}\n  → ${c.dim(config.outDir)}\n`);

let browser = null;
let context;

if (usingChromeProfile) {
  console.log(
    c.dim(`  using Chrome profile "${config.chromeProfile}" — Chrome must be quit\n`)
  );
  try {
    // Drives the real Chrome against the real profile, so Chrome decrypts its
    // own cookies. We never read, copy or decrypt the cookie store ourselves.
    context = await chromium.launchPersistentContext(config.chromeUserDataDir, {
      channel: 'chrome',
      headless: !config.headed,
      viewport: { width: 1440, height: 1000 },
      args: [`--profile-directory=${config.chromeProfile}`],
      timeout: 45000, // Chrome refuses outright; no point waiting the full 3 min
    });
  } catch (err) {
    const msg = String(err);
    if (/non-default data directory|Timeout.*launchPersistentContext/i.test(msg)) {
      console.error(
        c.red('\n  ✗ Chrome will not allow automation against this profile.\n\n') +
          '    Chrome blocks the DevTools protocol whenever the profile lives in its\n' +
          '    standard user-data directory — a security measure, not a misconfiguration.\n' +
          '    Quitting Chrome does not change it, and there is no flag that overrides it.\n\n' +
          `    ${c.bold('Use a captured session instead:')}\n\n` +
          `      ${c.bold('node login.js')}   ${c.dim('— log in once in a separate window, then close it')}\n` +
          `      ${c.bold('node crawl.js')}   ${c.dim('— picks up the saved session automatically')}\n`
      );
    } else if (/ProcessSingleton|profile.*in use|SingletonLock|Failed to create/i.test(msg)) {
      console.error(
        c.red('\n  ✗ Chrome is still running.\n\n') +
          '    Quit it completely (⌘Q, not just closing the window) and re-run.\n' +
          '    Chrome holds an exclusive lock on its profile while open.\n'
      );
    } else {
      console.error(c.red(`\n  ✗ Could not launch Chrome with that profile:\n    ${msg}\n`));
    }
    process.exit(1);
  }
} else {
  browser = await chromium.launch({ headless: !config.headed });
  context = await browser.newContext({
    userAgent: config.userAgent,
    viewport: { width: 1440, height: 1000 },
    ...(savedSession ? { storageState: config.statePath } : {}),
  });
}

context.setDefaultTimeout(config.timeoutMs);

// Pre-flight: confirm the session really is signed in before spending half an
// hour on a crawl. A failed Kajabi login still leaves a full-looking cookie jar,
// so the only honest test is whether a members-only page serves content.
if (hasSession) {
  const probe = await context.newPage();
  try {
    const res = await probe.goto(new URL('/library', site).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    const status = res?.status() ?? 0;
    const bounced = /login|sign[_-]?in/i.test(new URL(probe.url()).pathname);
    if (status >= 400 || bounced) {
      console.error(
        c.red('  ✗ The saved session is not signed in.\n\n') +
          `    /library answered ${status} → ${new URL(probe.url()).pathname}\n\n` +
          '    Crawling now would produce a public-only export that looks complete.\n' +
          `    Re-run ${c.bold('node login.js')} and check it reports "Signed in".\n\n` +
          `    ${c.dim('To crawl just the public site on purpose, delete .auth/storageState.json.')}\n`
      );
      await probe.close();
      await (browser ? browser.close() : context.close());
      process.exit(1);
    }
    console.log(c.green('  ✓ session verified — member area reachable\n'));
  } catch (err) {
    console.log(c.yellow(`  ! Could not verify the session (${String(err).split('\n')[0]}) — continuing.\n`));
  } finally {
    await probe.close().catch(() => {});
  }
}

// Watch every request so third-party integrations show up even when they're
// injected by a script we never parse.
context.on('request', (req) => {
  try {
    const host = new URL(req.url()).hostname;
    if (host !== new URL(site).hostname) {
      networkHosts.set(host, (networkHosts.get(host) ?? 0) + 1);
    }
  } catch {
    /* ignore */
  }
});

// ── Seeds ────────────────────────────────────────────────────────────────────

enqueue(site, 0);
for (const s of config.memberSeeds) enqueue(new URL(s, site).toString(), 0);
for (const s of config.seeds) enqueue(s, 0);

// Kajabi publishes a sitemap on most plans — the fastest way to find the
// orphaned sales/VSL pages that nothing links to.
try {
  const res = await fetch(new URL('/sitemap.xml', site), {
    headers: { 'user-agent': config.userAgent },
  });
  if (res.ok) {
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
    let added = 0;
    for (const loc of locs) {
      if (/\.xml$/i.test(loc)) continue; // sitemap index entry
      if (!queued.has(normalizeUrl(loc, site))) added += 1;
      enqueue(loc, 0, 'sitemap.xml');
    }
    console.log(c.dim(`  sitemap.xml → ${locs.length} urls (${added} new)`));
  }
} catch {
  console.log(c.dim('  sitemap.xml → not available'));
}

// ── Page worker ──────────────────────────────────────────────────────────────

async function autoScroll(page) {
  // Kajabi lazy-loads images on long sales pages; without this we save a page
  // full of 1px placeholders.
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const step = 600;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight + 1000 || total > 40000) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 60);
    });
  });
  await page.waitForTimeout(400);
}

async function crawlOne(page, job) {
  const { url, depth } = job;
  const slug = slugForUrl(url);
  const dir = path.join(paths.pages, slug);

  if (config.resume && (await exists(path.join(dir, 'page.json')))) {
    const prior = await readJson(path.join(dir, 'page.json'));
    if (prior) {
      for (const l of prior.links ?? []) if (!l.external) enqueue(l.href, depth + 1, url);
      for (const i of prior.images ?? []) noteAsset(i.url, 'image', url);
      for (const d of prior.documents ?? []) noteAsset(d.href, 'document', url);
      visited.set(url, { slug, title: prior.title, resumed: true });
      return { skipped: true };
    }
  }

  let response;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeoutMs });
  } catch (err) {
    failures.push({ url, error: String(err).split('\n')[0] });
    return { failed: true };
  }

  const status = response?.status() ?? 0;
  if (status >= 400) {
    failures.push({ url, status });
    return { failed: true };
  }

  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 });
  } catch {
    /* good enough — some Kajabi pages never go idle */
  }
  await autoScroll(page);

  const data = await page.evaluate(pageExtractor);
  data.requestedUrl = url;
  data.finalUrl = page.url();
  data.status = status;

  // A redirect means the folder is named after the URL we asked for while the
  // content belongs to somewhere else. Record the hop — it belongs in the
  // redirect map — and claim the destination so it isn't crawled again as a
  // second copy under its own slug.
  const finalNorm = normalizeUrl(page.url(), site);
  if (finalNorm && finalNorm !== url) {
    data.redirectedFrom = url;
    queued.add(finalNorm);
  }
  data.depth = depth;
  data.slug = slug;
  data.crawledAt = new Date().toISOString();

  await ensureDir(dir);
  await writeText(path.join(dir, 'page.html'), await page.content());
  await writeJson(path.join(dir, 'page.json'), data);
  await writeText(
    path.join(dir, 'content.md'),
    `<!-- ${data.finalUrl}\n     title: ${data.title ?? ''}\n     exported: ${data.crawledAt} -->\n\n` +
      `# ${data.title ?? slug}\n\n${data.markdown}\n`
  );

  if (config.screenshots) {
    try {
      await page.screenshot({
        path: path.join(dir, 'screenshot.jpg'),
        fullPage: true,
        type: 'jpeg',
        quality: 78,
      });
    } catch {
      /* over-long pages can exceed the surface limit; not fatal */
    }
  }

  for (const l of data.links) if (!l.external) enqueue(l.href, depth + 1, url);
  for (const i of data.images) noteAsset(i.url, 'image', url);
  for (const d of data.documents) noteAsset(d.href, 'document', url);
  for (const f of data.forms) if (f.action) noteAsset(f.action, 'form-action', url);

  visited.set(url, {
    slug,
    title: data.title,
    finalUrl: data.finalUrl,
    forms: data.forms.length,
    optIns: data.forms.filter((f) => f.isOptIn).length,
    videos: data.videos.length,
    images: data.images.length,
    documents: data.documents.length,
    pixels: data.tracking.pixels,
    syllabus: data.syllabus.length,
    quiz: data.quiz.detected,
    loggedOut: data.looksLoggedOut,
  });

  return { ok: true, data };
}

// ── Dynamic worker pool over a growing queue ─────────────────────────────────

let processed = 0;
let sessionWarned = false;

async function worker(id) {
  const page = await context.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  try {
    for (;;) {
      const job = queue.shift();
      if (!job) {
        // Another worker may still be discovering links — wait briefly.
        await sleep(250);
        if (queue.length === 0) return;
        continue;
      }
      if (processed >= config.maxPages) return;
      processed += 1;
      const n = processed;

      const result = await crawlOne(page, job);
      const mark = result.skipped
        ? c.dim('·')
        : result.failed
          ? c.red('✗')
          : c.green('✓');
      const label = new URL(job.url).pathname + new URL(job.url).search;
      console.log(
        `  ${mark} ${String(n).padStart(4)}/${config.maxPages} ` +
          `${c.dim(`[q${queue.length}]`)} ${label.slice(0, 90)}`
      );

      if (result.data?.looksLoggedOut && !sessionWarned) {
        sessionWarned = true;
        console.log(
          c.yellow(
            '\n  ! A page returned a login form — the saved session may have expired.\n' +
              '    Re-run `npm run login`, then re-run the crawl (it resumes).\n'
          )
        );
      }

      if (config.delayMs) await sleep(config.delayMs);
    }
  } finally {
    await page.close().catch(() => {});
  }
}

const started = Date.now();
await Promise.all(
  Array.from({ length: config.concurrency }, (_, i) => worker(i))
);

if (queue.length > 0) {
  console.log(
    c.yellow(
      `\n  ! Stopped at the --max-pages limit with ${queue.length} URLs still queued.\n` +
        `    Re-run with --max-pages ${config.maxPages * 2} to go deeper (it resumes).`
    )
  );
}

// ── Assets ───────────────────────────────────────────────────────────────────

console.log(`\n${c.bold('Downloading assets')} — ${assetUrls.size} unique files\n`);

const assetList = [...assetUrls.values()];
let bytes = 0;
let okCount = 0;
const assetResults = await pool(assetList, 6, async (asset, i) => {
  const dest = localPathForAsset(paths.assets, asset.url);
  if (await exists(dest)) {
    okCount += 1;
    return { ...asset, localPath: path.relative(config.outDir, dest), cached: true };
  }
  const res = await download(asset.url, dest, {
    headers: { 'user-agent': config.userAgent, referer: site },
  });
  if (res.ok) {
    okCount += 1;
    bytes += res.bytes;
    if ((i + 1) % 25 === 0 || i === assetList.length - 1) {
      console.log(
        c.dim(`  ${okCount}/${assetList.length} downloaded · ${humanBytes(bytes)}`)
      );
    }
    return {
      ...asset,
      localPath: path.relative(config.outDir, dest),
      bytes: res.bytes,
      contentType: res.contentType,
    };
  }
  return { ...asset, failed: true, status: res.status ?? null, error: res.error ?? null };
});

// ── Manifest ─────────────────────────────────────────────────────────────────

const manifest = {
  site,
  exportedAt: new Date().toISOString(),
  durationSeconds: Math.round((Date.now() - started) / 1000),
  authenticated: hasSession,
  sessionSource: usingChromeProfile
    ? `chrome-profile:${config.chromeProfile}`
    : savedSession
      ? 'storageState'
      : 'anonymous',
  counts: {
    pagesCrawled: visited.size,
    pagesFailed: failures.length,
    queueRemaining: queue.length,
    assetsFound: assetList.length,
    assetsDownloaded: assetResults.filter((a) => !a.failed).length,
    assetsFailed: assetResults.filter((a) => a.failed).length,
  },
  pages: Object.fromEntries(visited),
  assets: assetResults,
  failures,
  thirdPartyHosts: Object.fromEntries(
    [...networkHosts.entries()].sort((a, b) => b[1] - a[1])
  ),
};
await writeJson(paths.manifest, manifest);

// A persistent context owns its browser; closing the context shuts it down.
await (browser ? browser.close() : context.close());

console.log(`
${c.green(c.bold('Crawl complete'))}

  pages      ${visited.size} saved${failures.length ? c.red(`, ${failures.length} failed`) : ''}
  assets     ${manifest.counts.assetsDownloaded}/${assetList.length} downloaded (${humanBytes(bytes)} new)
  output     ${config.outDir}

  Next:
    ${c.bold('node videos.js --inventory-only')}   ${c.dim('catalogue videos, download nothing')}
    ${c.bold('node report.js')}                    ${c.dim('what was found vs. the checklist')}

  ${c.dim('`node videos.js` without --inventory-only downloads every video file.')}
  ${c.dim('Only do that if you do not already hold the masters.')}
${
  queue.length > 0
    ? c.yellow(
        `\n  ! ${queue.length} URLs were left queued — re-run with a higher --max-pages\n` +
          `    to finish them. Already-saved pages are skipped, so it resumes cheaply.\n`
      )
    : ''
}`);
