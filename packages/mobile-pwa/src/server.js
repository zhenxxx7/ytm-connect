/**
 * YTM-Connect — Mobile PWA Reverse-Proxy & Injector Server (Module C)
 *
 * Responsibilities:
 *  1. Reverse-proxies https://music.youtube.com with a Mobile User-Agent.
 *  2. Strips X-Frame-Options, Content-Security-Policy, and Cross-Origin-* headers.
 *  3. Injects PWA manifest.json, overlay.css, and bridge.js into HTML responses.
 *  4. Tunnels WebSocket connections on /__ytm_connect__/ws directly to the Relay Server.
 *  5. Provides a resilient Mobile YTM App DOM hydration layer so the mobile interface
 *     works seamlessly on localhost/LAN even when Google origin checks block Polymer scripts.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { WebSocketServer, WebSocket } = require('ws');

const DEFAULT_PWA_PORT = Number(process.env.PWA_PORT || process.env.PORT || 3000);
const DEFAULT_RELAY_PORT = Number(process.env.RELAY_PORT || 8787);
const UPSTREAM_ORIGIN = 'https://music.youtube.com';

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const STRIPPED_RESPONSE_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'cross-origin-embedder-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'strict-transport-security'
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

/**
 * Injected snippet appended into <head> / <body> of proxied https://music.youtube.com HTML responses.
 */
function getInjectedHeadTags(initialSearch = '') {
  return `
<!-- YTM-Connect Mobile PWA Injection -->
<script>
(function() {
  window.__YTM_CONNECT_INITIAL_SEARCH__ = ${JSON.stringify(initialSearch || '')} || window.location.search;
  if (window.trustedTypes && window.trustedTypes.createPolicy) {
    try {
      if (!window.trustedTypes.defaultPolicy) {
        window.trustedTypes.createPolicy('default', {
          createHTML: function(s) { return s; },
          createScriptURL: function(s) { return s; },
          createScript: function(s) { return s; }
        });
      }
    } catch (e) {}
  }
})();
</script>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="#090a0d" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="manifest" href="/__ytm_connect__/manifest.json" />
<link rel="apple-touch-icon" href="/__ytm_connect__/icons/icon-192.png" />
<link rel="stylesheet" href="/__ytm_connect__/overlay.css" />
<script src="/__ytm_connect__/bridge.js" defer></script>
`;
}

/**
 * Adaptive Mobile YouTube Music Shell Fallback script:
 * If the proxied music.youtube.com Polymer bundle does not render visible player elements on localhost
 * within 900ms, this mounts a faithful Mobile YouTube Music App Deck (<video>, ytmusic-player-bar,
 * #play-pause-button, .next-button, .previous-button, and YouTube embed support) so Remote Control
 * and Local Handoff Playback work seamlessly in every mobile browser.
 */
