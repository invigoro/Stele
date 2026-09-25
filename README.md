# Stele

Stele turns text into a weathered inscription or an aged document: carved marble, crumbling
sandstone, burnt letters, water-stained papyrus. The result is a handout image for tabletop games,
to share with players or print, where damage and fading make it harder for players to read.

**Live site:** https://stele.invigoro.me/

## Using it

- **Pick a medium:** marble, sandstone, granite, slate, wood, paper, parchment or papyrus. Each has
  colour variants, shapes (a Roman tabula ansata, a round-topped stele, a broken fragment, a torn
  sheet…) and writing methods (carved, gilded, painted, burned, inked).
- **Type the text,** choose a style (Roman capitals, blackletter, copperplate, handwriting,
  typewriter, runes…), and add wear:
  - **Damage** scales everything the medium can suffer; "Damage types" adjusts each one (chips,
    cracks, lichen, burns, water, ink blots, tears, folds…).
  - **Fade** wears the writing itself away: carving grows shallow, ink thins and browns.
  - 🎲 rerolls where the damage or fading falls.
- **Decide what players can read:** wrap words in `[[double brackets]]` to guarantee they're
  destroyed, or in `{{double braces}}` to keep damage off them.
- **Paint damage by hand:** pick a brush (chip, wear away, stain, scorch or moss on stone; hole,
  rub out, water, burn or ink blot on paper…) and drag on the picture. `[` and `]` change the brush size, and
  Ctrl+Z undoes a stroke.
- **Write long letters:** on paper, parchment and papyrus, text that doesn't fit continues onto
  more pages (or shrinks to fit, if you prefer). A line with just `---` starts a new page.
- **Start from a preset** such as "Roman epitaph", "Burnt letter" or "Dwarven waystone".
- **Take it to the table:** download a 300 DPI PNG (optionally transparent, for virtual tabletops),
  every page as a ZIP, or one PDF of every page at true size; print all pages at true size; or copy
  a link. The page's URL always describes the current handout.

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
