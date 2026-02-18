# Voxium

A Discord-like clone (text/voice chat + roles + moderation) built with:
- Rust backend (`actix-web` + `sqlx` + SQLite)
- Tauri frontend + HTML/CSS/JS

---

## Table of Contents
- [Features](#features)
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
- Authentication (register/login)
- Discord OAuth login (optional)
- Text and voice channels
- Real-time messaging via WebSocket
- Image uploads
- Replies, pins, advanced search
- Server roles + room-level permissions
- Server/room settings in the UI
- Discord REST bridge endpoint (`/api/discord/proxy`) for custom client experiments

---

## Roadmap

### Short term
- Better multi-user stability on LAN/Internet
- Faster room/server settings workflows (admin UX)
- Cleaner Tauri build configuration for packaging

### Mid term
- More robust notifications (mentions, presence, activity)
- Advanced moderation tools (logs, bulk actions)
- Better DB performance and message pagination

### Exploratory
- **Custom client compatibility with official Discord APIs** (research preview)
  - only if it can be done properly and safely
  - disabled by default in this project

---

## Technical Docs
- [Protocol Specification](PROTOCOL.md)
- [Ops / Release Checklist](OPS_CHECKLIST.md)

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
git clone https://github.com/Pouare514/discord2.git
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
2. Make your changes (small and focused if possible)
3. Run quick checks:
```bash
cargo check -p backend
node --check discord-app/src/main.js
```
4. Commit with a clear message:
```bash
git add .
git commit -m "feat: add ..."
```
5. Push + open a Pull Request

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
- Check `apiBaseUrl` / `wsUrl` in `discord-app/src/runtime-config.js`
- Check CSP in `discord-app/src-tauri/tauri.conf.json`
- Check port/firewall (`8080`)

### Discord login does not work
- Verify backend env: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`
- The redirect URI configured in the Discord developer portal must exactly match `DISCORD_REDIRECT_URI`
- Ensure `discordClientId` and `discordRedirectUri` are set in `discord-app/src/runtime-config.js`

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

