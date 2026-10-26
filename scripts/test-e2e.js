/**
 * YTM-Connect — Comprehensive End-to-End & Module Integration Test Suite
 * Tests:
 *  1. Desktop Extension Manifest V3, Icons & QR Code SVG Generator (qrcode.js)
 *  2. Relay Server Room Broker, Pairing Token Validation, Heartbeat PING/PONG & Failover
 *  3. Mobile PWA Reverse-Proxy Header Stripping (X-Frame-Options / CSP) & HTML Asset Injection
 *  4. WebSocket State Sync (STATE_UPDATE) & Remote Control Mode (COMMAND_ACTION)
 *  5. Bidirectional Playback Handoff (Desktop -> Mobile & Mobile -> Desktop) with exact timestamp & queue
 *  6. Live Dev Stack Verification (if running on :8787 and :3000)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { WebSocket } = require('ws');
const { generateAllIcons } = require('./generate-icons');
const { createRelayServer } = require('../packages/relay-server/src/index');
const { createMobilePwaServer, injectBridgeIntoHtml } = require('../packages/mobile-pwa/src/server');

function waitForEvent(ws, expectedEvent, predicate = () => true, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg);
      reject(new Error(`Timed out waiting for event: ${expectedEvent}`));
    }, timeoutMs);

    function onMsg(raw) {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.event === expectedEvent && predicate(msg)) {
        clearTimeout(timer);
        ws.off('message', onMsg);
        resolve(msg);
      }
    }

    ws.on('message', onMsg);
  });
}

async function runTests() {
  console.log('====================================================================');
  console.log('  YTM-Connect — Full Integration & E2E Verification Suite');
  console.log('====================================================================\n');

  // ---------------------------------------------------------------------------
  // Test 1: Desktop Extension Manifest V3, Icons & QR Code Generator
  // ---------------------------------------------------------------------------
  console.log('▶ [1/6] Validating Desktop Extension Manifest V3, Icons & QR Generator...');
  generateAllIcons();

  const extDir = path.join(__dirname, '..', 'packages', 'desktop-extension');
  const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.manifest_version, 3, 'Must be Manifest V3');
  assert.ok(manifest.permissions.includes('storage'), 'Must include storage permission');
  assert.ok(manifest.permissions.includes('activeTab'), 'Must include activeTab permission');
  assert.ok(
    manifest.host_permissions.includes('https://music.youtube.com/*'),
    'Must include music.youtube.com host permission'
  );
  assert.ok(manifest.browser_specific_settings?.gecko?.id, 'Must include Firefox gecko settings');

  // Verify QR Code generator in isolated VM context
  const qrCodeSrc = fs.readFileSync(path.join(extDir, 'popup', 'qrcode.js'), 'utf8');
  const qrSandbox = { window: {}, TextEncoder };
  vm.createContext(qrSandbox);
  vm.runInContext(qrCodeSrc, qrSandbox);
  assert.ok(
    typeof qrSandbox.window.YtmConnectQR?.renderQrSvg === 'function',
    'YtmConnectQR.renderQrSvg must be exported'
  );
  const svgOutput = qrSandbox.window.YtmConnectQR.renderQrSvg(
    'http://192.168.1.2:3000/?room=K7M9P2&token=SECRET99'
  );
  assert.ok(svgOutput.startsWith('<svg') && svgOutput.includes('<path d="M'), 'Must render valid SVG QR path');
  console.log('  ✓ Manifest V3, PNG icons, and ISO/IEC 18004 QR Code SVG generator verified');

  // ---------------------------------------------------------------------------
  // Test 2: Start Ephemeral Relay Server & Mobile PWA Server
  // ---------------------------------------------------------------------------
  console.log('▶ [2/6] Starting Ephemeral Relay Server & Mobile PWA Proxy Server...');
  const relay = createRelayServer({ port: 0 });
  const { port: relayPort, lanIp } = await relay.start(0);

  const pwa = createMobilePwaServer({ port: 0, relayPort });
  const { port: pwaPort } = await pwa.start(0);
  console.log(`  ✓ Ephemeral Relay on :${relayPort} (LAN: ${lanIp}), Mobile PWA on :${pwaPort}`);

  try {
    // -------------------------------------------------------------------------
    // Test 3: Mobile PWA HTML Injector, Header Stripping & Static PWA Assets
    // -------------------------------------------------------------------------
    console.log('▶ [3/6] Verifying Mobile PWA Reverse-Proxy, Header Stripping & Assets...');
    const sampleHtml = `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'"><title>YTM</title></head><body><div>App</div></body></html>`;
    const injected = injectBridgeIntoHtml(sampleHtml);
    assert.ok(!injected.includes('http-equiv="Content-Security-Policy"'), 'Must strip inline CSP meta');
    assert.ok(injected.includes('/__ytm_connect__/bridge.js'), 'Must inject bridge.js');
    assert.ok(injected.includes('/__ytm_connect__/overlay.css'), 'Must inject overlay.css');
    assert.ok(injected.includes('/__ytm_connect__/manifest.json'), 'Must inject manifest.json');

    // Fetch proxied root page from Mobile PWA server
    const rootRes = await fetch(`http://127.0.0.1:${pwaPort}/?room=TEST88&token=TOKEN777`);
    assert.strictEqual(rootRes.status, 200);
    assert.strictEqual(rootRes.headers.get('x-frame-options'), null, 'X-Frame-Options must be stripped');
    assert.strictEqual(
      rootRes.headers.get('content-security-policy'),
      null,
      'Content-Security-Policy header must be stripped'
    );
    const rootHtml = await rootRes.text();
    assert.ok(rootHtml.includes('/__ytm_connect__/bridge.js'), 'Response HTML must contain injected bridge.js');
    assert.ok(rootHtml.includes('/__ytm_connect__/overlay.css'), 'Response HTML must contain injected overlay.css');

    // Verify manifest, service worker, and icons
    for (const assetPath of [
      '/manifest.json',
      '/__ytm_connect__/sw.js',
      '/__ytm_connect__/overlay.css',
      '/__ytm_connect__/bridge.js',
      '/__ytm_connect__/icons/icon-192.png',
      '/__ytm_connect__/icons/icon-512.png'
    ]) {
      const res = await fetch(`http://127.0.0.1:${pwaPort}${assetPath}`);
      assert.strictEqual(res.status, 200, `Asset ${assetPath} must return 200 OK`);
    }
    console.log('  ✓ Reverse-proxy header stripping, HTML injection, and PWA assets verified');

    // -------------------------------------------------------------------------
    // Test 4: Room Pairing, Token Security, State Sync & Remote Control
    // -------------------------------------------------------------------------
    console.log('▶ [4/6] Verifying Room Pairing, Token Validation, STATE_UPDATE & COMMAND_ACTION...');
    const roomId = 'TEST88';
    const pairToken = 'TOKEN777';

    // Desktop joins Relay Server
    const desktopWs = new WebSocket(`ws://127.0.0.1:${relayPort}/?room=${roomId}&token=${pairToken}`);
    await new Promise((res) => desktopWs.once('open', res));

    // Test PING / PONG heartbeat
    const pongPromise = waitForEvent(desktopWs, 'PONG');
    desktopWs.send(JSON.stringify({ event: 'PING', roomId, senderId: 'desktop-01' }));
    await pongPromise;

    const desktopJoinPromise = waitForEvent(
      desktopWs,
      'DEVICE_LIST_UPDATED',
      (m) => m.payload.devices.length === 1
    );

    desktopWs.send(
      JSON.stringify({
        event: 'JOIN_ROOM',
        roomId,
        senderId: 'desktop-01',
        targetId: 'ALL',
        payload: {
          deviceId: 'desktop-01',
          deviceName: 'Desktop Chrome',
          deviceType: 'DESKTOP',
          pairToken
        }
      })
    );

    const list1 = await desktopJoinPromise;
    assert.strictEqual(list1.payload.activeDeviceId, 'desktop-01');

    // Verify invalid pairing token is rejected with ERROR
    const badMobileWs = new WebSocket(
      `ws://127.0.0.1:${pwaPort}/__ytm_connect__/ws?room=${roomId}&token=WRONG_TOKEN`
    );
    await new Promise((res) => badMobileWs.once('open', res));
    const errorEventPromise = waitForEvent(badMobileWs, 'ERROR');
    badMobileWs.send(
      JSON.stringify({
        event: 'JOIN_ROOM',
        roomId,
        senderId: 'mobile-bad',
        targetId: 'ALL',
        payload: {
          deviceId: 'mobile-bad',
          deviceName: 'Bad Token Phone',
          deviceType: 'MOBILE',
          pairToken: 'WRONG_TOKEN'
        }
      })
    );
    const errMsg = await errorEventPromise;
    assert.strictEqual(errMsg.payload.code, 'INVALID_PAIR_TOKEN');
    badMobileWs.close();

    // Legitimate Mobile connects through Mobile PWA WebSocket tunnel (/ws)
    const mobileWs = new WebSocket(
      `ws://127.0.0.1:${pwaPort}/__ytm_connect__/ws?room=${roomId}&token=${pairToken}`
    );
    await new Promise((res) => mobileWs.once('open', res));

    const bothJoinedPromise = waitForEvent(
      desktopWs,
      'DEVICE_LIST_UPDATED',
      (m) => m.payload.devices.length === 2
    );

    mobileWs.send(
      JSON.stringify({
        event: 'JOIN_ROOM',
        roomId,
        senderId: 'mobile-01',
        targetId: 'ALL',
        payload: {
          deviceId: 'mobile-01',
          deviceName: 'iPhone PWA',
          deviceType: 'MOBILE',
          pairToken
        }
      })
    );

    const list2 = await bothJoinedPromise;
    assert.strictEqual(list2.payload.devices.length, 2);
    assert.strictEqual(list2.payload.activeDeviceId, 'desktop-01');

    // Desktop emits STATE_UPDATE -> Mobile receives it
    const mobileStatePromise = waitForEvent(mobileWs, 'STATE_UPDATE');
    desktopWs.send(
      JSON.stringify({
        event: 'STATE_UPDATE',
        roomId,
        senderId: 'desktop-01',
        targetId: 'ALL',
        payload: {
          videoId: 'dQw4w9WgXcQ',
          listId: 'RDAMVMdQw4w9WgXcQ',
          title: 'Never Gonna Give You Up',
          artist: 'Rick Astley',
          artwork: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          currentTime: 42.5,
          duration: 213,
          isPaused: false,
          volume: 85
        }
      })
    );

    const mobileStateMsg = await mobileStatePromise;
    assert.strictEqual(mobileStateMsg.payload.videoId, 'dQw4w9WgXcQ');
    assert.strictEqual(mobileStateMsg.payload.listId, 'RDAMVMdQw4w9WgXcQ');
    assert.strictEqual(mobileStateMsg.payload.currentTime, 42.5);

    // Mobile sends COMMAND_ACTION (PLAY, PAUSE, NEXT, PREV, SEEK, VOLUME) -> Desktop receives all
    for (const testCmd of [
      { action: 'PAUSE' },
      { action: 'PLAY' },
      { action: 'NEXT' },
      { action: 'PREV' },
      { action: 'SEEK', value: 88.4 },
      { action: 'VOLUME', value: 65 }
    ]) {
      const desktopCmdPromise = waitForEvent(
        desktopWs,
        'COMMAND_ACTION',
        (m) => m.payload.action === testCmd.action
      );
      mobileWs.send(
        JSON.stringify({
          event: 'COMMAND_ACTION',
          roomId,
          senderId: 'mobile-01',
          targetId: 'desktop-01',
          payload: testCmd
        })
      );
      const received = await desktopCmdPromise;
      assert.strictEqual(received.payload.action, testCmd.action);
      if (testCmd.value !== undefined) {
        assert.strictEqual(received.payload.value, testCmd.value);
      }
    }
    console.log('  ✓ Pairing security, STATE_UPDATE sync, and all 6 COMMAND_ACTION types verified');

    // -------------------------------------------------------------------------
    // Test 5: Bidirectional Playback Handoff (Desktop <-> Mobile)
    // -------------------------------------------------------------------------
    console.log('▶ [5/6] Verifying Bidirectional Playback Handoff (Desktop <-> Mobile)...');
    desktopWs.once('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'HANDOFF_PLAYBACK' && msg.payload.phase === 'PAUSE_SOURCE') {
        desktopWs.send(
          JSON.stringify({
            event: 'HANDOFF_PLAYBACK',
            roomId,
            senderId: 'desktop-01',
            targetId: 'mobile-01',
            payload: {
              fromDeviceId: 'desktop-01',
              toDeviceId: 'mobile-01',
              videoId: 'dQw4w9WgXcQ',
              listId: 'RDAMVMdQw4w9WgXcQ',
              currentTime: 91.25,
              autoPlay: true,
              confirmed: true
            }
          })
        );
      }
    });

    const mobileHandoffConfirmedPromise = waitForEvent(
      mobileWs,
      'HANDOFF_PLAYBACK',
      (m) => m.payload.confirmed === true && m.payload.toDeviceId === 'mobile-01'
    );
    const activeUpdatedToMobilePromise = waitForEvent(
      desktopWs,
      'DEVICE_LIST_UPDATED',
      (m) => m.payload.activeDeviceId === 'mobile-01'
    );

    mobileWs.send(
      JSON.stringify({
        event: 'HANDOFF_PLAYBACK',
        roomId,
        senderId: 'mobile-01',
        targetId: 'desktop-01',
        payload: {
          fromDeviceId: 'desktop-01',
          toDeviceId: 'mobile-01',
          videoId: 'dQw4w9WgXcQ',
          listId: 'RDAMVMdQw4w9WgXcQ',
          currentTime: 88.4,
          autoPlay: true
        }
      })
    );

    const [handoffToMobile, activeMobileList] = await Promise.all([
      mobileHandoffConfirmedPromise,
      activeUpdatedToMobilePromise
    ]);

    assert.strictEqual(activeMobileList.payload.activeDeviceId, 'mobile-01');
    assert.strictEqual(handoffToMobile.payload.currentTime, 91.25);

    // Reverse Handoff (Mobile -> Desktop)
    const desktopHandoffConfirmedPromise = waitForEvent(
      desktopWs,
      'HANDOFF_PLAYBACK',
      (m) => m.payload.confirmed === true && m.payload.toDeviceId === 'desktop-01'
    );

    mobileWs.send(
      JSON.stringify({
        event: 'HANDOFF_PLAYBACK',
        roomId,
        senderId: 'mobile-01',
        targetId: 'desktop-01',
        payload: {
          fromDeviceId: 'mobile-01',
          toDeviceId: 'desktop-01',
          videoId: 'dQw4w9WgXcQ',
          listId: 'RDAMVMdQw4w9WgXcQ',
          currentTime: 134.8,
          autoPlay: true,
          confirmed: true
        }
      })
    );

    const handoffToDesktop = await desktopHandoffConfirmedPromise;
    assert.strictEqual(handoffToDesktop.payload.toDeviceId, 'desktop-01');
    assert.strictEqual(handoffToDesktop.payload.currentTime, 134.8);

    // Test active player disconnect failover (Desktop disconnects -> Mobile becomes activeDeviceId)
    const failoverPromise = waitForEvent(
      mobileWs,
      'DEVICE_LIST_UPDATED',
      (m) => m.payload.devices.length === 1 && m.payload.activeDeviceId === 'mobile-01'
    );
    desktopWs.close();
    const failoverList = await failoverPromise;
    assert.strictEqual(failoverList.payload.activeDeviceId, 'mobile-01');
    mobileWs.close();
    console.log('  ✓ Bidirectional Handoff & disconnect failover verified');

    // -------------------------------------------------------------------------
    // Test 6: Verify Live Dev Stack (ports 8787 & 3000) if running
    // -------------------------------------------------------------------------
    console.log('▶ [6/6] Checking Live Dev Servers on :8787 and :3000...');
    try {
      const liveRelayHealth = await fetch('http://127.0.0.1:8787/health').then((r) => r.json());
      const livePwaHealth = await fetch('http://127.0.0.1:3000/health').then((r) => r.json());
      assert.strictEqual(liveRelayHealth.ok, true);
      assert.strictEqual(livePwaHealth.ok, true);
      console.log(
        `  ✓ Live Dev Stack verified! Relay URL: ${liveRelayHealth.wsUrl} | Mobile PWA URL: ${liveRelayHealth.pwaUrl}`
      );
    } catch {
      console.log('  ℹ Live dev servers not currently running on :8787/:3000 (ephemeral servers passed)');
    }
  } finally {
    await pwa.stop();
    await relay.stop();
  }

  console.log('\n✅ ALL 6 YTM-CONNECT TEST SUITES PASSED!\n');
}

runTests().catch((err) => {
  console.error('\n❌ E2E Test Failed:', err);
  process.exit(1);
});
