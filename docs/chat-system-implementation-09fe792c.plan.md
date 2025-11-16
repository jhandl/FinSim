<!-- 09fe792c-5fdf-418e-ba4b-d21de1933c53 ecedd4cc-52bf-4a98-a1ee-29553c313a25 -->
# Chat System Implementation Plan

## Overview

Implement a two-way chat system that allows users to communicate with the developer through GitHub Issues. Users are identified by a unique client-side identifier stored in localStorage, enabling conversation tracking without requiring authentication. The UI starts as a simple feedback form and ONLY transforms into a GitHub issue comment-style interface when responses are available.

## Architecture

### Components

1. **ChatManager.js**: Core component managing chat UI, message sending, and response fetching
2. **Cloudflare Worker**: Serverless relay for GitHub Issues API (similar to feedback form plan)
3. **UI Integration**: Add message entry point in burger menu
4. **CSS Styling**: GitHub issue comment-style layout (NOT chat bubbles)

### Data Flow

```
User sends message → POST /chat → Worker → GitHub Issue (with user ID in metadata)
                                 ← { issueNumber }

User opens chat → GET /chat/conversation?userId=<uuid> → Worker → GitHub API
                                                      ← { issue, comments[] }

User receives notification → Check for new comments → Display in comment thread UI
```

## Implementation Details

### 1. Unique User Identification

**Location**: `src/frontend/web/components/ChatManager.js`

- Generate UUID v4 on first use (store in `localStorage` key `finsim_chat_userId`)
- If UUID exists, reuse it
- Include UUID in all GitHub issue metadata (not in title, but in body)
- This allows the worker to fetch all issues/comments for a specific user

**UUID Generation**:

- Use a simple UUID v4 generator (or crypto.randomUUID if available)
- Store as: `localStorage.setItem('finsim_chat_userId', uuid)`

### 2. ChatManager Component

**File**: `src/frontend/web/components/ChatManager.js`

**Responsibilities**:

- Modal lifecycle (lazy-create DOM on first open)
- Two UI modes:
  - **Feedback mode**: Single textarea + Submit button (when no conversation exists OR when conversation exists but no responses yet)
  - **Comment thread mode**: GitHub issue comment-style thread + input area (ONLY when at least one developer response exists)
- Message sending via POST to relay endpoint
- Periodic checking for new responses
- Notification display when new responses arrive
- Conversation state management in localStorage
- Mode switching: Start in feedback mode, switch to comment thread mode only when responses are detected

**localStorage Keys**:

- `finsim_chat_userId`: UUID v4 identifier
- `finsim_chat_conversation`: `{ issueNumber: number, lastCheckedAt: ISO, lastCommentId: number }`
- `finsim_chat_last_check`: Timestamp for rate-limiting checks

**Modal Structure** (Feedback Mode - default when no conversation exists or no responses yet):

- Title: "Send a message" or "Feedback"
- Single textarea (placeholder: "Type your message...", max length ~2000)
- Character counter
- Buttons: `Send` (primary), `Cancel` (secondary)
- No GitHub references
- Looks like a simple feedback form

**Modal Structure** (Comment Thread Mode - ONLY shown when responses exist):

- Title: "Conversation" (or "Messages")
- Scrollable comment thread area (GitHub issue comment style, NOT chat bubbles):
  - Comments displayed in chronological order (like GitHub issue comments)
  - Each comment shows: author name, timestamp, message body
  - User comments: Displayed with user identifier (e.g., "You")
  - Developer comments: Displayed with developer name/identifier
  - Timestamps: Relative (e.g., "2 days ago") or absolute if >7 days old
  - No "typing..." indicators, online status, or chat bubble styling
  - Styled exactly like GitHub issue comments: author header, timestamp, message body below
  - Visual design: author name bold, timestamp subtle, message body in standard text block
- Input area at bottom:
  - Textarea for new messages (labeled as "Add a comment" or similar)
  - Send button
