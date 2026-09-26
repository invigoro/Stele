# Stele

Stele turns text into a weathered inscription or an aged document: carved marble, crumbling
sandstone, burnt letters, water-stained papyrus. The result is a handout image for tabletop games,
to share with players or print, where damage and fading make it harder for players to read.

**Live site:** https://stele.invigoro.me/

## Using it

- **Pick a medium:** marble, sandstone, granite, slate, a clay tablet, a bronze plaque, wood, paper,
  parchment or papyrus. Each has colour variants, shapes (a Roman tabula ansata, a round-topped stele, a broken
  fragment, a torn sheet…) and writing methods (carved, gilded, painted, burned, inked, typed, cast
  in relief, engraved, pressed into clay).
- **Type the text,** choose a style (Roman capitals, blackletter, copperplate, handwriting,
  typewriter…), and add wear:
  - **Damage** scales everything the medium can suffer; "Damage types" adjusts each one (chips,
    cracks, lichen, verdigris, burns, water, ink blots, tears, folds…).
  - **Fade** wears the writing itself away: carving grows shallow, ink thins and browns.
  - 🎲 rerolls where the damage or fading falls.
- **Letter it like a Roman inscription:** Roman letters (capitals, V for U, I for J), a raised
  dot between words, or no spaces at all (scriptio continua), with an optional dot between
  sentences in place of their full stops. Justify the text to set it in an even block across
  the stone.
- **Write in runes or cuneiform:** type in English and pick a script: runes (Elder Futhark,
  Younger Futhark or Anglo-Saxon Futhorc), or cuneiform, spelled out in real Akkadian syllable
  signs that a player with a sign list could read back. Clay tablets start out in cuneiform, on
  ruled lines.
- **Arrange the writing in blocks:** the writing is made of blocks of text, signatures and
  pictures, each with its own text, script, style, size and page. Add them with **+ Text**,
  **+ Signature** and **+ Picture**. Click one on the preview to pick it, then drag it to move it,
  pull a corner to resize it and the round handle to turn it (Shift for 15° steps); arrow keys
  nudge it and Delete removes it. The template arranges the main text, and signs a signature
  below it, until you move them; "Put back in place" hands them back.
- **Sign it:** a signature is written in a hand of its own (a typed page is signed in pen).
- **Write pictures:** choose a picture file, paste one (Ctrl+V), drop one on the preview, or give a
  link to one. It's carved, inked, cast or pressed in just as lettering is; anything transparent
  in it stays bare, or for a drawing on white, only its dark parts are written. Uploaded pictures
  are kept in your browser, so a copied link carries only pictures that are themselves links.
- **Draw by hand:** pick the pen and drag on the preview to draw a map, a sketch or a mark, made the
  same way as the lettering: etched into stone, inked onto paper, cast in bronze. `[` and `]`
  change the pen width.
- **Decide what players can read:** wrap words in `[[double brackets]]` to guarantee they're
  destroyed (typed pages get them blacked out), or in `{{double braces}}` to keep damage off
  them.
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
