## FinSim Feedback Form (GitHub Issues via Serverless Relay)

### Goals and constraints
- **Single in-app input box**: Users type feedback in a modal; no external redirects, no GitHub UI.
- **No database**: Use GitHub Issues as the backend record. No server persistence.
- **Privacy-first**: Only send the message and minimal non-PII context. No email collection.
- **Status updates without email**: Track issue numbers locally and check status via a serverless relay.
- **Static site compatibility**: Keep FinSim purely static; the relay runs separately (e.g., Cloudflare Worker).

### High-level architecture
1. **Frontend (FinSim UI)**
   - Adds a `Feedback` item in the burger menu that opens a minimal modal (one textarea + Submit/Cancel). Do not add a header button.
   - On Submit, POSTs to a relay endpoint with the message and minimal context.
   - Stores returned `issueNumber` locally and periodically checks for status updates.
   - Shows neutral in-app toasts when state advances. Never shows GitHub links/IDs.

2. **Serverless relay (Cloudflare Worker)**
   - Endpoint `POST /feedback`: creates a GitHub Issue in the repo using a repo‑scoped token.
   - Endpoint `POST /feedback/status`: returns simplified status for a batch of issue numbers.
   - Enforces CORS to FinSim domains. No storage; stateless.

Data flow
```
User → FinSim modal → POST /feedback → Worker → GitHub Issues
                                    ← { issueNumber }

On load/run → POST /feedback/status with [issueNumbers] → Worker → GitHub API
                                                    ← mapped statuses
```

### UI changes (static HTML + JS)
- `src/frontend/web/ifs/index.html`
  - Burger menu: add a `Feedback` item with id `sendFeedbackMobile` (near `startWizardMobile`). The Feedback action lives only in the burger menu; do not add a header button.
  - Optional: add a global config line for the relay URL:
    ```html
    <script>window.FEEDBACK_RELAY_URL = 'https://<your-worker-subdomain>.workers.dev';</script>
    ```
  - IMPORTANT: After editing JS/CSS references, update cache-busting query params in the "SYSTEM UTILITIES" section at the bottom of this file per project rules.

- `src/frontend/web/WebUI.js`
  - Wire binding in startup to open the feedback modal on `#sendFeedbackMobile` click.
  - Trigger background status checks on app load and when the user clicks `Run Simulation`.

- New module (recommended): `src/frontend/web/components/FeedbackManager.js`
  - Responsible for rendering/opening/closing the modal, submission, local tracking, and status polling.
  - Add a `<script>` tag for this file to `src/frontend/web/ifs/index.html` with a cache-busting param.

### Frontend implementation details

Create `FeedbackManager` (class) with the following responsibilities:
- **Modal lifecycle**
  - Lazy-create DOM the first time it is opened to avoid startup cost.
  - Accessibility: focus trap within modal, `aria-modal="true"`, close on ESC, and restore focus to the invoker.
  - Structure:
    - Title: “Send feedback”
    - Single textarea (placeholder: “How can we improve?”), character counter, max length ~2,000.
    - Buttons: `Submit` (primary), `Cancel` (secondary).
    - No references to GitHub. No extra fields.

- **Submit flow**
  - Gather minimal context only:
    - `version`: from `WebUI.getVersion()` or `localStorage.getItem('simulatorVersion')` fallback.
    - `url`: `location.href` (redact query if needed).
    - `ua`: `navigator.userAgent`.
    - `screen`: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`.
    - `tz`: `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - POST to `window.FEEDBACK_RELAY_URL + '/feedback'` with `Content-Type: application/json`:
    ```json
    { "message": "...", "version": "1.27", "url": "...", "ua": "...", "screen": "...", "tz": "..." }
    ```
  - On success: expect `{ issueNumber: number }`.
    - Store the issue locally (see Tracking below).
    - Close modal, clear textarea, show toast: “Thanks for your feedback!”
  - On failure: show toast error and keep the modal open.

- **Tracking (localStorage)**
  - Key: `finsim_feedback`
  - Value: array of records `{ issue: number, createdAt: ISO, lastKnown: 'received'|'acknowledged'|'in-progress'|'resolved', lastNotifiedAt?: ISO }`
  - Add a companion timestamp key `finsim_feedback_last_check` to rate-limit status checks (e.g., once per 24h).

- **Status checks**
  - When the app loads and when `Run Simulation` is pressed:
    - If `Date.now() - last_check` < 24h, skip.
    - If there are tracked issues, POST to `.../feedback/status` with `{ issues: number[] }`.
    - Response shape:
      ```json
      {
        "statuses": [
          { "issue": 123, "state": "received|acknowledged|in-progress|resolved", "updatedAt": "ISO", "note": "optional" }
        ]
      }
      ```
    - Compare each item’s `state` with `lastKnown`:
      - If advanced, show a neutral toast:
        - to `acknowledged`: “We received your feedback. Thank you!”
        - to `in-progress`: “We’re working on an update inspired by your feedback.”
        - to `resolved`: “An update inspired by your feedback has shipped.”
      - Update `lastKnown` and `lastNotifiedAt`.
      - Optionally remove entries in `resolved` to keep the list small.

