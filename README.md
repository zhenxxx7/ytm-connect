# YTM-Connect (Spotify Connect for YouTube Music)

Real-time multi-device remote control and playback handoff system for YouTube Music (`music.youtube.com`). Control playback seamlessly between your **Desktop Browser** (Chrome, Edge, Firefox) and **Mobile Browser** (iOS Safari, Android Chrome via PWA), including 1-click playback handoff with exact timestamp (`currentTime`) and queue (`listId`) synchronization.

---

## Monorepo Structure

```text
ytm-connect/
├── packages/
│   ├── relay-server/          # Real-time WebSocket signaling & room broker (Node.js + ws)
│   ├── desktop-extension/     # Cross-browser Manifest V3 Extension (Chrome, Edge, Firefox)
│   └── mobile-pwa/            # Reverse-proxy PWA wrapper + injected bridge script for Mobile Web
├── scripts/
│   ├── dev.js                 # Unified dev runner for Relay Server + Mobile PWA
│   ├── generate-icons.js      # Pure-Node PNG icon generator for Extension & PWA
│   └── test-e2e.js            # Automated End-to-End protocol & handoff verification suite
├── package.json
└── PLAN.md
```

---

## Quick Start

### 1. Install Dependencies & Start Servers
From the monorepo root:

```bash
npm install
npm run dev
```

This single command starts both servers concurrently:
- **Relay WebSocket Server:** `ws://localhost:8787` (and `ws://<your-lan-ip>:8787`)
- **Mobile PWA Proxy Server:** `http://localhost:3000` (and `http://<your-lan-ip>:3000`)

---

### 2. Load the Unpacked Desktop Extension

#### Google Chrome / Brave
1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select:
   `c:\Data\prgm\YTM-Connect\packages\desktop-extension`

#### Microsoft Edge
1. Open `edge://extensions/`
2. Enable **Developer mode** (toggle in the left sidebar).
3. Click **Load unpacked** and select:
   `c:\Data\prgm\YTM-Connect\packages\desktop-extension`

#### Mozilla Firefox
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select `c:\Data\prgm\YTM-Connect\packages\desktop-extension\manifest.json`

---

### 3. Pair Mobile & Handoff Playback

1. Open [https://music.youtube.com](https://music.youtube.com) on your Desktop browser and play any song or playlist.
2. Click the **YTM-Connect** extension icon in your browser toolbar (or click the injected **Connect / Devices Available** button inside the YouTube Music bottom player bar).
3. Scan the **QR Code** with your phone (connected to the same Wi-Fi LAN), or open `http://<your-lan-ip>:3000/?room=XXXXXX&token=YYYYYY` on your mobile browser.
4. On your phone, tap **Add to Home Screen** to install as a standalone dark-theme PWA.
5. **Remote Control Mode:** While Desktop is the active player, tapping Play/Pause, Next, Previous, Seek, or Volume on the Mobile PWA controls your Desktop YouTube Music tab in real time.
6. **Playback Handoff (Switch Play):**
   - Tap the floating **Spotify Connect Device Pill** at the bottom of the mobile screen and select **"Listen on this Phone"** to pause Desktop and immediately resume at the exact timestamp on your phone.
   - Tap **"Listen on Desktop"** to hand playback back to your Desktop browser at the exact timestamp.
