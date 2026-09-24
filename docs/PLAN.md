# Stele implementation plan

Stele turns text into a realistic physical object with writing on it (a marble inscription, a
letter, a papyrus fragment) and outputs a handout image for tabletop games, to share with players
directly or to print. The point is
legibility: damage and fade let a game master control how hard the text is for players to read.

**Current phase:** the backlog. Phases 0–3 are done. See [Milestones](#milestones).

## The approach

One WebGL2 renderer handles every medium. It treats each object as a flat surface with a few
layers of data per pixel:

- **Height:** how deep each point is, which is how carving works.
- **Color** and **gloss.**
- **Alpha:** whether the object exists there at all. This is how tears, burned-through holes and
  broken edges work.

A final lighting pass then shades the object like a photo or a scan. Media differ only in the
shader function that fills in those layers, so adding a medium means writing one shader function
and one TypeScript definition file.

The text comes in as a **signed distance field (SDF)**: for each pixel, the distance to the
nearest edge of a letter. Most of the realism comes from this:

- **Carving:** a V-shaped chisel groove is `depth = min(distInside * tan(wallAngle), maxDepth)`.
  Thick strokes end up deeper than thin ones, as with real chisel work. Under low-angle light, one
  wall of each groove is lit and the other is in shadow, like a real inscription.
- **Fade on stone:** the surface wears down, so `depth' = max(0, depth - erosion(x))`, where the
  erosion amount varies with noise. Thin strokes and serifs vanish first and thick strokes last,
  in patches, which is how real inscriptions become unreadable.
- **Ink:** shifting the distance threshold makes strokes thinner or thicker (for fade and pen
  pressure). It can also blur the edges (ink bleed) and darken them (ink pooling).

Everything is measured in **millimetres, not pixels**, so the live preview and the 300 DPI print
render are the same image at different resolutions. Randomness comes from **seeds**, so the same
settings always give the same image. That makes "reroll the damage, keep everything else"
possible, and a share link can recreate a handout exactly.

**Why WebGL2:** procedural noise for a full Letter page at 300 DPI (about 8.4 million pixels)
takes seconds per frame on the CPU and milliseconds on the GPU, so the sliders update live. SVG
filters are slow at print size and hard to control. three.js would add a 3D scene graph we don't
need.

## Stack and hosting

- **Vite + TypeScript**, deployed to GitHub Pages by
  [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) on every push to `main`. The
  workflow runs the tests and the type check before deploying. Vite uses a relative `base`, so the
  same build works at `invigoro.github.io/Stele/`, locally, or on a custom domain.
- **Node 24**, pinned in `.nvmrc` and used by CI. Anything from 22.12 up works locally.
- **No UI framework.** Each medium lists its own settings, and the control panel is generated
  from those lists in plain TS. The hard part of this project is the renderer, not the UI.
- **twgl.js**, a thin WebGL2 helper.
- **Shaders live under `src/render/shaders/`.** `.vert` and `.frag` files are entry points;
  `.glsl` files are libraries pulled in with `#include "path"`, which is resolved relative to the
  including file, once per shader. Noise comes from Stefan Gustavson's MIT-licensed webgl-noise
  library, vendored with its license.
- **Fonts hosted with the app via Fontsource.** They're all OFL or Apache licensed and load only
  when selected.
- **Vitest** for logic tests and **Playwright** for screenshot tests of fixed presets.

## Rendering pipeline

```
text ──► layout ──► letter mask ──► distance field ─┐
medium ─► material (height · color · gloss) ────────┼─► combine ─► lighting ─► preview / 300 DPI export
damage ─► seeded shapes + noise ────────────────────┤
fade ───────────────────────────────────────────────┘
```

1. **Layout (CPU):** wrap, auto-size and place the text inside the object's writing area. Add
   slight irregularity, then draw the letters into a mask.
2. **Distance field (GPU):** computed from the mask with the jump-flood algorithm in milliseconds.
3. **Material (GPU):** marble veins, sandstone grain and layering, wood grain and knots, paper
   fibres and blotchiness, papyrus strips.
4. **Damage shapes (CPU):** seeded crack paths, tear lines, chip outlines, fold lines and burn
   starting points.
5. **Combine (GPU):** the object's outline and edge bevel, then the text (carved, inked or
   painted) with fade applied, then damage:
   - A chip lowers the surface, so a chip deeper than a letter erases it.
   - Tears and burn-throughs remove parts of the object.
   - Stains and scorching change the color.
   - Water damage makes ink blur and run.
6. **Lighting (GPU):** shadows cast inside grooves, grime darkening in recesses, and highlights on
   polished surfaces.
   - Stone and wood are lit like a photo, with light coming in at a low angle that you can adjust.
     A lower angle makes worn carving easier to read, which is how epigraphers read old
     inscriptions.
   - Paper gets soft, even light, like a scanner.

Each stage is cached. Dragging the Fade or Damage slider doesn't redo the text layout or the
distance field. The goal is preview updates in under 50 ms and exports in a few seconds.

## Settings

