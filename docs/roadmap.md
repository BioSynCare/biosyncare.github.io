# Refactor Roadmap – February 2025

## Phase 1 – Module Extraction & Engine Switches

- [ ] Move inline script from `index.html` into `src/main.js`
- [ ] Introduce `src/state`, `src/ui/vanilla`, `src/services` folders
- [ ] Add pluggable sensory engine registry (Web Audio vs Tone.js, Canvas vs Pixi.js/Three.js/p5.js, haptics)
- [ ] Surface currently selected engines in the diagnostics widget

## Phase 2 – Tooling & Quality

- [x] Add ESLint + Prettier configuration ✓ COMPLETED (2025-11-04)
- [ ] (Optional) Set up Husky + lint-staged for pre-commit checks

## Phase 3 – State Management Stores

- [ ] Introduce Zustand stores for auth, activity, and usage state
- [ ] Update UI modules to consume stores instead of manual globals

## Phase 4 – RDF & Ontology

- [ ] Replace custom parser with `n3` and build an `onc-service`
- [ ] Add unit tests for ontology parsing (Vitest/Jest)

# Extra

## ToDo

get documentation:

- Mass framework
- Music Python Package
- audiovisualMedicine, artigo conceitual

add visualization of sonic output:

- Spectrograms 2D, 3D, represented in shapes and other visual features.
- aeterni anima-style shapes with particles moving from and to places in trajectories.

freakcoding integration:
simple commands start and control/substitute the neurosensory stimulation tracks

use UI libs:
bootstrap? preact, react?

testing modules and deploy procedure:
we should test BSCLab and update firebase if rules changed

## Urgent

- [x] system diagnostics widget disappeared from the bottom left corner.
- [ ] mobile iphone safari not working
