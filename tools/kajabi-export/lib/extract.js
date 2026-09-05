/**
 * Runs *inside the browser page*. Everything it needs must be self-contained —
 * it is serialised across to Chromium, so no imports and no closures.
 *
 * Returns one structured record per page: the copy, every asset reference,
 * every form, every video embed and every tracking tag.
 */
export function pageExtractor() {
  const abs = (u) => {
    try {
      return new URL(u, location.href).toString();
    } catch {
      return null;
    }
  };

  const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  const attr = (el, name) => el?.getAttribute?.(name) ?? null;

  // ── Copy, as markdown ─────────────────────────────────────────────────────
  // Walk the visible DOM and emit something a human can proofread against the
  // rebuilt site. Not a perfect converter — a faithful one.
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE', 'IFRAME', 'CANVAS']);

  function isHidden(el) {
    const s = getComputedStyle(el);
    return s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0;
  }

  function toMarkdown(root) {
    const out = [];
    const seen = new Set();

    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) return;
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node;
      if (SKIP.has(el.tagName)) return;
      let hidden = false;
      try {
        hidden = isHidden(el);
      } catch {
        /* detached node */
      }
      if (hidden) return;

      const tag = el.tagName;

      if (/^H[1-6]$/.test(tag)) {
        const t = text(el);
        if (t && !seen.has(`h:${t}`)) {
          seen.add(`h:${t}`);
          out.push(`${'#'.repeat(Number(tag[1]))} ${t}`);
        }
        return;
      }

      if (tag === 'P' || tag === 'BLOCKQUOTE') {
        const t = text(el);
        if (t && !seen.has(`p:${t}`)) {
          seen.add(`p:${t}`);
          out.push(tag === 'BLOCKQUOTE' ? `> ${t}` : t);
        }
        return;
      }

      if (tag === 'LI') {
        const t = text(el);
        if (t && !seen.has(`li:${t}`)) {
          seen.add(`li:${t}`);
          out.push(`- ${t}`);
        }
        return;
      }

      if (tag === 'IMG') {
        const src = abs(el.getAttribute('src') ?? el.getAttribute('data-src') ?? '');
        if (src) out.push(`![${el.getAttribute('alt') ?? ''}](${src})`);
        return;
      }

      if (tag === 'A') {
        const href = abs(el.getAttribute('href') ?? '');
        const t = text(el);
        // Only emit standalone link-ish elements (buttons/CTAs); inline links
        // get picked up by their containing paragraph.
        if (href && t && el.closest('p') === null && !seen.has(`a:${t}:${href}`)) {
          seen.add(`a:${t}:${href}`);
          out.push(`[${t}](${href})`);
          return;
        }
      }

      for (const child of el.children) walk(child);
    }

    walk(root);
    return out.join('\n\n');
  }

  // ── Images, including CSS backgrounds and srcset ───────────────────────────
  const images = new Map();
  const addImage = (url, meta) => {
    const a = abs(url);
    if (!a || a.startsWith('data:') || a.startsWith('blob:')) return;
    if (!images.has(a)) images.set(a, { url: a, ...meta });
  };

  for (const img of document.querySelectorAll('img')) {
    addImage(img.getAttribute('src') ?? img.getAttribute('data-src') ?? '', {
      alt: img.getAttribute('alt') ?? '',
      width: img.naturalWidth || null,
      height: img.naturalHeight || null,
      source: 'img',
    });
    const srcset = img.getAttribute('srcset') ?? img.getAttribute('data-srcset');
    if (srcset) {
      for (const part of srcset.split(',')) {
        const u = part.trim().split(/\s+/)[0];
        if (u) addImage(u, { alt: img.getAttribute('alt') ?? '', source: 'srcset' });
      }
    }
  }

  for (const source of document.querySelectorAll('source[srcset]')) {
    for (const part of (source.getAttribute('srcset') ?? '').split(',')) {
      const u = part.trim().split(/\s+/)[0];
      if (u) addImage(u, { source: 'picture' });
    }
  }

  for (const el of document.querySelectorAll('*')) {
    let bg = '';
    try {
      bg = getComputedStyle(el).backgroundImage;
    } catch {
      continue;
    }
    if (!bg || bg === 'none') continue;
    for (const m of bg.matchAll(/url\((['"]?)(.*?)\1\)/g)) {
      addImage(m[2], { source: 'css-background' });
    }
  }

  for (const meta of document.querySelectorAll('meta[property^="og:image"], meta[name="twitter:image"]')) {
    addImage(meta.getAttribute('content') ?? '', { source: 'og' });
  }

  // ── Links, split into internal / external / documents ──────────────────────
  const DOC_RE = /\.(pdf|docx?|xlsx?|pptx?|zip|csv|txt|mp3|wav|m4a|epub)(\?|$)/i;
  const links = [];
  const documents = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const href = abs(a.getAttribute('href'));
    if (!href || href.startsWith('javascript:')) continue;
    const label = text(a) || attr(a, 'aria-label') || attr(a, 'title') || '';
    const record = {
      href,
      label,
      external: new URL(href).host !== location.host,
      download: a.hasAttribute('download'),
      // Kajabi renders CTAs as <a> with button styling; worth flagging.
      isButton: /btn|button|cta/i.test(a.className || ''),
    };
    links.push(record);
    if (DOC_RE.test(href) || record.download) documents.push(record);
  }

  // ── Forms and opt-ins ─────────────────────────────────────────────────────
  const forms = [];
  for (const form of document.querySelectorAll('form')) {
    const fields = [...form.querySelectorAll('input, select, textarea')]
      .filter((f) => f.type !== 'hidden' || /email|name|tag|offer|form/i.test(f.name ?? ''))
      .map((f) => ({
        name: f.getAttribute('name'),
        type: f.getAttribute('type') ?? f.tagName.toLowerCase(),
        placeholder: f.getAttribute('placeholder'),
        required: f.hasAttribute('required'),
        label:
          text(form.querySelector(`label[for="${f.id}"]`)) ||
          text(f.closest('label')) ||
          null,
      }));
    const submit = form.querySelector('[type=submit], button');
    const html = form.outerHTML;
    forms.push({
      action: abs(form.getAttribute('action') ?? '') ?? null,
      method: (form.getAttribute('method') ?? 'get').toLowerCase(),
      id: form.id || null,
      className: form.className || null,
      fields,
      submitLabel: text(submit) || attr(submit, 'value') || null,
      // Kajabi stamps opt-in forms with these; they identify which list/tag a
      // signup lands in, which is exactly what has to be rebuilt.
      kajabiFormId:
        attr(form, 'data-kjb-form-id') ??
        (html.match(/form[_-]?id["'\s:=]+(\d{4,})/i)?.[1] ?? null),
      // An email field means lead capture — unless there's a password box, in
      // which case it's the login form and nobody is opting into anything.
      isOptIn:
        fields.some((f) => f.type === 'email' || /email/i.test(f.name ?? '')) &&
        !fields.some((f) => f.type === 'password') &&
        !/search|login|sign[_-]?in/i.test(`${form.className || ''} ${form.id || ''}`) &&
        !/\/(login|sign_in|sessions)\b/i.test(form.getAttribute('action') ?? ''),
      heading:
        text(form.closest('section, div')?.querySelector('h1, h2, h3, h4')) || null,
    });
  }

  // ── Video embeds ──────────────────────────────────────────────────────────
  const videos = [];
  const addVideo = (v) => {
    if (v.id && !videos.some((x) => x.id === v.id && x.provider === v.provider)) videos.push(v);
  };

  for (const el of document.querySelectorAll('[class*="wistia_async_"]')) {
    const m = (el.className || '').match(/wistia_async_([a-zA-Z0-9]{8,})/);
    if (m) addVideo({ provider: 'wistia', id: m[1], source: 'class' });
  }
  for (const el of document.querySelectorAll('[data-wistia-id]')) {
    addVideo({ provider: 'wistia', id: attr(el, 'data-wistia-id'), source: 'data-attr' });
  }
  for (const iframe of document.querySelectorAll('iframe[src]')) {
    const src = iframe.getAttribute('src') ?? '';
    let m;
    if ((m = src.match(/wistia\.(?:net|com)\/embed\/(?:iframe|medias)\/([a-zA-Z0-9]{8,})/))) {
      addVideo({ provider: 'wistia', id: m[1], source: 'iframe', embedUrl: abs(src) });
    } else if ((m = src.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,})/))) {
      addVideo({ provider: 'youtube', id: m[1], source: 'iframe', embedUrl: abs(src) });
    } else if ((m = src.match(/player\.vimeo\.com\/video\/(\d+)/))) {
      addVideo({ provider: 'vimeo', id: m[1], source: 'iframe', embedUrl: abs(src) });
    }
  }
  for (const v of document.querySelectorAll('video')) {
    const src = v.getAttribute('src') || v.querySelector('source')?.getAttribute('src');
    // `blob:` sources are MediaSource handles created by a player at runtime —
    // there is no file behind them to fetch. The real media is the Wistia embed
    // we already captured above.
    if (!src || src.startsWith('blob:') || src.startsWith('data:')) continue;
    addVideo({ provider: 'file', id: abs(src), url: abs(src), source: 'video-tag' });
  }

  // ── Tracking tags ─────────────────────────────────────────────────────────
  const tracking = { pixels: [], scripts: [], inline: [] };
  const html = document.documentElement.outerHTML;

  const patterns = [
    { key: 'meta-pixel', re: /fbq\(\s*['"]init['"]\s*,\s*['"](\d{10,})['"]/g },
    { key: 'meta-pixel-noscript', re: /facebook\.com\/tr\?id=(\d{10,})/g },
    { key: 'ga4', re: /\b(G-[A-Z0-9]{6,})\b/g },
    { key: 'universal-analytics', re: /\b(UA-\d{4,}-\d+)\b/g },
    { key: 'google-ads', re: /\b(AW-\d{6,})\b/g },
    { key: 'gtm', re: /\b(GTM-[A-Z0-9]{4,})\b/g },
    { key: 'tiktok-pixel', re: /ttq\.load\(\s*['"]([A-Z0-9]{10,})['"]/g },
    { key: 'hotjar', re: /hjid\s*[:=]\s*(\d{5,})/g },
    { key: 'clarity', re: /clarity\.ms\/tag\/([a-z0-9]{8,})/g },
  ];
  for (const { key, re } of patterns) {
    for (const m of html.matchAll(re)) {
      if (!tracking.pixels.some((p) => p.type === key && p.id === m[1])) {
        tracking.pixels.push({ type: key, id: m[1] });
      }
    }
  }

  for (const s of document.querySelectorAll('script[src]')) {
    const src = abs(s.getAttribute('src'));
    if (!src) continue;
    const host = new URL(src).host;
    if (host !== location.host) tracking.scripts.push(src);
  }
  for (const s of document.querySelectorAll('script:not([src])')) {
    const body = s.textContent ?? '';
    // Keep anything that smells like tracking or a custom integration, so the
    // "any custom scripts" checklist line can actually be answered.
    if (/fbq|gtag|dataLayer|ttq|analytics|pixel|hotjar|clarity|_learnq|klaviyo/i.test(body)) {
      tracking.inline.push(body.trim().slice(0, 4000));
    }
  }

  // ── Kajabi program structure (lesson sidebar) ─────────────────────────────
  // Member-area pages render a syllabus; capturing it preserves the
  // module → lesson hierarchy that a flat page dump would lose.
  const syllabus = [];
  const navRoot = document.querySelector(
    '[class*="syllabus"], [class*="sidebar"] nav, aside nav, [data-module], [class*="lesson-list"]'
  );
  if (navRoot) {
    let currentModule = null;
    for (const el of navRoot.querySelectorAll('*')) {
      const cls = el.className || '';
      if (typeof cls !== 'string') continue;
      if (/module|section|category/i.test(cls) && /title|heading|name/i.test(cls)) {
        const t = text(el);
        if (t) {
          currentModule = { module: t, lessons: [] };
          syllabus.push(currentModule);
        }
      } else if (el.tagName === 'A' && /lesson|post|item/i.test(cls)) {
        const t = text(el);
        const href = abs(el.getAttribute('href'));
        if (t && href) {
          if (!currentModule) {
            currentModule = { module: null, lessons: [] };
            syllabus.push(currentModule);
          }
          currentModule.lessons.push({ title: t, href });
        }
      }
    }
  }

  // ── Quizzes / assessments ─────────────────────────────────────────────────
  // Detect from real markup only. Matching the *word* "quiz" or "question" in
  // body copy flags nearly every sales page, which makes the signal useless.
  const quizQuestions = [...document.querySelectorAll('[class*="question"], fieldset')]
    .map((q) => ({
      prompt: text(q.querySelector('legend, h1, h2, h3, h4, p, label')),
      options: [...q.querySelectorAll('input[type=radio], input[type=checkbox]')].map(
        (i) =>
          text(document.querySelector(`label[for="${i.id}"]`)) ||
          text(i.closest('label')) ||
          i.getAttribute('value') ||
          ''
      ),
    }))
    .filter((q) => q.prompt && q.options.length > 0);

  const quizEl = document.querySelector(
    '[class*="quiz"], [class*="assessment"], [data-quiz], [id*="quiz"]'
  );

  const quiz = {
    detected: quizQuestions.length > 0 || quizEl !== null,
    questions: quizQuestions,
    // Which of the two signals fired, so a reviewer can judge a bare element hit.
    evidence: quizQuestions.length > 0 ? 'questions-parsed' : quizEl ? 'quiz-element' : null,
  };

  // ── Pricing hints ─────────────────────────────────────────────────────────
  const bodyText = document.body.innerText ?? '';
  const prices = [
    ...new Set((bodyText.match(/(?:[$£€]\s?\d[\d,]*(?:\.\d{2})?)/g) ?? []).slice(0, 40)),
  ];

  return {
    url: location.href,
    finalUrl: location.href,
    title: document.title || null,
    meta: {
      description: attr(document.querySelector('meta[name="description"]'), 'content'),
      canonical: abs(attr(document.querySelector('link[rel="canonical"]'), 'href') ?? ''),
      ogTitle: attr(document.querySelector('meta[property="og:title"]'), 'content'),
      ogDescription: attr(document.querySelector('meta[property="og:description"]'), 'content'),
      ogImage: attr(document.querySelector('meta[property="og:image"]'), 'content'),
      robots: attr(document.querySelector('meta[name="robots"]'), 'content'),
    },
    headings: [...document.querySelectorAll('h1, h2, h3')].map((h) => ({
      level: Number(h.tagName[1]),
      text: text(h),
    })),
    markdown: toMarkdown(document.body),
    plainText: bodyText.replace(/\n{3,}/g, '\n\n').trim(),
    images: [...images.values()],
    links,
    documents,
    forms,
    videos,
    tracking,
    syllabus,
    quiz,
    prices,
    // A member page that still shows a login form means the session expired.
    looksLoggedOut:
      /log\s?in|sign\s?in/i.test(text(document.querySelector('form button, form [type=submit]')) ?? '') &&
      document.querySelector('input[type=password]') !== null,
  };
}