```ts
interface Settings {
  text: string;                       // newlines kept; later: [[damage this]] markup
  font: FontId; align: 'left' | 'center' | 'right'; size: 'auto' | number;
  wrap: 'word' | 'anywhere' | 'manual'; // 'anywhere' for unspaced text like HICSACERDATERTIO…
  medium: MediumId; variant: string;    // marble: carrara | pentelic | rosso | nero …
  method: MethodId;                     // carved-v | carved-flat | paint-filled | gilt | ink-irongall | …
  shape: ShapeId; widthMm: number; heightMm: number;
  damage: { amount: number; types: Partial<Record<DamageId, number>>; seed: number };
  fade:   { amount: number; seed: number };
  light:  { azimuth: number; elevation: number };
  output: { page: 'letter' | 'a4' | 'a5' | 'custom'; dpi: 150 | 300; background: 'white' | 'transparent' };
  seed: number;                         // material + layout
}
```

- Choosing a medium fills in good defaults for shape, size, font, writing method and lighting.
- Settings save automatically in the browser.
- The URL encodes all settings (compressed), so a link recreates the exact handout.

## Media

| Medium | Default writing | Damage types | What Fade does |
|---|---|---|---|
| Marble | V-cut (optionally filled with paint or gold) | chips, cracks, broken edges, staining/soot, lichen | grooves get shallower and rounder, thin strokes go first; fresh-cut contrast and paint wear away |
| Sandstone | V- or U-cut | chips, flaking, honeycomb pitting, cracks, broken edges, moss | same, but coarser and patchier; the grain drowns out shallow cuts |
| Wood | carved, painted, or burned | splits along the grain, gouges, burns, rot, worm and nail holes | carving softens and greys; paint flakes; burned letters lighten |
| Paper | iron-gall ink | tears, burns, water damage (running ink + stain rings), smudges, folds, stains, age spots | ink thins, breaks up and browns; worst along folds and edges |
| Papyrus | carbon ink | holes, breaks along the fibres, frayed edges, darkening | ink flakes off in patches |
| *Parchment* | ink | as paper, plus warping | as paper |
| *Granite, Slate* | V-cut, gold-filled | as marble | granite's speckle hides letters; slate's pale fresh-cut letters dull to the surface color |

- **Italic rows:** cheap to add once the paper and stone versions work.
- **Later:** bronze plaques (raised letters, green patina) and clay tablets (letters pressed in)
  need new writing methods, so they're in the backlog.
- **Shapes:** rectangle, round-top stele, tabula ansata (the Roman plaque with dovetail handles on
  each side), broken fragment, and for paper, a full sheet or a torn note.

## Damage and fade

- **Two ways to generate damage:**
  - **Noise-based** for spread-out damage (stains, lichen, pitting, rot, age spots). The slider
    controls how much of the surface is covered.
  - **Seeded shapes** for discrete events: cracks as branching random paths, tears as jagged
    lines, chips as irregular outlines (more likely near edges and corners), folds as lines that
    wear away the ink along them, and burns as irregular edges that go from scorched to charred
    to holes.
- **Details that make it convincing:** chips expose paler fresh stone; torn paper edges get a
  pale, fibrous rim; water stains get a dark ring at the edge, with blurred ink running downward;
  paper wears through where folds cross.
- **Controls:** one main Damage slider, per-type sliders under "Advanced" (preset for each
  medium), and a 🎲 reroll button each for damage, fade and the material. Fade is one slider, but
  noise controls where it hits, so the fading is patchy rather than a uniform transparency.
- **Targeted damage (Phase 3):** since readability is the point of the game, the game master
  should control it, not just randomness. Wrapping a word in `[[ ]]` guarantees it's destroyed
  ("THE KEY LIES BENEATH THE [[ALTAR]]"), and wrapping text in `{{ }}` protects it from random
  damage.

## Text and fonts

- **Starter fonts:**
  - Roman capitals: Cinzel, Marcellus
  - Medieval uncial: Uncial Antiqua
  - Gothic blackletter: UnifrakturMaguntia
  - Formal 19th-century script: Pinyon Script, Mrs Saint Delafield
  - Everyday handwriting: Homemade Apple, Cedarville Cursive
  - Early printing: IM Fell English
  - Typewriter: Special Elite
  - Runes: Noto Sans Runic
- **Making handwriting convincing:** a font draws every "e" identically, which gives away fake
  handwriting. To counter that:
  - small random rotation, baseline shifts and spacing per word
  - a gentle wobble over the whole ink layer, and lines that drift slightly
  - per-letter irregularity only for fonts whose letters don't join, because it would break
    cursive connections
  - dip-pen ink cycles: ink gets lighter over a few words, then dark again after a "re-dip"
- **Helpers:** automatic font sizing, and a Roman style option (uppercase, U→V, J→I, and a raised
  dot between words).
- **Later:** uploading your own font, such as a Dethek or Espruar font you own.

## Printing and export

The image is the main output: it can be shared directly (chat, a virtual tabletop), where it looks
best, or printed. Printing is supported but isn't the priority; prints from a basic black-and-white
printer came out fine in testing.

