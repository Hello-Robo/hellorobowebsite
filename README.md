# Hello Robo — Website

The new website for the Hello Robo studio, built with [Astro](https://astro.build)
(static output, no framework JS).

- **Design source:** Figma “Hello Robo Website 2026” → page **Handoff ✅** → section `website`
  (https://www.figma.com/design/9SsfbCUY7KcxjZpCuRpDxf/Hello-Robo-Website-2026?node-id=10093-10194)
- **Scope of this repo:** front end. Order of work:
  **static desktop → responsive → motion → WebGL & CMS**.

## Status

| Phase | State |
|---|---|
| 0. Project setup, tokens, fonts | ✅ done |
| 1. Shell: Get in touch, nav pill, pre-footer, footer | ✅ done |
| 2. Static desktop blocks, all pages | ✅ done (matches Figma section heights at 1728 within ~1–5px) |
| 3a. Laptop + landscape tablet scaling (1024–1727) | ✅ done (the 1728 design scales down; text has readable floors) |
| 3b. Mobile + portrait tablet (≤ 1023) | ✅ Home from the Figma 390 frame; other pages follow the same rules (see “Needs design”) |
| Site menu (overlay) | ✅ works on every page; placeholder open/close animation |
| 4. Motion | 🟡 in progress — Home scroll interactions done (see “Scroll interactions”); next: menu reveal, value tabs, contact steps |
| 5. WebGL scenes, video, CMS | ⏳ slots and content collections are ready |

## Getting started

```bash
git clone https://github.com/lilyhellorobo/hellorobowebsite.git
cd hellorobowebsite
npm install
npm run dev
```

Open http://localhost:4321. The licensed font files are **not in git** (public repo):
copy `AllianceNo2-Regular.woff2` and `.woff` into `public/fonts/` — ask Lily for them.

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server with live reload |
| `npm run build` | Builds the static site into `dist/` |
| `npm run preview` | Serves the built site |
| `npm run svg` | Optimizes every SVG in `public/images` (SVGO, `svgo.config.mjs`) |

If you change `src/content.config.ts` and the dev server shows old data, stop it and
clear the cache: `rm -rf .astro node_modules/.astro node_modules/.vite`, then `npm run dev`.

Review pages (not linked from the site): `/styleguide` (colors, text styles, buttons,
icons, lines) and `/blocks` (every block and page).

---

## Sitemap

| Route | Page | Figma frame | Content |
|---|---|---|---|
| `/` | Home | 1.0 home | static + `news` collection |
| `/work` | Work — project wheel (full screen, no footer) | Portfolio page | `projects` collection |
| `/work/[slug]` | Project, e.g. `/work/weekly-robotics` | Project (Weekly Robotics) | `projects` collection |
| `/services` | Services | Services | static |
| `/team` | Endless object canvas + person cards (`/team#lily-a` opens a card) | team + card | `team` collection |
| `/careers` | Careers | Careers | `positions` collection |
| `/careers/[slug]` | Position, e.g. `/careers/content-creator` | Careers (Content Creator) | `positions` collection |
| `/robo-radio` | Robo Radio | Robo radio | `episodes` collection |
| `/robo-radio/[slug]` | Episode, e.g. `/robo-radio/14-alejandro-otalora` | robo radio single episode | `episodes` collection |
| `/contact` | Contact flow: `#name` `#email` `#company` `#mission` `#message` `#done` | Contact + Receipt | static |
| `/styleguide`, `/blocks` | Internal review pages | — | — |

Every page shares the shell from `BaseLayout`: **Get in touch** (top right) · page ·
**pre-footer** · **footer** · **nav pill** + **site menu**. Options per page:
`headerVariant` (dark / light / grey), `prefooter` (conversation / building / false),
`back` (adds the back button), `footer` (false on Work, Team, Contact).

## Folder structure

```
src/
  styles/
    tokens.css          design tokens: colors, type, scale unit, spacing, layout, z-index
    fonts.css           Alliance No.2 @font-face
    global.css          reset, text style classes, helpers, image/icon scaling
  layouts/
    BaseLayout.astro    the shell every page uses
  components/
    global/             GetInTouch, NavPill, SiteMenu, PreFooterCTA, Footer, FooterWordmark
    ui/                 Button, ArrowLink, Divider, WebGLSlot, VideoSlot, BlockPlaceholder
    icons/              Icon (corners, hex, hex-pin, back, arrow, dots), RoboLogo
  blocks/               page blocks — one folder per page, one block per file
    home/ work/ services/ careers/ position/ radio/ episode/ project/ team/ contact/
  content/              CMS-shaped JSON: projects/ team/ positions/ episodes/ news/
  content.config.ts     schemas for those collections
  data/site.ts          menu links, studio address, socials
  assets/               photos (PNG, 2× exports) — optimized to WebP by astro:assets
  pages/                one file per route (see Sitemap)
public/
  fonts/                licensed fonts (git-ignored)
  images/<page>/        SVG graphics (stamps, logos, micrographics), a few PNGs
  videos/               showreel.mp4 / .webm / poster go here (see videos/README.md)
svgo.config.mjs         SVG optimization settings (keeps ids and viewBox)
.claude/launch.json     dev server config for the Claude preview
```

---

## Design system

All values live in `src/styles/tokens.css`. Blocks use tokens and the five text
classes — no raw hex colors or font sizes.

### Colors

| Token | Value | Use |
|---|---|---|
| `--color-orange` | `#FF6B03` | **Orange / primary — the only orange.** Every orange in the designs uses it |
| `--color-black` | `#000000` | dark sections, buttons |
| `--color-ink` | `#111111` | body text on light, image placeholders |
| `--color-ink-warm` | `#100F0D` | video / deep backgrounds |
| `--color-white` | `#FFFFFF` | |
| `--color-grey-50` | `#F9F9F9` | nav pill, menu panel |
| `--color-grey-100` | `#F2F2F2` | light surfaces |
| `--color-grey-200` | `#EDEDED` | team field |
| `--color-grey-300` | `#D9D9D9` | placeholders, Copy button |
| `--color-grey-350` | `#C6C6C6` | pre-footer / contact bg, inactive menu links |
| `--color-grey-400` | `#BCBCBC` | menu dots |
| `--color-grey-600` | `#747474` | secondary text |
| `--line-on-light` / `--line-on-dark` | black / white 20% | rules and dividers (`--line-width: 1px`) |
| `--line-strong-on-light` / `-on-dark` | black / white | active tab segment |

Only the orange is a Figma variable; greys and lines were measured from the designs.

### Typography — Alliance No.2 Regular, five styles only

| Class | Desktop (Figma) | Floor on small screens | Mobile (Figma Mobile/*) |
|---|---|---|---|
| `.t-h1` | 120 / 95% / −6% | 56 | 64 / 95% / −6% |
| `.t-h2` | 80 / 95% / −6% | 40 | 44 / 116% / −5% |
| `.t-h3` | 50 / 116% / −5% | 26 | 32 / 116% / −5% |
| `.t-body` | 20 / 120% / −1% | 15 | 16 / 120% / −1% |
| `.t-button` | 18 / 100% / +6%, uppercase | 13 | 18 |
| `.t-body2-mobile` | (Body on desktop) | — | 12 / 120% / −1% (Mobile/Body2) |

Don't add text styles. Stray sizes in Figma are mapped to the nearest of these.
The browser renders Alliance the same as Figma (checked: heading widths match within 0.5px).

### Scale unit and layout

| Token | Value |
|---|---|
| `--px` | `min(1px, 100vw / 1728)` — **1 Figma pixel**. 1px at 1728+, smaller below; 1px again on mobile |
| `--page-max` | 1728px |
| `--page-margin` | 40 (16 on mobile) |
| `--gutter` | 12 |
| `--space-6 … --space-160` | 6, 12, 16, 20, 24, 32, 40, 48, 60, 80, 100, 120, 160 |
| `--button-height` | 60 (min 44) |
| `--nav-height` / `--nav-width` | 80 / 426 (min 56 / 300; 64 tall on mobile) |
| `--icon-size` | 32 (min 24) |
| `--ease-out` / `--ease-in-out` | `cubic-bezier(.23,1,.32,1)` / `cubic-bezier(.4,0,.2,1)` — motion style from telhaclarke.com.au/studio |
| `--duration-fast / -normal / -smooth / -slow` | 0.35s / 0.45s / 0.7s / 1.1s |
| `--stagger` | 0.04s between words / lines |
| `--radius-ui` | 2px |
| `--z-raised / -header / -nav / -overlay` | 10 / 100 / 200 / 300 (menu sits at nav − 1) |

### Helpers (`global.css`)

- `.container` — max 1728, side margins
- `.theme-dark` / `.theme-light` — section colors
- `.only-mobile` / `.only-desktop` — elements that exist in one layout only
- `.visually-hidden` — screen-reader-only text
- `img[style*="--w"]`, `.icon`, `.robo-logo` — take their Figma width from `--w`, scaled by `--px`

### Responsive system

| Range | What happens |
|---|---|
| ≥ 1728 | The Figma desktop frame, 1:1 |
| 1024 – 1727 | Same layout scaled by `--px` (e.g. 1440 → 83%, 1024 → 59%); text floors keep it readable. Small-laptop fixes: `@media (min-width: 1024px) and (max-width: 1199px)` |
| ≤ 1023 | Mobile layouts (Figma 390 frames) — phones and portrait tablets (the scaled desktop left pinned full-screen blocks mostly empty on upright tablets), `@media (max-width: 1023px)` at the end of each block's `<style>` |

Writing CSS: desktop sizes as `calc(N * var(--px))` where N is the Figma px value;
hairlines (1–2px) stay as they are; mobile values are plain px; use `minmax(0, 1fr)`
for mobile grid columns. Images: give `<img>` its Figma `width` and `style="--w: N"`.

---

## Components

| Component | Figma | Notes |
|---|---|---|
| `GetInTouch` | hero "nav" 265×64 | fixed top right; dark / light / grey; hidden on mobile (it's in the menu) |
| `NavPill` | "nav" 10093:2370, 426×80 | fixed bottom centre; optional back button; opens the menu |
| `SiteMenu` | "1.1 menu d" 10194:165 | blurred backdrop, links (current page black + arrow), Let’s talk, photo (a random one of the 8 studio photos in `src/assets/menu/photos/` — Figma 10240:141 — each time the menu opens, never the same twice in a row), Say hello + socials. Close: × / Esc / backdrop click |
| `PreFooterCTA` | "block" 1728×949 | variants `conversation` (stamp) / `building` ("Click anywhere"); mobile adds 2 buttons + email bar |
| `Footer` + `FooterWordmark` | "footer + contacts" 10093:2045 | wordmark is one SVG `<symbol>` reused 39× |
| `Button` | "button" | variants dark / light, size default / small, icons hex / hex-pin / corners / arrow / none |
| `ArrowLink` | "View →" | orange Body link |
| `Divider` | rules | `tone`, `accent` segment |
| `WebGLSlot` | areas marked "3d web gl" | reserves the space, shows the static poster; mount scenes in `.webgl-slot__stage` |
| `VideoSlot` | video areas | plays `src` (muted, loop) or shows the poster; `mobileRatio` for a different mobile crop |
| `Icon`, `RoboLogo` | icons, orange logo | `currentColor` |

## Block inventory

Every block file starts with a comment naming its Figma node and link.

| Page | Block (file in `src/blocks/`) | Figma node | Mobile |
|---|---|---|---|
| Home | `home/HomeHero` — title, receipt sphere, robot (WebGL poster) | 10093:119 | Figma |
| | `home/HomeIntro` — stamp + mission text | 10093:145 | Figma |
| | `home/HomeShowreel` — video (`public/videos/showreel.mp4`) | 10093:183 | Figma |
| | `home/HomePhilosophy` — "300 robotics companies" + bars (WebGL poster) | 10093:185 | Figma |
| | `home/HomeShowcase` — "What it took…" + 3 pinned slides (world / operators / market) | 10093:250, 10203:131, 10203:481 | Figma (block 1 / 2 / block) |
| | `home/HomeClients` — text + logo wall + stamps | 10093:577 | Figma (logo rows) |
| | `work/ProjectScroller` — project wheel, framed (shared with /work) | 10093:1049 | Figma (cards) |
| | `home/HomeRadio` — Robo Radio teaser + posters | 10093:1424 | Figma |
| | `home/HomeNews` — news row, scrolls sideways (`news` collection) | 10093:1889 | Figma |
| Work | `work/ProjectScroller` | 10100:11973 | cards, all projects |
| Project | `project/ProjectHero` — title, badge, intro + reveal image | 10100:12388, 10100:12374 | rules |
| | `project/ProjectSummary` (+ `ProjectTextRow`) — text + facts | 10100:12615 | rules |
| | `project/ProjectSections` — media rows (1–3 images) and text rows | 10100:12637 | rules |
| | `project/ProjectTestimonial` — quote + credits + stamp | 10100:12938 | rules |
| | `project/ProjectNext` — next project | 10100:13197 | rules |
| Services | `services/ServicesHero` | 10103:138 | rules |
| | `services/ServicesDevice` — device still (video later) | 10103:211 | needs design |
| | `services/ServicesScroller` — branding / interface / video production, one pinned block | 10103:212 / 267 / 304 | rules (stacked) |
| | `services/ServicesBuilding` — "Building toward yes" + logos | 10103:1223 | rules |
| Team | `team/TeamField` — endless draggable object canvas + 9 cards | 10104:170, 235, 324, 463, 573, 555 | same canvas (touch drag, scaled 55%), card = sheet |
| Careers | `careers/CareersHero` — title, stamps, text, photo strip | 10100:14718 | needs design |
| | `careers/CareersValues` — values 01–03 (Curiosity / Care / Craft), pinned, + robot (WebGL poster) | 10100:14871, 9457:5217, 9457:5246 | pinned (text + robot) |
| | `careers/CareersPositions` — list from `positions` | 10100:14936 | rules |
| Position | `position/PositionHero` | 10102:146 | rules |
| | `position/PositionDetails` | 10102:1315 | rules |
| Robo Radio | `radio/RadioTV` (variant hero) — TV poster + controls | 10105:275 | needs design |
| | `radio/RadioIntro` | 10105:306 | rules |
| | `radio/RadioClips` — Humanoids + 2 clips | 10105:432 | rules |
| | `radio/RadioCollage` — 3×3 posters | 10105:481 | needs design |
| | `radio/RadioInvite` — "Pull up a chair" | 10105:971 | rules |
| | `radio/RadioEpisodes` — list from `episodes` | 10105:985 | rules |
| | `radio/RadioGuests` — guest logos | 10105:1064 | rules |
| Episode | `episode/EpisodeHero` | 10105:2720 | rules |
| | `episode/EpisodeText` ×2 + `radio/RadioTV` (variant episode) | 10105:2815, 10105:2825 | rules |
| Contact | `contact/ContactFlow` — 7 screens via `:target` | 10093:10195 … 10721 | needs design |
| | `contact/Receipt` — receipt artwork | 10099:11845 | rules |

**Mobile:** *Figma* = built from the 390 frame · *rules* = follows the Home mobile
rules (one column, 16 margins, Home spacing) · *needs design* = placeholder until
there's a mobile frame.

## Scroll interactions

Each one is a small script that turns the scroll position into a few numbers; all the
visuals are CSS on top of those, so the animation can be restyled without touching the
script. Transitions are placeholders for the motion step.

| Block | What happens | Values the CSS uses |
|---|---|---|
| **Showcase** "Make the … say yes" (`home/HomeShowcase`) | Starts inside the page margins. When it reaches the top it pins; the first half screen of scrolling widens it to full screen, then three screens move through the slides: the photo crossfades, the title and services list swap, the bright segment of the line grows. Mobile: already full width, slides only. | `--enter` (0→1, widening), `--progress` (0→1, line), `data-active` (slide 0–2) |
| **Project wheel** (`work/ProjectScroller`) | Home: starts inside the margins, pins, widens to full screen, then the names turn on a real 3D drum (CSS perspective + rotateX/translateZ, faces all the way round, a whole number of project loops): names away from the front are foreshortened, keystoned and pulled toward the vanishing point; fade = Figma's wheel opacities. The front project sets the background (crossfade, 30% black overlay) and the services list. VIEW shows only while the front name is hovered or focused, 128px after it. CSS CRT layer from the Figma shader values (scanlines, aperture mask, vignette, noise, flicker, rolling band). Work page: full screen and **endless** — the page doesn't scroll; wheel / trackpad / touch drag / arrow, Page Up/Down and space keys turn the drum forever in both directions, easing and settling the nearest project at the front (`infinite` prop). Mobile: no wheel — full-screen project slides that pin and change on scroll (photo crossfade, name / services / VIEW swap, progress line), like the showcase. | `--enter`, `--rot` (drum angle), `.is-front`, `.is-current`, `.is-hovering`; mobile: `--progress`, `.is-current` |
| **Services** (`services/ServicesScroller`) | Pins; one screen per service. Progress line on top fills a third per service. Left: label, title words and each service slide up out of a mask and the next service's slide in (staggered). Right: the next image slides in from the bottom over the previous one (clip-path + slight rise). Mobile: the three services stacked, no pin. | `data-state` (past / current / next), `--progress` |
| **Careers values** (`careers/CareersValues`) | Pins; one screen per value (Curiosity → Care → Craft). Kanji, label and description slide up out of a mask and the next value's slide in, word by word (same style as Services). Tabs 01–03 = progress: the active tab turns black and its underline fills through that value; clicking a tab scrolls to it. The robot stays (same image for all values). Mobile: pinned too, robot below the text. | `data-state`, `--local`, `.is-active` |
| **Team canvas** (`team/TeamField`) | Endless canvas of the 9 objects (`src/assets/team/objects/`, multiply-blended into the grey): the tile is the Figma frame itself — its 13 objects and labels at their exact Figma positions (`LAYOUT`), in one big 3600×2400 tile; the Figma frame spread 20% (`SPREAD`, more room, same arrangement), spaced by where each object actually is in its image (`VISIBLE`) + its label, and the rest of the tile filled with objects spaced like it (`scripts/team-layout.mjs` → `team-layout.json`, run `npm run team:layout`): every object's nearest neighbour at Figma's gap (image + label, edge to edge), no clumps or holes, the same object kept ~900px+ from itself — drawn 3×3 and wrapped as you drag; opens on the frame (phones: on the robot). Drag with mouse / touch / trackpad / arrows, with a glide. Objects stay sharp (no blur). Hover: the fade grows with distance from the object and toward the corners, with a lens push toward the screen edges. Click: the canvas glides the object to the middle of the left half (slightly enlarged), the card fades in on the right. The robot (`hello_robo`) opens the studio card (Hello Robo, our culture, no photo — Figma 10104:398, `/team#hello-robo`); every other object a random person for now. ×, a click outside or Esc closes. Phones: same canvas at 55%, pressing an object previews the focus, the card is a bottom sheet (object glides into the space above it; swipe down / tap canvas / × closes). The menu pill and Get in touch fade and slide away while an object is selected (`html[data-nav=hidden]`). | `.is-focus`, `.is-selected`, `--blur`, `--fade`, `.team-card.is-open` |
| **News** (`home/HomeNews`) | The card row scrolls sideways: trackpad / shift + wheel, arrow keys when focused, click-and-drag with a mouse. Cards snap to the page margin; a drag never opens a card. | `.is-dragging` |

Phones: progress is measured against the pinned block's own height (not the window),
so slides don't jump when the browser toolbar shows or hides. Reduced motion turns off
the CRT animation and the text slide-ins.

## Content (CMS-ready)

Collections in `src/content/` (schemas in `src/content.config.ts`). Each entry is a
JSON file; adding a file adds a page or row.

| Collection | Fields | Used by |
|---|---|---|
| `projects` | name, intro, services, reveal (cover: image or video), background, micrographics (left, right), summary, facts, sections (media / text), testimonial, credits, next, order | `/work/[slug]` |
| `team` | name, nameJa, role, quote, photo, object (which field object opens the card), model (3D .glb), order | `/team` |
| `positions` | title, location, hours, type, intro, workOn, bring, niceToHave, howWeWork, applySteps, outro, stamp, order | `/careers`, `/careers/[slug]` |
| `episodes` | title, number, guest, guestTitle, description, youtube (video id), portfolioUrl, cover, poster, listed, order | `/robo-radio`, `/robo-radio/[slug]` |
| `news` | text, image, size (wide / narrow), href, order | Home news row |

## CMS (`/admin`)

A small built-in CMS at `/admin` edits **Team**, **Updates** (the `news` collection),
**Projects**, **Careers** (the `positions` collection) and **Robo Radio** (the `episodes`
collection). It writes the same JSON files in `src/content/` and uploads images
into `src/assets/<collection>/`, so the pages need no changes: in `npm run dev` a save
shows up on the site right away.

**Setup (once per machine):** logins live in the git-ignored `.env`, never in the repo.

```bash
npm run cms:user -- add lily@hellorobo.co     # asks for a password; run again to reset it
npm run cms:user -- remove someone@hellorobo.co
npm run cms:user -- list
```

The first run also creates `CMS_SESSION_SECRET`. Then open http://localhost:4321/admin.

**How it fits together**

- Site pages stay static (prerendered). Only `/admin` and `/api/contact` render on
  demand, as Vercel functions (`@astrojs/vercel`; `npm run dev` runs them locally).
  `src/middleware.ts` sends anyone not signed in to `/admin/login`.
- Files are read and written through `src/cms/repo.ts`: on disk locally, as **one GitHub
  commit per save** on Vercel (see Production below).
- `src/cms/collections.ts` lists the editable fields per section. **If you change a
  schema in `src/content.config.ts`, update the matching fields there.** The Team
  field object ids also mirror `OBJECTS` in `src/blocks/team/TeamField.astro`.
- Passwords are stored as scrypt hashes; sessions are signed cookies (7 days).
  Removing a user from `.env` signs them out.
- Deleting an entry (or replacing an image) also deletes images nothing else uses.
- The Work wheel (Home + `/work`) lists the projects by `order`; the first one is the
  active project and its reveal image is the wheel background.
- Project **page sections** are Media (1–3 images, videos or YouTube side by side), Text
  and Facts blocks, in any order. A Facts block is a headline + text (like a text row)
  with left / right lines under it; each project's first one is "What Made People Say
  Yes" (it replaced the old fixed summary). The cover (`reveal`) only shows on the Work wheel.
- Projects have a **background color** (the dark sections of the project page; text,
  lines and muted text turn black on light colors) and two hero **micrographics**.
  Micrographics come from the asset library (`src/cms/library.ts`): every
  `stamp-*` / `badge-*` / globe / micrographic SVG in `public/images`, plus uploads,
  which go to `public/images/micrographics/` and are available to every project.
  SVG uploads with scripts or event handlers are refused.
- Team, Projects, Updates, Careers and Robo Radio can be **dragged into order** on their list page
  (drag the ⠿ handle, or focus it and use ↑ / ↓). Dropping saves right away by
  rewriting each entry's `order` (1, 2, 3…); `sortable: true` in `collections.ts`
  turns it on for a section.
- Project **cover** (`reveal`) and **media rows** take an image (JPG, PNG, GIF) or a video
  (MP4 / WebM). Videos are uploaded to `public/videos/projects/<id>/` and stored as
  `{ "video": "/videos/..." }`; images stay in `src/assets`. `components/ui/Media.astro`
  renders either: optimized image, GIF as-is (keeps animating), or a muted looping inline
  video (paused for reduced motion).
- The **studio card** on /team (Hello Robo, opened by the robot) is its own collection,
  `src/content/studio/hello-robo.json`. In the CMS it sits pinned at the top of Team
  (`parent: 'team'`); it can be edited but not added or deleted (`fixed: true`).
- Team members can have a **3D object** (`model`) for the WebGL team gallery: a GLB
  (binary glTF, textures embedded) uploaded in the CMS to `public/models/team/` and
  stored as its URL. OBJ/FBX/etc. are refused with export instructions. On `/team`
  each object `<li>` carries `data-person`, `data-object` and `data-model` for the
  WebGL scene to load (e.g. three.js `GLTFLoader`).
- Episodes store the YouTube video id; any YouTube link pasted in the CMS is converted.
  The episode page plays it on the TV screen (`RadioTV`, loaded only on click).
- Episodes marked **Featured** (up to 6) are the posters under “One talk. One future” on
  Robo Radio; **Displayed on homepage** (up to 4) are the posters in the Home Robo Radio
  section. Both follow the list order. A boolean field's `limit` in `collections.ts`
  caps how many entries can have it on.
- **Contact form responses** (`/admin/responses`): the contact flow (`/contact`, reached
  from Get in touch and the pre-footer) posts to `POST /api/contact`, which saves each
  submission as a JSON file in `data/contact-responses/` (git-ignored: personal data never
  goes into the repo). The CMS lists them newest first and can delete them. The endpoint
  only accepts posts from the site itself, has a hidden bot trap and allows 5 sends per
  visitor per 10 minutes. On Vercel they're kept in the project's private Blob store
  (`contact-responses/`) instead, never in the repo.

| Path | What |
|---|---|
| `src/cms/` | auth, field definitions, file store, admin layout + styles, browser editor |
| `src/cms/repo.ts` | where files live: disk locally, GitHub commits on Vercel |
| `src/cms/client/upload.ts`, `src/pages/admin/api/upload.ts` | on Vercel, uploads go from the browser to Blob first |
| `src/pages/admin/` | login, logout, list / new / edit pages, `responses/`, `api/` (save, delete), `media` (image previews) |
| `src/cms/responses.ts`, `src/pages/api/contact.ts` | contact form responses: storage and the public endpoint |
| `scripts/cms-user.mjs` | `npm run cms:user` |

**Production (Vercel, project `hellorobo-co`):** the CMS runs at `/admin` on the live site.

- **A save is a commit.** Each save, reorder, delete or micrographic upload becomes one
  commit on the branch the deployment was built from (`main` for the live site, the PR
  branch for a preview), authored "Hello Robo CMS", naming who saved it. Vercel then
  rebuilds and the live site shows it in about 2 minutes; the CMS itself shows it at once
  (it reads the branch head). Undo = revert the commit on GitHub.
- **Uploads** over Vercel's 4.5 MB request limit (images up to 15 MB, models 30 MB,
  videos 100 MB) go from the browser straight to the private Blob store (`uploads/tmp/`);
  the save fetches them from there, commits them to the same folders as locally, and
  deletes the temporary copy.
- **Environment variables** (Vercel → Settings → Environment Variables, Production and
  Preview):
  - `CMS_USERS`, `CMS_SESSION_SECRET`: the same values as in `.env` (same logins).
  - `GITHUB_TOKEN`: a fine-grained GitHub token for `Hello-Robo/hellorobowebsite` only,
    with **Contents: Read and write**. Without it the CMS on Vercel refuses to save
    rather than lose edits.
  - `BLOB_READ_WRITE_TOKEN`: added by Vercel for the `hellorobo-fonts` Blob store (fonts,
    contact responses, upload staging).
  - Optional: `GITHUB_REPO` (`owner/name`) and `CMS_BRANCH` to override the defaults.
- Adding a CMS user: `npm run cms:user -- add …` locally, then copy the new `CMS_USERS`
  line into Vercel and redeploy.

## Assets

- **Graphics are SVG only** (logos, icons, stamps, micrographics). Export from Figma
  with text outlined, run `npm run svg`, compare with the original at 4× zoom.
  Never remove `id`s (masks depend on them).
- **Photos** are 2× PNG exports in `src/assets/`, served as WebP by `astro:assets`.
- **The one orange:** recolor any other orange in an exported SVG to `#FF6B03`.

## Open items

- Mobile designs needed: Robo Radio TV, Contact, Careers hero, Services device image, poster collage, Project hero.
- Real social links (`src/data/site.ts`).
- Placeholder copy in Figma: Team (Paulina, Greg quotes; Alex's names swapped); episode rows share one description.
- Heavy SVGs to simplify with the designer: approved stamp (~965 KB), department stamp (~738 KB), logo rows (~990 KB), menu micrographic (~518 KB). Bedrock logo only exists as PNG.
- Motion step: menu reveal, value tabs, contact copy-email and receipt with real data; polish of the Home scroll interactions (easing, timing).
- Project wheel: some project reveal images may need a better crop for the wheel background.

---

## Rules

- **Text styles:** only `.t-h1 .t-h2 .t-h3 .t-body .t-button` (+ `.t-body2-mobile`).
- **Tokens only:** no raw hex colors or font sizes in blocks. Add missing values to `tokens.css` first.
- **Sizes:** desktop sizes as `calc(N * var(--px))`; mobile in plain px at the end of the block.
- **One block = one file.** Figma node link in a comment at the top of the file.
- **Graphics are SVG only**; photos and video stay raster.
- **WebGL and video** areas use `WebGLSlot` / `VideoSlot`, so the layout never waits for 3D or video.
- **No JS for layout.** Static states use CSS (`:target` for team cards and contact steps).
  Scripts: the menu toggle in `NavPill`, and the click-to-play YouTube embed in `RadioTV`.

## How we work

- `main` is the working, deployable version — don't commit to it directly.
- Start each task on its own branch: `git checkout -b feature/short-description`.
- Push the branch and open a Pull Request on GitHub for review.
- Before starting new work, update: `git checkout main && git pull`.

### Page transitions
Moving between pages is a crossfade (`@view-transition` in `global.css`, motion tokens): the old page stays until the new one can paint, so there's no blank / half-loaded frame. Get in touch and the menu pill keep their place (`view-transition-name`). Hovering a site link prerenders that page (speculation rules in `BaseLayout`, /admin and /api excluded) so it opens instantly. Images that aren't loaded yet fade in when they arrive (`img-wait` / `img-in`). Chrome / Edge get all of it, Safari 18.2+ the crossfade, other browsers load pages normally; reduced motion turns the fades off.
