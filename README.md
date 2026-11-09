# Ali Abu-Hatem portfolio site

A single static page (`index.html`) plus `assets/`. No build step and no server code, so it runs on any static host.

## Deploy

**Vercel**: `npx vercel deploy --prod` from this folder, or drag the folder into vercel.com/new.

**Netlify**: drag the folder onto app.netlify.com/drop.

**GitHub Pages**: push this folder to a repo named `aliabuhatem.github.io`, then enable Pages on the `main` branch.

After the first deploy, open `index.html` and change `content="assets/og-card.jpg"` in the `og:image` tag to the full URL (for example `https://aliabuhatem.github.io/assets/og-card.jpg`), so LinkedIn and WhatsApp show the preview card.

## What is inside

- `index.html`: the page. Three.js, GSAP + ScrollTrigger and Lenis load from jsDelivr at pinned versions; fonts load from Google Fonts.
- `assets/*.webp`: project screenshots and portraits.
- `assets/*.pdf`: the CV (with and without photo) and the portfolio, linked from the page.
- `assets/og-card.jpg`: the social preview image.

## Editing content

All copy comes from `src/content.json`. To rebuild after editing it:

```bash
pip install jinja2
python3 src/scripts/build_site.py <folder that contains content/, site_src/ and site/assets>
```

The `src/` folder mirrors that layout (`content/`, `site_src/`, `print_src/`, `scripts/`). The PDF build (`build_print.py`) also needs Playwright with Chrome and `pypdf`.

## Behaviour notes

- Motion respects `prefers-reduced-motion`: the 3D scene renders one still frame and scroll effects are off.
- The 3D scene pauses when it scrolls out of view or the tab is hidden.
- The theme follows the visitor's system setting; the toggle choice is remembered on this self-hosted version.
