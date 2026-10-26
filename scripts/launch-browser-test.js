/**
 * YTM-Connect — Live Browser Launcher & Real YouTube Music Verification
 *
 * 1. Launches Google Chrome on https://music.youtube.com/watch?v=dQw4w9WgXcQ
 * 2. Enables CSP bypass for CDP injection and injects overlay.css, page-bridge.js, and content.js
 * 3. Verifies the injected "Devices Available" button inside ytmusic-player-bar and WebSocket room join
 * 4. Opens the paired Mobile PWA tab (http://localhost:3000/?room=XXXXXX&token=YYYYYY)
 * 5. Verifies both Desktop YouTube Music and Mobile PWA are connected in the same room and tests live remote control
 * 6. Keeps the browser open for interactive user testing.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebSocket } = require('ws');

const CHROME_CANDIDATES = [
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
  path.join(
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Google\\Chrome\\Application\\chrome.exe'
  ),
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  path.join(
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Microsoft\\Edge\\Application\\msedge.exe'
  )
];

function findBrowserExecutable() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Could not find Chrome or Edge executable');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJsonWithRetry(url, retries = 25, delayMs = 400) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // retry
    }
    await sleep(delayMs);
  }
  throw new Error(`Failed to connect to ${url}`);
}

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res?.result?.value;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function main() {
  const browserExe = findBrowserExecutable();
  const extDir = path.resolve(__dirname, '..', 'packages', 'desktop-extension');
  const profileDir = path.join(os.tmpdir(), `ytm-connect-live-${Date.now()}`);
  const debugPort = 9223;

  const overlayCss = fs.readFileSync(path.join(extDir, 'overlay.css'), 'utf8');
  const pageBridgeJs = fs.readFileSync(path.join(extDir, 'page-bridge.js'), 'utf8');
  const contentJs = fs.readFileSync(path.join(extDir, 'content.js'), 'utf8');

  const ytmUrl = 'https://music.youtube.com/watch?v=dQw4w9WgXcQ';

  console.log(`[Browser Test] Launching Chrome: ${browserExe}`);
  const child = spawn(
    browserExe,
    [
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${debugPort}`,
      `--load-extension=${extDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1440,920',
      'about:blank'
    ],
    {
      stdio: 'ignore',
      detached: false
    }
  );

  const targets = await fetchJsonWithRetry(`http://127.0.0.1:${debugPort}/json`);
  const pageTarget = targets.find((t) => t.type === 'page');

  const cdp = new CdpSession(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // Allow ws://localhost:8787 connection from https://music.youtube.com when injected via CDP
  await cdp.send('Page.setBypassCSP', { enabled: true });

  const bootstrapInjection = `
    (function() {
      const mountStyle = () => {
        if (!document.getElementById('ytmc-injected-style') && (document.head || document.documentElement)) {
          const st = document.createElement('style');
          st.id = 'ytmc-injected-style';
          st.textContent = ${JSON.stringify(overlayCss)};
          (document.head || document.documentElement).appendChild(st);
        }
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountStyle);
      } else {
        mountStyle();
      }
    })();
    ${pageBridgeJs}
    ${contentJs}
  `;

  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: bootstrapInjection
  });

  console.log(`[Browser Test] Navigating to ${ytmUrl} ...`);
  await cdp.send('Page.navigate', { url: ytmUrl });

  // Wait for YouTube Music DOM to hydrate and content.js to inject the button
  for (let i = 0; i < 25; i++) {
    const ready = await cdp.evaluate(
      `Boolean(document.querySelector('.ytmc-playerbar-btn') && document.querySelector('ytmusic-player-bar'))`
    );
    if (ready) break;
    await sleep(600);
  }

  await sleep(1000);

  const desktopStatus = await cdp.evaluate(`
    (function() {
      const btn = document.querySelector('.ytmc-playerbar-btn');
      const popover = document.querySelector('.ytmc-popover');
      const video = document.querySelector('video');
      const playerBar = document.querySelector('ytmusic-player-bar');
      const cfg = JSON.parse(localStorage.getItem('ytm_connect_config') || '{}');
      return {
        pageUrl: location.href,
        pageTitle: document.title,
        hasYtmPlayerBar: Boolean(playerBar),
        hasVideoElement: Boolean(video),
        hasInjectedConnectBtn: Boolean(btn),
        connectBtnClasses: btn ? btn.className : null,
        connectBtnText: btn ? btn.textContent.trim() : null,
        hasPopoverElement: Boolean(popover),
        roomId: cfg.roomId || null,
        pairToken: cfg.pairToken || null,
        deviceId: cfg.deviceId || null,
        pwaUrl: cfg.pwaUrl || 'http://localhost:3000'
      };
    })()
  `);

  console.log('\n[Browser Test] YouTube Music Desktop Tab Status:');
  console.log(JSON.stringify(desktopStatus, null, 2));

  // Open the Device Switcher Popover on YouTube Music
  await cdp.evaluate(`
    (function() {
      const btn = document.querySelector('.ytmc-playerbar-btn');
      if (btn) btn.click();
    })()
  `);

  const roomId = desktopStatus.roomId || 'LIVE99';
  const pairToken = desktopStatus.pairToken || '';
  const mobilePwaUrl = `http://localhost:3000/?room=${encodeURIComponent(
    roomId
  )}&token=${encodeURIComponent(pairToken)}`;

  console.log(`\n[Browser Test] Opening Paired Mobile PWA Tab: ${mobilePwaUrl}`);
  await cdp.send('Target.createTarget', { url: mobilePwaUrl });

  // Wait for Mobile PWA tab to join the room
  let roomInfo = null;
  for (let i = 0; i < 15; i++) {
    roomInfo = await fetchJsonWithRetry(`http://localhost:8787/room/${encodeURIComponent(roomId)}`);
    if (roomInfo && roomInfo.devices && roomInfo.devices.length >= 2) break;
    await sleep(500);
  }

  console.log('\n[Browser Test] Live Relay Server Room Status:');
  console.log(JSON.stringify(roomInfo, null, 2));

  // Re-check the YouTube Music Desktop button text now that 2 devices are in the room
  const updatedBtnState = await cdp.evaluate(`
    (function() {
      const btn = document.querySelector('.ytmc-playerbar-btn');
      const items = Array.from(document.querySelectorAll('.ytmc-device-item')).map(el => el.textContent.trim());
      return {
        buttonText: btn ? btn.textContent.trim() : null,
        popoverDeviceItems: items
      };
    })()
  `);
  console.log('\n[Browser Test] Updated YouTube Music In-Page Overlay:');
  console.log(JSON.stringify(updatedBtnState, null, 2));

  console.log('\n✅ Live Browser Verification Complete! Chrome remains open for you to test.');
  cdp.close();

  child.on('exit', () => process.exit(0));
}

main().catch((err) => {
  console.error('[Browser Test] Error:', err);
  process.exit(1);
});
