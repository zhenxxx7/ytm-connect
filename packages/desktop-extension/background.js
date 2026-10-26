/**
 * YTM-Connect — Extension Background Service Worker (Manifest V3)
 *
 * Provides ZERO-INSTALL Serverless Cloud Signaling via MQTT-over-WSS (wss://broker.emqx.io:8084/mqtt)
 * plus optional Local Relay Server (ws://localhost:8787) bridging.
 * Runs in the privileged extension origin so music.youtube.com's CSP never blocks remote connections.
 */
const extApi = typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : null;
const CLOUD_MQTT_URL = 'wss://broker.emqx.io:8084/mqtt';

function mqttEncodeLength(len) {
  const out = [];
  do {
    let digit = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) digit |= 0x80;
    out.push(digit);
  } while (len > 0);
  return out;
}

function mqttEncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  return [(bytes.length >> 8) & 0xff, bytes.length & 0xff, ...bytes];
}

function mqttMakeConnect(clientId) {
  const payload = [...mqttEncodeUtf8('MQTT'), 4, 2, 0, 60, ...mqttEncodeUtf8(clientId)];
  return new Uint8Array([0x10, ...mqttEncodeLength(payload.length), ...payload]);
}

function mqttMakeSubscribe(topic) {
  const payload = [0, 1, ...mqttEncodeUtf8(topic), 0];
  return new Uint8Array([0x82, ...mqttEncodeLength(payload.length), ...payload]);
}

function mqttMakePublish(topic, text) {
  const t = mqttEncodeUtf8(topic);
  const m = new TextEncoder().encode(text);
  const payload = [...t, ...m];
  return new Uint8Array([0x30, ...mqttEncodeLength(payload.length), ...payload]);
}

if (extApi && extApi.runtime && extApi.runtime.onConnect) {
  extApi.runtime.onConnect.addListener((port) => {
    if (port.name !== 'ytm-connect-ws-bridge') return;

    let mqttWs = null;
    let localWs = null;
    let currentRoomId = 'YTM123';
    let pingTimer = null;

    function getTopic() {
      return `ytm-connect/v1/room/${currentRoomId}`;
    }

    function cleanup() {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      if (mqttWs) {
        try {
          mqttWs.onclose = null;
          mqttWs.close();
        } catch {}
        mqttWs = null;
      }
      if (localWs) {
        try {
          localWs.onclose = null;
          localWs.close();
        } catch {}
        localWs = null;
      }
    }

    function connectTransports(roomId, localRelayUrl) {
      cleanup();
      currentRoomId = String(roomId || 'YTM123').toUpperCase();

      // 1. Connect to Serverless Cloud MQTT-over-WSS Broker (No npm start required!)
      try {
        mqttWs = new WebSocket(CLOUD_MQTT_URL, 'mqtt');
        mqttWs.binaryType = 'arraybuffer';
        mqttWs.onopen = () => {
          mqttWs.send(mqttMakeConnect(`ytmc_bg_${Date.now() % 100000}`));
          setTimeout(() => {
            if (mqttWs && mqttWs.readyState === WebSocket.OPEN) {
              mqttWs.send(mqttMakeSubscribe(getTopic()));
              try {
                port.postMessage({ type: 'WS_OPEN', mode: 'CLOUD_MQTT' });
              } catch {}
            }
          }, 160);
        };
        mqttWs.onmessage = (event) => {
          const u = new Uint8Array(event.data);
          if ((u[0] & 0xf0) === 0x30) {
            let idx = 1;
            while (idx < u.length && u[idx++] & 0x80) {}
            const tLen = (u[idx] << 8) | u[idx + 1];
            const payloadBytes = u.subarray(idx + 2 + tLen);
            const text = new TextDecoder().decode(payloadBytes);
            try {
              port.postMessage({ type: 'WS_MESSAGE', data: text });
            } catch {}
          }
        };
        mqttWs.onerror = () => {};
      } catch {}

      // 2. Also connect to Local Relay Server (ws://localhost:8787) if running
      if (localRelayUrl) {
        try {
          localWs = new WebSocket(localRelayUrl);
          localWs.onopen = () => {
            try {
              port.postMessage({ type: 'WS_OPEN', mode: 'LOCAL_WS' });
            } catch {}
          };
          localWs.onmessage = (event) => {
            try {
              port.postMessage({ type: 'WS_MESSAGE', data: event.data });
            } catch {}
          };
          localWs.onerror = () => {};
        } catch {}
      }

      pingTimer = setInterval(() => {
        if (mqttWs && mqttWs.readyState === WebSocket.OPEN) {
          try {
            mqttWs.send(new Uint8Array([0xc0, 0x00]));
          } catch {}
        }
      }, 25000);
    }

    port.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'WS_CONNECT') {
        connectTransports(msg.roomId, msg.url);
      } else if (msg.type === 'WS_SEND' && msg.data) {
        if (mqttWs && mqttWs.readyState === WebSocket.OPEN) {
          try {
            mqttWs.send(mqttMakePublish(getTopic(), msg.data));
          } catch {}
        }
        if (localWs && localWs.readyState === WebSocket.OPEN) {
          try {
            localWs.send(msg.data);
          } catch {}
        }
      } else if (msg.type === 'WS_CLOSE') {
        cleanup();
      }
    });

    port.onDisconnect.addListener(() => {
      cleanup();
    });
  });
}

if (extApi && extApi.runtime && extApi.runtime.onMessage) {
  extApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;

    if (message.type === 'OPEN_MOBILE_WINDOW') {
      const mobileUrl = extApi.runtime.getURL(
        `mobile/index.html?room=${encodeURIComponent(message.roomId || '')}&token=${encodeURIComponent(
          message.pairToken || ''
        )}`
      );
      if (extApi.windows && extApi.windows.create) {
        extApi.windows.create({
          url: mobileUrl,
          type: 'popup',
          width: 410,
          height: 820
        });
      } else if (extApi.tabs && extApi.tabs.create) {
        extApi.tabs.create({ url: mobileUrl });
      }
      sendResponse({ ok: true, url: mobileUrl });
      return true;
    }

    return false;
  });
}
