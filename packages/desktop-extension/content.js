/**
 * YTM-Connect — Desktop Extension Content Script (Module B)
 *
 * Supports ZERO-INSTALL Serverless Mode (no `npm start` required!):
 *  - BroadcastChannel ('ytm_connect_bus') for instant browser tab/window sync
 *  - Extension Service Worker MQTT-over-WSS Bridge (wss://broker.emqx.io:8084/mqtt) for cross-device cloud sync
 *  - Optional Local Relay WebSocket (ws://localhost:8787) when `npm run dev` is running
 */
(function () {
  if (window.__YTM_CONNECT_CONTENT_INITIALIZED__) return;
  window.__YTM_CONNECT_CONTENT_INITIALIZED__ = true;

  const rawExtApi =
    typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : null;
  const extApi = rawExtApi && rawExtApi.runtime && rawExtApi.runtime.id ? rawExtApi : null;
  const PENDING_HANDOFF_KEY = 'ytm_connect_pending_handoff';
  const CLOUD_MQTT_URL = 'wss://broker.emqx.io:8084/mqtt';

  const state = {
    roomId: '',
    pairToken: '',
    deviceId: '',
    deviceName: detectDesktopName(),
    deviceType: 'DESKTOP',
    relayUrl: 'ws://localhost:8787',
    pwaUrl: 'https://raw.githack.com/zhenxxx7/ytm-connect/main/docs/index.html',
    connected: false,
    activeDeviceId: null,
    devices: [],
    popoverOpen: false,
    pageMeta: {
      videoId: '',
      listId: '',
      title: '',
      artist: ''
    },
    remoteTrack: {
      videoId: '',
      listId: '',
      title: '',
      artist: '',
      artwork: '',
      currentTime: 0,
      duration: 0,
      isPaused: true,
      volume: 100
    }
  };

  let ws = null;
  let mqttWs = null;
  let bgPort = null;
  let broadcastChan = null;
  let stateBroadcastInterval = null;
  let observedVideo = null;
  let lastSentSignature = '';
  let lastSentTime = 0;
  const seenMsgIds = new Set();

  function detectDesktopName() {
    const ua = navigator.userAgent || '';
    if (ua.includes('Edg/')) return 'Desktop Edge';
    if (ua.includes('Firefox/')) return 'Desktop Firefox';
    if (ua.includes('Chrome/')) return 'Desktop Chrome';
    return 'Desktop Browser';
  }

  function randomAlphanumeric(len) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    const randomValues = new Uint32Array(len);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < len; i++) {
      out += chars[randomValues[i] % chars.length];
    }
    return out;
  }

  function h(tag, attrs = {}, children = []) {
    const elem = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null) continue;
      if (k === 'className') elem.className = v;
      else if (k === 'textContent') elem.textContent = v;
      else if (k === 'onclick' && typeof v === 'function') elem.addEventListener('click', v);
      else elem.setAttribute(k, String(v));
    }
    for (const child of children) {
      if (!child) continue;
      if (typeof child === 'string') elem.appendChild(document.createTextNode(child));
      else elem.appendChild(child);
    }
    return elem;
  }

  function createMonitorSvg(size = 16) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', '2');
    rect.setAttribute('y', '3');
    rect.setAttribute('width', '20');
    rect.setAttribute('height', '14');
    rect.setAttribute('rx', '2');
    rect.setAttribute('ry', '2');

    const l1 = document.createElementNS(ns, 'line');
    l1.setAttribute('x1', '8');
    l1.setAttribute('y1', '21');
    l1.setAttribute('x2', '16');
    l1.setAttribute('y2', '21');

    const l2 = document.createElementNS(ns, 'line');
    l2.setAttribute('x1', '12');
    l2.setAttribute('y1', '17');
    l2.setAttribute('x2', '12');
    l2.setAttribute('y2', '21');

    svg.appendChild(rect);
    svg.appendChild(l1);
    svg.appendChild(l2);
    return svg;
  }

  function createPhoneSvg(size = 18) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', '5');
    rect.setAttribute('y', '2');
    rect.setAttribute('width', '14');
    rect.setAttribute('height', '20');
    rect.setAttribute('rx', '2');
    rect.setAttribute('ry', '2');

    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', '12');
    line.setAttribute('y1', '18');
    line.setAttribute('x2', '12.01');
    line.setAttribute('y2', '18');

    svg.appendChild(rect);
    svg.appendChild(line);
    return svg;
  }

  async function loadStorageConfig() {
    const defaults = {
      roomId: randomAlphanumeric(6),
      pairToken: randomAlphanumeric(8),
      deviceId: `desktop-${randomAlphanumeric(8).toLowerCase()}`,
      deviceName: detectDesktopName(),
      relayUrl: 'ws://localhost:8787',
      pwaUrl: 'https://raw.githack.com/zhenxxx7/ytm-connect/main/docs/index.html'
    };

    try {
      if (extApi && extApi.storage && extApi.storage.local) {
        const stored = await new Promise((resolve) => {
          extApi.storage.local.get(Object.keys(defaults), (items) => resolve(items || {}));
        });
        const merged = {
          roomId: (stored.roomId || defaults.roomId).toUpperCase(),
          pairToken: stored.pairToken || defaults.pairToken,
          deviceId: stored.deviceId || defaults.deviceId,
          deviceName: stored.deviceName || defaults.deviceName,
          relayUrl: stored.relayUrl || defaults.relayUrl,
          pwaUrl: stored.pwaUrl || defaults.pwaUrl
        };
        extApi.storage.local.set(merged);
        try {
          localStorage.setItem('ytm_connect_config', JSON.stringify(merged));
        } catch {}
        Object.assign(state, merged);
        return;
      }
    } catch {}

    try {
      const raw = localStorage.getItem('ytm_connect_config');
      const parsed = raw ? JSON.parse(raw) : {};
      const merged = {
        roomId: (parsed.roomId || defaults.roomId).toUpperCase(),
        pairToken: parsed.pairToken || defaults.pairToken,
        deviceId: parsed.deviceId || defaults.deviceId,
        deviceName: parsed.deviceName || defaults.deviceName,
        relayUrl: parsed.relayUrl || defaults.relayUrl,
        pwaUrl: parsed.pwaUrl || defaults.pwaUrl
      };
      localStorage.setItem('ytm_connect_config', JSON.stringify(merged));
      Object.assign(state, merged);
    } catch {
      Object.assign(state, defaults);
    }
  }

  async function saveStorageConfig(partial) {
    Object.assign(state, partial);
    try {
      if (extApi && extApi.storage && extApi.storage.local) {
        extApi.storage.local.set(partial);
      }
      const existing = JSON.parse(localStorage.getItem('ytm_connect_config') || '{}');
      localStorage.setItem('ytm_connect_config', JSON.stringify({ ...existing, ...partial }));
    } catch {}
  }

  function injectPageBridge() {
    try {
      if (extApi && extApi.runtime && extApi.runtime.getURL) {
        const script = document.createElement('script');
        script.src = extApi.runtime.getURL('page-bridge.js');
        script.async = false;
        (document.head || document.documentElement).appendChild(script);
        script.onload = () => script.remove();
      }
    } catch {}

    window.addEventListener('ytm-connect:page-meta', (event) => {
      const detail = event.detail || {};
      if (detail.videoId) state.pageMeta.videoId = detail.videoId;
      if (detail.listId) state.pageMeta.listId = detail.listId;
      if (detail.title) state.pageMeta.title = detail.title;
      if (detail.artist) state.pageMeta.artist = detail.artist;
    });
  }

  function sendPageCommand(action, payload = {}) {
    window.dispatchEvent(
      new CustomEvent('ytm-connect:page-command', {
        detail: { action, payload }
      })
    );
  }

  function readLocalPlayerState() {
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    const playerBar = document.querySelector('ytmusic-player-bar');
    const urlParams = new URLSearchParams(window.location.search);

    let videoId = urlParams.get('v') || state.pageMeta.videoId || '';
    let listId = urlParams.get('list') || state.pageMeta.listId || '';

    if (!videoId) {
      const titleLink = document.querySelector('a.ytp-title-link[href*="v="]');
      if (titleLink && titleLink.href) {
        try {
          const u = new URL(titleLink.href, window.location.origin);
          videoId = u.searchParams.get('v') || videoId;
          listId = u.searchParams.get('list') || listId;
        } catch {}
      }
    }

    let title = '';
    let artist = '';
    let artwork = '';

    if (playerBar) {
      const titleEl =
        playerBar.querySelector('.content-info-wrapper .title') ||
        playerBar.querySelector('yt-formatted-string.title');
      const bylineEl =
        playerBar.querySelector('.content-info-wrapper .byline') ||
        playerBar.querySelector('.subtitle yt-formatted-string');
      const imgEl =
        playerBar.querySelector('.middle-controls img.image') ||
        playerBar.querySelector('img.yt-img-shadow');

      if (titleEl && titleEl.textContent) title = titleEl.textContent.trim();
      if (bylineEl && bylineEl.textContent) {
        artist = bylineEl.textContent.trim().split('•')[0].trim();
      }
      if (imgEl && imgEl.src) artwork = imgEl.src;
    }

    if (navigator.mediaSession && navigator.mediaSession.metadata) {
      const meta = navigator.mediaSession.metadata;
      if (!title && meta.title) title = meta.title;
      if (!artist && meta.artist) artist = meta.artist;
      if (!artwork && Array.isArray(meta.artwork) && meta.artwork.length > 0) {
        artwork = meta.artwork[meta.artwork.length - 1].src || '';
      }
    }

    if (!title && state.pageMeta.title) title = state.pageMeta.title;
    if (!artist && state.pageMeta.artist) artist = state.pageMeta.artist;

    if (!videoId && artwork) {
      const match = artwork.match(/\/vi(?:_webp)?\/([a-zA-Z0-9_-]{11})\//);
      if (match) videoId = match[1];
    }

    const currentTime = video ? Number(video.currentTime || 0) : 0;
    const duration =
      video && Number.isFinite(video.duration) && video.duration > 0
        ? Number(video.duration)
        : readDurationFromDom(playerBar);
    const isPaused = video ? Boolean(video.paused) : true;
    const volume = video ? Math.round((video.muted ? 0 : video.volume) * 100) : 100;

    return {
      videoId,
      listId,
      playlistId: listId,
      title: title || 'YouTube Music',
      artist: artist || 'Ready to play',
      albumArtUrl: artwork,
      artwork,
      currentTime: Math.round(currentTime * 100) / 100,
      duration: Math.round(duration * 100) / 100,
      isPaused,
      volume
    };
  }

  function readDurationFromDom(playerBar) {
    if (!playerBar) return 0;
    const timeInfo = playerBar.querySelector('.time-info');
    if (!timeInfo || !timeInfo.textContent) return 0;
    const parts = timeInfo.textContent.split('/');
    if (parts.length < 2) return 0;
    return parseTimeText(parts[1].trim());
  }

  function parseTimeText(str) {
    const segs = str.split(':').map((n) => parseInt(n, 10));
    if (segs.some(Number.isNaN)) return 0;
    if (segs.length === 2) return segs[0] * 60 + segs[1];
    if (segs.length === 3) return segs[0] * 3600 + segs[1] * 60 + segs[2];
    return 0;
  }

  function isThisDeviceActive() {
    if (!state.activeDeviceId) return true;
    return state.activeDeviceId === state.deviceId;
  }

  function ensureSelfInDevices() {
    if (!state.activeDeviceId) state.activeDeviceId = state.deviceId;
    const hasSelf = state.devices.some((d) => d.deviceId === state.deviceId);
    if (!hasSelf) {
      state.devices.unshift({
        deviceId: state.deviceId,
        deviceName: state.deviceName,
        deviceType: 'DESKTOP',
        isActivePlayer: state.activeDeviceId === state.deviceId
      });
    }
    state.devices.forEach((d) => {
      d.isActivePlayer = d.deviceId === state.activeDeviceId;
    });
  }

  /**
   * Serverless MQTT helpers (for direct fallback when not using bgPort)
   */
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

  function sendWsEvent(event, payload = {}, targetId = 'ALL') {
    const msgId = `${state.deviceId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    seenMsgIds.add(msgId);
    const serialized = JSON.stringify({
      msgId,
      event,
      roomId: state.roomId,
      senderId: state.deviceId,
      targetId,
      payload
    });

    // 1. Same-browser BroadcastChannel
    if (broadcastChan) {
      try {
        broadcastChan.postMessage(serialized);
      } catch {}
    }

    // 2. Extension Background Service Worker Bridge (Cloud MQTT + Local WS)
    if (bgPort) {
      try {
        bgPort.postMessage({ type: 'WS_SEND', data: serialized });
      } catch {}
    }

    // 3. Direct MQTT-over-WSS if connected
    if (mqttWs && mqttWs.readyState === WebSocket.OPEN) {
      try {
        mqttWs.send(mqttMakePublish(`ytm-connect/v1/room/${state.roomId}`, serialized));
      } catch {}
    }

    // 4. Direct Local WS if connected
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(serialized);
      } catch {}
    }

    return true;
  }

  function emitStateUpdate(force = false) {
    if (!isThisDeviceActive() && !force) return;

    const current = readLocalPlayerState();
    const sig = `${current.videoId}|${current.listId}|${current.title}|${current.isPaused}|${current.volume}`;
    const now = Date.now();

    if (!force && sig === lastSentSignature && current.isPaused && now - lastSentTime < 5000) {
      return;
    }

    lastSentSignature = sig;
    lastSentTime = now;
    sendWsEvent('STATE_UPDATE', current, 'ALL');
  }

  function executePlayerCommand(payload = {}) {
    const action = String(payload.action || '').toUpperCase();
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    const playPauseBtn =
      document.querySelector('#play-pause-button') ||
      document.querySelector('ytmusic-player-bar #play-pause-button');
    const nextBtn =
      document.querySelector('ytmusic-player-bar .next-button') ||
      document.querySelector('.next-button');
    const prevBtn =
      document.querySelector('ytmusic-player-bar .previous-button') ||
      document.querySelector('.previous-button');

    switch (action) {
      case 'PLAY': {
        if (video && video.paused) {
          video.play().catch(() => {
            if (playPauseBtn) playPauseBtn.click();
          });
        } else if (!video && playPauseBtn) {
          playPauseBtn.click();
        }
        sendPageCommand('PLAY');
        setTimeout(() => emitStateUpdate(true), 120);
        break;
      }

      case 'PAUSE': {
        if (video && !video.paused) {
          video.pause();
        } else if (!video && playPauseBtn) {
          playPauseBtn.click();
        }
        sendPageCommand('PAUSE');
        setTimeout(() => emitStateUpdate(true), 120);
        break;
      }

      case 'TOGGLE': {
        if (video) {
          if (video.paused) video.play().catch(() => playPauseBtn && playPauseBtn.click());
          else video.pause();
        } else if (playPauseBtn) {
          playPauseBtn.click();
        }
        setTimeout(() => emitStateUpdate(true), 120);
        break;
      }

      case 'NEXT': {
        if (nextBtn) nextBtn.click();
        else sendPageCommand('NEXT');
        setTimeout(() => emitStateUpdate(true), 350);
        break;
      }

      case 'PREV': {
        if (prevBtn) prevBtn.click();
        else sendPageCommand('PREV');
        setTimeout(() => emitStateUpdate(true), 350);
        break;
      }

      case 'SEEK': {
        const targetTime = Number(payload.value ?? payload.time ?? 0);
        if (Number.isFinite(targetTime)) {
          if (video) video.currentTime = Math.max(0, targetTime);
          sendPageCommand('SEEK', { time: targetTime });
        }
        setTimeout(() => emitStateUpdate(true), 120);
        break;
      }

      case 'VOLUME': {
        const rawVolume = Number(payload.value ?? payload.volume ?? 100);
        const clamped = Math.max(0, Math.min(100, rawVolume));
        if (video) {
          video.muted = clamped === 0;
          video.volume = clamped / 100;
        }
        const slider = document.querySelector('ytmusic-player-bar #volume-slider');
        if (slider) {
          slider.value = clamped;
          slider.dispatchEvent(new Event('change', { bubbles: true }));
        }
        sendPageCommand('VOLUME', { volume: clamped });
        setTimeout(() => emitStateUpdate(true), 120);
        break;
      }

      case 'LOAD_AND_PLAY': {
        const data = typeof payload.value === 'object' && payload.value ? payload.value : payload;
        loadAndPlayTrack({
          videoId: data.videoId,
          listId: data.listId || data.playlistId || '',
          startSeconds: Number(data.startSeconds ?? data.currentTime ?? 0),
          autoPlay: data.autoPlay ?? true
        });
        break;
      }
    }
  }

  function loadAndPlayTrack({ videoId, listId = '', startSeconds = 0, autoPlay = true }) {
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    const current = readLocalPlayerState();

    if (video && videoId && current.videoId === videoId) {
      video.currentTime = Math.max(0, Number(startSeconds) || 0);
      if (autoPlay) {
        video.play().catch(() => {
          const playPauseBtn = document.querySelector('#play-pause-button');
          if (playPauseBtn) playPauseBtn.click();
        });
      }
      setTimeout(() => emitStateUpdate(true), 250);
      return;
    }

    if (videoId) {
      let resolved = false;
      const onResult = (e) => {
        if (resolved) return;
        resolved = true;
        window.removeEventListener('ytm-connect:load-result', onResult);
        const detail = e.detail || {};
        if (detail.handled) {
          setTimeout(() => {
            const v = document.querySelector('video');
            if (v) {
              if (Math.abs(v.currentTime - startSeconds) > 2) {
                v.currentTime = Math.max(0, Number(startSeconds) || 0);
              }
              if (autoPlay && v.paused) v.play().catch(() => {});
            }
            emitStateUpdate(true);
          }, 500);
        } else {
          navigateWithPendingHandoff({ videoId, listId, startSeconds, autoPlay });
        }
      };

      window.addEventListener('ytm-connect:load-result', onResult);
      sendPageCommand('LOAD_AND_PLAY', { videoId, listId, startSeconds, autoPlay });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener('ytm-connect:load-result', onResult);
          navigateWithPendingHandoff({ videoId, listId, startSeconds, autoPlay });
        }
      }, 600);
    } else if (video && autoPlay) {
      if (startSeconds > 0) video.currentTime = startSeconds;
      video.play().catch(() => {});
    }
  }

  function navigateWithPendingHandoff({ videoId, listId, startSeconds, autoPlay }) {
    if (!videoId) return;
    try {
      sessionStorage.setItem(
        PENDING_HANDOFF_KEY,
        JSON.stringify({
          videoId,
          listId,
          startSeconds: Number(startSeconds) || 0,
          autoPlay: Boolean(autoPlay),
          ts: Date.now()
        })
      );
    } catch {}

    const params = new URLSearchParams();
    params.set('v', videoId);
    if (listId) params.set('list', listId);
    if (startSeconds > 0) params.set('t', `${Math.floor(startSeconds)}s`);
    window.location.href = `https://music.youtube.com/watch?${params.toString()}`;
  }

  function checkPendingHandoffOnLoad() {
    try {
      const raw = sessionStorage.getItem(PENDING_HANDOFF_KEY);
      if (!raw) return;
      sessionStorage.removeItem(PENDING_HANDOFF_KEY);
      const pending = JSON.parse(raw);
      if (!pending || Date.now() - pending.ts > 30000) return;

      let attempts = 0;
      const timer = setInterval(() => {
        attempts++;
        const video = document.querySelector('video');
        if (video && video.readyState >= 1) {
          clearInterval(timer);
          if (pending.startSeconds > 0) video.currentTime = pending.startSeconds;
          if (pending.autoPlay) video.play().catch(() => {});
          setTimeout(() => emitStateUpdate(true), 400);
        } else if (attempts > 25) {
          clearInterval(timer);
        }
      }, 300);
    } catch {}
  }

  function triggerHandoffTo(targetDeviceId) {
    if (!targetDeviceId) return;
    const fromDeviceId = state.activeDeviceId || state.deviceId;
    const localState = readLocalPlayerState();

    if (fromDeviceId === state.deviceId) {
      const video = document.querySelector('video');
      if (video && !video.paused) video.pause();
      sendPageCommand('PAUSE');
    }

    const sourceState =
      fromDeviceId === state.deviceId
        ? localState
        : {
            ...localState,
            ...state.remoteTrack,
            videoId: state.remoteTrack.videoId || localState.videoId
          };

    state.activeDeviceId = targetDeviceId;
    ensureSelfInDevices();
    renderOverlayUI();

    sendWsEvent('DEVICE_LIST_UPDATED', {
      devices: state.devices,
      activeDeviceId: state.activeDeviceId
    });

    sendWsEvent(
      'HANDOFF_PLAYBACK',
      {
        fromDeviceId,
        toDeviceId: targetDeviceId,
        videoId: sourceState.videoId,
        listId: sourceState.listId,
        title: sourceState.title,
        artist: sourceState.artist,
        artwork: sourceState.artwork,
        currentTime: sourceState.currentTime,
        duration: sourceState.duration,
        volume: sourceState.volume,
        autoPlay: true,
        confirmed: true
      },
      targetDeviceId
    );
  }

  function handleWsMessage(rawText) {
    let msg;
    try {
      msg = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.roomId && msg.roomId.toUpperCase() !== state.roomId.toUpperCase()) return;

    if (msg.msgId) {
      if (seenMsgIds.has(msg.msgId)) return;
      seenMsgIds.add(msg.msgId);
      if (seenMsgIds.size > 400) {
        const first = seenMsgIds.values().next().value;
        seenMsgIds.delete(first);
      }
    }

    const { event: eventType, payload = {} } = msg;

    switch (eventType) {
      case 'JOIN_ROOM': {
        // Serverless P2P Room Coordination: register joining Mobile/peer device and reply with device list + track state
        if (payload.deviceId && payload.deviceId !== state.deviceId) {
          ensureSelfInDevices();
          const existing = state.devices.find((d) => d.deviceId === payload.deviceId);
          if (!existing) {
            state.devices.push({
              deviceId: payload.deviceId,
              deviceName: payload.deviceName || 'Mobile Controller',
              deviceType: payload.deviceType || 'MOBILE',
              isActivePlayer: state.activeDeviceId === payload.deviceId
            });
          } else {
            existing.deviceName = payload.deviceName || existing.deviceName;
          }
          ensureSelfInDevices();
          renderOverlayUI();

          // Broadcast updated device list and current state to the joining device
          sendWsEvent('DEVICE_LIST_UPDATED', {
            devices: state.devices,
            activeDeviceId: state.activeDeviceId
          });
          setTimeout(() => emitStateUpdate(true), 100);
        }
        break;
      }

      case 'DEVICE_LIST_UPDATED': {
        if (Array.isArray(payload.devices) && payload.devices.length > 0) {
          state.devices = payload.devices;
        }
        if (payload.activeDeviceId) {
          state.activeDeviceId = payload.activeDeviceId;
        }
        ensureSelfInDevices();
        renderOverlayUI();
        break;
      }

      case 'STATE_UPDATE': {
        state.remoteTrack = {
          ...state.remoteTrack,
          ...payload
        };
        renderOverlayUI();
        break;
      }

      case 'COMMAND_ACTION': {
        executePlayerCommand(payload);
        break;
      }

      case 'HANDOFF_PLAYBACK': {
        if (
          (payload.phase === 'PAUSE_SOURCE' || !payload.confirmed) &&
          payload.fromDeviceId === state.deviceId
        ) {
          const video = document.querySelector('video');
          if (video && !video.paused) video.pause();
          sendPageCommand('PAUSE');

          const finalState = readLocalPlayerState();
          state.activeDeviceId = payload.toDeviceId;
          ensureSelfInDevices();
          renderOverlayUI();

          sendWsEvent('DEVICE_LIST_UPDATED', {
            devices: state.devices,
            activeDeviceId: state.activeDeviceId
          });

          sendWsEvent(
            'HANDOFF_PLAYBACK',
            {
              fromDeviceId: state.deviceId,
              toDeviceId: payload.toDeviceId,
              videoId: finalState.videoId || payload.videoId,
              listId: finalState.listId || payload.listId,
              title: finalState.title,
              artist: finalState.artist,
              artwork: finalState.artwork,
              currentTime: finalState.currentTime,
              duration: finalState.duration,
              volume: finalState.volume,
              autoPlay: payload.autoPlay ?? true,
              confirmed: true
            },
            payload.toDeviceId
          );
        } else if (payload.toDeviceId === state.deviceId) {
          state.activeDeviceId = state.deviceId;
          ensureSelfInDevices();
          renderOverlayUI();

          sendWsEvent('DEVICE_LIST_UPDATED', {
            devices: state.devices,
            activeDeviceId: state.deviceId
          });

          loadAndPlayTrack({
            videoId: payload.videoId,
            listId: payload.listId || '',
            startSeconds: Number(payload.currentTime || 0),
            autoPlay: payload.autoPlay ?? true
          });
        }
        break;
      }
    }
  }

  function announceJoin(claimActive = false) {
    ensureSelfInDevices();
    renderOverlayUI();
    sendWsEvent('JOIN_ROOM', {
      deviceId: state.deviceId,
      deviceName: state.deviceName,
      deviceType: 'DESKTOP',
      pairToken: state.pairToken,
      claimActive
    });
    setTimeout(() => {
      if (isThisDeviceActive()) emitStateUpdate(true);
    }, 200);
  }

  function connectWebSocket(claimActive = false) {
    ensureSelfInDevices();
    state.connected = true;
    renderOverlayUI();

    const url = new URL(state.relayUrl);
    url.searchParams.set('room', state.roomId);
    url.searchParams.set('token', state.pairToken);
    const fullWsUrl = url.toString();

    // 1. Same-browser BroadcastChannel (0ms, zero-install)
    try {
      if (broadcastChan) broadcastChan.close();
      broadcastChan = new BroadcastChannel('ytm_connect_bus');
      broadcastChan.onmessage = (e) => handleWsMessage(e.data);
      announceJoin(claimActive);
    } catch {}

    // 2. Extension Background Service Worker Bridge (Cloud MQTT + Local WS, bypasses YTM CSP)
    if (extApi && extApi.runtime && typeof extApi.runtime.connect === 'function') {
      try {
        if (bgPort) {
          try {
            bgPort.disconnect();
          } catch {}
        }
        bgPort = extApi.runtime.connect({ name: 'ytm-connect-ws-bridge' });
        bgPort.onMessage.addListener((m) => {
          if (!m) return;
          if (m.type === 'WS_OPEN') {
            state.connected = true;
            announceJoin(claimActive);
          } else if (m.type === 'WS_MESSAGE') {
            handleWsMessage(m.data);
          }
        });
        bgPort.onDisconnect.addListener(() => {
          bgPort = null;
        });
        bgPort.postMessage({
          type: 'WS_CONNECT',
          roomId: state.roomId,
          url: fullWsUrl
        });
        return;
      } catch {
        bgPort = null;
      }
    }

    // 3. Direct Cloud MQTT-over-WSS (when running outside extension background bridge)
    try {
      if (mqttWs) {
        try {
          mqttWs.onclose = null;
          mqttWs.close();
        } catch {}
      }
      mqttWs = new WebSocket(CLOUD_MQTT_URL, 'mqtt');
      mqttWs.binaryType = 'arraybuffer';
      mqttWs.onopen = () => {
        state.connected = true;
        mqttWs.send(mqttMakeConnect(`ytmc_d_${state.deviceId}_${Date.now() % 10000}`));
        setTimeout(() => {
          if (mqttWs && mqttWs.readyState === WebSocket.OPEN) {
            mqttWs.send(mqttMakeSubscribe(`ytm-connect/v1/room/${state.roomId}`));
            announceJoin(claimActive);
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
          handleWsMessage(text);
        }
      };
      mqttWs.onerror = () => {};
    } catch {}

    // 4. Optional Direct Local Relay WS (if `npm run dev` is running)
    try {
      if (ws) {
        try {
          ws.onclose = null;
          ws.close();
        } catch {}
      }
      ws = new WebSocket(fullWsUrl);
      ws.onopen = () => {
        state.connected = true;
        announceJoin(claimActive);
      };
      ws.onmessage = (e) => handleWsMessage(e.data);
      ws.onerror = () => {};
    } catch {}
  }

  function bindPlayerObservers() {
    const attachVideoListeners = () => {
      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
      if (video && video !== observedVideo) {
        observedVideo = video;
        const onImmediateChange = () => emitStateUpdate(true);
        video.addEventListener('play', onImmediateChange);
        video.addEventListener('pause', onImmediateChange);
        video.addEventListener('loadeddata', onImmediateChange);
        video.addEventListener('seeked', onImmediateChange);
        video.addEventListener('volumechange', onImmediateChange);
      }
      try {
        ensurePlayerBarButton();
      } catch {}
    };

    attachVideoListeners();

    const observer = new MutationObserver(() => {
      attachVideoListeners();
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    if (stateBroadcastInterval) clearInterval(stateBroadcastInterval);
    stateBroadcastInterval = setInterval(() => {
      if (!isThisDeviceActive()) return;
      const video = document.querySelector('video');
      if (video && !video.paused) {
        emitStateUpdate(true);
      }
    }, 2000);
  }

  let triggerBtn = null;
  let popoverEl = null;
  let remoteBannerEl = null;

  function ensurePlayerBarButton() {
    if (!document.body) return;
    if (!popoverEl) {
      createOverlayElements();
    }

    const rightControls =
      document.querySelector('ytmusic-player-bar .right-controls-buttons') ||
      document.querySelector('ytmusic-player-bar .right-controls');

    if (rightControls && triggerBtn && triggerBtn.parentElement !== rightControls) {
      rightControls.insertBefore(triggerBtn, rightControls.firstChild);
    } else if (!rightControls && triggerBtn && !triggerBtn.parentElement) {
      let anchor = document.querySelector('.ytmc-floating-anchor');
      if (!anchor) {
        anchor = h('div', { className: 'ytmc-floating-anchor' });
        document.body.appendChild(anchor);
      }
      anchor.appendChild(triggerBtn);
    }
  }

  function createOverlayElements() {
    triggerBtn = h('button', {
      className: 'ytmc-playerbar-btn',
      type: 'button',
      title: 'YTM-Connect — Devices Available',
      onclick: (e) => {
        e.stopPropagation();
        state.popoverOpen = !state.popoverOpen;
        renderOverlayUI();
      }
    });

    remoteBannerEl = h('div', { className: 'ytmc-remote-banner', hidden: 'true' });
    document.body.appendChild(remoteBannerEl);

    popoverEl = h('div', {
      className: 'ytmc-popover',
      hidden: 'true',
      onclick: (e) => e.stopPropagation()
    });
    document.body.appendChild(popoverEl);

    document.addEventListener('click', () => {
      if (state.popoverOpen) {
        state.popoverOpen = false;
        renderOverlayUI();
      }
    });

    renderOverlayUI();
  }

  function openMobileControllerWindow(e) {
    if (e) e.preventDefault();
    if (extApi && extApi.runtime && extApi.runtime.sendMessage) {
      extApi.runtime.sendMessage({
        type: 'OPEN_MOBILE_WINDOW',
        roomId: state.roomId,
        pairToken: state.pairToken
      });
      return;
    }
    const rawBase = state.pwaUrl.replace(/\/+$/, '');
    const sep = rawBase.endsWith('.html') ? '?' : '/?';
    const fallbackUrl = `${rawBase}${sep}room=${encodeURIComponent(
      state.roomId
    )}&token=${encodeURIComponent(state.pairToken)}`;
    window.open(fallbackUrl, 'ytmc_mobile', 'width=410,height=820');
  }

  function renderOverlayUI() {
    if (!triggerBtn || !popoverEl || !remoteBannerEl) return;

    ensureSelfInDevices();
    const peerCount = state.devices.length;
    const activeDevice = state.devices.find((d) => d.deviceId === state.activeDeviceId);
    const remoteActive = state.connected && activeDevice && activeDevice.deviceId !== state.deviceId;

    triggerBtn.className = [
      'ytmc-playerbar-btn',
      state.connected ? 'is-connected' : '',
      remoteActive ? 'is-remote-active' : ''
    ]
      .filter(Boolean)
      .join(' ');

    const labelText = remoteActive
      ? activeDevice.deviceName
      : peerCount > 1
      ? 'Devices Available'
      : 'Connect';

    const btnChildren = [createMonitorSvg(16), h('span', { textContent: labelText })];
    if (peerCount > 0) {
      btnChildren.push(h('span', { className: 'ytmc-badge-count', textContent: String(peerCount) }));
    }
    triggerBtn.replaceChildren(...btnChildren);

    if (remoteActive) {
      remoteBannerEl.hidden = false;
      remoteBannerEl.replaceChildren(
        h('span', {}, ['Listening on ', h('strong', { textContent: activeDevice.deviceName })]),
        h('button', {
          type: 'button',
          className: 'ytmc-remote-banner-btn',
          textContent: 'Listen on this Desktop',
          onclick: () => triggerHandoffTo(state.deviceId)
        })
      );
    } else {
      remoteBannerEl.hidden = true;
    }

    popoverEl.hidden = !state.popoverOpen;
    if (!state.popoverOpen) return;

    const headerEl = h('div', { className: 'ytmc-popover-header' }, [
      h('div', { className: 'ytmc-popover-title' }, [
        h('span', { className: `ytmc-status-dot ${state.connected ? 'online' : ''}` }),
        h('span', { textContent: 'Connect to a device' })
      ]),
      h('span', { className: 'ytmc-room-pill', textContent: `ROOM ${state.roomId}` })
    ]);

    const listEl = h('div', { className: 'ytmc-device-list' });
    for (const dev of state.devices) {
      const isSelf = dev.deviceId === state.deviceId;
      const isActive = dev.deviceId === state.activeDeviceId;
      const isMobile = dev.deviceType === 'MOBILE';

      const rightBadge = isActive
        ? h('div', { className: 'ytmc-eq', title: 'Active Player' }, [
            h('span'),
            h('span'),
            h('span')
          ])
        : h('span', {
            className: 'ytmc-transfer-tag',
            textContent: isSelf ? 'Listen Here' : 'Transfer'
          });

      const itemEl = h(
        'div',
        {
          className: `ytmc-device-item ${isActive ? 'is-active' : ''}`,
          onclick: () => {
            if (dev.deviceId && dev.deviceId !== state.activeDeviceId) {
              triggerHandoffTo(dev.deviceId);
            }
          }
        },
        [
          h('div', { className: 'ytmc-device-left' }, [
            h('div', { className: 'ytmc-device-icon' }, [
              isMobile ? createPhoneSvg(18) : createMonitorSvg(18)
            ]),
            h('div', { className: 'ytmc-device-meta' }, [
              h('div', {
                className: 'ytmc-device-name',
                textContent: `${dev.deviceName}${isSelf ? ' (This Desktop)' : ''}`
              }),
              h('div', {
                className: 'ytmc-device-sub',
                textContent: isActive
                  ? 'Currently Active Player'
                  : isMobile
                  ? 'Mobile PWA • Tap to handoff'
                  : 'Desktop Browser • Tap to handoff'
              })
            ])
          ]),
          rightBadge
        ]
      );
      listEl.appendChild(itemEl);
    }

    const footerEl = h('div', { className: 'ytmc-popover-footer' }, [
      h('span', { textContent: 'Zero-Install Serverless Ready' }),
      h('a', {
        className: 'ytmc-pair-link',
        href: '#',
        textContent: '📱 Launch Mobile Controller ↗',
        onclick: openMobileControllerWindow
      })
    ]);

    popoverEl.replaceChildren(headerEl, listEl, footerEl);
  }

  if (extApi && extApi.runtime && extApi.runtime.onMessage) {
    extApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== 'object') return false;

      switch (message.type) {
        case 'GET_EXTENSION_STATE': {
          ensureSelfInDevices();
          sendResponse({
            ok: true,
            roomId: state.roomId,
            pairToken: state.pairToken,
            deviceId: state.deviceId,
            deviceName: state.deviceName,
            relayUrl: state.relayUrl,
            pwaUrl: state.pwaUrl,
            connected: state.connected,
            activeDeviceId: state.activeDeviceId,
            devices: state.devices,
            localPlayer: readLocalPlayerState(),
            remoteTrack: state.remoteTrack
          });
          return true;
        }

        case 'REGENERATE_ROOM': {
          const newRoomId = randomAlphanumeric(6);
          const newToken = randomAlphanumeric(8);
          state.devices = [];
          saveStorageConfig({ roomId: newRoomId, pairToken: newToken }).then(() => {
            connectWebSocket(true);
            sendResponse({ ok: true, roomId: newRoomId, pairToken: newToken });
          });
          return true;
        }

        case 'JOIN_CUSTOM_ROOM': {
          const customRoom = String(message.roomId || '')
            .trim()
            .toUpperCase()
            .slice(0, 12);
          const customToken = String(message.pairToken || state.pairToken).trim();
          if (customRoom) {
            state.devices = [];
            saveStorageConfig({ roomId: customRoom, pairToken: customToken }).then(() => {
              connectWebSocket();
              sendResponse({ ok: true, roomId: customRoom, pairToken: customToken });
            });
          } else {
            sendResponse({ ok: false });
          }
          return true;
        }

        case 'UPDATE_URLS': {
          const partial = {};
          if (message.relayUrl) partial.relayUrl = message.relayUrl.trim();
          if (message.pwaUrl) partial.pwaUrl = message.pwaUrl.trim();
          saveStorageConfig(partial).then(() => {
            connectWebSocket();
            sendResponse({ ok: true, ...partial });
          });
          return true;
        }

        case 'TRIGGER_HANDOFF': {
          triggerHandoffTo(message.targetDeviceId);
          sendResponse({ ok: true });
          return true;
        }

        case 'REMOTE_COMMAND': {
          if (isThisDeviceActive()) {
            executePlayerCommand(message.payload || {});
          } else {
            sendWsEvent('COMMAND_ACTION', message.payload || {}, state.activeDeviceId || 'ALL');
          }
          sendResponse({ ok: true });
          return true;
        }
      }
      return false;
    });
  }

  async function init() {
    await loadStorageConfig();
    injectPageBridge();
    bindPlayerObservers();
    connectWebSocket();
    checkPendingHandoffOnLoad();
  }

  init();
})();
