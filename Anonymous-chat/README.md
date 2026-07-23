# 🏰 Anonymous Chat — Pitch Black

A modern, minimal, anonymous chat app with a pure-black theme and a chess knight logo.

## ✨ Features

- 🔒 **Anonymous** — no login, random identity per session
- 🖤 **Pitch Black theme** — pure black UI, easy on the eyes
- ♞ **Chess knight logo** — custom SVG
- 💬 **Text messages** with emoji picker
- 🎙 **Voice notes** (record & send)
- 📷 **Photos & videos** (drag / attach)
- 📞 **Audio & video calls** (WebRTC peer-to-peer)
- 🌐 **WebSocket** real-time messaging + signaling

## 🚀 Local Setup

```bash
npm install
npm start
# Open http://localhost:3000
```

## 🌍 Deploy to Vercel

1. Push this folder to a GitHub repository.
2. Go to [vercel.com](https://vercel.com) → **New Project** → import your repo.
3. Framework Preset: **Other**
4. Build Command: *(leave empty)*
5. Output Directory: *(leave empty)*
6. Click **Deploy**.

> ⚠️ WebSockets on Vercel require a **Pro** plan. For free-tier WebSocket support, deploy `server.js` to **Railway**, **Render**, or **Fly.io** instead, and update `WS_URL` in `index.html` to point to that server.

## 🐙 Deploy to GitHub Pages (frontend only)

If you only want the frontend hosted (and run the server elsewhere):

1. Push to GitHub.
2. Repo → **Settings → Pages** → Source: **main** branch, folder `/root`.
3. Edit `WS_URL` in `index.html` to point to your deployed WebSocket server.

## 🧪 Notes

- Calls use **WebRTC** with public Google STUN servers.
- Media files are limited to **8 MB** (configurable in `index.html`).
- All data is ephemeral — no server-side storage.
