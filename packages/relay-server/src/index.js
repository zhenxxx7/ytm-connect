/**
 * YTM-Connect — Relay Server (Module A)
 * Lightweight real-time WebSocket message router, room broker, and handoff coordinator.
 */

const http = require('http');
const os = require('os');
const { URL } = require('url');
const { WebSocketServer, WebSocket } = require('ws');

const DEFAULT_PORT = Number(process.env.RELAY_PORT || process.env.PORT || 8787);
const PWA_PORT = Number(process.env.PWA_PORT || 3000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS || 30000);
const ROOM_IDLE_TTL_MS = 5 * 60 * 1000; // Keep room metadata for 5 mins on navigation/reload
const HANDOFF_CONFIRM_TIMEOUT_MS = 400;

/**
 * Detect primary non-internal IPv4 address on LAN for QR code generation.
 */
function getPrimaryLanIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, netList] of Object.entries(interfaces)) {
    if (!netList) continue;
    for (const net of netList) {
      if (net.family === 'IPv4' && !net.internal) {
        const lower = name.toLowerCase();
        const isVirtual =
          lower.includes('vethernet') ||
          lower.includes('wsl') ||
          lower.includes('docker') ||
          lower.includes('vmware') ||
          lower.includes('virtualbox') ||
          lower.includes('hyper-v') ||
          lower.includes('tailscale') ||
          net.address.startsWith('100.');
        const isPrivateLan =
          net.address.startsWith('192.168.') ||
          net.address.startsWith('10.') ||
          /^172\.(1[6-9]|2\d|3[0-1])\./.test(net.address);
        candidates.push({ address: net.address, isVirtual, isPrivateLan, name });
      }
    }
  }

  const preferredLan = candidates.find((c) => !c.isVirtual && c.isPrivateLan);
  if (preferredLan) return preferredLan.address;
  const physical = candidates.find((c) => !c.isVirtual);
  if (physical) return physical.address;
  if (candidates.length > 0) return candidates[0].address;
  return '127.0.0.1';
}

function normalizeRoomId(roomId) {
  if (!roomId || typeof roomId !== 'string') return '';
  return roomId.trim().toUpperCase().slice(0, 12);
}

function sendJson(ws, message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      console.error('[Relay] Failed to send message:', err.message);
    }
  }
}