- **Size:** each medium has a real size in mm, adjustable from 50% to 150% (shown in cm and
  inches).
- **Print:** renders at 300 DPI into a print-only layout sized in mm, on a page turned to suit the
  object, so it prints at true size at 100% scale. The paper size comes from the browser's print
  dialog; an object too big for the page shrinks to fit.
- **PNG download:** includes the DPI, with an optional transparent background for virtual
  tabletops like Foundry and Roll20. PDF export comes later.
- **Share links:** the page's URL always encodes the current handout (compressed settings after
  `#s=`), and settings are saved in the browser between visits.
- **Not built:** a calibration page and a print-friendly brightness option. Printing isn't the
  priority, so these wait until someone needs them.

## Project layout

Items marked *(planned)* don't exist yet.

```
.github/workflows/deploy.yml     # test, build and deploy to Pages on push to main
index.html · vite.config.ts · package.json · .nvmrc
public/                          # copied as-is (favicon)
docs/PLAN.md                     # this file
dev/contact-sheet.html           # dev server only: media × fade × damage grids, print-res crops
src/
  main.ts · style.css            # app entry: wires settings, panel, preview and export
  settings.ts · share.ts         # the Settings model and defaults; share links and autosave
  presets.ts                     # ready-made handouts
  scene.ts                       # settings → everything the renderer needs, in mm
  media/                         # media (sizes, variants, methods, damage mix), shapes, writing methods
  text/                          # fonts, layout/fit/wrap, the writing hand, markup, Roman forms
  damage/                        # seeded generators (chips, breaks, cracks, holes, burns, tears…) and GPU packing
  render/
    gl.ts · targets.ts           # WebGL2 context, capability checks, programs, render targets
    distanceField.ts             # jump-flood signed distance to the letters
    renderer.ts · display.ts     # cached surface + lighting passes; drawing to the page
    shaders/                     # all GLSL; .vert/.frag entry points, .glsl libraries
      lib/ surface/ media/ writing/ damage/  # media/stone.glsl and sheet.glsl hold shared behaviour
  export/                        # PNG with DPI, file download, printing at true size
  ui/                            # store, control builders, the control panel
  dev/contactSheet.ts            # the contact sheet page
  util/rng.ts                    # seeded PRNG
```

## Milestones

**Phase 0: Setup and deploy.** *(done)*
- Vite/TS project, the deploy workflow, and a WebGL2 test canvas live on Pages.
- *Done when* a push to `main` updates the site.

**Phase 1: Get Marble and Paper looking real.** *(done; a test print on a black-and-white printer
looked good)*
Prove the look on two very different media before building everything else.
- text layout, a few fonts, the distance field, the noise library, and the combine and lighting
  steps
- carved marble and inked paper
- Fade on both, plus two damage types: marble chips and water-damaged paper with running ink
- seeds, 300 DPI PNG export, and the contact sheet page for tuning

*Done when* the image is convincing, on screen or printed, and readability drops off smoothly as
the sliders go up.

**Phase 2: The full starting set.** *(done)*
- Sandstone, Wood and Papyrus, plus Parchment, Granite and Slate
- the remaining damage types
- writing methods: flat-bottomed cuts, paint- or gold-filled carving, painted, burned, carbon ink
- shapes, lighting controls and color variants

**Phase 3: Handout workflow.** *(done; the page-size picker was dropped in favour of the print
dialog, and the calibration page is deferred)*
- true-size printing, and PNG with DPI and transparency
- share links and autosave
- presets: "Roman epitaph", "Burnt letter", "Papyrus fragment", "Tavern sign"
- targeted-damage markup
- Roman helpers and handwriting realism (pen pressure added)
- mobile layout (the preview stays pinned at the top), and a clear message on browsers without
  WebGL2

**Backlog:**
- media: bronze plaque, clay and wax tablets, leather, chalk on slate
- writing methods: pencil, typewriter, burned-in lettering
- extras: wax seals, a signature in a different hand
- converting text to runes
- painting damage onto the preview by hand
- several handouts per sheet, PDF export, and a "photo mode" showing the object on a table
- offline use

## Risks

- **Realism:** Phase 1 and the contact sheet are aimed at this. If a material doesn't look real
  when generated from noise, it can be blended with a free public-domain photo texture (from
  ambientCG or Poly Haven).
- **GPU memory at 300 DPI:** a full Letter page needs about 150–250 MB of GPU memory.
  Lower-precision buffers help, and large exports can be rendered in tiles.
- **Printers vary:** a low-priority concern, since the image can always be shared instead. The
  calibration page and brightness option are nice-to-haves.
- **Font licensing:** only openly licensed fonts get bundled, so no Trajan. Anything else comes
  through user upload.

## Decisions

- US Letter is the default page size, with A4 and others available.
- Stone and wood get photo-style lighting; paper gets scan-style lighting.
- The UI is plain TypeScript, with no framework.
- Everything runs in the browser; nothing is sent anywhere.
- The deploy workflow doesn't cache dependencies, following setup-node's guidance for workflows
  that publish.