- **Integration points**
  - In `WebUI` constructor/init:
    - Instantiate `FeedbackManager` and keep a reference (`this.feedbackManager`).
    - Bind `#sendFeedbackMobile` to `feedbackManager.open()`.
    - In `setupRunSimulationButton`, call `this.feedbackManager.checkStatusesIfDue()` early.
    - Also call `checkStatusesIfDue()` after DOMContentLoaded.

- **Notifications**
  - Reuse `NotificationUtils.showToast(title, message, timeoutSeconds)`.
  - Keep messages short and neutral; no issue numbers or links.

### Cloudflare Worker (serverless relay) implementation

Endpoints
- `POST /feedback`
  - In: `{ message, version, url, ua, screen, tz }`
  - Out: `{ issueNumber }`
  - Behavior:
    - Validate `message` (non-empty, length cap ~4–8k).
    - Build GitHub issue title: `"User feedback"`.
    - Build body:
      ```
      ## Feedback

      <message>

      ---
      Version: <version>
      URL: <url>
      Browser: <ua>
      Screen: <screen>
      Timezone: <tz>
      ```
    - Create issue via `POST https://api.github.com/repos/<owner>/<repo>/issues` with headers:
      - `Authorization: Bearer <env.GITHUB_TOKEN>`
      - `Accept: application/vnd.github+json`
      - `X-GitHub-Api-Version: 2022-11-28`
    - Labels: `feedback` (and optionally `from-app`).
    - Return `{ issueNumber: issue.number }`.

- `POST /feedback/status`
  - In: `{ issues: number[] }`
  - Out: `{ statuses: Array<{ issue, state, updatedAt, note? }> }`
  - Behavior:
    - Fetch each issue via `GET /repos/<owner>/<repo>/issues/<number>` (parallel with a small concurrency limit).
    - Map to simplified states:
      - `closed` → `resolved`
      - `open` with label `in-progress` → `in-progress`
      - `open` with label `triaged` or `acknowledged` → `acknowledged`
      - else `received`
    - `updatedAt`: `issue.updated_at`.
    - Optional `note`: short, sanitized latest maintainer comment (not required for v1).

Security & CORS
- Restrict `Origin` to production GitHub Pages domain and `http://localhost:8080` for dev.
- Handle `OPTIONS` preflight and set `Access-Control-Allow-Origin` to the validated origin.
- Rate-limit per-IP and/or per-Origin (optional) to mitigate abuse.
- Cap payload sizes; reject binary.

Token & permissions
- Use a fine-grained GitHub PAT scoped to the target repo with `Issues: Read/Write` only.
- Store PAT only as `GITHUB_TOKEN` secret in Worker environment. Never expose to the client.

Configuration
- Define `window.FEEDBACK_RELAY_URL` in `src/frontend/web/ifs/index.html`.
- Allow origins list in Worker: `['https://<your-gh-pages-domain>', 'http://localhost:8080']`.
- Labels: `feedback` (add `in-progress`, `triaged`, `acknowledged` as applicable to your workflow).

Deployment (Worker)
1. Create a new Cloudflare Worker service.
2. Add secret `GITHUB_TOKEN`.
3. Deploy and note the public URL.
4. Add the URL to `window.FEEDBACK_RELAY_URL` in FinSim.

Cache-busting (FinSim rule)
- After adding `FeedbackManager.js` and/or modifying any JS/CSS referenced by `src/frontend/web/ifs/index.html`, update the cache-busting query string for those `<script>`/`<link>` tags to the current date (and bump suffix if multiple edits in same day).

Testing plan (manual, per project guidance)
- Local dev: `npm install` then `npx serve -s . -l 8080`, open `http://localhost:8080`.
- Configure `window.FEEDBACK_RELAY_URL` to your Worker and allow `http://localhost:8080` in CORS.
- Steps:
  1. Open app, open the burger menu, click `Feedback` → modal appears with one textarea.
  2. Submit with non-empty message → success toast appears; modal closes.
  3. Confirm `localStorage['finsim_feedback']` contains an entry with `issue` and `lastKnown: 'received'`.
  4. Reload app → if last check is stale, client calls `/feedback/status`.
  5. In GitHub, add label `triaged` → refresh/reload; see one-time “We received your feedback” toast; `lastKnown` updates to `acknowledged`.
  6. Add label `in-progress` → see “We’re working on an update…” toast.
  7. Close the issue → see “An update inspired by your feedback has shipped.” toast; entry removed or marked `resolved`.
- Do not attempt to open browser programmatically; user runs their own browser per project policy.

Optional enhancements
- “Don’t show updates” toggle: suppress toasts while continuing silent tracking.
- Basic profanity/PII hint below textarea.
- Character counter and remaining quota indicator.
- Simple HMAC on `/feedback` with a public salt to discourage automated spam (still keep CORS & rate-limits).

Acceptance criteria
- Users can submit feedback entirely within the app; no redirections.
- No database required; issues are created in GitHub with proper metadata.
- Local status tracking and neutral, one-time notifications on state advancement.
- Token never exposed client-side; CORS restricted to FinSim domains.
- Cache-busting updated for any changed/added JS in `src/frontend/web/ifs/index.html`.


