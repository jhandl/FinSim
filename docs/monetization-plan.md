## FinSim Monetization Plan (No-Backend, Privacy-First)

### Objectives and Constraints
- **Privacy-first**: Do not collect or store PII. All purchases and identity are handled by a third party.
- **Static app**: Runs entirely in the browser via GitHub Pages (no backend, no serverless, no webhooks you control).
- **Payment + entitlement**: Use a third party for payment/licensing; app must differentiate free vs paid purely client-side.
- **Compatibility**: Frontend edits only; core `src/core/` remains GAS-compatible and unchanged.

### High-Level Approach
- **Anonymous entitlements**: Store a locally cached entitlement token (license) in `localStorage`. Token is either:
  - a signed offline token (recommended), or
  - an online-validated license (verified through vendor’s public API each startup).
- **Feature gating**: Introduce a small `Entitlements` client module and a `FeatureGate` helper. The UI checks `FeatureGate` before enabling premium features.
- **No user accounts**: Users paste a license key or upload a license file. The app never learns their identity; all customer records live with the vendor.

### Monetization Models (Feasibility under Constraints)
- **Subscriptions (monthly/yearly, tiered)**: Recommended. Deliver time-bound, signed entitlement tokens (e.g., exp in 30 days). App verifies offline; refresh on expiry by contacting vendor with license key.
- **One-time “Pro” license**: Issue a long-lived signed token. Can include major version limits or upgrade windows.
- **Pay-what-you-want (PWYW)**: Supported if vendor supports PWYW pricing. Entitlement issuance identical to one-time or subscription depending on product setup.
- **Credits (consume per use)**: Not recommended with zero backend. Secure decrement requires a trusted counter you control. Viable only if the vendor natively supports client-usable metering APIs (rare) or you relax enforcement to best-effort local counters.
- **Add-on content packs**: Ship premium tax rule packs, wizards, or scenarios as separately downloadable, signed assets. The app loads and verifies signatures at runtime. Works well with static hosting.

### Third-Party Options (No-Server Viability)
- **Gumroad**
  - Pros: Simple checkout, PWYW support, license verification endpoint historically callable from client with product permalink + license key.
  - Cons: CORS and policy may change; no offline signature tokens; verification requires network on each check.
  - Fit: Good for quick start (online verification). Pair with periodic caching for offline grace.
- **Keygen (keygen.sh)**
  - Pros: Cryptographic license tokens verifiable offline with public key; supports tiers/entitlements in payload; can issue time-bound tokens.
  - Cons: Requires verifying feasibility of client-side token mint/refresh (CORS) without exposing secrets.
  - Fit: Best for robust offline verification without your backend.
- **Lemon Squeezy / Paddle / Stripe**
  - Typically require secret keys or webhooks for license checks. Without a backend, you’d need either:
    - manual distribution of a signed license file post-purchase, or
    - a vendor-managed endpoint that exchanges a user-visible license key for a signed token without your secret.
  - Fit: Possible if you use license files or a vendor feature akin to Keygen; otherwise not ideal.

Recommendation: Start with Gumroad (fastest) or Keygen (most robust). If choosing Gumroad, design an offline grace period and cache the last valid check. If choosing Keygen, use their ECDSA-signed token flow for offline checks.

### What to Gate (Initial Proposal)
- **Monte Carlo**: cap free users to a small number of runs (e.g., 250) and scenarios per session; higher caps for paid tiers.
- **Dual-person mode**: available to paid tiers only or with limits (e.g., export disabled for free).
- **Export/Import enhancements**: CSV export, multi-scenario save slots, or batch runs.
- **Advanced wizards**: property purchase with mortgage helper, multi-asset analytics, and pinch-point visualizations.
- **Additional tax packs**: extra countries or premium rule variants shipped as signed packs.

### Entitlement Token Design (Offline-Friendly)
- **Format**: JWT or custom JSON with detached signature using WebCrypto-verifiable alg (ES256 recommended).
- **Claims**: `iss`, `aud`, `sub` (randomized non-PII), `tier` (e.g., free/pro/plus), `features` (array of gates), `limits` (e.g., `{"monteCarlo.maxRuns": 5000}`), `nbf`, `exp`, `nonce` (anti-replay), optional `deviceHint` (non-PII).
- **Validation**:
  - Verify signature using embedded vendor public key (ECDSA P-256) via `crypto.subtle.verify`.
  - Check `nbf/exp`, `iss/aud`, and optional `nonce` freshness.
  - On success, cache token in `localStorage` with `lastValidatedAt`.
  - If expired, attempt refresh with vendor using license key; otherwise enter grace mode or downgrade to free.

