# Voxium

A modern Discord-like application (text/voice chat + roles + moderation) with full Discord integration, built with:

- Rust backend (`actix-web` + `sqlx` + SQLite)
- Tauri frontend + HTML/CSS/JS

---

## Table of Contents

- [Features](#features)
- [Discord Integration](#discord-integration)
- [Roadmap](#roadmap)
- [Technical Docs](#technical-docs)
- [Prerequisites](#prerequisites)
- [Quick Local Setup](#quick-local-setup)
- [Using It with Friends (Network)](#using-it-with-friends-network)
- [Roles & Administration](#roles--administration)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)

---

## Features

### Core
- Authentication (register/login)
- Text and voice channels with real-time messaging (WebSocket)
- Image uploads, replies, pins, advanced search
- Server roles + room-level permissions
- Server/room settings in the UI

### UI
- Discord-inspired interface with guild bar, sidebar, chat area, and members panel
- Dark theme with smooth transitions and hover effects
- Pill indicators, active states, and guild icon system
- Collapsible channel categories
- Markdown rendering in messages (bold, italic, code blocks, spoilers, links)
- Embed previews and message reactions
- Infinite scroll (older messages loaded on scroll-up)

### Discord Integration
- **Integrated Discord mode** — browse your real Discord servers, DMs, and channels directly inside Voxium using the same UI layout (guild bar, sidebar, chat area)
- Discord servers displayed in the guild bar with the exact same order as your official Discord client (via `guild_folders`)
- DMs sorted by most recent conversation
- Full channel browsing with categories, text & voice channel icons
- Message rendering with Discord markdown, embeds, attachments, stickers, and reactions
- Send messages to Discord channels from within Voxium
- QR code remote authentication for Discord token linking
- Discord REST bridge endpoint (`/api/discord/proxy`)

---

## Roadmap

### Done ✅

- [x] Core text/voice chat system
- [x] Role-based permissions + admin tools
- [x] Image uploads, replies, pins, search
- [x] **Discord-inspired UI** (guild bar, sidebar, chat area, members panel)
- [x] **Discord integration v1** — browse servers, DMs, channels, and messages using the native Voxium UI
- [x] Guild ordering matching official Discord client (`guild_folders`)
- [x] DM sorting by most recent message
- [x] Discord message rendering (markdown, embeds, reactions, attachments, stickers)
- [x] Send messages to Discord from Voxium
- [x] QR remote auth for Discord token linking

### Short term

- [ ] Typing indicators in Discord mode
- [ ] Discord thread support
- [ ] Presence / online status display
- [ ] Better multi-user stability on LAN/Internet
- [ ] Faster room/server settings workflows (admin UX)

### Mid term

- [ ] Discord voice channel integration (listen/join)
- [ ] More robust notifications (mentions, presence, activity)
- [ ] Advanced moderation tools (logs, bulk actions)
- [ ] Better DB performance and message pagination
- [ ] Cleaner Tauri build configuration for packaging

### Exploratory

- [ ] Discord Gateway WebSocket (real-time events without polling)
- [ ] Multi-account Discord support
- [ ] Plugin / extension system

---

## Technical Docs

- [Protocol Specification](PROTOCOL.md)
- [Ops / Release Checklist](OPS_CHECKLIST.md)
- [Discord User API (non officielle)](README_DISCORD_USER_API.md)

---

## Prerequisites

### Tools

- `Rust` (stable)
- `Node.js` (LTS recommended)
- `npm`

### Windows (Tauri)

- `WebView2 Runtime`
- C++ Build Tools (Visual Studio Build Tools)

> The backend listens on `0.0.0.0:8080` by default.

---

## Quick Local Setup

### 1) Clone the repository

```bash
git clone https://github.com/Pouare514/voxium.git
cd discord2
```

### 2) Install frontend dependencies

```bash
cd discord-app
npm install
cd ..
```

### 3) (Optional) Configure `.env`

The backend reads `.env` (optional) from the workspace root.

You can start from:

```bash
cp .env.example .env
```

Example:

```env
PORT=8080
JWT_SECRET=change-me
DATABASE_URL=sqlite:voxium.db
DISCORD_CLIENT_ID=your_discord_app_client_id
DISCORD_CLIENT_SECRET=your_discord_app_client_secret
DISCORD_REDIRECT_URI=http://127.0.0.1:1420/
```

Without `.env`, the default DB is created automatically: `sqlite:voxium.db`.

### 4) Run the app

Option A (Windows):

```bat
launch.bat
```

Option B (manual, 2 terminals):

Terminal 1:

```bash
cd backend
cargo run --bin backend
```

Terminal 2:

```bash
cd discord-app
npm run tauri dev
```

---

## Using It with Friends (Network)

By default, the frontend points to `127.0.0.1` (localhost), so **each friend must point to the host server IP**.

### 1) Host the backend on one machine

On the host machine:

```bash
cd backend
cargo run --bin backend
```

Open port `8080` in firewall/router if needed.

### 2) Point clients to the host IP/domain

Edit `discord-app/src/runtime-config.js`:

```js
window.VOXIUM_RUNTIME_CONFIG = {
  apiBaseUrl: "http://192.168.1.42:8080",
  wsUrl: "ws://192.168.1.42:8080/ws",
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  discordAuthorizeBaseUrl: "https://discord.com/oauth2/authorize",
  discordClientId: "YOUR_DISCORD_APP_CLIENT_ID",
  discordRedirectUri: "http://127.0.0.1:1420/auth/discord/callback",
  discordScope: "identify email guilds",
  discordResponseType: "code",
  discordPrompt: "consent"
};
```

For HTTPS deployment, use:

- `apiBaseUrl: "https://your-domain.tld"`
- `wsUrl: "wss://your-domain.tld/ws"`

### 3) Update Tauri CSP

`discord-app/src-tauri/tauri.conf.json` also includes `127.0.0.1` in `connect-src`.
Replace it with the IP/domain you actually use, otherwise connections may be blocked.

### 4) Run the client on your friends’ machines

```bash
cd discord-app
npm install
npm run tauri dev
```

---

## Roles & Administration

### Promote a user to admin

Option 1 (UI): via member context menu (if you are already admin).

Option 2 (CLI):

```bat
make_admin.bat
```

Then enter the username in the terminal.

### Server/Room settings

- **Server settings**: create/delete roles + role assignment
- **Room settings** (right-click): name, type, required role, public/private mode

---

## Contributing

Thanks to everyone who wants to contribute ❤️

Whether it’s a big feature, a bug fix, a UX idea, or even a typo, contributions are welcome.

### Simple workflow

1. Fork/clone and create a branch:

```bash
git checkout -b feat/my-feature
```

1. Make your changes (small and focused if possible)
2. Run quick checks:

```bash
cargo check -p backend
node --check discord-app/src/main.js
```

1. Commit with a clear message:

```bash
git add .
git commit -m "feat: add ..."
```

1. Push + open a Pull Request

### Contribution guide (important)

- Keep changes readable and within PR scope
- Explain the “why” in the PR description (2-3 lines is enough)
- If you changed UX, add a short screenshot/video
- If you changed roles/permissions, list tested scenarios
- If unsure about direction, open an issue/discussion before a big refactor

---

## Troubleshooting

### `npm run build` fails with `frontendDist includes ["node_modules", "src-tauri"]`

This is caused by the current Tauri config (`frontendDist: "../"`).
For local development, use `npm run tauri dev`.

### Client cannot connect to backend
- Check `API` / `WS_URL` in `discord-app/src/main.js`
- Check CSP in `discord-app/src-tauri/tauri.conf.json`
- Check port/firewall (`8080`)

### Discord login does not work
- Verify backend env: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`
- The redirect URI configured in the Discord developer portal must exactly match `DISCORD_REDIRECT_URI`
- Ensure `discordClientId` and `discordRedirectUri` are set in `discord-app/src/runtime-config.js`
- If frontend values are empty, the app now falls back to `GET /api/auth/discord/config` (backend env)
- For the non-official user-side flow (Userdoccers / docs.discord.food), see `README_DISCORD_USER_API.md`

### Calling Discord APIs from the custom client
- Use `window.VoxiumDiscord.request('/users/@me/guilds')` once logged in via Discord
- Calls are forwarded through `POST /api/discord/proxy` with your linked Discord OAuth token
- Message example: `window.VoxiumDiscord.request('/channels/<channel_id>/messages', { method: 'POST', body: { content: 'hello' } })`

### Database issues

- Check `DATABASE_URL`
- In dev, if needed, recreate the local SQLite file from scratch

---

## Useful project structure

- `backend/`: Rust API + WebSocket + DB
- `discord-app/`: Tauri client (UI)
- `migrations/`: SQL scripts applied at startup
- `uploads/`: uploaded files
