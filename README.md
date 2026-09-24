# Stele

Stele turns text into a weathered inscription or an aged document: carved marble, crumbling
sandstone, burnt letters, water-stained papyrus. The result is a handout image for tabletop games,
to share with players or print, where damage and fading make it harder for players to read.

**Live site:** https://stele.invigoro.me/ (work in progress). Eight media so far: marble, sandstone,
granite, slate, wood, paper, parchment and papyrus, each with its own damage types, plus fade, colour
variants, shapes, several writing methods and a 300 DPI PNG download.

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
