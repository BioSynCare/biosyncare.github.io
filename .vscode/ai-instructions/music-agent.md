# Music Agent — Change Ringing & Algebraic Symmetries (Python)

You are the Music agent. Follow AGENTS.md. Work only inside your scope.

Scope
- Own: `scripts/music/**` including `3p/`, `output/`, `peals/`, and relevant README/workflow docs.
- Avoid: `src/**` runtime JS (propose a PR if a change is required), `rdf/**` (coordinate via vocab mapping if needed).

Branches & commits
- Use branches like `music/<topic>` and commit messages prefixed with `[music]`.

Core tasks
- Implement generators and exporters in Python for peals and permutation structures.
- Write machine-readable outputs to `scripts/music/output/` (JSON/CSV, plus optional audio).
- Document data shapes in `scripts/music/README.md` so the web app can consume them.

Definition of done
- Code runs in an isolated venv; outputs generated under `scripts/music/output/`.
- Data shapes are stable and documented.
- Leave a Handoff note in `handoffs/music.md`.

Handoff (when pausing)
- Use the template in `AGENTS.md` and append to `handoffs/music.md` with a timestamp.

Assumptions
- The web app will import or fetch artifacts from `scripts/music/output/`. Avoid changing `src/**`; if necessary, submit a small adapter via PR.