### Online License Verification (If Using Gumroad-like Flow)
- **Flow**: User pastes license key → app calls vendor `verify` endpoint with `product` + `license_key` → on success, store vendor response and synthesize a short-lived, app-signed cache record (not a real signature; used only for UX) with `nextCheckAt`.
- **Tradeoffs**: Requires network to validate; use cached “valid until” to tolerate brief offline periods. Avoid shipping secrets.

### Add-on Content Packs (Signed Assets)
- **Packaging**: JSON/YAML packs (e.g., tax rules, wizard templates) zipped and signed (manifest + signature). Host on vendor CDN or a private bucket.
- **Loading**: App fetches pack only when entitlement or license file is present; validates signature using public key; then enables features driven by the pack.
- **Benefits**: Prevents casual copying of premium content while keeping app static.

### Optional Email‑Based Accounts and Login (If We Collect Email)
Goals: enable multi‑device activation, recovery, optional sync, and better UX without building our own backend or storing credentials.

Options
- Vendor‑only accounts (no in‑app login)
  - Flow: purchase via vendor → vendor emails license → in‑app “Enter License” remains primary. “Recover license” opens vendor customer portal. The app never touches emails.
  - Pros: zero PII in app; simplest ops. Cons: no cross‑device auto‑sync; user has to keep their key.

- Passwordless identity via third‑party IdP (no passwords)
  - Providers: Magic.link, Clerk, Auth0 Passwordless (email magic link/OTP). Hosted login preferred.
  - Flow: user logs in → app receives an ID/DID token → derive stable `anonId` from token subject →
    - Encrypt and store local entitlement blob under this identity.
    - Optional: sync encrypted entitlement to user‑owned storage (see below) to enable cross‑device restore.
  - Mapping identity to entitlements:
    - Primary: user still enters license key once; app binds the resulting entitlement to identity for sync.
    - Vendor‑integrated (optional): only if the licensing vendor exposes a customer API that accepts IdP tokens from the browser (rare). Otherwise avoid.
  - Pros: no passwords, better UX, no app‑side email storage. Cons: extra dependency and cost; CORS/idp SDK footprint.

- Client‑only Firebase Auth (email link or social login)
  - Flow: use Firebase Authentication (hosted UI). Store only an encrypted entitlement blob per user in Firestore with strict client security rules (user can read/write only their own doc). We never run servers or see raw emails outside ID tokens.
  - Pros: mature SDK; client‑only feasible with correct rules. Cons: introduces third‑party datastore; needs security rules and quota management.

- User‑owned storage sync (no central DB)
  - Providers: GitHub Gist (private), Google Drive AppData, Dropbox App Folder (via OAuth).
  - Flow: sign in with provider → store an encrypted entitlement blob in the user’s own storage → on new device, sign in and restore the blob.
  - Pros: strong privacy; avoids any shared backend. Cons: more OAuth flows; token lifecycle handling.

PII Boundary and Compliance
- Use hosted IdP pages so credentials/emails never touch our app; we read only ID tokens.
- Do not persist emails or IDs locally beyond in‑memory use; persist only a random `anonId` and encrypted blobs.
- Update Privacy Policy/ToS to reflect the chosen IdP and the fact that identity is managed by that provider.

Implementation Outline (no code here)
- UI: add optional “Sign in” in header and `WelcomeModal`, clearly stating it enables sync/recovery and is not required for offline use.
- Identity: integrate one provider (Magic.link or Firebase hosted login). Avoid custom forms.
- Binding: when a license is entered, encrypt entitlement with a key derived from the IdP token subject and a local random salt; store locally and, if opted in, sync to user‑owned storage or Firestore.
- Restore: after sign‑in, look for encrypted blob → decrypt → validate token via existing `Entitlements` module → enable features.
- Off‑ramp: allow users to disconnect and purge synced blobs.

Trade‑offs Matrix (summary)
- Vendor‑only: simplest, no login, no sync.
- Passwordless IdP: good UX, no passwords, sync via user storage.
- Firebase: easiest all‑in‑one, but introduces third‑party DB.
- User‑owned storage: maximum privacy, more setup friction.

### Signed Pack Verification and Anti‑Tampering (Client‑Only)
#### Goals and Threat Model
- **Goals**: Ensure only licensed users can load premium packs; prevent trivial copying or toggling premium features via devtools; resist MITM/traffic sniffing from revealing usable data.
- **Non‑goals**: Perfect DRM. With no backend, a determined attacker can modify their local runtime. We aim to raise cost and block casual misuse while preserving privacy.

#### Pack Format
- Pack archive contains at minimum:
  - `manifest.json`: canonical JSON including `packId`, `version`, `algorithm` (`sha256`), `files[]` with `path`, `size`, `sha256`, and a `mode` per file: `signed` or `encrypted`.
  - `manifest.sig`: detached signature over the canonicalized `manifest.json` using vendor private key (ECDSA P‑256 or Ed25519).
  - One or more payload files. For sensitive data, use a single `payload.enc` (AES‑GCM) rather than many small files.

