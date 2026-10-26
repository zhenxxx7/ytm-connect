# YTM-Connect — Architecture & Execution Plan

## 1. Overview
**YTM-Connect** brings a **Spotify Connect**-style real-time multi-device remote control and seamless playback handoff experience to YouTube Music (`music.youtube.com`). Users can control playback between their Desktop Browser (Chrome, Edge, Firefox via Manifest V3 Extension) and Mobile Browser (iOS Safari, Android Chrome via Reverse-Proxy PWA Wrapper), with exact timestamp (`currentTime`) and queue (`listId`) synchronization.

---

## 2. Monorepo Structure
```text
ytm-connect/
├── packages/
│   ├── relay-server/          # Real-time WebSocket signaling & room broker (Node.js + ws)
│   ├── desktop-extension/     # Cross-browser Manifest V3 Extension (Chrome, Edge, Firefox)
│   └── mobile-pwa/            # Reverse-proxy PWA wrapper + injected bridge script for Mobile Web
├── package.json
└── PLAN.md
```

---

## 3. Event Protocol Schema (JSON over WebSocket)
Every WebSocket message follows the envelope:
```json
{
  "event": "EVENT_TYPE",
  "roomId": "ABC123",
  "senderId": "device-uuid",
  "targetId": "device-uuid-or-ALL",
  "payload": {}
}
```

### Supported Events
1. `JOIN_ROOM`: `{ deviceId, deviceName, deviceType: "DESKTOP" | "MOBILE", pairToken?: string }`
2. `DEVICE_LIST_UPDATED`: `{ devices: [{ deviceId, deviceName, deviceType, isActivePlayer }], activeDeviceId }`
3. `STATE_UPDATE`: `{ videoId, listId, title, artist, artwork, currentTime, duration, isPaused, volume }`
4. `COMMAND_ACTION`: `{ action: "PLAY" | "PAUSE" | "NEXT" | "PREV" | "SEEK" | "VOLUME" | "LOAD_AND_PLAY", value?: number | string | object }`
5. `HANDOFF_PLAYBACK`: `{ fromDeviceId, toDeviceId, videoId, listId, currentTime, autoPlay: true }`

---

## 4. Execution Steps
- [x] **Step 1:** Initialize workspace monorepo and build `packages/relay-server` with Node.js + `ws` (room creation, token verification, device registry, 30s ping/pong heartbeat cleanup, state caching/broadcasting, and handoff routing).
- [x] **Step 2:** Build `packages/desktop-extension` (Manifest V3 for Chrome/Edge/Firefox, DOM scraper for `<video>` and `ytmusic-player-bar`, main-world `#movie_player` controller bridge, WebSocket auto-reconnection, in-page Spotify-Connect style "Devices Available" overlay, and Popup UI with zero-dependency SVG QR Code generator).
- [x] **Step 3:** Build `packages/mobile-pwa` (Reverse-proxy server fetching `https://music.youtube.com` with Mobile User-Agent, stripping `X-Frame-Options` & `CSP`, injecting `bridge.js` + `overlay.css` + PWA `manifest.json`, remote-control interception vs local playback mode, and Spotify Connect floating pill + bottom-sheet UI).
- [x] **Step 4:** Root `npm run dev` script orchestrating both `relay-server` and `mobile-pwa`, plus end-to-end verification tests and browser setup guide.
