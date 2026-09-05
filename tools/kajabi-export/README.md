# Kajabi exporter

Mirrors the Kajabi site to disk before the account is cancelled — pages, copy,
images, PDFs, **video files**, forms, tracking IDs and program structure.

Built against [ProjectNeeds.MD](../../ProjectNeeds.MD); `REPORT.md` comes back
with that checklist filled in.

---

## Run it

```bash
cd tools/kajabi-export
npm install
npm run setup                       # one-time: downloads Chromium (~130MB)

export KAJABI_SITE=https://www.yourkajabisite.com

npm run login                       # opens a browser — log in by hand
npm run crawl                       # pages, copy, images, PDFs, forms, pixels
npm run videos                      # the actual video files
npm run report                      # the checklist, filled in
```

`npm run login` opens a real browser window and waits. Log in as the **site
owner** (an admin sees every program), click into the member library and open
one lesson, then press Enter. Only the resulting session cookies are saved, to
`.auth/storageState.json` — your password is never typed by, or visible to, this
tool.

Skipping login still exports the public marketing site, but **member programs,
lessons and course video will be missed**.

### Why you can't just reuse your everyday Chrome profile

There is a `--chrome-profile` flag, and against a normal Chrome profile it will
not work. Chrome refuses to expose the DevTools protocol whenever the profile
sits in its standard user-data directory:

```
DevTools remote debugging requires a non-default data directory.
```

That's a deliberate security boundary — it stops automation from driving your
real logged-in browser. Quitting Chrome doesn't change it and no flag overrides
it. The flag is only useful for a purpose-built profile in a separate directory
(`--chrome-user-data-dir`).

`npm run login` sidesteps the whole thing: it opens its own browser with its own
fresh profile, which has no such restriction.

---

## What lands on disk

```
export/
  REPORT.md            ← start here: the migration checklist, answered
  opt-in-forms.md         every email capture form + its fields
  tracking.md             Meta Pixel / GA / GTM IDs + custom scripts
  redirects.json          old Kajabi URL → new site path, for next.config.js
  inventory.csv           one row per page, for QA tick-off
  findings.json           all of the above, machine-readable
  manifest.json           raw crawl record

  pages/<slug>/
    page.html               fully rendered HTML
    content.md              readable copy — proofread the rebuild against this
    page.json               images, links, forms, videos, pixels, syllabus, quiz
    screenshot.jpg          full-page screenshot

  assets/<host>/…        every image, PDF, font and download, original paths kept
  videos/
    VIDEOS.md               inventory table
    wistia/                 <name>--<id>.mp4 + .vtt captions + .jpg poster + .json
    youtube/ vimeo/         only if yt-dlp is installed
```

---

## Options

| Flag | Default | What it does |
|---|---|---|
| `--site <url>` | `$KAJABI_SITE` | the site to mirror |
| `--out <dir>` | `./export` | output directory |
| `--chrome-profile <dir>` | — | reuse a logged-in Chrome profile (quit Chrome first) |
| `--headed` | off | show the browser window |
| `--max-pages <n>` | `600` | stop after N pages |
| `--concurrency <n>` | `3` | parallel tabs |
| `--delay <ms>` | `400` | pause between page loads |
| `--screenshots false` | on | skip screenshots (much smaller output) |
| `--include <regex>` | — | only crawl matching paths |
| `--exclude <regex>` | logout, admin, api | never crawl matching paths |
| `--resume false` | on | re-fetch pages already saved |
| `--video-quality` | `best` | `best` \| `original` \| `medium` |
| `--inventory-only` | off | catalogue videos without downloading them |

Everything resumes. If a run dies or you hit `--max-pages`, run it again with a
higher limit — already-saved pages are skipped.

```bash
node crawl.js --max-pages 1500 --concurrency 2
node crawl.js --include '^/(products|library)' --screenshots false
```

---

## Notes

- **Video.** Kajabi hosts course video on Wistia, which publishes a public JSON
  manifest per media listing direct MP4 renditions. That is what gets pulled, so
  you end up with real files. YouTube/Vimeo embeds are recorded as links since
  they live on your own channels; `brew install yt-dlp` before `npm run videos`
  to grab local copies of those too.

- **Already have the videos?** Run `node videos.js --inventory-only`. It resolves
  every Wistia id to a title, duration, resolution and the lessons it appears on
  and writes `videos/VIDEOS.md` — the mapping you need to attach files you
  already hold to the right course — without downloading a byte.

  To push those into the platform's S3 bucket, feed the resulting
  `videos/index.json` to [`server/scripts/import-videos.js`](../../server/scripts/import-videos.js),
  which streams each one down, uploads it and deletes the local copy before
  starting the next.
- **Rate.** Three tabs with a 400ms pause. Polite for a site you own; raise
  `--concurrency` if you're short on time.
- **Logout is excluded** from the crawl by default. Following it mid-run kills
  the session and every later member page comes back empty.

## What this cannot get

A scraper only sees the public-facing site. These are Kajabi admin exports and
must be done by hand — `REPORT.md` repeats them as a checklist:

- Contacts / subscribers CSV (People ▸ Contacts ▸ Export, **include tags**)
- Email broadcasts and sequences/automations (Marketing)
- Coupon and checkout codes such as `Free4me` (Sales ▸ Coupons)
- Payment processor connection details (Settings ▸ Payments)
- Pixel IDs configured in settings rather than injected into pages
- Current DNS records (Settings ▸ Domains)