Example manifest fields (illustrative, not code):
- `packId`: stable identifier (e.g., `ie-premium-2025`)
- `version`: semantic or date version
- `files`: list with `path`, `sha256`, `mode`, optional `gcmNonce` for encrypted payloads
- `requiresEntitlements`: array of feature flags or a dedicated `packId` claim

#### Issuance and Hosting
- Vendor (or build pipeline) signs `manifest.json` using vendor private key. Public key ships with the app.
- Host `manifest.json`, `manifest.sig`, and payload on GitHub Pages or vendor CDN with HTTPS.
- Prefer hashed or opaque filenames (e.g., `packs/8d/a1/payload.enc`) to avoid leaking product names in URLs.

#### Client Verification Pipeline
1. Check local entitlement for pack access:
   - Token must include either the `packId` in `features`/`entitlements` or a `packKeys[packId]` entry if encryption is used.
2. Fetch `manifest.json` and `manifest.sig`.
3. Verify signature using embedded vendor public key via WebCrypto (`crypto.subtle.verify`). Reject on failure.
4. For each required file in `manifest.json`:
   - Fetch file as ArrayBuffer.
   - If `mode = signed`: compute SHA‑256 and compare to manifest.
   - If `mode = encrypted`: obtain `AES‑GCM` key from entitlement (`packKeys[packId]`) and decrypt using `gcmNonce` (96‑bit). GCM tag authenticates content; after decrypt, optionally re‑hash and compare to manifest.
5. Only after all checks pass, parse the decrypted JSON/YAML and activate corresponding features.

Notes:
- Store only encrypted bytes in cache (IndexedDB recommended). Do not persist decrypted payloads.
- On entitlement expiry, purge cached decrypted material (defense‑in‑depth) and require re‑decryption with a fresh token.

#### Keying Strategy (No Backend)
- Include per‑pack AES‑GCM keys in the signed entitlement under `packKeys[packId]` (base64url). Because the token is signed server‑side, clients cannot forge keys.
- Rotate keys periodically (e.g., monthly) by issuing new entitlements upon subscription renewal. Old keys naturally expire with the token `exp`.
- Optionally derive per‑install session keys: `K = HKDF(packKey, anonId, packId)` where `anonId` is a local random value. This raises effort to casually share decrypted blobs across devices while remaining PII‑free.

#### Anti‑Tampering Measures (Raising the Bar)
- **Minimal trusted surface**: Put signature verification, key handling, and gate decisions in a very small module (`Entitlements`), which is minified/obfuscated separately.
- **WASM helper (optional)**: Perform signature verification and AES in a tiny WebAssembly module to make live‑patching harder.
- **Runtime hardening**:
  - Freeze exported gate APIs (`Object.freeze`) and avoid global, easily monkey‑patchable symbols.
  - Compute simple self‑integrity checks for the gate bundle (e.g., embedded hash of its own source fetched by URL) and degrade gracefully on mismatch.
  - Disallow `eval` and inline scripts via a strict CSP meta tag in the HTML (`script-src 'self'; object-src 'none'; base-uri 'none'`).
- **Obfuscation**: Apply targeted obfuscation only to entitlement/crypto paths to keep the rest of the code readable.

Limitations: Users can still alter their local runtime in devtools. Encryption ensures they cannot produce valid decrypted pack data without a legitimate key.

#### Traffic Analysis Mitigations
- **Opaque paths**: Use hashed directories/filenames for packs; avoid human‑readable pack names in URLs.
- **Encrypted-at-rest**: Payloads are always encrypted. Network observers see ciphertext only.
- **Referrer policy**: Set meta `referrer` to `no-referrer` to minimize leakage when fetching vendor assets.
- **CSP `connect-src`**: Restrict outbound requests to `self` and selected vendor domains to reduce exfiltration surfaces.
- **Cache discipline**: Append cache‑busting dates to pack requests only when updated; avoid verbose query params that reveal product names.

#### Caching and Revocation Strategy
- Use IndexedDB to cache encrypted payloads keyed by `packId:version` and manifest hash.
- Never cache decrypted payloads. Require a valid token to decrypt on each app session (fast with WebCrypto).
- Token expiry acts as soft revocation. Key rotation on renewal limits long‑term sharing of keys.

#### Developer Checklist (Packs)
- Define `manifest.json` schema and canonicalization rules; implement signer in release tooling.
- Embed vendor public key in the app; verify signatures with WebCrypto.
- Implement AES‑GCM decrypt path guarded by entitlement `packKeys`.
- Add CSP meta tag and referrer policy in `src/frontend/web/ifs/index.html` during implementation.
- Use IndexedDB for encrypted cache; add purge on entitlement changes/expiry.