function getAdaptiveMobileStageMarkup() {
  return `
<script>
(function () {
  function mountMobileYtmShellIfNeeded() {
    if (document.getElementById('ytmc-mobile-app-shell')) return;
    const hasNativeYtmContent =
      document.querySelector('ytmusic-app-layout') &&
      document.querySelector('ytmusic-app-layout').offsetHeight > 80;
    if (hasNativeYtmContent) return;

    const shell = document.createElement('div');
    shell.id = 'ytmc-mobile-app-shell';
    shell.style.cssText =
      'min-height:100vh;background:radial-gradient(circle at 50% 12%,rgba(255,0,51,0.16),transparent 55%),#090a0d;color:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:16px 16px 150px;box-sizing:border-box;display:flex;flex-direction:column;gap:18px;';

    shell.innerHTML = \`
      <header style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:34px;height:34px;border-radius:50%;background:#ff0033;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(255,0,51,0.4);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><polygon points="9,7 18,12 9,17"/></svg>
          </div>
          <div>
            <div style="font-size:17px;font-weight:800;letter-spacing:-0.02em;">Music</div>
            <div style="font-size:11px;color:#9aa2b1;">YTM-Connect Mobile PWA</div>
          </div>
        </div>
        <button id="ytmc-header-connect-btn" type="button" style="padding:7px 13px;border-radius:999px;border:1px solid rgba(30,215,96,0.45);background:rgba(30,215,96,0.14);color:#1ed760;font-size:12px;font-weight:700;cursor:pointer;">
          Devices / Switch Play
        </button>
      </header>

      <!-- Main Mobile Stage Card -->
      <main style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:22px;padding:20px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;box-shadow:0 20px 50px rgba(0,0,0,0.5);">
        <div id="ytmc-stage-mode-pill" style="padding:5px 12px;border-radius:999px;background:rgba(30,215,96,0.15);color:#1ed760;font-size:11.5px;font-weight:700;">
          Connecting to Room...
        </div>

        <div style="position:relative;width:min(240px,68vw);height:min(240px,68vw);border-radius:18px;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,0.65);background:#151821;">
          <img id="ytmc-stage-art" src="/__ytm_connect__/icons/icon-512.png" alt="Album Art" style="width:100%;height:100%;object-fit:cover;" />
          <div id="ytmc-yt-embed-wrap" style="position:absolute;inset:0;display:none;background:#000;"></div>
        </div>

        <div style="max-width:100%;">
          <h2 id="ytmc-stage-title" style="margin:0;font-size:20px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Ready to Connect</h2>
          <p id="ytmc-stage-artist" style="margin:4px 0 0;font-size:13.5px;color:#9aa2b1;">Start a song on Desktop or tap Switch Play</p>
        </div>

        <!-- Standard ytmusic-player-bar compatible DOM controls -->
        <ytmusic-player-bar style="display:flex;align-items:center;justify-content:center;gap:20px;width:100%;margin-top:4px;">
          <span class="title" id="ytmc-dom-title" style="display:none;"></span>
          <span class="byline" id="ytmc-dom-artist" style="display:none;"></span>
          <button type="button" class="previous-button" style="width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#fff;font-size:17px;cursor:pointer;">⏮</button>
          <button type="button" id="play-pause-button" class="play-pause-button" style="width:60px;height:60px;border-radius:50%;border:none;background:#ff0033;color:#fff;font-size:22px;font-weight:800;cursor:pointer;box-shadow:0 8px 24px rgba(255,0,51,0.45);">▶</button>
          <button type="button" class="next-button" style="width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#fff;font-size:17px;cursor:pointer;">⏭</button>
        </ytmusic-player-bar>

        <!-- Quick Handoff Action Buttons -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;margin-top:6px;">
          <button type="button" id="ytmc-quick-phone-btn" style="padding:11px 12px;border-radius:12px;border:1px solid rgba(30,215,96,0.4);background:rgba(30,215,96,0.16);color:#1ed760;font-size:12.5px;font-weight:700;cursor:pointer;">
            📱 Listen on this Phone
          </button>
          <button type="button" id="ytmc-quick-desktop-btn" style="padding:11px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.07);color:#f5f7fa;font-size:12.5px;font-weight:700;cursor:pointer;">
            💻 Listen on Desktop
          </button>
        </div>
      </main>

      <!-- Bottom Navigation Bar (above which the Spotify Connect Pill floats) -->
      <nav style="position:fixed;left:0;right:0;bottom:0;height:56px;background:rgba(12,14,18,0.96);border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-around;font-size:11px;color:#9aa2b1;z-index:2147483630;">
        <span style="color:#fff;font-weight:700;">Home</span>
        <span>Samples</span>
        <span>Explore</span>
        <span>Library</span>
      </nav>
    \`;

    document.body.appendChild(shell);

    document.getElementById('ytmc-header-connect-btn').addEventListener('click', () => {
      if (window.YTMConnectMobile) window.YTMConnectMobile.openDeviceSheet();
    });

    document.getElementById('ytmc-quick-phone-btn').addEventListener('click', () => {
      if (!window.YTMConnectMobile) return;
      const st = window.YTMConnectMobile.getState();
      window.YTMConnectMobile.initiateHandoff(st.deviceId);
    });

    document.getElementById('ytmc-quick-desktop-btn').addEventListener('click', () => {
      if (!window.YTMConnectMobile) return;
      const st = window.YTMConnectMobile.getState();
      const desktop = st.devices.find((d) => d.deviceType === 'DESKTOP' || d.deviceId !== st.deviceId);
      if (desktop) {
        window.YTMConnectMobile.initiateHandoff(desktop.deviceId);
      } else {
        window.YTMConnectMobile.openDeviceSheet();
      }
    });

    const playBtn = document.getElementById('play-pause-button');
    playBtn.addEventListener('click', () => {
      if (!window.YTMConnectMobile) return;
      const st = window.YTMConnectMobile.getState();
      if (st.activeDeviceId === st.deviceId) {
        window.YTMConnectMobile.dispatchUserControl(st.track.isPaused ? 'PLAY' : 'PAUSE');
      }
    });

    window.addEventListener('ytm-connect:state-rendered', (e) => {
      const d = e.detail || {};
      const t = d.track || {};
      const artEl = document.getElementById('ytmc-stage-art');
      const titleEl = document.getElementById('ytmc-stage-title');
      const artistEl = document.getElementById('ytmc-stage-artist');
      const modePill = document.getElementById('ytmc-stage-mode-pill');
      const domTitle = document.getElementById('ytmc-dom-title');
      const domArtist = document.getElementById('ytmc-dom-artist');

      if (artEl && t.artwork) artEl.src = t.artwork;
      if (titleEl) titleEl.textContent = t.title || 'YouTube Music';
      if (artistEl) artistEl.textContent = t.artist || 'Ready';
      if (domTitle) domTitle.textContent = t.title || '';
      if (domArtist) domArtist.textContent = t.artist || '';
      if (playBtn) playBtn.textContent = t.isPaused ? '▶' : '⏸';

      if (modePill) {
        if (!d.connected) {
          modePill.textContent = 'Connecting to Relay Room ' + (d.roomId || '') + '...';
        } else if (d.isMobileActive) {
          modePill.textContent = '🔊 Local Playback Active on this Phone (Room ' + d.roomId + ')';
        } else {
          const activeDev = (d.devices || []).find((x) => x.deviceId === d.activeDeviceId);
          modePill.textContent =
            '🟢 Remote Control Mode — Controlling ' + (activeDev ? activeDev.deviceName : 'Desktop');
        }
      }
    });

    // When handoff activates local playback on Mobile with a real YouTube videoId, mount embedded player
    window.addEventListener('ytm-connect:mobile-handoff-active', (e) => {
      const detail = e.detail || {};
      const wrap = document.getElementById('ytmc-yt-embed-wrap');
      if (!wrap || !detail.videoId) return;
      const start = Math.max(0, Math.floor(Number(detail.startSeconds || 0)));
      wrap.style.display = 'block';
      wrap.innerHTML = \`<iframe
        width="100%"
        height="100%"
        src="https://www.youtube.com/embed/\${encodeURIComponent(detail.videoId)}?autoplay=1&playsinline=1&start=\${start}&enablejsapi=1"
        frameborder="0"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowfullscreen
      ></iframe>\`;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(mountMobileYtmShellIfNeeded, 250));
  } else {
    setTimeout(mountMobileYtmShellIfNeeded, 250);
  }
})();
</script>
`;
}

