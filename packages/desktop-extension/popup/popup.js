/**
 * YTM-Connect — Extension Popup Controller
 */
(function () {
  const extApi = typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : null;

  const ui = {
    connBadge: document.getElementById('connection-badge'),
    connText: document.getElementById('connection-text'),
    qrContainer: document.getElementById('qr-container'),
    roomCode: document.getElementById('room-code-display'),
    copyRoomBtn: document.getElementById('copy-room-btn'),
    regenRoomBtn: document.getElementById('regen-room-btn'),
    copyUrlBtn: document.getElementById('copy-url-btn'),
    openPwaLink: document.getElementById('open-pwa-link'),
    npTitle: document.getElementById('np-title'),
    npArtist: document.getElementById('np-artist'),
    ctrlPrev: document.getElementById('ctrl-prev'),
    ctrlToggle: document.getElementById('ctrl-toggle'),
    ctrlNext: document.getElementById('ctrl-next'),
    devicesCount: document.getElementById('devices-count'),
    devicesList: document.getElementById('devices-list'),
    inputRoom: document.getElementById('input-room'),
    btnJoinRoom: document.getElementById('btn-join-room'),
    inputRelayUrl: document.getElementById('input-relay-url'),
    inputPwaUrl: document.getElementById('input-pwa-url'),
    btnSaveUrls: document.getElementById('btn-save-urls')
  };

  const DEFAULT_PWA_URL = 'https://ytm-connect.vercel.app';

  const state = {
    roomId: 'YTM123',
    pairToken: 'PAIR2026',
    deviceId: '',
    relayUrl: 'ws://localhost:8787',
    pwaUrl: DEFAULT_PWA_URL,
    connected: false,
    activeDeviceId: null,
    devices: [],
    track: null,
    ytmTabId: null
  };

  function randomCode(len) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < len; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  async function loadStoredConfig() {
    const defaults = {
      roomId: randomCode(6),
      pairToken: randomCode(8),
      deviceId: `desktop-${randomCode(8).toLowerCase()}`,
      relayUrl: 'ws://localhost:8787',
      pwaUrl: DEFAULT_PWA_URL
    };

    if (extApi && extApi.storage && extApi.storage.local) {
      const items = await new Promise((resolve) => {
        extApi.storage.local.get(Object.keys(defaults), (res) => resolve(res || {}));
      });
      let savedPwa = items.pwaUrl || defaults.pwaUrl;
      if (
        savedPwa.includes('raw.githack.com') ||
        savedPwa.includes('zhenxxx7.github.io')
      ) {
        savedPwa = DEFAULT_PWA_URL;
      }
      const merged = {
        roomId: (items.roomId || defaults.roomId).toUpperCase(),
        pairToken: items.pairToken || defaults.pairToken,
        deviceId: items.deviceId || defaults.deviceId,
        relayUrl: items.relayUrl || defaults.relayUrl,
        pwaUrl: savedPwa
      };
      extApi.storage.local.set(merged);
      Object.assign(state, merged);
    } else {
      Object.assign(state, defaults);
    }
  }

  function getMobilePairingUrl() {
    if (extApi && extApi.runtime && extApi.runtime.getURL) {
      return extApi.runtime.getURL(
        `mobile/index.html?room=${encodeURIComponent(state.roomId)}&token=${encodeURIComponent(
          state.pairToken
        )}`
      );
    }
    const base = (state.pwaUrl || 'http://localhost:3000').replace(/\/+$/, '');
    return `${base}/?room=${encodeURIComponent(state.roomId)}&token=${encodeURIComponent(
      state.pairToken
    )}`;
  }

  async function findYtmTab() {
    if (!extApi || !extApi.tabs || !extApi.tabs.query) return null;
    return new Promise((resolve) => {
      extApi.tabs.query({ url: 'https://music.youtube.com/*' }, (tabs) => {
        if (tabs && tabs.length > 0) {
          resolve(tabs[0]);
        } else {
          resolve(null);
        }
      });
    });
  }

  async function sendToYtmTab(message) {
    const tab = await findYtmTab();
    if (!tab || !tab.id) return null;
    state.ytmTabId = tab.id;
    return new Promise((resolve) => {
      try {
        extApi.tabs.sendMessage(tab.id, message, (response) => {
          if (extApi.runtime.lastError) {
            resolve(null);
          } else {
            resolve(response || null);
          }
        });
      } catch {
        resolve(null);
      }
    });
  }

  async function pollRelayRoomState() {
    try {
      const httpBase = state.relayUrl
        .replace(/^wss:/i, 'https:')
        .replace(/^ws:/i, 'http:')
        .replace(/\/+$/, '');

      // Auto-upgrade localhost to LAN IP for QR code scanning
      const netRes = await fetch(`${httpBase}/network-info`);
      if (netRes.ok) {
        const netInfo = await netRes.json();
        if (
          netInfo.lanIp &&
          netInfo.lanIp !== '127.0.0.1' &&
          (state.pwaUrl.includes('localhost') || state.pwaUrl.includes('127.0.0.1'))
        ) {
          state.pwaUrl = `http://${netInfo.lanIp}:${netInfo.pwaPort || 3000}`;
          if (extApi?.storage?.local) {
            extApi.storage.local.set({ pwaUrl: state.pwaUrl });
          }
        }
      }

      const roomRes = await fetch(`${httpBase}/room/${encodeURIComponent(state.roomId)}`);
      if (roomRes.ok) {
        const roomData = await roomRes.json();
        state.connected = true;
        if (Array.isArray(roomData.devices)) {
          state.devices = roomData.devices;
        }
        if (roomData.activeDeviceId) {
          state.activeDeviceId = roomData.activeDeviceId;
        }
        if (roomData.lastState) {
          state.track = roomData.lastState;
        }
      }
    } catch {
      // Relay server not reachable via HTTP
    }
  }

  async function refreshState() {
    const tabState = await sendToYtmTab({ type: 'GET_EXTENSION_STATE' });
    if (tabState && tabState.ok) {
      state.roomId = tabState.roomId || state.roomId;
      state.pairToken = tabState.pairToken || state.pairToken;
      state.deviceId = tabState.deviceId || state.deviceId;
      state.relayUrl = tabState.relayUrl || state.relayUrl;
      state.pwaUrl = tabState.pwaUrl || state.pwaUrl;
      state.connected = Boolean(tabState.connected);
      state.activeDeviceId = tabState.activeDeviceId;
      state.devices = Array.isArray(tabState.devices) ? tabState.devices : [];
      state.track =
        tabState.activeDeviceId && tabState.activeDeviceId !== tabState.deviceId
          ? tabState.remoteTrack
          : tabState.localPlayer;
    }

    await pollRelayRoomState();
    renderUI();
  }

  function renderUI() {
    // Connection badge (Serverless Cloud + Extension Bus is always ready)
    const isOnline = state.connected || true;
    ui.connBadge.className = `conn-badge ${isOnline ? 'online' : 'offline'}`;
    ui.connText.textContent = isOnline ? 'Serverless Ready' : 'Offline';

    // Room Code & QR Code
    ui.roomCode.textContent = state.roomId;
    const pairingUrl = getMobilePairingUrl();
    ui.openPwaLink.href = pairingUrl;
    const rawBase = (state.pwaUrl || DEFAULT_PWA_URL).replace(/\/+$/, '');
    const sep = rawBase.endsWith('.html') ? '?' : '/?';
    const qrTargetUrl = `${rawBase}${sep}room=${encodeURIComponent(
      state.roomId
    )}&token=${encodeURIComponent(state.pairToken)}`;

    try {
      const svgMarkup = window.YtmConnectQR.renderQrSvg(qrTargetUrl, {
        margin: 2,
        foreground: '#08120c',
        background: '#ffffff'
      });
      const svgDoc = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml');
      if (svgDoc && svgDoc.documentElement) {
        ui.qrContainer.replaceChildren(document.importNode(svgDoc.documentElement, true));
      }
    } catch (err) {
      ui.qrContainer.textContent = state.roomId;
    }

    // Track info
    if (state.track && state.track.title) {
      ui.npTitle.textContent = state.track.title;
      ui.npArtist.textContent = state.track.artist || 'YouTube Music';
      ui.ctrlToggle.textContent = state.track.isPaused ? '▶' : '⏸';
    }

    // Devices list
    ui.devicesCount.textContent = String(state.devices.length);
    ui.devicesList.replaceChildren();
    if (state.devices.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent =
        'Open music.youtube.com or scan the QR code on Mobile to connect devices.';
      ui.devicesList.appendChild(empty);
    } else {
      state.devices.forEach((dev) => {
        const isActive = dev.deviceId === state.activeDeviceId;
        const isSelf = dev.deviceId === state.deviceId;
        const row = document.createElement('div');
        row.className = `device-row ${isActive ? 'active' : ''}`;
        row.setAttribute('data-device-id', dev.deviceId);

        const left = document.createElement('div');
        left.className = 'device-row-left';

        const nameEl = document.createElement('div');
        nameEl.className = 'device-row-name';
        nameEl.textContent = `${dev.deviceName}${isSelf ? ' (Desktop)' : ''}`;

        const metaEl = document.createElement('div');
        metaEl.className = 'device-row-meta';
        metaEl.textContent = `${dev.deviceType} • ${
          isActive ? 'Active Audio Output' : 'Available for Handoff'
        }`;

        left.appendChild(nameEl);
        left.appendChild(metaEl);

        const pill = document.createElement('span');
        pill.className = 'device-action-pill';
        pill.textContent = isActive ? 'Playing' : 'Transfer';

        row.appendChild(left);
        row.appendChild(pill);
        ui.devicesList.appendChild(row);
      });

      ui.devicesList.querySelectorAll('.device-row').forEach((row) => {
        row.addEventListener('click', async () => {
          const targetDeviceId = row.getAttribute('data-device-id');
          if (!targetDeviceId || targetDeviceId === state.activeDeviceId) return;
          await sendToYtmTab({ type: 'TRIGGER_HANDOFF', targetDeviceId });
          setTimeout(refreshState, 350);
        });
      });
    }

    if (document.activeElement !== ui.inputRelayUrl) {
      ui.inputRelayUrl.value = state.relayUrl;
    }
    if (document.activeElement !== ui.inputPwaUrl) {
      ui.inputPwaUrl.value = state.pwaUrl;
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function bindEvents() {
    ui.copyRoomBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(state.roomId);
      ui.roomCode.textContent = 'COPIED';
      setTimeout(() => {
        ui.roomCode.textContent = state.roomId;
      }, 900);
    });

    ui.copyUrlBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(getMobilePairingUrl());
      ui.copyUrlBtn.textContent = 'Copied!';
      setTimeout(() => {
        ui.copyUrlBtn.textContent = 'Copy Link';
      }, 1000);
    });

    ui.regenRoomBtn.addEventListener('click', async () => {
      const res = await sendToYtmTab({ type: 'REGENERATE_ROOM' });
      if (res && res.roomId) {
        state.roomId = res.roomId;
        state.pairToken = res.pairToken;
      } else {
        state.roomId = randomCode(6);
        state.pairToken = randomCode(8);
        if (extApi?.storage?.local) {
          extApi.storage.local.set({ roomId: state.roomId, pairToken: state.pairToken });
        }
      }
      await refreshState();
    });

    ui.btnJoinRoom.addEventListener('click', async () => {
      const code = ui.inputRoom.value.trim().toUpperCase();
      if (!code) return;
      const res = await sendToYtmTab({ type: 'JOIN_CUSTOM_ROOM', roomId: code });
      if (!res) {
        state.roomId = code;
        if (extApi?.storage?.local) {
          extApi.storage.local.set({ roomId: code });
        }
      }
      ui.inputRoom.value = '';
      await refreshState();
    });

    ui.btnSaveUrls.addEventListener('click', async () => {
      const relayUrl = ui.inputRelayUrl.value.trim() || 'ws://localhost:8787';
      const pwaUrl = ui.inputPwaUrl.value.trim() || 'http://localhost:3000';
      state.relayUrl = relayUrl;
      state.pwaUrl = pwaUrl;
      if (extApi?.storage?.local) {
        extApi.storage.local.set({ relayUrl, pwaUrl });
      }
      await sendToYtmTab({ type: 'UPDATE_URLS', relayUrl, pwaUrl });
      await refreshState();
    });

    ui.ctrlPrev.addEventListener('click', async () => {
      await sendToYtmTab({ type: 'REMOTE_COMMAND', payload: { action: 'PREV' } });
      setTimeout(refreshState, 300);
    });

    ui.ctrlToggle.addEventListener('click', async () => {
      const action = state.track && !state.track.isPaused ? 'PAUSE' : 'PLAY';
      await sendToYtmTab({ type: 'REMOTE_COMMAND', payload: { action } });
      setTimeout(refreshState, 250);
    });

    ui.ctrlNext.addEventListener('click', async () => {
      await sendToYtmTab({ type: 'REMOTE_COMMAND', payload: { action: 'NEXT' } });
      setTimeout(refreshState, 300);
    });
  }

  async function init() {
    await loadStoredConfig();
    bindEvents();
    await refreshState();
    setInterval(refreshState, 2000);
  }

  init();
})();
