/**
 * YTM-Connect — Built-in Extension Mobile Controller Stage (Zero `npm start` required)
 */
(function () {
  function initShell() {
    const headerConnectBtn = document.getElementById('ytmc-header-connect-btn');
    const quickPhoneBtn = document.getElementById('ytmc-quick-phone-btn');
    const quickDesktopBtn = document.getElementById('ytmc-quick-desktop-btn');
    const playBtn = document.getElementById('play-pause-button');

    if (headerConnectBtn) {
      headerConnectBtn.addEventListener('click', () => {
        if (window.YTMConnectMobile) window.YTMConnectMobile.openDeviceSheet();
      });
    }

    if (quickPhoneBtn) {
      quickPhoneBtn.addEventListener('click', () => {
        if (!window.YTMConnectMobile) return;
        const st = window.YTMConnectMobile.getState();
        window.YTMConnectMobile.initiateHandoff(st.deviceId);
      });
    }

    if (quickDesktopBtn) {
      quickDesktopBtn.addEventListener('click', () => {
        if (!window.YTMConnectMobile) return;
        const st = window.YTMConnectMobile.getState();
        const desktop = st.devices.find(
          (d) => d.deviceType === 'DESKTOP' || d.deviceId !== st.deviceId
        );
        if (desktop) {
          window.YTMConnectMobile.initiateHandoff(desktop.deviceId);
        } else {
          window.YTMConnectMobile.openDeviceSheet();
        }
      });
    }

    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (!window.YTMConnectMobile) return;
        const st = window.YTMConnectMobile.getState();
        if (st.activeDeviceId === st.deviceId) {
          window.YTMConnectMobile.dispatchUserControl(st.track.isPaused ? 'PLAY' : 'PAUSE');
        }
      });
    }

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
        if (d.isMobileActive) {
          modePill.textContent =
            '🔊 Local Playback Active on Mobile (' + (d.roomId || '') + ')';
        } else {
          const activeDev = (d.devices || []).find((x) => x.deviceId === d.activeDeviceId);
          modePill.textContent =
            '🟢 Remote Control Mode — Controlling ' +
            (activeDev ? activeDev.deviceName : 'Desktop YouTube Music');
        }
      }
    });

    window.addEventListener('ytm-connect:mobile-handoff-active', (e) => {
      const detail = e.detail || {};
      const wrap = document.getElementById('ytmc-yt-embed-wrap');
      if (!wrap || !detail.videoId) return;
      const start = Math.max(0, Math.floor(Number(detail.startSeconds || 0)));
      wrap.style.display = 'block';
      wrap.replaceChildren();
      const iframe = document.createElement('iframe');
      iframe.width = '100%';
      iframe.height = '100%';
      iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(
        detail.videoId
      )}?autoplay=1&playsinline=1&start=${start}&enablejsapi=1`;
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
      iframe.setAttribute('allowfullscreen', 'true');
      wrap.appendChild(iframe);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShell);
  } else {
    initShell();
  }
})();