function injectBridgeIntoHtml(rawHtml, initialSearch = '') {
  const headInjection = getInjectedHeadTags(initialSearch);
  const bodyInjection = getAdaptiveMobileStageMarkup();

  let html = String(rawHtml || '');

  // Strip any inline <meta http-equiv="Content-Security-Policy" ...> tags in HTML
  html = html.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');

  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (match) => `${match}\n${headInjection}`);
  } else if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${headInjection}\n</head>`);
  } else {
    html = `${headInjection}\n${html}`;
  }

  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${bodyInjection}\n</body>`);
  } else {
    html = `${html}\n${bodyInjection}`;
  }

  return html;
}

function buildStandaloneProxiedDocument(initialSearch = '') {
  return injectBridgeIntoHtml(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>YouTube Music — YTM-Connect Mobile PWA</title>
</head>
<body style="margin:0;background:#090a0d;color:#f5f7fa;">
</body>
</html>`,
    initialSearch
  );
}

function createMobilePwaServer(options = {}) {
  const port = options.port ?? DEFAULT_PWA_PORT;
  const relayPort = options.relayPort ?? DEFAULT_RELAY_PORT;
  const publicDir = path.join(__dirname, '..', 'public');

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // 1. Serve PWA manifest at both /manifest.json and /__ytm_connect__/manifest.json
    if (pathname === '/manifest.json' || pathname === '/__ytm_connect__/manifest.json') {
      const filePath = path.join(publicDir, 'manifest.json');
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.json'] });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // 2. Serve injected static assets under /__ytm_connect__/*
    if (pathname.startsWith('/__ytm_connect__/')) {
      const relPath = pathname.replace('/__ytm_connect__/', '');
      const safePath = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(publicDir, safePath);

      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Cache-Control': 'no-cache'
        });
        fs.createReadStream(fullPath).pipe(res);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Asset not found' }));
      return;
    }

    // 3. Health check endpoint
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          service: 'ytm-connect-mobile-pwa',
          port,
          relayPort,
          upstream: UPSTREAM_ORIGIN
        })
      );
      return;
    }

    // 4. Reverse-Proxy & Injector Layer for https://music.youtube.com
    try {
      const upstreamUrl = new URL(req.url || '/', UPSTREAM_ORIGIN);
      // Do not forward internal pairing params to upstream cache key if not needed
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      const upstreamRes = await fetch(upstreamUrl.toString(), {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: {
          'User-Agent': MOBILE_USER_AGENT,
          'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
          'Referer': UPSTREAM_ORIGIN + '/',
          'Origin': UPSTREAM_ORIGIN
        },
        redirect: 'follow',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // Copy safe headers while stripping X-Frame-Options and Content-Security-Policy
      const outHeaders = {};
      upstreamRes.headers.forEach((value, key) => {
        const lowerKey = key.toLowerCase();
        if (!STRIPPED_RESPONSE_HEADERS.has(lowerKey)) {
          outHeaders[key] = value;
        }
      });

      const contentType = (upstreamRes.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('text/html') || pathname === '/' || pathname === '/watch') {
        const rawHtml = await upstreamRes.text();
        const injectedHtml = injectBridgeIntoHtml(rawHtml, parsedUrl.search);
        outHeaders['content-type'] = 'text/html; charset=utf-8';
        res.writeHead(upstreamRes.status || 200, outHeaders);
        res.end(injectedHtml);
        return;
      }

      const arrayBuf = await upstreamRes.arrayBuffer();
      res.writeHead(upstreamRes.status || 200, outHeaders);
      res.end(Buffer.from(arrayBuf));
    } catch {
      // Fallback: if upstream https://music.youtube.com is unreachable (e.g., offline LAN environment),
      // serve the injected standalone Mobile PWA document so local/LAN pairing and handoff always work!
      const fallbackHtml = buildStandaloneProxiedDocument(parsedUrl.search);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      res.end(fallbackHtml);
    }
  });

  // WebSocket Tunnel on /__ytm_connect__/ws -> ws://127.0.0.1:${relayPort}
  const wssTunnel = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (parsedUrl.pathname === '/__ytm_connect__/ws' || parsedUrl.pathname === '/ws') {
      wssTunnel.handleUpgrade(req, socket, head, (clientWs) => {
        const targetWsUrl = `ws://127.0.0.1:${relayPort}/${parsedUrl.search || ''}`;
        const relayWs = new WebSocket(targetWsUrl);
        const pendingMessages = [];

        relayWs.on('open', () => {
          while (pendingMessages.length > 0) {
            const msg = pendingMessages.shift();
            if (relayWs.readyState === WebSocket.OPEN) {
              relayWs.send(msg);
            }
          }
        });

        clientWs.on('message', (data) => {
          const text = data.toString();
          if (relayWs.readyState === WebSocket.OPEN) {
            relayWs.send(text);
          } else if (relayWs.readyState === WebSocket.CONNECTING) {
            pendingMessages.push(text);
          }
        });

        relayWs.on('message', (data) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data.toString());
          }
        });

        const closeBoth = () => {
          try {
            if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
          } catch {}
          try {
            if (relayWs.readyState === WebSocket.OPEN) relayWs.close();
          } catch {}
        };

        clientWs.on('close', closeBoth);
        clientWs.on('error', closeBoth);
        relayWs.on('close', closeBoth);
        relayWs.on('error', closeBoth);
      });
    } else {
      socket.destroy();
    }
  });

  return {
    server,
    start(listenPort = port) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(listenPort, '0.0.0.0', () => {
          const actualPort = server.address().port;
          console.log(`[Mobile PWA Proxy] Listening on http://localhost:${actualPort}`);
          resolve({ port: actualPort });
        });
      });
    },
    stop() {
      return new Promise((resolve) => {
        wssTunnel.close(() => {
          server.close(() => resolve());
        });
      });
    }
  };
}

if (require.main === module) {
  const pwa = createMobilePwaServer();
  pwa.start().catch((err) => {
    console.error('[Mobile PWA Proxy] Failed to start:', err);
    process.exit(1);
  });
}

module.exports = { createMobilePwaServer, injectBridgeIntoHtml };