function createRelayServer(options = {}) {
  const port = options.port ?? DEFAULT_PORT;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;

  /**
   * @type {Map<string, {
   *   roomId: string,
   *   pairToken: string | null,
   *   activeDeviceId: string | null,
   *   lastActiveDeviceId: string | null,
   *   devices: Map<string, {
   *     deviceId: string,
   *     deviceName: string,
   *     deviceType: 'DESKTOP' | 'MOBILE',
   *     isActivePlayer: boolean,
   *     ws: import('ws').WebSocket,
   *     joinedAt: number,
   *     lastSeen: number
   *   }>,
   *   lastState: Record<string, any> | null,
   *   pendingHandoff: { timer: NodeJS.Timeout, payload: Record<string, any> } | null,
   *   cleanupTimer: NodeJS.Timeout | null
   * }>}
   */
  const rooms = new Map();

  function getOrCreateRoom(rawRoomId) {
    const roomId = normalizeRoomId(rawRoomId);
    if (!roomId) return null;
    let room = rooms.get(roomId);
    if (!room) {
      room = {
        roomId,
        pairToken: null,
        activeDeviceId: null,
        lastActiveDeviceId: null,
        devices: new Map(),
        lastState: null,
        pendingHandoff: null,
        cleanupTimer: null
      };
      rooms.set(roomId, room);
    }
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
    return room;
  }

  function serializeDevices(room) {
    const list = [];
    for (const d of room.devices.values()) {
      list.push({
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        deviceType: d.deviceType,
        isActivePlayer: d.deviceId === room.activeDeviceId
      });
    }
    return list;
  }

  function syncActivePlayerFlags(room) {
    for (const d of room.devices.values()) {
      d.isActivePlayer = d.deviceId === room.activeDeviceId;
    }
  }

  function broadcastDeviceList(room) {
    syncActivePlayerFlags(room);
    const message = {
      event: 'DEVICE_LIST_UPDATED',
      roomId: room.roomId,
      senderId: 'RELAY_SERVER',
      targetId: 'ALL',
      payload: {
        devices: serializeDevices(room),
        activeDeviceId: room.activeDeviceId
      }
    };
    for (const d of room.devices.values()) {
      sendJson(d.ws, message);
    }
  }

  function broadcastToRoom(room, message, excludeDeviceId = null) {
    for (const d of room.devices.values()) {
      if (excludeDeviceId && d.deviceId === excludeDeviceId) continue;
      sendJson(d.ws, message);
    }
  }

  function finalizeHandoff(room, handoffPayload) {
    if (room.pendingHandoff) {
      clearTimeout(room.pendingHandoff.timer);
      room.pendingHandoff = null;
    }

    const fromDeviceId = handoffPayload.fromDeviceId || room.activeDeviceId;
    const toDeviceId = handoffPayload.toDeviceId;
    if (!toDeviceId) return;

    const mergedState = {
      ...(room.lastState || {}),
      videoId: handoffPayload.videoId || room.lastState?.videoId || '',
      listId: handoffPayload.listId ?? room.lastState?.listId ?? '',
      title: handoffPayload.title || room.lastState?.title || 'YouTube Music Track',
      artist: handoffPayload.artist || room.lastState?.artist || 'YouTube Music',
      artwork: handoffPayload.artwork || room.lastState?.artwork || '',
      currentTime:
        typeof handoffPayload.currentTime === 'number'
          ? handoffPayload.currentTime
          : Number(room.lastState?.currentTime || 0),
      duration:
        typeof handoffPayload.duration === 'number'
          ? handoffPayload.duration
          : Number(room.lastState?.duration || 0),
      volume:
        typeof handoffPayload.volume === 'number'
          ? handoffPayload.volume
          : Number(room.lastState?.volume ?? 100),
      isPaused: !(handoffPayload.autoPlay ?? true),
      updatedAt: Date.now()
    };

    room.lastState = mergedState;
    room.activeDeviceId = toDeviceId;
    room.lastActiveDeviceId = toDeviceId;
    syncActivePlayerFlags(room);

    // 1. Broadcast updated device list with new activeDeviceId
    broadcastDeviceList(room);

    // 2. Deliver confirmed HANDOFF_PLAYBACK to target device (and notify room)
    const handoffEvent = {
      event: 'HANDOFF_PLAYBACK',
      roomId: room.roomId,
      senderId: fromDeviceId || 'RELAY_SERVER',
      targetId: toDeviceId,
      payload: {
        fromDeviceId,
        toDeviceId,
        videoId: mergedState.videoId,
        listId: mergedState.listId,
        title: mergedState.title,
        artist: mergedState.artist,
        artwork: mergedState.artwork,
        currentTime: mergedState.currentTime,
        duration: mergedState.duration,
        volume: mergedState.volume,
        autoPlay: handoffPayload.autoPlay ?? true,
        confirmed: true
      }
    };

    const targetDevice = room.devices.get(toDeviceId);
    if (targetDevice) {
      sendJson(targetDevice.ws, handoffEvent);
    }

    // Also broadcast STATE_UPDATE to passive devices so UI stays in sync immediately
    broadcastToRoom(
      room,
      {
        event: 'STATE_UPDATE',
        roomId: room.roomId,
        senderId: toDeviceId,
        targetId: 'ALL',
        payload: mergedState
      },
      toDeviceId
    );
  }

  function removeSocketFromRoom(ws) {
    const roomId = ws.roomId;
    const deviceId = ws.deviceId;
    if (!roomId || !deviceId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const existing = room.devices.get(deviceId);
    // Only delete if this exact socket is still the registered socket for deviceId
    if (existing && existing.ws === ws) {
      room.devices.delete(deviceId);

      if (room.activeDeviceId === deviceId) {
        room.lastActiveDeviceId = deviceId;
        // Pick next available device if any
        const nextDevice = room.devices.values().next().value;
        room.activeDeviceId = nextDevice ? nextDevice.deviceId : null;
      }

      if (room.devices.size > 0) {
        broadcastDeviceList(room);
      } else {
        room.cleanupTimer = setTimeout(() => {
          if (room.devices.size === 0) {
            rooms.delete(roomId);
          }
        }, ROOM_IDLE_TTL_MS);
      }
    }
  }

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (parsedUrl.pathname === '/health' || parsedUrl.pathname === '/network-info') {
      const lanIp = getPrimaryLanIp();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          service: 'ytm-connect-relay',
          lanIp,
          relayPort: port,
          pwaPort: PWA_PORT,
          pwaUrl: `http://${lanIp}:${PWA_PORT}`,
          wsUrl: `ws://${lanIp}:${port}`,
          roomsCount: rooms.size,
          uptime: Math.round(process.uptime())
        })
      );
      return;
    }

    if (parsedUrl.pathname.startsWith('/room/')) {
      const roomId = normalizeRoomId(parsedUrl.pathname.replace('/room/', ''));
      const room = rooms.get(roomId);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      if (!room) {
        res.end(JSON.stringify({ exists: false, roomId, devices: [], activeDeviceId: null }));
        return;
      }
      res.end(
        JSON.stringify({
          exists: true,
          roomId: room.roomId,
          activeDeviceId: room.activeDeviceId,
          devices: serializeDevices(room),
          lastState: room.lastState
        })
      );
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        name: 'YTM-Connect Relay Server',
        status: 'running',
        lanIp: getPrimaryLanIp(),
        wsEndpoint: `ws://${getPrimaryLanIp()}:${port}`
      })
    );
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const queryRoomId = normalizeRoomId(parsedUrl.searchParams.get('room') || '');
    const queryToken = parsedUrl.searchParams.get('token') || null;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (rawData) => {
      ws.isAlive = true;
      let msg;
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        sendJson(ws, {
          event: 'ERROR',
          roomId: ws.roomId || '',
          senderId: 'RELAY_SERVER',
          targetId: ws.deviceId || 'ALL',
          payload: { code: 'INVALID_JSON', message: 'Malformed JSON message' }
        });
        return;
      }

      if (!msg || typeof msg !== 'object') return;

      // Support application-level heartbeat ping
      if (msg.event === 'PING') {
        sendJson(ws, {
          event: 'PONG',
          roomId: msg.roomId || ws.roomId || '',
          senderId: 'RELAY_SERVER',
          targetId: msg.senderId || ws.deviceId || 'ALL',
          payload: { ts: Date.now() }
        });
        return;
      }

      const event = msg.event;
      const roomId = normalizeRoomId(msg.roomId || queryRoomId || ws.roomId || '');
      const senderId = msg.senderId || msg.payload?.deviceId || ws.deviceId || '';
      const targetId = msg.targetId || 'ALL';
      const payload = msg.payload || {};

      if (!roomId) {
        sendJson(ws, {
          event: 'ERROR',
          roomId: '',
          senderId: 'RELAY_SERVER',
          targetId: senderId || 'ALL',
          payload: { code: 'MISSING_ROOM_ID', message: 'roomId is required' }
        });
        return;
      }

      const room = getOrCreateRoom(roomId);
      if (!room) return;

      switch (event) {
        case 'JOIN_ROOM': {
          const deviceId = String(payload.deviceId || senderId || `dev-${Date.now()}`);
          const deviceType = payload.deviceType === 'MOBILE' ? 'MOBILE' : 'DESKTOP';
          const deviceName = String(
            payload.deviceName || (deviceType === 'MOBILE' ? 'Mobile PWA' : 'Desktop Browser')
          );
          const incomingToken = payload.pairToken || payload.token || queryToken || null;

          // Token pairing validation:
          // - If room has no token yet and one is provided, bind it.
          // - If DESKTOP provides a token, update room's pairToken.
          // - If MOBILE provides a token and room has a token, verify match.
          if (incomingToken) {
            if (!room.pairToken || deviceType === 'DESKTOP') {
              room.pairToken = String(incomingToken);
            } else if (room.pairToken && String(incomingToken) !== room.pairToken) {
              sendJson(ws, {
                event: 'ERROR',
                roomId: room.roomId,
                senderId: 'RELAY_SERVER',
                targetId: deviceId,
                payload: {
                  code: 'INVALID_PAIR_TOKEN',
                  message: 'Pairing token mismatch for this room.'
                }
              });
              return;
            }
          }

          // If socket was previously in another room or deviceId, clean up old binding
          if (ws.roomId && (ws.roomId !== room.roomId || ws.deviceId !== deviceId)) {
            removeSocketFromRoom(ws);
          }

          ws.roomId = room.roomId;
          ws.deviceId = deviceId;

          const existingDevice = room.devices.get(deviceId);
          if (existingDevice && existingDevice.ws !== ws) {
            // Close stale socket for same deviceId without triggering active device drop
            try {
              existingDevice.ws.roomId = null;
              existingDevice.ws.close(1000, 'Replaced by newer connection');
            } catch {
              // ignore
            }
          }

          // Determine active player assignment
          if (
            !room.activeDeviceId ||
            !room.devices.has(room.activeDeviceId) ||
            payload.claimActive === true ||
            room.lastActiveDeviceId === deviceId
          ) {
            // If no active player or this device was previously the active player before reload
            if (!room.activeDeviceId || !room.devices.has(room.activeDeviceId) || payload.claimActive === true) {
              room.activeDeviceId = deviceId;
              room.lastActiveDeviceId = deviceId;
            }
          }

          room.devices.set(deviceId, {
            deviceId,
            deviceName,
            deviceType,
            isActivePlayer: room.activeDeviceId === deviceId,
            ws,
            joinedAt: existingDevice?.joinedAt || Date.now(),
            lastSeen: Date.now()
          });

          console.log(
            `[Relay] Room ${room.roomId}: ${deviceName} (${deviceType}, ${deviceId}) joined. Active: ${room.activeDeviceId}`
          );

          // Broadcast updated device list to everyone in the room
          broadcastDeviceList(room);

          // Send cached playback state immediately to the joining device
          if (room.lastState) {
            sendJson(ws, {
              event: 'STATE_UPDATE',
              roomId: room.roomId,
              senderId: room.activeDeviceId || 'RELAY_SERVER',
              targetId: deviceId,
              payload: room.lastState
            });
          }
          break;
        }

        case 'STATE_UPDATE': {
          const senderDevice = room.devices.get(senderId);
          if (senderDevice) {
            senderDevice.lastSeen = Date.now();
          }

          // Only accept state updates from the active device (or if room has no state yet, or forced)
          const isFromActive = !room.activeDeviceId || senderId === room.activeDeviceId || payload.force === true;
          if (isFromActive) {
            room.lastState = {
              videoId: payload.videoId || room.lastState?.videoId || '',
              listId: payload.listId ?? room.lastState?.listId ?? '',
              title: payload.title || room.lastState?.title || '',
              artist: payload.artist || room.lastState?.artist || '',
              artwork: payload.artwork || room.lastState?.artwork || '',
              currentTime: Number(payload.currentTime ?? room.lastState?.currentTime ?? 0),
              duration: Number(payload.duration ?? room.lastState?.duration ?? 0),
              isPaused: Boolean(payload.isPaused ?? true),
              volume: Number(payload.volume ?? room.lastState?.volume ?? 100),
              updatedAt: Date.now()
            };
          }

          const outbound = {
            event: 'STATE_UPDATE',
            roomId: room.roomId,
            senderId,
            targetId: targetId || 'ALL',
            payload: room.lastState || payload
          };

          if (targetId && targetId !== 'ALL') {
            const target = room.devices.get(targetId);
            if (target) sendJson(target.ws, outbound);
          } else {
            broadcastToRoom(room, outbound, senderId);
          }
          break;
        }

        case 'COMMAND_ACTION': {
          // Route command from passive controller to the active player (or explicit targetId)
          const resolvedTargetId =
            targetId && targetId !== 'ALL' ? targetId : room.activeDeviceId;

          const outbound = {
            event: 'COMMAND_ACTION',
            roomId: room.roomId,
            senderId,
            targetId: resolvedTargetId || 'ALL',
            payload
          };

          if (resolvedTargetId && room.devices.has(resolvedTargetId)) {
            const targetDevice = room.devices.get(resolvedTargetId);
            sendJson(targetDevice.ws, outbound);
          } else {
            broadcastToRoom(room, outbound, senderId);
          }
          break;
        }

        case 'HANDOFF_PLAYBACK': {
          const fromDeviceId = payload.fromDeviceId || room.activeDeviceId;
          const toDeviceId = payload.toDeviceId || (targetId !== 'ALL' ? targetId : null);

          if (!toDeviceId) break;

          const sourceDevice = fromDeviceId ? room.devices.get(fromDeviceId) : null;
          const isConfirmedBySource =
            payload.confirmed === true ||
            senderId === fromDeviceId ||
            !sourceDevice ||
            fromDeviceId === toDeviceId;

          if (!isConfirmedBySource && sourceDevice) {
            // Step 2 of Handoff Workflow:
            // Target device (e.g. Mobile) requested handoff from Source (e.g. Desktop).
            // Ask Source to immediately pause its <video> and reply with exact final videoId, listId, currentTime.
            if (room.pendingHandoff) {
              clearTimeout(room.pendingHandoff.timer);
            }

            const pauseRequest = {
              event: 'HANDOFF_PLAYBACK',
              roomId: room.roomId,
              senderId,
              targetId: fromDeviceId,
              payload: {
                ...payload,
                fromDeviceId,
                toDeviceId,
                autoPlay: payload.autoPlay ?? true,
                phase: 'PAUSE_SOURCE'
              }
            };
            sendJson(sourceDevice.ws, pauseRequest);

            // Fallback timer in case source tab is throttled/unresponsive
            const timer = setTimeout(() => {
              finalizeHandoff(room, {
                ...payload,
                fromDeviceId,
                toDeviceId,
                autoPlay: payload.autoPlay ?? true
              });
            }, HANDOFF_CONFIRM_TIMEOUT_MS);

            room.pendingHandoff = { timer, payload };
          } else {
            // Source device either initiated the handoff directly or confirmed pause + exact timestamp
            if (sourceDevice && senderId !== fromDeviceId) {
              sendJson(sourceDevice.ws, {
                event: 'COMMAND_ACTION',
                roomId: room.roomId,
                senderId: 'RELAY_SERVER',
                targetId: fromDeviceId,
                payload: { action: 'PAUSE' }
              });
            }
            finalizeHandoff(room, {
              ...payload,
              fromDeviceId,
              toDeviceId,
              autoPlay: payload.autoPlay ?? true
            });
          }
          break;
        }

        default: {
          // Forward any custom or future protocol events according to targetId
          if (targetId && targetId !== 'ALL') {
            const target = room.devices.get(targetId);
            if (target) sendJson(target.ws, msg);
          } else {
            broadcastToRoom(room, msg, senderId);
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      removeSocketFromRoom(ws);
    });

    ws.on('error', (err) => {
      console.error('[Relay] Socket error:', err.message);
      removeSocketFromRoom(ws);
    });
  });

  // 30s Heartbeat Ping/Pong Cleanup
  const heartbeatTimer = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        removeSocketFromRoom(ws);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        // ignore
      }
    }
  }, heartbeatIntervalMs);

  wss.on('close', () => {
    clearInterval(heartbeatTimer);
  });

  return {
    server,
    wss,
    rooms,
    start(listenPort = port) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(listenPort, '0.0.0.0', () => {
          const actualPort = server.address().port;
          const lanIp = getPrimaryLanIp();
          console.log(`[Relay Server] Listening on ws://localhost:${actualPort} (LAN: ws://${lanIp}:${actualPort})`);
          resolve({ port: actualPort, lanIp });
        });
      });
    },
    stop() {
      return new Promise((resolve) => {
        clearInterval(heartbeatTimer);
        for (const ws of wss.clients) {
          try {
            ws.terminate();
          } catch {
            // ignore
          }
        }
        wss.close(() => {
          server.close(() => resolve());
        });
      });
    }
  };
}

if (require.main === module) {
  const relay = createRelayServer();
  relay.start().catch((err) => {
    console.error('[Relay Server] Failed to start:', err);
    process.exit(1);
  });
}

function vercelRootHandler(req, res) {
  const fs = require('fs');
  const path = require('path');
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'public', 'index.html'),
    path.join(__dirname, '..', '..', '..', 'docs', 'index.html'),
    path.join(__dirname, '..', '..', 'mobile-pwa', 'public', 'index.html')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(p, 'utf8'));
        return;
      }
    } catch {}
  }
  const qs = req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.writeHead(302, { Location: `/index.html${qs}` });
  res.end();
}

vercelRootHandler.createRelayServer = createRelayServer;
vercelRootHandler.getPrimaryLanIp = getPrimaryLanIp;
vercelRootHandler.normalizeRoomId = normalizeRoomId;

module.exports = vercelRootHandler;
