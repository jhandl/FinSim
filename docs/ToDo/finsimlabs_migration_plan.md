# FinSim Labs — Local-build migration plan (phased)

This plan gets you from your current **public** `finsim.ie` repo (Ireland-only) to a new setup with **two repos** and a **local build + artifact deploy** flow for `finsimlabs.com`, **without premium features yet**.

## Guiding constraints

- Keep **existing production** (`finsim.ie`, current public repo) running unchanged until the end.
- New multi‑country work lives in a **private** source repo.
- The deployed site is served from a **public** repo containing only build artifacts (`dist/`), suitable for GitHub Pages + Cloudflare.
- Builds run **locally**; deployment is a push of artifacts into the public deploy repo.
- Everything should stay within **GitHub + Cloudflare free tiers** if possible.
- Premium/paywall/Workers/Stripe are **explicitly out of scope** until after Phase 4.

---

## Naming (recommended)

- **Existing prod repo (unchanged for now):**
  - `finsim` (public) — continues to serve `finsim.ie`.

- **New repos:**
  - `finsimlabs-app` (private) — source code, build tooling, local scripts.
  - `finsimlabs-site` (public) — deploy-only artifacts for GitHub Pages.

You can adjust names; keep the “app/source vs site/artifacts” separation.

---

## Phase 1 — Establish the two new repos (prod stays where it is)

### Objectives
- Create the new repo split with **no functional changes** yet.
- Get `finsimlabs.com` serving a placeholder or minimal page from the new deploy repo.
- Do not touch `finsim.ie` or its current pipeline.

### Steps
1. **Create GitHub repos**
   - Create `finsimlabs-app` as **private**.
   - Create `finsimlabs-site` as **public**.

2. **Enable GitHub Pages for `finsimlabs-site`**
   - Pages source: `main` branch, `/ (root)` **or** `/docs` (pick one and stick with it).
   - Commit a simple `index.html` placeholder so Pages has content.

3. **Cloudflare DNS + routing**
   - In Cloudflare, add `finsimlabs.com` to your account (if not already).
   - Create DNS records to point `finsimlabs.com` (and optionally `www`) to GitHub Pages.
     - Use Cloudflare’s recommended GitHub Pages setup (CNAME + flattening / proxy settings) for apex domains.
   - Confirm TLS works and the placeholder loads.

4. **Baseline security headers**
   - Add a simple Cloudflare configuration (Rules / Transform Rules) for:
     - `Strict-Transport-Security`
     - `X-Content-Type-Options: nosniff`
     - `Referrer-Policy: no-referrer` (or `strict-origin-when-cross-origin`)
     - A conservative `Content-Security-Policy` (you can tighten later once you know asset patterns)

### Deliverables (exit criteria)
- `finsim.ie` unchanged and still working.
- `finsimlabs.com` serves a placeholder page from `finsimlabs-site`.
- You can deploy by pushing commits to `finsimlabs-site`.

### Rollback
- If DNS/Pages misbehaves: revert Cloudflare DNS records; `finsim.ie` is unaffected.

---

## Phase 2 — Link repos with local build tools (no premium)

### Objectives
- Introduce a minimal build system in the private repo.
- Produce a deterministic `dist/` folder locally.
- Deploy `dist/` to the public deploy repo automatically via a local script.
- Still no premium, no Workers, no auth, no Stripe.

### Steps
1. **Initialize project in `finsimlabs-app`**
   - Copy your current `relocation` branch code into `finsimlabs-app` as the starting point.
   - Keep history if useful:
     - Option A: `git clone` current repo, add a new remote, push a new branch.
     - Option B: copy files and start fresh (simpler, loses history).

2. **Add minimal build tooling**
   Choose one:
   - **Vite** (recommended if you want SPA ergonomics)
   - **esbuild** (recommended if you want minimal surface area)

   The build should output:
   - `dist/index.html`
   - `dist/assets/...` (JS/CSS)
   - Any static assets copied into `dist/`

3. **Define standard scripts**
   In `package.json` (conceptually):
   - `dev` — local dev server
   - `build` — produces `dist/`
   - `preview` — serves `dist/` locally
   - `lint` / `test` (optional now)

4. **Add a local deploy script**
   Create `scripts/deploy-site.(sh|js)` in `finsimlabs-app` that:
   - Runs `npm ci` (or `npm install`) if needed
   - Runs `npm run build`
   - Checks out `finsimlabs-site` into a temp directory (or uses a sibling folder)
   - Replaces the deploy repo contents with `dist/` contents
   - Commits with a message like `Deploy <git-sha> <timestamp>`
   - Pushes to `main`

   Notes:
   - Ensure the deploy script **never** copies source files, only `dist/`.
   - Ensure `dist/` is *not* committed in `finsimlabs-app` (add to `.gitignore`).

5. **Wire the domain base path**
   - Ensure the app works when hosted at the root of `https://finsimlabs.com/`.
   - If you use SPA routing, ensure refresh/deep links work (GitHub Pages limitations).
     - Easiest: hash routing (`/#/path`) initially, or a simple single-page app without deep routes.

### Deliverables (exit criteria)
- `npm run build` in `finsimlabs-app` outputs `dist/`.
- Running the deploy script updates `finsimlabs-site` and the updated app appears on `finsimlabs.com`.
- No premium logic; just the free app behaving correctly.

