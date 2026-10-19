# Shreyas Kale — portfolio

A static, dependency-free portfolio site. No build step, no framework: open `index.html` and it runs.

```
portfolio/
├── index.html                  # all markup
├── assets/
│   ├── css/style.css           # design system + every section
│   ├── js/app.js               # canvas headline, rail, cursor, clocks, form
│   ├── img/shreyas.png         # portrait
│   └── Shreyas_Kale_Resume.pdf # linked by "View Resume"
└── README.md
```

## Run locally

```bash
cd portfolio
npx http-server -p 8080     # or: python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## Deploy

**Vercel (recommended — this is what gets you a custom domain fastest)**

1. Push this repo to GitHub.
2. On vercel.com → Add New Project → import the repo.
3. Framework preset: **Other**. Root directory: `portfolio`. Build command: *(leave empty)*. Output directory: `.`
4. Deploy. For a free `yourname.is-a.dev` domain, open a PR at
   [is-a-dev/register](https://github.com/is-a-dev/register) with a `domains/<name>.json`
   pointing `CNAME` at `cname.vercel-dns.com`, then add that domain in Vercel.

**GitHub Pages** — Settings → Pages → deploy from branch, `/portfolio` folder. The site is fully relative-path based, so it works from a subpath.

## What's in it

| Section | Notes |
|---|---|
| Intro | Name lands first, lifts after ~2s |
| Hero | Headline rendered as a dot matrix on `<canvas>`; dots are pushed away by the cursor. Drifting clouds behind |
| About | Statement, capabilities, portrait, metrics, workflow widget, education |
| Process | Illustrated build thread — labelled as an illustration, not a real transcript |
| Work | Pinned horizontal rail (desktop) / vertical stack (mobile), 6 projects |
| Experience | Hover reveals a hidden detail line; wins marquee below |
| Contact | Form composes a prefilled email; copy-address button |
| Footer | Big wordmark, nav, scroll-to-top |

Accessibility: skip link, a real `<h1>` behind the canvas, focus rings, aria labels, and a full
`prefers-reduced-motion` path (no clouds, no marquee, no cursor effects, no count-ups).

## Editing

- **Text** → `index.html`, it is plain HTML in reading order.
- **Colours / type / spacing** → the `:root` block at the top of `assets/css/style.css`.
- **Headline wording** → `linesFor()` in `assets/js/app.js`. Keep lines short; the font size is fitted to the longest one.
- **Email address** → it appears in `index.html` (several links) and once in `app.js` (copy button + form).

## Still to fill in

- LinkedIn URL (not currently linked anywhere).
- Candor Investing start/end dates — the row currently reads just "Internship".
- Name of the 7th hackathon win; the marquee lists the six named on the résumé plus the two Top-8 finishes.
- Real project screenshots. Drop them in `assets/img/` and swap each `.browser__screen` placeholder for an `<img>`.
- Note: the linked résumé PDF contains a phone number, and it is publicly downloadable once deployed.
