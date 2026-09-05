/**
 * Turns the raw export into answers for ProjectNeeds.MD.
 *
 * Produces:
 *   REPORT.md          — the migration checklist, filled in with what was found
 *   findings.json      — the same data, machine-readable
 *   redirects.json     — old Kajabi URL → new site path, ready for next.config.js
 *   opt-in-forms.md    — every email capture form, so none is missed
 *   tracking.md        — pixel and analytics IDs to re-add to the new site
 *   inventory.csv      — one row per page, for ticking off during QA
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { config, paths } from './config.js';
import { readJson, writeJson, writeText, humanBytes, c } from './lib/util.js';

const manifest = await readJson(paths.manifest);
if (!manifest) {
  console.error(c.red('  ✗ No manifest.json — run `npm run crawl` first.'));
  process.exit(1);
}

const rawPages = [];
for (const slug of await fs.readdir(paths.pages).catch(() => [])) {
  const data = await readJson(path.join(paths.pages, slug, 'page.json'));
  if (data) rawPages.push(data);
}
rawPages.sort((a, b) => (a.finalUrl ?? '').localeCompare(b.finalUrl ?? ''));

// Several requested URLs can land on the same page (Kajabi redirects members-
// only paths to /login). Count that destination once, but remember every path
// that reached it — those are exactly the redirects the new site must honour.
const pages = [];
const redirectHops = [];
const byFinal = new Map();
for (const p of rawPages) {
  if (p.redirectedFrom) {
    redirectHops.push({ from: new URL(p.redirectedFrom).pathname, to: new URL(p.finalUrl).pathname });
  }
  const seen = byFinal.get(p.finalUrl);
  if (seen) {
    seen.alsoReachedVia = seen.alsoReachedVia ?? [];
    seen.alsoReachedVia.push(p.requestedUrl);
    continue;
  }
  byFinal.set(p.finalUrl, p);
  pages.push(p);
}

const videoIndex = (await readJson(path.join(paths.videos, 'index.json'))) ?? {
  videos: [],
  totals: {},
};

// ── Aggregate ────────────────────────────────────────────────────────────────

const optIns = [];
const allForms = [];
const pixels = new Map();
const customScripts = new Map();
const documents = new Map();
const syllabi = [];
const quizzes = [];
const socials = new Map();
const priceMentions = new Map();

for (const p of pages) {
  for (const f of p.forms ?? []) {
    const record = { ...f, page: p.finalUrl, pageTitle: p.title };
    allForms.push(record);
    if (f.isOptIn) optIns.push(record);
  }
  for (const px of p.tracking?.pixels ?? []) {
    // The <noscript> fallback carries the same pixel id as the inline script —
    // count it once, or every Meta Pixel is reported twice.
    const type = px.type.replace(/-noscript$/, '');
    const key = `${type}:${px.id}`;
    if (!pixels.has(key)) pixels.set(key, { type, id: px.id, pages: [] });
    const entry = pixels.get(key);
    if (!entry.pages.includes(p.finalUrl)) entry.pages.push(p.finalUrl);
  }
  for (const s of p.tracking?.inline ?? []) {
    const key = s.slice(0, 200);
    if (!customScripts.has(key)) customScripts.set(key, { body: s, pages: [] });
    customScripts.get(key).pages.push(p.finalUrl);
  }
  for (const d of p.documents ?? []) {
    if (!documents.has(d.href)) documents.set(d.href, { ...d, pages: [] });
    documents.get(d.href).pages.push(p.finalUrl);
  }
  if ((p.syllabus ?? []).length > 0) {
    syllabi.push({ page: p.finalUrl, title: p.title, modules: p.syllabus });
  }
  if (p.quiz?.detected) {
    quizzes.push({ page: p.finalUrl, title: p.title, questions: p.quiz.questions ?? [] });
  }
  for (const l of p.links ?? []) {
    if (!l.external) continue;
    const host = new URL(l.href).hostname.replace(/^www\./, '');
    if (/instagram|facebook|tiktok|youtube|twitter|x\.com|linkedin/.test(host)) {
      if (!socials.has(l.href)) socials.set(l.href, { href: l.href, label: l.label, host });
    }
  }
  for (const price of p.prices ?? []) {
    if (!priceMentions.has(price)) priceMentions.set(price, []);
    priceMentions.get(price).push(p.finalUrl);
  }
}

// ── Program → module → lesson tree ───────────────────────────────────────────
//
// Kajabi renders every lesson with the same <title> (the site name) and its
// sidebar markup doesn't match the generic syllabus selectors, so neither is a
// usable source. The URL is: it encodes the hierarchy exactly.
//
//   /products/<program>/categories/<moduleId>/posts/<lessonId>
//
// Module and lesson names come from the headings each page did capture: h1 is
// the module, and the lesson title is the first heading that is neither the
// module name nor Kajabi's "N Lessons" counter.
const LESSON_URL = /\/products\/([^/]+)\/categories\/(\d+)\/posts\/(\d+)/;
const COUNTER = /^\d+\s+lessons?$/i;

const programs = new Map();

for (const p of pages) {
  const m = (p.finalUrl ?? '').match(LESSON_URL);
  if (!m) continue;
  const [, programSlug, moduleId, lessonId] = m;

  if (!programs.has(programSlug)) programs.set(programSlug, { slug: programSlug, modules: new Map() });
  const program = programs.get(programSlug);

  const headings = (p.headings ?? []).map((h) => h.text).filter(Boolean);
  const moduleName = headings[0] ?? null;
  const lessonTitle =
    headings.find((h) => h !== moduleName && !COUNTER.test(h.trim())) ?? `Lesson ${lessonId}`;

  if (!program.modules.has(moduleId)) {
    program.modules.set(moduleId, { id: moduleId, name: moduleName, lessons: [] });
  }
  const mod = program.modules.get(moduleId);
  if (!mod.name && moduleName) mod.name = moduleName;

  mod.lessons.push({
    id: lessonId,
    title: lessonTitle,
    url: p.finalUrl,
    folder: `pages/${p.slug}`,
    videos: (p.videos ?? []).map((v) => `${v.provider}:${v.id}`),
    documents: (p.documents ?? []).length,
    words: (p.markdown ?? '').split(/\s+/).filter(Boolean).length,
  });
}

const programTree = [...programs.values()].map((prog) => ({
  slug: prog.slug,
  modules: [...prog.modules.values()],
  lessonCount: [...prog.modules.values()].reduce((n, m2) => n + m2.lessons.length, 0),
  videoCount: [...prog.modules.values()].reduce(
    (n, m2) => n + m2.lessons.reduce((k, l) => k + l.videos.length, 0),
    0
  ),
}));

await writeJson(path.join(config.outDir, 'programs.json'), {
  note: 'Module/lesson hierarchy rebuilt from lesson URLs. Feeds course creation on the new site.',
  programs: programTree,
});

await writeText(
  path.join(config.outDir, 'PROGRAMS.md'),
  `# Programs\n\n${
    programTree.length === 0
      ? '_No lesson pages found. Was the crawl signed in?_\n'
      : programTree
          .map(
            (prog) =>
              `## ${prog.slug}\n\n` +
              `${prog.modules.length} modules · ${prog.lessonCount} lessons · ${prog.videoCount} videos\n\n` +
              prog.modules
                .map(
                  (mod) =>
                    `### ${mod.name ?? `Module ${mod.id}`}  \n` +
                    `${mod.lessons.length} lessons\n\n` +
                    mod.lessons
                      .map(
                        (l) =>
                          `- **${l.title}**` +
                          `${l.videos.length ? ` · ${l.videos.join(', ')}` : ' · _no video_'}` +
                          `${l.documents ? ` · ${l.documents} download(s)` : ''}` +
                          ` · ${l.words} words  \n  ${l.url}`
                      )
                      .join('\n')
                )
                .join('\n\n')
          )
          .join('\n\n---\n\n')
  }\n`
);

const assetsByKind = {};
for (const a of manifest.assets ?? []) {
  const ext = path.extname(a.url.split('?')[0]).toLowerCase() || '(none)';
  assetsByKind[ext] = (assetsByKind[ext] ?? 0) + 1;
}
const totalAssetBytes = (manifest.assets ?? []).reduce((n, a) => n + (a.bytes ?? 0), 0);

// ── Redirect map ─────────────────────────────────────────────────────────────

/** Best guess at where an old Kajabi path should land on the new site. */
function suggestNewPath(oldPath) {
  const p = oldPath.replace(/\/+$/, '') || '/';
  if (p === '/') return '/';
  if (/^\/(library|products|dashboard)$/.test(p)) return '/dashboard';
  if (/^\/products?\//.test(p)) return `/courses/${p.split('/').filter(Boolean).pop()}`;
  if (/^\/(courses|offers)\//.test(p)) return `/courses/${p.split('/').filter(Boolean).pop()}`;
  if (/^\/blog\//.test(p)) return p;
  if (/^\/(about|contact)/.test(p)) return p;
  if (/policy|privacy/.test(p)) return '/privacy';
  if (/terms|conditions/.test(p)) return '/terms';
  if (/affiliate/.test(p)) return '/affiliate';
  if (/^\/(pages|p)\//.test(p)) return `/${p.split('/').filter(Boolean).pop()}`;
  return null; // needs a human decision
}

const redirects = [];
const seenSources = new Set();
const addRedirect = (oldPath, title) => {
  if (!oldPath || oldPath === '/' || seenSources.has(oldPath)) return;
  seenSources.add(oldPath);
  const destination = suggestNewPath(oldPath);
  redirects.push({
    source: oldPath,
    destination,
    permanent: true,
    title,
    ...(destination ? {} : { TODO: 'decide destination' }),
  });
};

for (const p of pages) {
  if (!p.finalUrl) continue;
  addRedirect(new URL(p.finalUrl).pathname, p.title);
  // Paths that only existed as redirect sources still need an entry, or the
  // old link breaks on the new site.
  for (const via of p.alsoReachedVia ?? []) addRedirect(new URL(via).pathname, p.title);
}
for (const hop of redirectHops) addRedirect(hop.from, `redirected to ${hop.to} on Kajabi`);
await writeJson(path.join(config.outDir, 'redirects.json'), {
  note:
    'Paste the resolved entries into next.config.js under async redirects(). ' +
    'Entries with a null destination need a human decision first.',
  nextConfigSnippet:
    'module.exports = { async redirects() { return require("./redirects.json").redirects } }',
  redirects: redirects.map(({ title, TODO, ...r }) => ({ ...r, ...(TODO ? { TODO } : {}) })),
});

// ── opt-in-forms.md ──────────────────────────────────────────────────────────

await writeText(
  path.join(config.outDir, 'opt-in-forms.md'),
  `# Email capture / opt-in forms\n\n` +
    `${optIns.length} opt-in form${optIns.length === 1 ? '' : 's'} found across ` +
    `${new Set(optIns.map((f) => f.page)).size} pages.\n\n` +
    `Every one of these has to be recreated on the new site **and connected to the new\n` +
    `email system**, or signups silently stop.\n\n` +
    (optIns.length === 0
      ? '_None detected. If you know opt-ins exist, they may be inside an iframe or a\npop-up that only fires on exit intent — check those pages manually._\n'
      : optIns
          .map(
            (f, i) =>
              `## ${i + 1}. ${f.heading ?? f.submitLabel ?? 'Untitled form'}\n\n` +
              `- **Page:** ${f.page}\n` +
              `- **Kajabi form id:** ${f.kajabiFormId ?? '—'}\n` +
              `- **Posts to:** \`${f.action ?? '—'}\` (${f.method})\n` +
              `- **Button:** ${f.submitLabel ?? '—'}\n` +
              `- **Fields:**\n` +
              f.fields
                .map(
                  (x) =>
                    `  - \`${x.name ?? '?'}\` (${x.type})${x.required ? ' **required**' : ''}` +
                    `${x.placeholder ? ` — placeholder: "${x.placeholder}"` : ''}`
                )
                .join('\n')
          )
          .join('\n\n')) +
    `\n\n---\n\n## All forms (including non-opt-in)\n\n` +
    allForms
      .map((f) => `- ${f.isOptIn ? '**opt-in**' : 'other'} · ${f.page} → \`${f.action ?? '—'}\``)
      .join('\n') +
    '\n'
);

// ── tracking.md ──────────────────────────────────────────────────────────────

await writeText(
  path.join(config.outDir, 'tracking.md'),
  `# Tracking & integrations\n\n` +
    `## Pixels and analytics IDs\n\n` +
    (pixels.size === 0
      ? '_None found in page source. Check Kajabi → Settings → Integrations before cancelling._\n'
      : `| Type | ID | Pages |\n|---|---|---|\n` +
        [...pixels.values()]
          .map((p) => `| ${p.type} | \`${p.id}\` | ${p.pages.length} |`)
          .join('\n') +
        '\n') +
    `\n## Third-party hosts contacted while loading\n\n` +
    `Anything here is an integration the new site may need to reproduce.\n\n` +
    `| Host | Requests |\n|---|---|\n` +
    Object.entries(manifest.thirdPartyHosts ?? {})
      .slice(0, 60)
      .map(([h, n]) => `| ${h} | ${n} |`)
      .join('\n') +
    `\n\n## Custom inline scripts\n\n` +
    (customScripts.size === 0
      ? '_None._\n'
      : [...customScripts.values()]
          .map(
            (s, i) =>
              `### Script ${i + 1} — on ${s.pages.length} page(s)\n\n\`\`\`js\n${s.body.slice(0, 2000)}\n\`\`\`\n`
          )
          .join('\n')) +
    '\n'
);

// ── inventory.csv ────────────────────────────────────────────────────────────

const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
await writeText(
  path.join(config.outDir, 'inventory.csv'),
  'url,title,status,images,documents,videos,forms,opt_ins,has_quiz,local_folder,redirected_from,suggested_new_path\n' +
    pages
      .map((p) =>
        [
          p.finalUrl,
          p.title,
          p.status,
          (p.images ?? []).length,
          (p.documents ?? []).length,
          (p.videos ?? []).length,
          (p.forms ?? []).length,
          (p.forms ?? []).filter((f) => f.isOptIn).length,
          p.quiz?.detected ? 'yes' : 'no',
          `pages/${p.slug}`,
          // Explains why a folder name can differ from the URL it holds.
          [p.redirectedFrom, ...(p.alsoReachedVia ?? [])].filter(Boolean).join(' | '),
          suggestNewPath(new URL(p.finalUrl).pathname) ?? '',
        ]
          .map(csvEscape)
          .join(',')
      )
      .join('\n') +
    '\n'
);

// ── findings.json ────────────────────────────────────────────────────────────

const findings = {
  site: manifest.site,
  exportedAt: new Date().toISOString(),
  authenticated: manifest.authenticated,
  pages: pages.length,
  assets: { count: (manifest.assets ?? []).length, bytes: totalAssetBytes, byExtension: assetsByKind },
  videos: videoIndex.totals ?? {},
  optIns: optIns.length,
  forms: allForms.length,
  pixels: [...pixels.values()],
  documents: [...documents.values()],
  syllabi,
  quizzes,
  socials: [...socials.values()],
  prices: [...priceMentions.keys()],
  failures: manifest.failures ?? [],
};
await writeJson(paths.findings, findings);

// ── REPORT.md ────────────────────────────────────────────────────────────────

const tick = (ok) => (ok ? '✅' : '⚠️');
const docCount = documents.size;
const videoDownloaded = videoIndex.totals?.downloaded ?? 0;
const videoTotal = videoIndex.totals?.embeds ?? 0;

const report = `# Kajabi export report

**Site:** ${manifest.site}
**Exported:** ${new Date().toISOString()}
**Session:** ${manifest.authenticated ? 'authenticated (member content included)' : '⚠️ **anonymous** — member programs were NOT captured'}

---

## Against the migration checklist

| Checklist item | Found | Notes |
|---|---|---|
| All pages | ${tick(pages.length > 0)} ${pages.length} | \`pages/<slug>/\` — html, markdown copy, screenshot, json |
| All written content/copy | ${tick(pages.length > 0)} | \`content.md\` per page |
| Images / graphics / logos | ${tick((assetsByKind['.jpg'] ?? 0) + (assetsByKind['.png'] ?? 0) > 0)} ${(manifest.assets ?? []).length} assets | ${humanBytes(totalAssetBytes)} in \`assets/\` |
| PDFs / downloads / resources | ${tick(docCount > 0)} ${docCount} | see table below |
| Videos | ${tick(videoDownloaded > 0)} ${videoDownloaded}/${videoTotal} | \`videos/VIDEOS.md\` |
| Modules / lessons structure | ${tick(programTree.length > 0)} ${programTree.length} programs | ${programTree.map((p) => `${p.modules.length}mod/${p.lessonCount}lessons`).join(', ') || 'none — was the crawl signed in?'} — \`PROGRAMS.md\` |
| Quizzes | ${tick(quizzes.length > 0)} ${quizzes.length} | ${quizzes.length === 0 ? 'none detected' : 'questions captured where rendered'} |
| Opt-in forms | ${tick(optIns.length > 0)} ${optIns.length} | \`opt-in-forms.md\` |
| Buttons and links | ✅ | every \`<a>\` recorded per page in \`page.json\` |
| Social icons | ${tick(socials.size > 0)} ${socials.size} | ${[...new Set([...socials.values()].map((s) => s.host))].join(', ') || '—'} |
| Meta Pixel / GA / scripts | ${tick(pixels.size > 0)} ${pixels.size} | \`tracking.md\` |
| Pricing / offers | ${tick(priceMentions.size > 0)} ${priceMentions.size} distinct | ${[...priceMentions.keys()].slice(0, 12).join(', ') || '—'} |
| URL preservation | ✅ ${redirects.length} | \`redirects.json\` |

### Cannot be scraped — do these by hand in Kajabi before cancelling

- [ ] **Contacts / email list** → Kajabi ▸ People ▸ Contacts ▸ Export CSV (include tags)
- [ ] **Email broadcasts** → Marketing ▸ Emails — save copy of any worth keeping
- [ ] **Email sequences / automations** → Marketing ▸ Automations — screenshot each trigger + steps
- [ ] **Checkout codes** (e.g. \`Free4me\`) → Sales ▸ Coupons/Offers — record code, discount, expiry
- [ ] **Payment processor keys** → Settings ▸ Payments — note which Stripe/PayPal account is connected
- [ ] **Pixel IDs not present in page source** → Settings ▸ Integrations
- [ ] **Domain / DNS** → Settings ▸ Domains — record the current records before the domain is released

---

## Pages (${pages.length})

| URL | Title | Imgs | Docs | Vids | Forms | Quiz |
|---|---|---|---|---|---|---|
${pages
  .map(
    (p) =>
      `| ${p.finalUrl} | ${(p.title ?? '').slice(0, 60)} | ${(p.images ?? []).length} | ` +
      `${(p.documents ?? []).length} | ${(p.videos ?? []).length} | ${(p.forms ?? []).length} | ` +
      `${p.quiz?.detected ? 'yes' : ''} |`
  )
  .join('\n')}

---

## Downloadable resources (${docCount})

${
  docCount === 0
    ? '_None found._'
    : `| File | Label | Linked from |\n|---|---|---|\n` +
      [...documents.values()]
        .map((d) => `| ${d.href} | ${d.label ?? ''} | ${d.pages.length} page(s) |`)
        .join('\n')
}

---

## Program structure (${syllabi.length})

${
  syllabi.length === 0
    ? '_No syllabus detected. If your programs have modules, re-run `npm run login` and\ncrawl again — this only appears inside the member area._'
    : syllabi
        .map(
          (s) =>
            `### ${s.title ?? s.page}\n${s.page}\n\n` +
            s.modules
              .map(
                (m) =>
                  `- **${m.module ?? 'Untitled module'}**\n` +
                  m.lessons.map((l) => `  - ${l.title} — ${l.href}`).join('\n')
              )
              .join('\n')
        )
        .join('\n\n')
}

---

## Quizzes (${quizzes.length})

${
  quizzes.length === 0
    ? '_None detected._'
    : quizzes
        .map(
          (q) =>
            `### ${q.title ?? q.page}\n${q.page}\n\n` +
            q.questions
              .map((x, i) => `${i + 1}. ${x.prompt}\n${x.options.map((o) => `   - ${o}`).join('\n')}`)
              .join('\n\n')
        )
        .join('\n\n')
}

---

## Failures (${(manifest.failures ?? []).length})

${
  (manifest.failures ?? []).length === 0
    ? '_None._'
    : (manifest.failures ?? [])
        .map((f) => `- ${f.url} — ${f.status ?? f.error}`)
        .join('\n')
}
`;

await writeText(paths.report, report);

console.log(`
${c.green(c.bold('Report written'))}

  ${c.bold('REPORT.md')}        the checklist, filled in
  opt-in-forms.md   ${optIns.length} email capture forms
  tracking.md       ${pixels.size} pixel/analytics IDs
  redirects.json    ${redirects.length} old→new URL mappings
  inventory.csv     ${pages.length} pages, for QA tick-off
  findings.json     machine-readable

  ${c.dim(config.outDir)}

${
  manifest.authenticated
    ? ''
    : c.yellow('  ! This was an anonymous crawl — member programs were not captured.\n' +
      '    Run `npm run login` then re-crawl to get modules, lessons and course video.\n')
}`);