### Rollback
- Revert the last commit(s) in `finsimlabs-site` to return to the placeholder.
- `finsim.ie` remains unchanged.

---

## Phase 3 — Test the process (repeatable releases)

### Objectives
- Validate repeatability: you can make a change, build, deploy, and verify quickly.
- Add basic release hygiene: version stamping, smoke checks, and safe rollback.

### Steps
1. **Add version stamping**
   - Embed a version string in the UI footer or console:
     - Example: `APP_VERSION = <git-sha>` injected at build time.
   - This makes it obvious which build is deployed.

2. **Add a smoke-test checklist (manual, fast)**
   Maintain a short checklist in the repo (e.g., `docs/release-checklist.md`):
   - Load app in a private window
   - Run a representative simulation
   - Verify key UI interactions
   - Verify no console errors
   - Verify version string matches expected commit

3. **Add pre-deploy guardrails**
   In the deploy script:
   - Confirm working tree is clean (no uncommitted changes) unless you intentionally allow it.
   - Confirm you’re on the expected branch (e.g., `main`).
   - Optionally require a tagged release or a `--force` flag.

4. **Define rollback procedure**
   - Rollback is “git revert” in `finsimlabs-site` to the last known good deploy commit.
   - Document this procedure in `docs/ops.md`.

### Deliverables (exit criteria)
- You can do 3 consecutive “change → build → deploy” cycles without surprises.
- You can identify deployed code by version string.
- Rollback steps are documented and tested once.

---

## Phase 4 — Carefully migrate old prod into the new setup

This phase is about **moving the Ireland-only prod** from its current repo into the new repo architecture **without breaking finsim.ie**.

### Objectives
- The Ireland-only app becomes buildable/deployable from the new architecture.
- `finsim.ie` continues to serve the Ireland-only product, now from a deploy-only repo.
- The old production repo can be frozen/archived after confidence is high.

### Strategy options
Pick one; the plan below assumes **Option A** (recommended).

#### Option A (recommended): keep two deploy repos
- `finsim-site` (public) — deploy-only artifacts for `finsim.ie`
- `finsimlabs-site` (public) — deploy-only artifacts for `finsimlabs.com`
And two private source repos:
- `finsim-app` (private) — Ireland-only source
- `finsimlabs-app` (private) — multi-country source

This keeps products isolated and reduces risk.

#### Option B: single source repo with two build targets
- One private repo builds two sites, deploying to two public repos.
This is doable, but adds complexity earlier than necessary.

### Steps (Option A)
1. **Create new repos for finsim.ie**
   - `finsim-app` (private)
   - `finsim-site` (public, GitHub Pages enabled)

2. **Move the current Ireland-only source into `finsim-app`**
   - Start by copying from the current production repo `main`.
   - Add the same build tooling approach as `finsimlabs-app` (reuse as much as possible).

3. **Set up local deploy script for finsim.ie**
   - Same artifact-only push flow: `finsim-app` builds → deploys to `finsim-site`.

4. **Dual-run period (parallel validation)**
   - Deploy `finsim-site` to a **temporary subdomain** first:
     - e.g. `next.finsim.ie` (Cloudflare DNS points to GitHub Pages for `finsim-site`)
   - Run smoke tests and compare behavior with current `finsim.ie`.

5. **Cutover**
   - Change Cloudflare DNS for `finsim.ie` to point to the new `finsim-site` GitHub Pages.
   - Validate quickly with your smoke checklist.

6. **Stabilize**
   - Keep the old repo intact (read-only) for a period.
   - After confidence, archive it or add a banner pointing to the new setup.

### Deliverables (exit criteria)
- `finsim.ie` is served from `finsim-site` (artifact-only).
- Ireland-only source is private (`finsim-app`).
- Old production repo is no longer the deploy source.

### Rollback
- Revert Cloudflare DNS to the old GitHub Pages origin (old repo).
- Because this is DNS-based, rollback is fast and low-risk.

---

## Post-Phase 4 — What we’ll plan next (not implementing yet)
Once Phase 4 is complete, the next plan will cover:
- Premium partitioning (free vs premium modules)
- Encrypted premium payload (`premium.bin`) + obfuscated loader
- Cloudflare Workers (verify license, Stripe webhook)
- D1/KV schema and key/rotation strategy
- Hardening (rate limits, anti-tamper signals, CSP tightening)

---

## Tracking checklist (copy into an issue tracker if you want)

- [ ] Phase 1: `finsimlabs-app` created (private)
- [ ] Phase 1: `finsimlabs-site` created (public) + Pages enabled
- [ ] Phase 1: `finsimlabs.com` serves placeholder via Cloudflare + Pages
- [ ] Phase 2: Build tooling added to `finsimlabs-app`
- [ ] Phase 2: Local deploy script pushes `dist/` to `finsimlabs-site`
- [ ] Phase 2: `finsimlabs.com` serves built app
- [ ] Phase 3: Version stamping in UI
- [ ] Phase 3: Smoke checklist + rollback documented and tested
- [ ] Phase 4: `finsim-app` + `finsim-site` created
- [ ] Phase 4: `next.finsim.ie` parallel validation
- [ ] Phase 4: `finsim.ie` cutover to `finsim-site`
- [ ] Phase 4: Old prod repo frozen/archived

