# Stele

Stele turns text into a weathered inscription or an aged document: carved marble, crumbling
sandstone, burnt letters, water-stained papyrus. The result is a printable handout for tabletop
games, where damage and fading make it harder for players to read.

**Live site:** https://invigoro.github.io/Stele/ (work in progress: carved marble and inked paper
so far, with damage, fade and 300 DPI PNG export)

## Development

Requires Node.js 22.12 or newer. The repo pins 24 in [`.nvmrc`](.nvmrc).

```sh
npm install
npm run dev       # dev server with hot reload
npm test          # unit tests
npm run build     # type-check, then build to dist/
npm run preview   # serve the production build locally
```

With the dev server running, `/dev/contact-sheet.html` renders every medium across a grid of fade
and damage levels, which is handy when tuning a material. Its query parameters are documented at
the top of [`src/dev/contactSheet.ts`](src/dev/contactSheet.ts).

Every push to `main` runs the tests, builds the site and deploys it to GitHub Pages
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

## Plan

[docs/PLAN.md](docs/PLAN.md) covers the rendering approach, the media and damage catalogue, and the
roadmap.
