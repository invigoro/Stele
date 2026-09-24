# Stele

Stele turns text into a weathered inscription or an aged document: carved marble, crumbling
sandstone, burnt letters, water-stained papyrus. The result is a printable handout for tabletop
games, where damage and fading make it harder for players to read.

**Live site:** https://invigoro.github.io/Stele/ (early work in progress: it currently shows a
renderer test pattern)

## Development

Requires Node.js 22.12 or newer. The repo pins 24 in [`.nvmrc`](.nvmrc).

```sh
npm install
npm run dev       # dev server with hot reload
npm test          # unit tests
npm run build     # type-check, then build to dist/
npm run preview   # serve the production build locally
```

Add `?seed=123` to the URL to pin the random seed.

Every push to `main` runs the tests, builds the site and deploys it to GitHub Pages
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

## Plan

[docs/PLAN.md](docs/PLAN.md) covers the rendering approach, the media and damage catalogue, and the
roadmap.