### FinSim Integration Plan (No Code Here, Implementation-Ready)
1. **Modules**
   - `src/frontend/web/utils/Entitlements.js`: loads/parses token or validates via vendor; exposes `getTier()`, `hasFeature(code)`, `getLimit(key)`; caches in `localStorage` under `finsim.entitlement` and `finsim.entitlement.meta`.
   - `src/frontend/web/utils/FeatureGate.js`: convenience wrappers for gating UI/actions; integrates with `NotificationUtils` / `ErrorModalUtils` for upgrade prompts.
2. **Startup Hook**
   - Inject `await Entitlements.initialize()` in `DOMContentLoaded` flow in `WebUI.js` after `Config.initialize(webUi)` and before showing welcome modal.
   - If token invalid/expired, show unobtrusive banner with “Enter License / Upgrade”.
3. **UI/UX**
   - Add “Upgrade” CTA in header and `WelcomeModal`. Implement a small “Enter License” modal (paste key or upload license file) with validation progress and error handling.
   - When a gated feature is clicked, show a contextual modal explaining the limit and linking to purchase.
4. **Gating Points (illustrative)**
   - Monte Carlo run initiation (cap runs or disable entirely on free).
   - Dual-person toggle and CSV export actions.
   - Loading premium data packs (tax rules, wizards).
5. **Storage/Privacy**
   - `localStorage` keys: `finsim.entitlement`, `finsim.entitlement.meta`, `finsim.anonId` (random UUIDv4), `finsim.lastLicenseCheckAt`.
   - Never store email, names, or purchase IDs.
6. **Security Hardening (optional)**
   - Minify/obfuscate only the `Entitlements`/`FeatureGate` modules to raise the bar for casual tampering.
   - Device binding is optional; if desired, derive a non-PII, unstable `deviceHint` (e.g., random per-install).
7. **Cache Busting**
   - After editing any JS/CSS, update the cache-busting date parameter in `src/frontend/web/ifs/index.html` per project rules.

### Credits Model: Feasibility Notes
- **Secure decrement** requires a trusted counter. With no backend, you cannot safely prevent resets/spoofing from client-side only.
- **Viable variants**:
  - Use a vendor that exposes a public, CORS-allowed metered entitlement API callable from the browser (rare). The browser decrements credits on each use server-side.
  - Ship prepaid single-use codes (small pool) redeemable with the vendor’s public API; the client “claims” a code per use. Operationally complex and fragile.
- **Recommendation**: Defer credits unless you adopt a vendor with client-side metering. Prefer subscriptions plus add-on packs.

### Implementation Tasks and Progress Tracking
- [ ] Select vendor and model: Gumroad (fast) or Keygen (offline tokens). Define tiers and pricing (including PWYW settings if used).
- [ ] Define entitlement schema (claims, features, limits) and finalize feature gating matrix.
- [ ] UX copy and flows for Upgrade/Enter License, and gated-feature prompts.
- [ ] Implement `Entitlements.js` and `FeatureGate.js` with WebCrypto verification (if using signed tokens) or online verification (if using Gumroad-style API).
- [ ] Insert startup hook into `WebUI.js` and wire UI prompts using `NotificationUtils`/`ErrorModalUtils`/`WelcomeModal`.
- [ ] Gate Monte Carlo, dual-person, export, and content packs according to the matrix.
- [ ] Integrate premium content packs (if any) with signature verification on load.
- [ ] Add minimal analytics-free counters (local only) for UX (e.g., remaining runs this session) with clear disclosure.
- [ ] Update `src/frontend/web/ifs/index.html` cache-busting for any modified JS/CSS.
- [ ] Write/update tests: unit tests for `Entitlements` parsing/validation, and UI tests for gating prompts. Manual UI validation per AGENTS.md.
- [ ] Publish and document how users activate licenses (paste key/upload file) without sharing PII.

### Open Decisions
- **Vendor**: Gumroad vs Keygen vs license-file distribution via another provider.
- **Gating matrix**: Exact limits and feature splits per tier.
- **Grace period**: How long to allow offline use after last successful validation (e.g., 7 days).
- **PWYW**: One-time vs subscription PWYW options and minimums.
- **Credits**: Adopt only if suitable client-callable metering exists.

### Rollout and Communication
- **Phase 1**: Soft-gate with informative prompts; grandfather existing users with an introductory token.
- **Phase 2**: Enforce limits, release premium packs, update landing docs and FAQ.
- **Support**: Provide self-service license re-download/upload; no email collection by the app; all purchase support handled by vendor checkout.


