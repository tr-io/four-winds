# Third-party components

- **Three.js** — MIT. 3D rendering and its RoundedBoxGeometry addon. [Source](https://github.com/mrdoob/three).
- **Kobalab majiang-core 1.4.1** — MIT, Satoshi Kobayashi. Riichi decomposition and scoring. [Source](https://github.com/kobalab/majiang-core). The server supplies EMA-specific parameters rather than package defaults. The checked-in patch adds a seven-pairs scoring switch for house rules; the default remains unchanged.
- **masaue/jan-js-lib 2.0.0** — Apache-2.0, copyright 2021 masaue. MCR scoring patterns. [Source](https://github.com/masaue/jan-js-lib). The checked-in patch fixes a closed-wait suit comparison, canonicalizes four-chow order, and adds a seven-pairs switch. Flowers and physical hand validation are handled by Four Winds. Regression tests cover both upstream defects.
- **DM Sans / Cormorant Garamond** — SIL Open Font License, distributed through Fontsource. Fonts are bundled locally; their package license files remain in the installed dependencies.
- **Express, Socket.IO, Vite, Zod, Helmet, TypeScript, tsx, Vitest, Playwright, and patch-package** retain their respective upstream licenses in their packages.

Tile faces, layout, interface icons, and the table geometry are drawn in this project. Animal glyphs use the operating system's emoji font. Rulebooks are linked as research references rather than redistributed; the game's rules note paraphrases the necessary facts.

`npm ci` applies the patches in `patches/` through the `postinstall` script. Keep the dependency versions, patches, and regression tests together when upgrading. The complete upstream package license notices are preserved in `node_modules` in the runtime image.