- Design should clearly indicate asynchronous communication (comment thread, not real-time chat)
- When user first opens after sending initial message but before response: still show feedback form mode
- Only switch to comment thread mode when at least one developer response exists

**Message Display**:

- Format: GitHub issue comment style (NOT chat bubbles)
  - Comment header: `[Author] commented [timestamp]` (styled like GitHub)
  - Comment body: Full message text below header (standard text block, not bubble)
  - User comments: Author shown as "You"
  - Developer comments: Author shown as developer name
- Markdown support for all messages (using existing `marked` library)
- No bubble styling, no right/left alignment - standard threaded comment layout
- Visual appearance should match GitHub issue comment threads exactly

### 3. GitHub Issues Integration

**Issue Creation** (POST /chat):

- Title: `"User message"` (generic, no user ID)
- Body structure:
  ```
  ## Message
  
  <user message>
  
  ---
  User ID: <uuid>
  Version: <version>
  URL: <url>
  Browser: <ua>
  Screen: <screen>
  Timezone: <tz>
  ```

- Labels: `chat`, `from-app`
- Return: `{ issueNumber: number }`

**Conversation Fetching** (GET /chat/conversation):

- Query parameter: `userId=<uuid>`
- Worker searches GitHub Issues API for issues with:
  - Label `chat`
  - Body contains `User ID: <uuid>`
- Returns: `{ issue: { number, title, body, created_at }, comments: Array<{ id, body, created_at, user: { login } }> }`
- Only return comments from the repository owner (filter by `user.login` matching repo owner)

**Comment Creation** (POST /chat/comment):

- Endpoint: `POST /chat/comment`
- Body: `{ issueNumber: number, message: string }`
- Worker creates comment on the issue via GitHub API
- Returns: `{ commentId: number }`

**Status Checking** (POST /chat/check):

- Body: `{ issueNumber: number, lastCommentId?: number }`
- Returns: `{ hasNew: boolean, comments?: Array<{ id, body, created_at }> }`
- Compares comment IDs to detect new responses

### 4. UI Integration

**HTML Changes** (`src/frontend/web/ifs/index.html`):

- Add "Message" or "Send Message" button in burger menu (after "Help", before dividers)
- Button ID: `openChat` (NOT mobile-specific)
- Add script tag for `ChatManager.js` with cache-busting parameter
- Add config line: `<script>window.CHAT_RELAY_URL = 'https://<worker-subdomain>.workers.dev';</script>`

**WebUI Integration** (`src/frontend/web/WebUI.js`):

- Instantiate `ChatManager` in constructor: `this.chatManager = new ChatManager(this)`
- Bind `#openChat` click to `this.chatManager.open()`
- Call `this.chatManager.checkForNewMessages()` on app load and when `Run Simulation` is pressed (rate-limited)

**Notification System**:

- When new response detected, show toast: "You have a new message"
- Add visual indicator (badge) on message button when unread messages exist
- Store `finsim_chat_unreadCount` in localStorage

### 5. CSS Styling

**File**: `src/frontend/web/ifs/css/chat.css` (new file)

**Design Principles**:

- No real-time indicators (no "typing...", no online status)
- NO chat bubbles - use GitHub issue comment styling
- Comments displayed in vertical thread (like GitHub issue comments)
- Author name and timestamp in header, message body below
- Timestamps clearly visible but not prominent
- Mobile-responsive
- Consistent with existing modal styles (reference `welcome-modal`, `wizard-modal`)
- When no responses exist: show feedback form mode
- When responses exist: show comment thread mode

**Key Styles**:

- `.chat-modal`: Base modal container
- `.chat-comments`: Scrollable comment thread area (NOT "messages")
- `.chat-comment`: Individual comment container (styled like GitHub issue comment)
- `.chat-comment-header`: Author name and timestamp header
- `.chat-comment-body`: Comment text body (standard text block, NOT bubble)
- `.chat-input-area`: Fixed bottom input section
- `.chat-timestamp`: Subtle timestamp styling (matches GitHub style)
- Badge indicator for unread count on button
- NO bubble styling, NO right/left alignment - standard vertical comment thread

