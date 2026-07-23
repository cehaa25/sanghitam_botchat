# ♞ Pitch Black — Anonymous Chat

A minimal, pitch-black anonymous chat with emojis, voice notes, photos, videos, and WebRTC calls.

## ✨ Features
- 🔒 Anonymous — no accounts, random aliases
- 💬 Realtime text chat (Supabase Realtime WebSockets)
- 😊 Emoji picker
- 📷 Photos & 🎬 Videos (Supabase Storage)
- 🎤 Voice notes (MediaRecorder + Storage)
- 📞 Audio & 🎥 Video calls (WebRTC P2P)
- 🔗 Shareable room links
- 🖤 Pure black theme

## 🚀 Deploy in 10 minutes

### 1. Supabase
1. Create a project at https://supabase.com
2. Open **SQL Editor** → paste & run `supabase-schema.sql`
3. Copy your **Project URL** and **anon public key** from *Settings → API*

### 2. GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOU/anonymous-chat.git
git push -u origin main
```

### 3. Vercel
1. Go to https://vercel.com → **New Project** → import your GitHub repo
2. Set framework: **Other**
3. Add env vars (optional — anon key is public-safe):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. Replace the two placeholders in `script.js`:
   ```js
   const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
   const SUPABASE_ANON_KEY = 'your-anon-key';
   ```
5. **Deploy**

### 4. Share
Open `https://your-app.vercel.app?room=midnight-42` — anyone with the link joins instantly.

## 🔐 Security notes
- Supabase anon key is **designed to be public** — protect it with RLS
- RLS policies allow open read/insert on `messages` and `chat-media` bucket
- For stricter isolation, add a room-token system or hash-based room access
- WebRTC is peer-to-peer; only signaling passes through Supabase
- No server-side logs of message content (messages are client-rendered)

## 🛠 Tech
- Vanilla HTML/CSS/JS (no build step)
- Supabase Realtime (WebSockets) + Storage
- WebRTC for calls
- Deployed on Vercel as static site
