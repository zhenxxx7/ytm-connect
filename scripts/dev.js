/**
 * YTM-Connect — Unified Development Orchestrator (`npm run dev`)
 * Spins up both:
 *  - Module A: Relay Server (ws://localhost:8787)
 *  - Module C: Mobile PWA Reverse Proxy & Bridge Server (http://localhost:3000)
 */
const path = require('path');
const { generateAllIcons } = require('./generate-icons');
const { createRelayServer, getPrimaryLanIp } = require('../packages/relay-server/src/index');
const { createMobilePwaServer } = require('../packages/mobile-pwa/src/server');

async function startDevStack() {
  generateAllIcons();

  const relayPort = Number(process.env.RELAY_PORT || 8787);
  const pwaPort = Number(process.env.PWA_PORT || 3000);
  const lanIp = getPrimaryLanIp();

  const relay = createRelayServer({ port: relayPort });
  const pwa = createMobilePwaServer({ port: pwaPort, relayPort });

  await relay.start(relayPort);
  await pwa.start(pwaPort);

  const extDir = path.resolve(__dirname, '..', 'packages', 'desktop-extension');

  console.log('\n====================================================================');
  console.log('  YTM-Connect Development Stack Ready');
  console.log('====================================================================');
  console.log(`  Relay WebSocket Server : ws://localhost:${relayPort} (LAN: ws://${lanIp}:${relayPort})`);
  console.log(`  Mobile PWA Server      : http://localhost:${pwaPort} (LAN: http://${lanIp}:${pwaPort})`);
  console.log(`  Desktop Extension Path : ${extDir}`);
  console.log('--------------------------------------------------------------------');
  console.log('  Quick Start:');
  console.log('  1. Load unpacked extension from packages/desktop-extension');
  console.log('  2. Open https://music.youtube.com on Desktop');
  console.log(`  3. Scan QR code in extension popup or visit http://${lanIp}:${pwaPort} on Mobile`);
  console.log('====================================================================\n');

  const shutdown = async () => {
    console.log('\n[YTM-Connect] Shutting down servers...');
    await Promise.all([pwa.stop(), relay.stop()]);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startDevStack().catch((err) => {
  console.error('[YTM-Connect] Failed to start dev stack:', err);
  process.exit(1);
});