### 6. Cloudflare Worker Endpoints

**Endpoints** (similar to feedback form plan):

**POST /chat**:

- Creates GitHub Issue with user message
- Includes user ID in body metadata
- Returns `{ issueNumber }`

**GET /chat/conversation**:

- Query: `userId=<uuid>`
- Searches issues by label `chat` and user ID in body
- Fetches comments for the issue
- Filters comments to only repository owner's comments
- Returns `{ issue, comments }`

**POST /chat/check**:

- Checks if new comments exist since `lastCommentId`
- Returns `{ hasNew: boolean, comments?: [] }`

**POST /chat/comment**:

- Creates a comment on an issue (for developer use, may not be needed if using GitHub UI directly)

**CORS & Security**:

- Same as feedback form: restrict to FinSim domains
- Rate limiting per IP/origin
- Validate user ID format (UUID v4)

### 7. Conversation State Management

**Initial State** (no conversation):

- Show feedback form mode
- User can send first message

**After First Message** (but before response):

- Store `issueNumber` in localStorage
- Still show feedback form mode on next open (no responses yet)

**After First Response**:

- Switch to comment thread mode on next open
- Fetch and display conversation history in GitHub issue comment style

**On App Load**:

- Check if conversation exists (`finsim_chat_conversation`)
- If exists, check for new comments (rate-limited to once per hour)
- Show notification if new comments found
- Determine mode: feedback form if no responses, comment thread if responses exist

**Message Sending**:

- User types message in comment thread mode
- POST to `/chat/comment` (or add comment via issue number)
- Update local conversation state
- Refresh comment thread display

### 8. Error Handling

- Network failures: Show toast error, keep modal open
- Invalid user ID: Regenerate UUID
- Issue not found: Reset conversation state, show feedback form
- Rate limiting: Show appropriate message, retry later

## Testing Considerations

**Manual Testing** (per project guidance):

1. Open app, open burger menu, click "Message" → feedback form appears (NOT chat interface)
2. Send message → success toast, modal closes
3. Reload app → message button shows badge if response exists
4. Open message dialog → if no response yet, still shows feedback form; if response exists, shows comment thread (GitHub issue style)
5. Send follow-up message → appears in comment thread
6. Developer responds via GitHub UI → user sees notification on next check
7. Open message dialog → new response appears in comment thread (GitHub issue comment style, NOT chat bubbles)

**Edge Cases**:

- User clears localStorage → new UUID generated, new conversation started
- Multiple tabs → each tab checks independently (acceptable)
- Offline → graceful degradation, queue message for later

## Dependencies

- Existing: `NotificationUtils`, `marked` (for markdown rendering)
- New: UUID v4 generator (simple implementation or use `crypto.randomUUID`)

## Files to Create/Modify

**New Files**:

- `src/frontend/web/components/ChatManager.js`
- `src/frontend/web/ifs/css/chat.css`

**Modified Files**:

- `src/frontend/web/ifs/index.html` (add message button, script tag, config)
- `src/frontend/web/WebUI.js` (integrate ChatManager)

**External** (separate deployment):

- Cloudflare Worker (similar structure to feedback form worker)

### To-dos

- [ ] Create ChatManager.js component with modal lifecycle, feedback/chat mode switching, message sending, and response fetching
- [ ] Implement UUID v4 generation and storage in localStorage for unique user identification
- [ ] Create chat.css with styles for feedback form and chat interface modes, ensuring no real-time indicators
- [ ] Add chat button to mobile burger menu in index.html and integrate ChatManager into WebUI.js
- [ ] Add notification system for new messages using NotificationUtils and badge indicator on chat button
- [ ] Update cache-busting parameters in index.html for new JS/CSS files per project rules