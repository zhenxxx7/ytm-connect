/**
 * YTM-Connect — Universal Mobile PWA & Extension Mobile Controller Bridge (Module C)
 *
 * Works in TWO modes automatically:
 *  1. ZERO-INSTALL SERVERLESS MODE (No `npm start` required!):
 *     Uses Cloud MQTT-over-WSS (wss://broker.emqx.io:8084/mqtt) + BroadcastChannel + Extension Runtime
 *  2. LOCAL RELAY MODE (When `npm run dev` is running):
 *     Also connects to ws://localhost:8787 / /__ytm_connect__/ws
 */
(function () {
  if (window.__YTM_CONNECT_MOBILE_BRIDGE__) return;
  window.__YTM_CONNECT_MOBILE_BRIDGE__ = true;

  const STORAGE_KEY = 'ytm_connect_mobile_config';
  const CLOUD_MQTT_URL = 'wss://broker.emqx.io:8084/mqtt';

  const DEFAULT_ARTWORK =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#ff0033"/>
            <stop offset="100%" stop-color="#12151e"/>
          </linearGradient>
        </defs>
        <rect width="120" height="120" rx="20" fill="url(#g)"/>
        <circle cx="60" cy="60" r="32" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.9"/>
        <polygon points="52,44 78,60 52,76" fill="#ffffff"/>
      </svg>`
    );

  const state = {
    roomId: '',
    pairToken: '',
    deviceId: '',
    deviceName: detectMobileDeviceName(),
    deviceType: 'MOBILE',
    connected: false,
    transportMode: 'Serverless Cloud',
    activeDeviceId: null,
    devices: [],
    sheetOpen: false,
    isScrubbing: false,
    track: {
      videoId: '',
      listId: '',
      title: 'Not Playing',
      artist: 'Waiting for Desktop YouTube Music...',
      artwork: DEFAULT_ARTWORK,
      currentTime: 0,
      duration: 0,
      isPaused: true,
      volume: 100
    }
  };

  let ws = null;
  let mqttWs = null;
  let broadcastChan = null;
  let localBroadcastTimer = null;
  let localSynthTimer = null;
  let observedVideo = null;
  let suppressLocalIntercept = false;
  const seenMsgIds = new Set();

  let ttPolicy = null;
  function setSafeHtml(el, htmlStr) {
    if (!el) return;
    try {
      let input = String(htmlStr || '');
      if (window.trustedTypes) {
        if (!ttPolicy && window.trustedTypes.createPolicy) {
          for (const name of ['ytm-connect', 'default', 'polymer-html-literal']) {
            try {
              ttPolicy = window.trustedTypes.createPolicy(name, { createHTML: (s) => s });
              break;
            } catch {}
          }
        }
        const policy = ttPolicy || window.trustedTypes.defaultPolicy;
        if (policy && typeof policy.createHTML === 'function') {
          input = policy.createHTML(input);
        }
      }
      const parsed = new DOMParser().parseFromString(input, 'text/html');
      if (parsed && parsed.body) {
        const nodes = Array.from(parsed.body.childNodes).map((n) => document.importNode(n, true));
        el.replaceChildren(...nodes);
      }
    } catch {}
  }

  function detectMobileDeviceName() {
    const ua = navigator.userAgent || '';
    if (/iPhone/i.test(ua)) return 'iPhone (Mobile PWA)';
    if (/iPad/i.test(ua)) return 'iPad (Mobile PWA)';
    if (/Android/i.test(ua)) return 'Android Phone (PWA)';
    return 'Mobile Controller PWA';
  }

  function randomCode(len) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < len; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  function loadAndSyncConfig() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      saved = {};
    }

    let desktopSaved = {};
    try {
      desktopSaved = JSON.parse(localStorage.getItem('ytm_connect_config') || '{}');
    } catch {}

    const rawSearch = window.__YTM_CONNECT_INITIAL_SEARCH__ || window.location.search;
    const params = new URLSearchParams(rawSearch);
    const urlRoom = (params.get('room') || '').trim().toUpperCase();
    const urlToken = (params.get('token') || '').trim();

    state.deviceId = saved.deviceId || `mobile-${randomCode(8).toLowerCase()}`;
    state.deviceName = saved.deviceName || detectMobileDeviceName();
    state.roomId = urlRoom || saved.roomId || desktopSaved.roomId || 'YTM123';
    state.pairToken = urlToken || saved.pairToken || desktopSaved.pairToken || '';

    saveConfig();
  }

  function saveConfig() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          roomId: state.roomId,
          pairToken: state.pairToken,
          deviceId: state.deviceId,
          deviceName: state.deviceName
        })
      );
    } catch {}
  }

  function isThisMobileActive() {
    return Boolean(state.activeDeviceId && state.activeDeviceId === state.deviceId);
  }

  function getActiveDeviceObject() {
    return state.devices.find((d) => d.deviceId === state.activeDeviceId) || null;
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('/__ytm_connect__/sw.js').catch(() => {});
    }
  }

  function getOrCreateLocalVideo() {
    let video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (!video) {
      video = document.createElement('video');
      video.id = 'ytmc-fallback-video';
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.style.cssText =
        'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;bottom:0;left:0;';
      document.body.appendChild(video);
    }
    return video;
  }

  function unlockMobileAudioInGesture() {
    try {
      const video = getOrCreateLocalVideo();
      video.muted = false;
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        setTimeout(() => ctx.close().catch(() => {}), 500);
      }
    } catch {}
  }

  function readMobileLocalState() {
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    const playerBar =
      document.querySelector('ytmusic-player-bar') || document.querySelector('ytm-custom-control');
    const params = new URLSearchParams(window.location.search);

    const videoId = params.get('v') || state.track.videoId || '';
    const listId = params.get('list') || state.track.listId || '';

    let title = state.track.title;
    let artist = state.track.artist;
    let artwork = state.track.artwork;

    if (playerBar) {
      const tEl = playerBar.querySelector('.title');
      const aEl = playerBar.querySelector('.byline') || playerBar.querySelector('.subtitle');
      const imgEl = playerBar.querySelector('img');
      if (tEl && tEl.textContent.trim()) title = tEl.textContent.trim();
      if (aEl && aEl.textContent.trim()) artist = aEl.textContent.trim().split('•')[0].trim();
      if (imgEl && imgEl.src) artwork = imgEl.src;
    }

    const hasRealVideoMedia = Boolean(
      video && video.src && Number.isFinite(video.duration) && video.duration > 0
    );

    const currentTime = hasRealVideoMedia
      ? Number(video.currentTime || 0)
      : Number(state.track.currentTime || 0);
    const duration = hasRealVideoMedia
      ? Number(video.duration || 0)
      : Number(state.track.duration || 210);
    const isPaused = hasRealVideoMedia ? Boolean(video.paused) : Boolean(state.track.isPaused);
    const volume = video ? Math.round((video.muted ? 0 : video.volume) * 100) : state.track.volume;

    return {
      videoId,
      listId,
      title: title || 'YouTube Music Track',
      artist: artist || 'Mobile PWA',
      artwork: artwork || DEFAULT_ARTWORK,
      currentTime: Math.round(currentTime * 100) / 100,
      duration: Math.round(duration * 100) / 100,
      isPaused,
      volume
    };
  }

  function executeLocalMobileAction(payload = {}) {
    const action = String(payload.action || '').toUpperCase();
    const video = getOrCreateLocalVideo();
    const hasSrc = Boolean(video && video.src);

    suppressLocalIntercept = true;
    try {
      switch (action) {
        case 'PLAY': {
          state.track.isPaused = false;
          if (hasSrc) video.play().catch(() => {});
          startLocalPlaybackClock();
          emitMobileStateUpdate(true);
          renderUI();
          break;
        }
        case 'PAUSE': {
          state.track.isPaused = true;
          if (hasSrc && !video.paused) video.pause();
          stopLocalPlaybackClock();
          emitMobileStateUpdate(true);
          renderUI();
          break;
        }
        case 'NEXT': {
          const nextBtn = document.querySelector('.next-button');
          if (nextBtn) nextBtn.click();
          state.track.currentTime = 0;
          emitMobileStateUpdate(true);
          renderUI();
          break;
        }
        case 'PREV': {
          const prevBtn = document.querySelector('.previous-button');
          if (prevBtn) prevBtn.click();
          state.track.currentTime = 0;
          emitMobileStateUpdate(true);
          renderUI();
          break;
        }
        case 'SEEK': {
          const t = Math.max(0, Number(payload.value ?? payload.time ?? 0));
          state.track.currentTime = t;
          if (hasSrc) video.currentTime = t;
          emitMobileStateUpdate(true);
          renderUI();
          break;
        }
        case 'VOLUME': {
          const vol = Math.max(0, Math.min(100, Number(payload.value ?? payload.volume ?? 100)));
          state.track.volume = vol;
          if (video) {
            video.muted = vol === 0;
            video.volume = vol / 100;
          }
          emitMobileStateUpdate(true);
          renderUI();
          break;
        }
        case 'LOAD_AND_PLAY': {
          const data = typeof payload.value === 'object' && payload.value ? payload.value : payload;
          loadAndPlayOnMobile({
            videoId: data.videoId,
            listId: data.listId || '',
            currentTime: Number(data.startSeconds ?? data.currentTime ?? 0),
            title: data.title,
            artist: data.artist,
            artwork: data.artwork,
            duration: data.duration,
            autoPlay: data.autoPlay ?? true
          });
          break;
        }
      }
    } finally {
      setTimeout(() => {
        suppressLocalIntercept = false;
      }, 150);
    }
  }

  function loadAndPlayOnMobile(handoffData = {}) {
    const videoId = handoffData.videoId || state.track.videoId || '';
    const listId = handoffData.listId ?? state.track.listId ?? '';
    const startSeconds = Number(handoffData.currentTime ?? handoffData.startSeconds ?? 0);
    const autoPlay = handoffData.autoPlay ?? true;

    state.track = {
      ...state.track,
      videoId,
      listId,
      title: handoffData.title || state.track.title || 'YouTube Music Track',
      artist: handoffData.artist || state.track.artist || 'Playing on this Phone',
      artwork:
        handoffData.artwork ||
        (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : state.track.artwork),
      currentTime: startSeconds,
      duration: Number(handoffData.duration || state.track.duration || 210),
      isPaused: !autoPlay
    };

    if (videoId && window.location.protocol.startsWith('http')) {
      try {
        const url = new URL(window.location.href);
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.startsWith('192.168.')) {
          url.pathname = '/watch';
        }
        url.searchParams.set('v', videoId);
        if (listId) url.searchParams.set('list', listId);
        url.searchParams.set('t', `${Math.floor(startSeconds)}s`);
        url.searchParams.set('room', state.roomId);
        if (state.pairToken) url.searchParams.set('token', state.pairToken);
        window.history.replaceState({}, '', url.toString());
      } catch {}
    }

    const moviePlayer = document.getElementById('movie_player');
    if (moviePlayer && typeof moviePlayer.loadVideoById === 'function' && videoId) {
      try {
        moviePlayer.loadVideoById({ videoId, startSeconds });
      } catch {}
    }

    const video = getOrCreateLocalVideo();
    if (video && video.src) {
      try {
        video.currentTime = startSeconds;
        if (autoPlay) video.play().catch(() => {});
      } catch {}
    }

    if (autoPlay) startLocalPlaybackClock();
    else stopLocalPlaybackClock();

    window.dispatchEvent(
      new CustomEvent('ytm-connect:mobile-handoff-active', {
        detail: { ...state.track, startSeconds, autoPlay }
      })
    );

    renderUI();
    emitMobileStateUpdate(true);
  }

  function startLocalPlaybackClock() {
    stopLocalPlaybackClock();
    localSynthTimer = setInterval(() => {
      if (!isThisMobileActive() || state.track.isPaused) return;
      const video = document.querySelector('video.html5-main-video');
      if (video && video.src && !video.paused && Number.isFinite(video.currentTime)) {
        state.track.currentTime = Number(video.currentTime);
        if (Number.isFinite(video.duration) && video.duration > 0) {
          state.track.duration = Number(video.duration);
        }
      } else {
        state.track.currentTime = Math.min(
          state.track.duration || 240,
          Number((state.track.currentTime + 0.5).toFixed(2))
        );
      }
      renderUI();
    }, 500);
  }

  function stopLocalPlaybackClock() {
    if (localSynthTimer) {
      clearInterval(localSynthTimer);
      localSynthTimer = null;
    }
  }

  function dispatchUserControl(action, value) {
    const normalized = String(action).toUpperCase();

    if (isThisMobileActive()) {
      executeLocalMobileAction({ action: normalized, value });
      return;
    }

    if (normalized === 'PLAY') state.track.isPaused = false;
    if (normalized === 'PAUSE') state.track.isPaused = true;
    if (normalized === 'SEEK' && typeof value === 'number') state.track.currentTime = value;
    if (normalized === 'VOLUME' && typeof value === 'number') state.track.volume = value;
    if (normalized === 'LOAD_AND_PLAY' && value && typeof value === 'object') {
      state.track = {
        ...state.track,
        videoId: value.videoId || state.track.videoId,
        listId: value.listId || '',
        title: value.title || state.track.title,
        artist: value.artist || state.track.artist,
        artwork:
          value.artwork ||
          (value.videoId ? `https://i.ytimg.com/vi/${value.videoId}/hqdefault.jpg` : state.track.artwork),
        currentTime: Number(value.startSeconds ?? value.currentTime ?? 0),
        duration: Number(value.duration || state.track.duration || 210),
        isPaused: false
      };
    }
    renderUI();

    sendWsEvent(
      'COMMAND_ACTION',
      {
        action: normalized,
        value
      },
      state.activeDeviceId || 'ALL'
    );
  }

  function initiateHandoff(targetDeviceId) {
    if (!targetDeviceId) return;

    if (targetDeviceId === state.deviceId) {
      unlockMobileAudioInGesture();
    }

    const fromDeviceId = state.activeDeviceId || state.deviceId;

    if (fromDeviceId === state.deviceId && targetDeviceId !== state.deviceId) {
      state.track.isPaused = true;
      stopLocalPlaybackClock();
      const video = document.querySelector('video');
      if (video && !video.paused) video.pause();
    }

    const currentSnapshot = isThisMobileActive() ? readMobileLocalState() : state.track;

    sendWsEvent(
      'HANDOFF_PLAYBACK',
      {
        fromDeviceId,
        toDeviceId: targetDeviceId,
        videoId: currentSnapshot.videoId || '',
        listId: currentSnapshot.listId || '',
        title: currentSnapshot.title,
        artist: currentSnapshot.artist,
        artwork: currentSnapshot.artwork,
        currentTime: Number(currentSnapshot.currentTime || 0),
        duration: Number(currentSnapshot.duration || 0),
        volume: Number(currentSnapshot.volume ?? 100),
        autoPlay: true,
        confirmed: fromDeviceId === state.deviceId
      },
      fromDeviceId === state.deviceId ? targetDeviceId : fromDeviceId
    );
  }

  function bindRemoteModeDomInterceptors() {
    document.addEventListener(
      'click',
      (e) => {
        if (isThisMobileActive()) return;
        const target = e.target && e.target.closest ? e.target : null;
        if (!target) return;

        const playPauseBtn = target.closest('#play-pause-button, .play-pause-button');
        if (playPauseBtn) {
          e.preventDefault();
          e.stopPropagation();
          dispatchUserControl(state.track.isPaused ? 'PLAY' : 'PAUSE');
          return;
        }

        const nextBtn = target.closest('.next-button');
        if (nextBtn) {
          e.preventDefault();
          e.stopPropagation();
          dispatchUserControl('NEXT');
          return;
        }

        const prevBtn = target.closest('.previous-button');
        if (prevBtn) {
          e.preventDefault();
          e.stopPropagation();
          dispatchUserControl('PREV');
        }
      },
      true
    );
  }

  /**
   * ============================================================================
   * Serverless Multi-Transport Engine:
   *  1. BroadcastChannel ('ytm_connect_bus') for instant same-browser tabs
   *  2. Cloud MQTT-over-WSS (wss://broker.emqx.io:8084/mqtt) for cross-device zero-install
   *  3. Local Relay WebSocket (ws://localhost:8787) if `npm run dev` is running
   * ============================================================================
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

  function getMqttTopic() {
    return `ytm-connect/v1/room/${state.roomId}`;
  }

  function sendWsEvent(event, payload = {}, targetId = 'ALL') {
    const msgId = `${state.deviceId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    seenMsgIds.add(msgId);
    const envelope = {
      msgId,
      event,
      roomId: state.roomId,
      senderId: state.deviceId,
      targetId,
      payload
    };
    const raw = JSON.stringify(envelope);

    // 1. Send via BroadcastChannel (same-browser zero-server)
    if (broadcastChan) {
      try {
        broadcastChan.postMessage(raw);
      } catch {}
    }

    // 2. Send via Serverless Cloud MQTT-over-WSS
    if (mqttWs && mqttWs.readyState === WebSocket.OPEN) {
      try {
        mqttWs.send(mqttMakePublish(getMqttTopic(), raw));
      } catch {}
    }

    // 3. Send via Local Relay Server WebSocket if connected
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(raw);
      } catch {}
    }

    return true;
  }

  function emitMobileStateUpdate(force = false) {
    if (!state.connected) return;
    if (!isThisMobileActive() && !force) return;
    const snapshot = readMobileLocalState();
    sendWsEvent('STATE_UPDATE', snapshot, 'ALL');
  }

  function ensureSelfInDevices() {
    const hasSelf = state.devices.some((d) => d.deviceId === state.deviceId);
    if (!hasSelf) {
      state.devices.push({
        deviceId: state.deviceId,
        deviceName: state.deviceName,
        deviceType: 'MOBILE',
        isActivePlayer: state.activeDeviceId === state.deviceId
      });
    }
  }

  function handleIncomingMessage(rawText) {
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

    const { event: eventType, senderId, payload = {} } = msg;

    switch (eventType) {
      case 'JOIN_ROOM': {
        // Serverless P2P coordination: if another device joins, add it to our device list
        if (payload.deviceId && payload.deviceId !== state.deviceId) {
          const exists = state.devices.find((d) => d.deviceId === payload.deviceId);
          if (!exists) {
            state.devices.push({
              deviceId: payload.deviceId,
              deviceName: payload.deviceName || 'Desktop Browser',
              deviceType: payload.deviceType || 'DESKTOP',
              isActivePlayer: false
            });
          }
          if (!state.activeDeviceId) {
            state.activeDeviceId = payload.deviceType === 'DESKTOP' ? payload.deviceId : state.deviceId;
          }
          ensureSelfInDevices();
          renderUI();
        }
        break;
      }

      case 'DEVICE_LIST_UPDATED': {
        state.devices = Array.isArray(payload.devices) ? payload.devices : [];
        state.activeDeviceId = payload.activeDeviceId || state.activeDeviceId;
        ensureSelfInDevices();
        if (!isThisMobileActive()) {
          stopLocalPlaybackClock();
        }
        renderUI();
        break;
      }

      case 'STATE_UPDATE': {
        if (senderId && senderId !== state.deviceId) {
          if (!state.devices.some((d) => d.deviceId === senderId)) {
            state.devices.push({
              deviceId: senderId,
              deviceName: 'Desktop Chrome',
              deviceType: 'DESKTOP',
              isActivePlayer: true
            });
            if (!state.activeDeviceId) state.activeDeviceId = senderId;
            ensureSelfInDevices();
          }
        }
        if (!isThisMobileActive()) {
          state.track = {
            ...state.track,
            ...payload,
            artwork:
              payload.artwork ||
              payload.albumArtUrl ||
              (payload.videoId
                ? `https://i.ytimg.com/vi/${payload.videoId}/hqdefault.jpg`
                : state.track.artwork || DEFAULT_ARTWORK)
          };
          renderUI();
        }
        break;
      }

      case 'COMMAND_ACTION': {
        if (isThisMobileActive()) {
          executeLocalMobileAction(payload);
        }
        break;
      }

      case 'HANDOFF_PLAYBACK': {
        if (payload.phase === 'PAUSE_SOURCE' && payload.fromDeviceId === state.deviceId) {
          state.track.isPaused = true;
          stopLocalPlaybackClock();
          const video = document.querySelector('video');
          if (video && !video.paused) video.pause();

          const finalState = readMobileLocalState();
          state.activeDeviceId = payload.toDeviceId;
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
          renderUI();
        } else if (payload.toDeviceId === state.deviceId && payload.confirmed) {
          state.activeDeviceId = state.deviceId;
          state.devices.forEach((d) => {
            d.isActivePlayer = d.deviceId === state.deviceId;
          });
          loadAndPlayOnMobile(payload);
        } else if (payload.confirmed && payload.toDeviceId) {
          state.activeDeviceId = payload.toDeviceId;
          stopLocalPlaybackClock();
          renderUI();
        }
        break;
      }
    }
  }

  function announceJoinRoom() {
    ensureSelfInDevices();
    sendWsEvent('JOIN_ROOM', {
      deviceId: state.deviceId,
      deviceName: state.deviceName,
      deviceType: 'MOBILE',
      pairToken: state.pairToken
    });
  }

  function connectAllTransports() {
    // 1. Same-browser BroadcastChannel (instant, zero-install)
    try {
      if (broadcastChan) broadcastChan.close();
      broadcastChan = new BroadcastChannel('ytm_connect_bus');
      broadcastChan.onmessage = (e) => handleIncomingMessage(e.data);
      state.connected = true;
      renderUI();
      announceJoinRoom();
    } catch {}

    // 2. Serverless Cloud MQTT-over-WSS (works across devices with zero npm start)
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
        renderUI();
        mqttWs.send(mqttMakeConnect(`ytmc_m_${state.deviceId}_${Date.now() % 10000}`));
        setTimeout(() => {
          if (mqttWs && mqttWs.readyState === WebSocket.OPEN) {
            mqttWs.send(mqttMakeSubscribe(getMqttTopic()));
            announceJoinRoom();
          }
        }, 180);
      };
      mqttWs.onmessage = (event) => {
        const u = new Uint8Array(event.data);
        if ((u[0] & 0xf0) === 0x30) {
          let idx = 1;
          while (idx < u.length && u[idx++] & 0x80) {}
          const tLen = (u[idx] << 8) | u[idx + 1];
          const payloadBytes = u.subarray(idx + 2 + tLen);
          const text = new TextDecoder().decode(payloadBytes);
          handleIncomingMessage(text);
        }
      };
    } catch {}

    // 3. Optional Local Relay Server (ws://localhost:8787) if running on local host
    const isLocalHost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('192.168.') ||
      window.location.hostname.startsWith('10.');
    if (isLocalHost) {
      try {
        if (ws) {
          try {
            ws.onclose = null;
            ws.close();
          } catch {}
        }
        const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${
          window.location.host
        }/__ytm_connect__/ws?room=${encodeURIComponent(state.roomId)}&token=${encodeURIComponent(
          state.pairToken
        )}`;

        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          state.connected = true;
          state.transportMode = 'Local Relay + Cloud';
          renderUI();
          announceJoinRoom();
        };
        ws.onmessage = (e) => handleIncomingMessage(e.data);
        ws.onerror = () => {};
      } catch {}
    }
  }

  /**
   * Build and render the Floating Spotify-Connect Pill + Bottom Sheet UI.
   */
  let pillEl = null;
  let backdropEl = null;
  let sheetEl = null;

  function mountMobileOverlayUI() {
    if (pillEl) return;

    pillEl = document.createElement('div');
    pillEl.className = 'ytmc-mobile-pill';
    setSafeHtml(
      pillEl,
      `
      <div class="ytmc-pill-main">
        <div class="ytmc-pill-left" id="ytmc-pill-open-sheet">
          <img class="ytmc-pill-art" id="ytmc-pill-art" src="${DEFAULT_ARTWORK}" alt="Artwork" />
          <div class="ytmc-pill-meta">
            <div class="ytmc-pill-title" id="ytmc-pill-title">YTM-Connect</div>
            <div class="ytmc-pill-status" id="ytmc-pill-status">Ready</div>
          </div>
        </div>
        <div class="ytmc-pill-actions">
          <button type="button" class="ytmc-pill-btn" id="ytmc-pill-play" title="Play / Pause">▶</button>
          <button type="button" class="ytmc-pill-btn" id="ytmc-pill-next" title="Next">⏭</button>
          <button type="button" class="ytmc-pill-btn connect-btn" id="ytmc-pill-devices" title="Devices & Handoff">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="ytmc-pill-progress-track">
        <div class="ytmc-pill-progress-bar" id="ytmc-pill-progress"></div>
      </div>
    `
    );
    document.body.appendChild(pillEl);

    backdropEl = document.createElement('div');
    backdropEl.className = 'ytmc-sheet-backdrop';
    backdropEl.addEventListener('click', () => toggleSheet(false));
    document.body.appendChild(backdropEl);

    sheetEl = document.createElement('div');
    sheetEl.className = 'ytmc-mobile-sheet';
    setSafeHtml(
      sheetEl,
      `
      <div class="ytmc-sheet-handle"></div>
      <div class="ytmc-sheet-header">
        <div class="ytmc-sheet-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1ed760" stroke-width="2.2">
            <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"></path>
            <line x1="2" y1="20" x2="2.01" y2="20"></line>
          </svg>
          <span>Connect to a device</span>
        </div>
        <button type="button" class="ytmc-sheet-close" id="ytmc-sheet-close">✕</button>
      </div>

      <div class="ytmc-transport-card">
        <div class="ytmc-transport-top">
          <img class="ytmc-transport-art" id="ytmc-sheet-art" src="${DEFAULT_ARTWORK}" alt="Track Art" />
          <div class="ytmc-transport-info">
            <div class="ytmc-transport-track" id="ytmc-sheet-track">No track playing</div>
            <div class="ytmc-transport-artist" id="ytmc-sheet-artist">YouTube Music</div>
            <span class="ytmc-transport-badge" id="ytmc-sheet-mode-badge">Remote Control Mode</span>
          </div>
        </div>
        <div class="ytmc-scrubber-row">
          <input type="range" class="ytmc-range" id="ytmc-seek-slider" min="0" max="100" value="0" step="1" />
          <div class="ytmc-time-row">
            <span id="ytmc-time-cur">0:00</span>
            <span id="ytmc-time-dur">0:00</span>
          </div>
        </div>
        <div class="ytmc-transport-buttons">
          <button type="button" class="ytmc-t-btn" id="ytmc-sheet-prev">⏮</button>
          <button type="button" class="ytmc-t-btn play" id="ytmc-sheet-play">▶</button>
          <button type="button" class="ytmc-t-btn" id="ytmc-sheet-next">⏭</button>
        </div>
        <div class="ytmc-volume-row">
          <span>🔈</span>
          <input type="range" class="ytmc-range" id="ytmc-vol-slider" min="0" max="100" value="100" step="1" />
          <span id="ytmc-vol-val">100%</span>
        </div>
      </div>

      <div class="ytmc-sheet-section-label">SELECT A DEVICE FOR PLAYBACK HANDOFF</div>
      <div class="ytmc-sheet-devices" id="ytmc-sheet-devices"></div>

      <div class="ytmc-sheet-section-label">ROOM PAIRING (6-DIGIT CODE)</div>
      <div class="ytmc-room-pair-card">
        <div>
          <div style="font-size:12px;font-weight:700;">Room: <span id="ytmc-room-label" style="color:#1ed760;font-family:monospace;">------</span></div>
          <div style="font-size:11px;color:#9aa2b1;">Enter code from Desktop Extension</div>
        </div>
        <div style="display:flex;gap:6px;">
          <input type="text" class="ytmc-room-input" id="ytmc-room-input" maxlength="12" placeholder="ABC123" />
          <button type="button" class="ytmc-room-join-btn" id="ytmc-room-join">Pair</button>
        </div>
      </div>
    `
    );
    document.body.appendChild(sheetEl);

    document.getElementById('ytmc-pill-open-sheet').addEventListener('click', () => {
      const npView = document.getElementById('ytmc-now-playing-view');
      if (npView) {
        npView.classList.remove('minimized');
        window.dispatchEvent(new CustomEvent('ytm-connect:open-now-playing'));
      } else {
        toggleSheet(true);
      }
    });
    document.getElementById('ytmc-pill-devices').addEventListener('click', () => toggleSheet(true));
    document.getElementById('ytmc-sheet-close').addEventListener('click', () => toggleSheet(false));

    document.getElementById('ytmc-pill-play').addEventListener('click', (e) => {
      e.stopPropagation();
      dispatchUserControl(state.track.isPaused ? 'PLAY' : 'PAUSE');
    });

    document.getElementById('ytmc-pill-next').addEventListener('click', (e) => {
      e.stopPropagation();
      dispatchUserControl('NEXT');
    });

    document.getElementById('ytmc-sheet-prev').addEventListener('click', () => dispatchUserControl('PREV'));
    document.getElementById('ytmc-sheet-play').addEventListener('click', () =>
      dispatchUserControl(state.track.isPaused ? 'PLAY' : 'PAUSE')
    );
    document.getElementById('ytmc-sheet-next').addEventListener('click', () => dispatchUserControl('NEXT'));

    const seekSlider = document.getElementById('ytmc-seek-slider');
    seekSlider.addEventListener('input', () => {
      state.isScrubbing = true;
      document.getElementById('ytmc-time-cur').textContent = formatSeconds(Number(seekSlider.value));
    });
    seekSlider.addEventListener('change', () => {
      state.isScrubbing = false;
      dispatchUserControl('SEEK', Number(seekSlider.value));
    });

    const volSlider = document.getElementById('ytmc-vol-slider');
    volSlider.addEventListener('input', () => {
      document.getElementById('ytmc-vol-val').textContent = `${volSlider.value}%`;
    });
    volSlider.addEventListener('change', () => {
      dispatchUserControl('VOLUME', Number(volSlider.value));
    });

    document.getElementById('ytmc-room-join').addEventListener('click', () => {
      const input = document.getElementById('ytmc-room-input');
      const code = input.value.trim().toUpperCase();
      if (!code) return;
      state.roomId = code;
      state.pairToken = '';
      saveConfig();
      input.value = '';
      connectAllTransports();
    });

    renderUI();
  }

  function toggleSheet(open) {
    state.sheetOpen = Boolean(open);
    if (backdropEl) backdropEl.className = `ytmc-sheet-backdrop ${state.sheetOpen ? 'open' : ''}`;
    if (sheetEl) sheetEl.className = `ytmc-mobile-sheet ${state.sheetOpen ? 'open' : ''}`;
    renderUI();
  }

  function formatSeconds(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  }

  function renderUI() {
    if (!pillEl || !sheetEl) return;

    const activeDev = getActiveDeviceObject();
    const mobileActive = isThisMobileActive();
    const artworkUrl = state.track.artwork || DEFAULT_ARTWORK;

    pillEl.className = `ytmc-mobile-pill ${!mobileActive && state.connected ? 'is-remote' : ''}`;

    const pillArt = document.getElementById('ytmc-pill-art');
    const pillTitle = document.getElementById('ytmc-pill-title');
    const pillStatus = document.getElementById('ytmc-pill-status');
    const pillPlay = document.getElementById('ytmc-pill-play');
    const pillProgress = document.getElementById('ytmc-pill-progress');

    if (pillArt && pillArt.src !== artworkUrl) pillArt.src = artworkUrl;
    if (pillTitle) {
      pillTitle.textContent = `${state.track.title || 'YouTube Music'} • ${
        state.track.artist || ''
      }`;
    }

    if (pillStatus) {
      pillStatus.className = `ytmc-pill-status ${state.connected ? '' : 'offline'}`;
      if (mobileActive) {
        pillStatus.textContent = `🔊 Playing on this Phone (Room ${state.roomId})`;
      } else if (activeDev) {
        pillStatus.textContent = `🟢 Listening on ${activeDev.deviceName} • Tap to Switch`;
      } else {
        pillStatus.textContent = `Room ${state.roomId} • Serverless Ready`;
      }
    }

    if (pillPlay) pillPlay.textContent = state.track.isPaused ? '▶' : '⏸';

    const dur = Math.max(1, Number(state.track.duration || 0));
    const cur = Math.min(dur, Math.max(0, Number(state.track.currentTime || 0)));
    const pct = state.track.duration > 0 ? Math.round((cur / dur) * 100) : 0;
    if (pillProgress) pillProgress.style.width = `${pct}%`;

    const sheetArt = document.getElementById('ytmc-sheet-art');
    if (sheetArt && sheetArt.src !== artworkUrl) sheetArt.src = artworkUrl;

    document.getElementById('ytmc-sheet-track').textContent = state.track.title || 'Not Playing';
    document.getElementById('ytmc-sheet-artist').textContent = state.track.artist || 'YouTube Music';
    document.getElementById('ytmc-sheet-mode-badge').textContent = mobileActive
      ? 'Local Playback Mode (Playing on Phone)'
      : `Remote Control Mode (${activeDev ? activeDev.deviceName : 'Desktop'})`;

    const seekSlider = document.getElementById('ytmc-seek-slider');
    if (seekSlider && !state.isScrubbing) {
      seekSlider.max = String(Math.max(1, Math.floor(state.track.duration || 210)));
      seekSlider.value = String(Math.floor(state.track.currentTime || 0));
    }
    if (!state.isScrubbing) {
      document.getElementById('ytmc-time-cur').textContent = formatSeconds(state.track.currentTime);
    }
    document.getElementById('ytmc-time-dur').textContent = formatSeconds(state.track.duration);
    document.getElementById('ytmc-sheet-play').textContent = state.track.isPaused ? '▶' : '⏸';

    const volSlider = document.getElementById('ytmc-vol-slider');
    if (volSlider && document.activeElement !== volSlider) {
      volSlider.value = String(state.track.volume ?? 100);
      document.getElementById('ytmc-vol-val').textContent = `${state.track.volume ?? 100}%`;
    }

    document.getElementById('ytmc-room-label').textContent = state.roomId;

    const devicesContainer = document.getElementById('ytmc-sheet-devices');
    if (devicesContainer) {
      ensureSelfInDevices();
      const list = state.devices;

      setSafeHtml(
        devicesContainer,
        list
          .map((dev) => {
            const isSelf = dev.deviceId === state.deviceId;
            const isActive = dev.deviceId === state.activeDeviceId;
            const title = isSelf ? 'Listen on this Phone' : `Listen on ${dev.deviceName}`;
            const subtitle = isActive
              ? 'Currently Active Audio Player'
              : isSelf
              ? `${dev.deviceName} • Seamless handoff at exact timestamp`
              : 'Desktop Browser • Seamless handoff at exact timestamp';

            return `
            <div class="ytmc-sheet-device ${isActive ? 'active' : ''}" data-target-id="${escapeHtml(dev.deviceId)}">
              <div class="ytmc-sheet-device-left">
                <div class="ytmc-sheet-device-icon">
                  ${dev.deviceType === 'MOBILE' ? '📱' : '💻'}
                </div>
                <div>
                  <div class="ytmc-sheet-device-title">${escapeHtml(title)}</div>
                  <div class="ytmc-sheet-device-sub">${escapeHtml(subtitle)}</div>
                </div>
              </div>
              <span class="ytmc-handoff-cta">
                ${isActive ? 'Active' : 'Switch Play'}
              </span>
            </div>
          `;
          })
          .join('')
      );

      devicesContainer.querySelectorAll('.ytmc-sheet-device').forEach((card) => {
        card.addEventListener('click', () => {
          const targetId = card.getAttribute('data-target-id');
          if (targetId && targetId !== state.activeDeviceId) {
            initiateHandoff(targetId);
          }
        });
      });
    }

    window.dispatchEvent(
      new CustomEvent('ytm-connect:state-rendered', {
        detail: {
          roomId: state.roomId,
          connected: state.connected,
          activeDeviceId: state.activeDeviceId,
          isMobileActive: mobileActive,
          devices: state.devices,
          track: state.track
        }
      })
    );
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window.YTMConnectMobile = {
    getState: () => state,
    dispatchUserControl,
    initiateHandoff,
    openDeviceSheet: () => toggleSheet(true),
    playTrack: (trackData) => {
      if (!trackData || !trackData.videoId) return;
      dispatchUserControl('LOAD_AND_PLAY', {
        videoId: trackData.videoId,
        listId: trackData.listId || '',
        startSeconds: Number(trackData.startSeconds || 0),
        title: trackData.title || 'YouTube Music Track',
        artist: trackData.artist || 'YouTube Music',
        artwork:
          trackData.artwork || `https://i.ytimg.com/vi/${trackData.videoId}/hqdefault.jpg`,
        duration: Number(trackData.duration || 210),
        autoPlay: true
      });
    },
    setRoomCode: (code) => {
      const cleaned = String(code || '').trim().toUpperCase();
      if (!cleaned) return;
      state.roomId = cleaned;
      state.pairToken = '';
      saveConfig();
      connectAllTransports();
    }
  };

  function init() {
    loadAndSyncConfig();
    registerServiceWorker();
    connectAllTransports();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        mountMobileOverlayUI();
        bindRemoteModeDomInterceptors();
      });
    } else {
      mountMobileOverlayUI();
      bindRemoteModeDomInterceptors();
    }

    localBroadcastTimer = setInterval(() => {
      if (state.connected && isThisMobileActive() && !state.track.isPaused) {
        emitMobileStateUpdate(true);
      }
    }, 2000);
  }

  init();
})();
