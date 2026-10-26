/**
 * YTM-Connect — Authentic YouTube Music Mobile App Clone & Controller (Zero `npm start` required)
 */
(function () {
  const YTM_CATALOG = [
    {
      videoId: '4NRXx6U8ABQ',
      listId: 'RDAMVM4NRXx6U8ABQ',
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      album: 'After Hours',
      duration: 200,
      moods: ['Energize', 'Party', 'Workout', 'Commute'],
      plays: '4.2B plays'
    },
    {
      videoId: 'kTJczUoc26U',
      listId: 'RDAMVMkTJczUoc26U',
      title: 'STAY',
      artist: 'The Kid LAROI & Justin Bieber',
      album: 'F*CK LOVE 3',
      duration: 141,
      moods: ['Energize', 'Party', 'Commute'],
      plays: '3.1B plays'
    },
    {
      videoId: 'jfKfPfyJRdk',
      listId: 'RDAMVMjfKfPfyJRdk',
      title: 'lofi hip hop radio - beats to relax/study to',
      artist: 'Lofi Girl',
      album: 'Chill Beats',
      duration: 240,
      moods: ['Relax', 'Focus'],
      plays: 'Live Stream'
    },
    {
      videoId: 'TUVcZfQe-Kw',
      listId: 'RDAMVMTUVcZfQe-Kw',
      title: 'Levitating',
      artist: 'Dua Lipa',
      album: 'Future Nostalgia',
      duration: 203,
      moods: ['Energize', 'Party', 'Workout'],
      plays: '2.4B plays'
    },
    {
      videoId: 'H5v3kku4y6Q',
      listId: 'RDAMVMH5v3kku4y6Q',
      title: 'As It Was',
      artist: 'Harry Styles',
      album: "Harry's House",
      duration: 167,
      moods: ['Commute', 'Relax', 'Energize'],
      plays: '2.9B plays'
    },
    {
      videoId: 'q0hyYWKXF0Q',
      listId: 'RDAMVMq0hyYWKXF0Q',
      title: 'Dance Monkey',
      artist: 'Tones and I',
      album: 'The Kids Are Coming',
      duration: 210,
      moods: ['Energize', 'Workout', 'Party'],
      plays: '3.0B plays'
    },
    {
      videoId: 'fJ9rUzIMcZQ',
      listId: 'RDAMVMfJ9rUzIMcZQ',
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      album: 'A Night at the Opera',
      duration: 355,
      moods: ['Energize', 'Commute', 'Party'],
      plays: '2.6B plays'
    },
    {
      videoId: 'JGwWNGJdvx8',
      listId: 'RDAMVMJGwWNGJdvx8',
      title: 'Shape of You',
      artist: 'Ed Sheeran',
      album: '÷ (Divide)',
      duration: 233,
      moods: ['Party', 'Workout', 'Romance'],
      plays: '6.2B plays'
    },
    {
      videoId: 'UceaB4D0jpo',
      listId: 'RDAMVMUceaB4D0jpo',
      title: 'Starboy (feat. Daft Punk)',
      artist: 'The Weeknd',
      album: 'Starboy',
      duration: 230,
      moods: ['Energize', 'Workout', 'Commute'],
      plays: '3.4B plays'
    },
    {
      videoId: 'pRpeEdMmmQ0',
      listId: 'RDAMVMpRpeEdMmmQ0',
      title: 'Shakira: Bzrp Music Sessions',
      artist: 'Bizarrap & Shakira',
      album: 'Vol. 53',
      duration: 218,
      moods: ['Party', 'Workout', 'Energize'],
      plays: '1.1B plays'
    },
    {
      videoId: 'YQHsXMglC9A',
      listId: 'RDAMVMYQHsXMglC9A',
      title: 'Hello',
      artist: 'Adele',
      album: '25',
      duration: 295,
      moods: ['Relax', 'Romance'],
      plays: '3.5B plays'
    },
    {
      videoId: 'dQw4w9WgXcQ',
      listId: 'RDAMVMdQw4w9WgXcQ',
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      album: 'Whenever You Need Somebody',
      duration: 213,
      moods: ['Party', 'Energize', 'Romance'],
      plays: '1.6B plays'
    }
  ];

  const YTM_MIXES = [
    {
      title: 'My Supermix',
      sub: 'The Weeknd, Dua Lipa, Harry Styles & more',
      videoId: '4NRXx6U8ABQ',
      listId: 'RDAMVM4NRXx6U8ABQ'
    },
    {
      title: 'Chill Lo-Fi Mix',
      sub: 'Lofi Girl, Synthwave, Ambient Study Beats',
      videoId: 'jfKfPfyJRdk',
      listId: 'RDAMVMjfKfPfyJRdk'
    },
    {
      title: 'Energy Boost',
      sub: 'Upbeat tracks for workout & focus',
      videoId: 'TUVcZfQe-Kw',
      listId: 'RDAMVMTUVcZfQe-Kw'
    },
    {
      title: 'Late Night Drive',
      sub: 'Daft Punk, The Weeknd, Midnight Vibes',
      videoId: 'UceaB4D0jpo',
      listId: 'RDAMVMUceaB4D0jpo'
    }
  ];

  let selectedMood = 'All';
  let searchQuery = '';
  let activeNpTab = 'upnext';
  let isVideoMode = false;
  let isPlayerScrubbing = false;
  let likedIds = new Set();
  let currentTrackState = {
    videoId: '',
    listId: '',
    title: 'Ready to Connect',
    artist: 'Play any song below or on Desktop',
    artwork: '',
    currentTime: 0,
    duration: 210,
    isPaused: true
  };

  function getArtUrl(videoId) {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r < 10 ? '0' : ''}${r}`;
  }

  function extractYouTubeVideoId(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
    try {
      const u = new URL(raw);
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      if (u.hostname.includes('youtu.be')) return u.pathname.replace('/', '').slice(0, 11);
    } catch {}
    return null;
  }

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function getFilteredTracks() {
    let list = YTM_CATALOG;
    if (selectedMood !== 'All') {
      list = list.filter((t) => t.moods && t.moods.includes(selectedMood));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const customVid = extractYouTubeVideoId(searchQuery.trim());
      const matches = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          (t.album && t.album.toLowerCase().includes(q))
      );
      if (customVid && !matches.some((m) => m.videoId === customVid)) {
        matches.unshift({
          videoId: customVid,
          listId: `RDAMVM${customVid}`,
          title: `YouTube Track (${customVid})`,
          artist: 'Direct YouTube Music Link',
          album: 'YouTube Music',
          duration: 210,
          plays: 'Instant Play'
        });
      }
      return matches;
    }
    return list;
  }

  function triggerPlayTrack(track, openFullPlayer = false) {
    if (!track || !track.videoId) return;
    const artwork = track.artwork || getArtUrl(track.videoId);

    if (window.YTMConnectMobile && typeof window.YTMConnectMobile.playTrack === 'function') {
      window.YTMConnectMobile.playTrack({
        videoId: track.videoId,
        listId: track.listId || `RDAMVM${track.videoId}`,
        title: track.title,
        artist: track.artist,
        artwork,
        duration: track.duration || 210,
        startSeconds: 0
      });
    }

    const st = window.YTMConnectMobile ? window.YTMConnectMobile.getState() : null;
    if (st && st.activeDeviceId === st.deviceId) {
      mountOrUpdateYoutubeEmbed(track.videoId, 0, isVideoMode);
    }

    if (openFullPlayer) {
      openNowPlayingSheet(true);
    }
    renderCatalogViews();
    renderNowPlayingDrawer();
  }

  function mountOrUpdateYoutubeEmbed(videoId, startSeconds = 0, showVideoBox = false) {
    const wrap = document.getElementById('ytmc-yt-embed-wrap');
    if (!wrap || !videoId) return;
    const start = Math.max(0, Math.floor(Number(startSeconds || 0)));

    wrap.style.display = showVideoBox ? 'block' : 'block';
    wrap.style.opacity = showVideoBox ? '1' : '0.01';
    wrap.style.pointerEvents = showVideoBox ? 'auto' : 'none';

    const existingIframe = wrap.querySelector('iframe');
    const targetSrc = `https://www.youtube.com/embed/${encodeURIComponent(
      videoId
    )}?autoplay=1&playsinline=1&start=${start}&enablejsapi=1`;

    if (!existingIframe || !existingIframe.src.includes(videoId)) {
      wrap.replaceChildren();
      const iframe = document.createElement('iframe');
      iframe.width = '100%';
      iframe.height = '100%';
      iframe.src = targetSrc;
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
      iframe.setAttribute('allowfullscreen', 'true');
      wrap.appendChild(iframe);
    }
  }

  function renderCatalogViews() {
    const tracks = getFilteredTracks();

    // 1. Speed Dial Grid (Top 9)
    const dialGrid = document.getElementById('ytmc-speed-dial-grid');
    if (dialGrid) {
      dialGrid.replaceChildren();
      tracks.slice(0, 9).forEach((track) => {
        const isCurrent = currentTrackState.videoId === track.videoId;
        const card = createEl('div', `ytm-dial-card ${isCurrent ? 'playing' : ''}`);
        const img = document.createElement('img');
        img.src = getArtUrl(track.videoId);
        img.alt = track.title;
        img.loading = 'lazy';

        const overlay = createEl('div', 'ytm-dial-overlay');
        const title = createEl('div', 'ytm-dial-title', track.title);
        overlay.appendChild(title);

        card.appendChild(img);
        card.appendChild(overlay);
        card.addEventListener('click', () => triggerPlayTrack(track, false));
        dialGrid.appendChild(card);
      });
    }

    // 2. Quick Picks List
    const picksList = document.getElementById('ytmc-quick-picks-list');
    if (picksList) {
      picksList.replaceChildren();
      tracks.forEach((track) => {
        const isCurrent = currentTrackState.videoId === track.videoId;
        const row = createEl('div', `ytm-song-row ${isCurrent ? 'playing' : ''}`);

        const thumbWrap = createEl('div', 'ytm-song-thumb-wrap');
        const img = document.createElement('img');
        img.className = 'ytm-song-thumb';
        img.src = getArtUrl(track.videoId);
        img.alt = track.title;
        img.loading = 'lazy';
        thumbWrap.appendChild(img);

        const meta = createEl('div', 'ytm-song-meta');
        const title = createEl(
          'div',
          'ytm-song-title',
          (isCurrent ? '🔊 ' : '') + track.title
        );
        const sub = createEl(
          'div',
          'ytm-song-sub',
          `${track.artist} • ${track.plays || formatTime(track.duration)}`
        );
        meta.appendChild(title);
        meta.appendChild(sub);

        const moreBtn = createEl('button', 'ytm-song-more', '▶');
        moreBtn.type = 'button';
        moreBtn.title = 'Open in Player';
        moreBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerPlayTrack(track, true);
        });

        row.appendChild(thumbWrap);
        row.appendChild(meta);
        row.appendChild(moreBtn);
        row.addEventListener('click', () => triggerPlayTrack(track, false));
        picksList.appendChild(row);
      });
    }

    // 3. Mixed For You Carousel
    const mixesEl = document.getElementById('ytmc-mixes-carousel');
    if (mixesEl && mixesEl.children.length === 0) {
      YTM_MIXES.forEach((mix) => {
        const card = createEl('div', 'ytm-mix-card');
        const artWrap = createEl('div', 'ytm-mix-art-wrap');
        const img = document.createElement('img');
        img.src = getArtUrl(mix.videoId);
        img.alt = mix.title;
        const badge = createEl('div', 'ytm-mix-badge', '▶');
        artWrap.appendChild(img);
        artWrap.appendChild(badge);

        const title = createEl('div', 'ytm-mix-title', mix.title);
        const sub = createEl('div', 'ytm-mix-sub', mix.sub);

        card.appendChild(artWrap);
        card.appendChild(title);
        card.appendChild(sub);
        card.addEventListener('click', () => {
          const found = YTM_CATALOG.find((t) => t.videoId === mix.videoId) || YTM_CATALOG[0];
          triggerPlayTrack(found, true);
        });
        mixesEl.appendChild(card);
      });
    }
  }

  function renderNowPlayingDrawer() {
    const body = document.getElementById('ytmc-np-drawer-body');
    if (!body) return;
    body.replaceChildren();

    if (activeNpTab === 'lyrics') {
      const box = createEl('div');
      box.style.cssText = 'padding:14px 8px;text-align:center;color:#ccc;font-size:13.5px;line-height:1.7;';
      const line1 = createEl('div', '', `♪ Now Playing: ${currentTrackState.title}`);
      line1.style.cssText = 'font-weight:800;color:#fff;font-size:15px;margin-bottom:6px;';
      const line2 = createEl('div', '', `Artist: ${currentTrackState.artist}`);
      const line3 = createEl(
        'div',
        '',
        'Real-time synchronized playback via YTM-Connect Serverless Bridge.'
      );
      line3.style.cssText = 'margin-top:8px;font-size:12px;color:#888;';
      box.appendChild(line1);
      box.appendChild(line2);
      box.appendChild(line3);
      body.appendChild(box);
      return;
    }

    const queueList =
      activeNpTab === 'related' ? [...YTM_CATALOG].reverse().slice(0, 6) : YTM_CATALOG.slice(0, 8);

    queueList.forEach((track) => {
      const isCurrent = currentTrackState.videoId === track.videoId;
      const row = createEl('div', `ytm-song-row ${isCurrent ? 'playing' : ''}`);

      const thumbWrap = createEl('div', 'ytm-song-thumb-wrap');
      thumbWrap.style.width = '40px';
      thumbWrap.style.height = '40px';
      const img = document.createElement('img');
      img.className = 'ytm-song-thumb';
      img.src = getArtUrl(track.videoId);
      thumbWrap.appendChild(img);

      const meta = createEl('div', 'ytm-song-meta');
      const title = createEl('div', 'ytm-song-title', track.title);
      title.style.fontSize = '13px';
      const sub = createEl('div', 'ytm-song-sub', `${track.artist} • ${formatTime(track.duration)}`);
      meta.appendChild(title);
      meta.appendChild(sub);

      row.appendChild(thumbWrap);
      row.appendChild(meta);
      row.addEventListener('click', () => triggerPlayTrack(track, false));
      body.appendChild(row);
    });
  }

  function openNowPlayingSheet(open) {
    const sheet = document.getElementById('ytmc-now-playing-view');
    if (!sheet) return;
    if (open) {
      sheet.classList.remove('minimized');
    } else {
      sheet.classList.add('minimized');
    }
  }

  function setSongOrVideoMode(videoMode) {
    isVideoMode = Boolean(videoMode);
    const songBtn = document.getElementById('ytmc-mode-song-btn');
    const videoBtn = document.getElementById('ytmc-mode-video-btn');
    const wrap = document.getElementById('ytmc-yt-embed-wrap');

    if (songBtn) songBtn.classList.toggle('active', !isVideoMode);
    if (videoBtn) videoBtn.classList.toggle('active', isVideoMode);

    if (wrap) {
      if (isVideoMode && currentTrackState.videoId) {
        mountOrUpdateYoutubeEmbed(
          currentTrackState.videoId,
          currentTrackState.currentTime,
          true
        );
      } else {
        wrap.style.opacity = '0.01';
        wrap.style.pointerEvents = 'none';
      }
    }
  }

  function handoffToPhone() {
    if (!window.YTMConnectMobile) return;
    const st = window.YTMConnectMobile.getState();
    window.YTMConnectMobile.initiateHandoff(st.deviceId);
  }

  function handoffToDesktop() {
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
  }

  function initShell() {
    renderCatalogViews();
    renderNowPlayingDrawer();

    // Header & Handoff buttons
    const openDevices = () => {
      if (window.YTMConnectMobile) window.YTMConnectMobile.openDeviceSheet();
    };

    const headerConnectBtn = document.getElementById('ytmc-header-connect-btn');
    const headerRoomPill = document.getElementById('ytmc-header-room-pill');
    const npDevicesBtn = document.getElementById('ytmc-np-devices-btn');
    const pillOpenDevices = document.getElementById('ytmc-pill-open-devices');

    if (headerConnectBtn) headerConnectBtn.addEventListener('click', openDevices);
    if (headerRoomPill) headerRoomPill.addEventListener('click', openDevices);
    if (npDevicesBtn) npDevicesBtn.addEventListener('click', openDevices);
    if (pillOpenDevices) pillOpenDevices.addEventListener('click', openDevices);

    // Phone / Desktop Handoff Triggers
    const quickPhoneBtn = document.getElementById('ytmc-quick-phone-btn');
    const quickDesktopBtn = document.getElementById('ytmc-quick-desktop-btn');
    const pillPhoneBtn = document.getElementById('ytmc-pill-handoff-phone');
    const pillDesktopBtn = document.getElementById('ytmc-pill-handoff-desktop');

    if (quickPhoneBtn) quickPhoneBtn.addEventListener('click', handoffToPhone);
    if (pillPhoneBtn) pillPhoneBtn.addEventListener('click', handoffToPhone);
    if (quickDesktopBtn) quickDesktopBtn.addEventListener('click', handoffToDesktop);
    if (pillDesktopBtn) pillDesktopBtn.addEventListener('click', handoffToDesktop);

    // Expand / Minimize Full Now Playing View
    const expandNpBtn = document.getElementById('ytmc-expand-np-btn');
    const openPlayerAvatar = document.getElementById('ytmc-open-player-avatar');
    const minimizeNpBtn = document.getElementById('ytmc-np-minimize-btn');

    if (expandNpBtn) expandNpBtn.addEventListener('click', () => openNowPlayingSheet(true));
    if (openPlayerAvatar) openPlayerAvatar.addEventListener('click', () => openNowPlayingSheet(true));
    if (minimizeNpBtn) minimizeNpBtn.addEventListener('click', () => openNowPlayingSheet(false));

    // Song / Video Toggle
    const songBtn = document.getElementById('ytmc-mode-song-btn');
    const videoBtn = document.getElementById('ytmc-mode-video-btn');
    if (songBtn) songBtn.addEventListener('click', () => setSongOrVideoMode(false));
    if (videoBtn) videoBtn.addEventListener('click', () => setSongOrVideoMode(true));

    // Search Drawer Toggle & Input
    const searchToggleBtn = document.getElementById('ytmc-search-toggle-btn');
    const searchDrawer = document.getElementById('ytmc-search-drawer');
    const searchInput = document.getElementById('ytmc-search-input');
    const searchClear = document.getElementById('ytmc-search-clear');

    if (searchToggleBtn && searchDrawer) {
      searchToggleBtn.addEventListener('click', () => {
        const isOpen = searchDrawer.classList.toggle('open');
        if (isOpen && searchInput) searchInput.focus();
      });
    }
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value;
        renderCatalogViews();
      });
    }
    if (searchClear && searchInput) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        renderCatalogViews();
      });
    }

    // Mood Chips
    const moodContainer = document.getElementById('ytmc-mood-chips');
    if (moodContainer) {
      moodContainer.querySelectorAll('.ytm-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          moodContainer.querySelectorAll('.ytm-chip').forEach((c) => c.classList.remove('active'));
          chip.classList.add('active');
          selectedMood = chip.getAttribute('data-mood') || 'All';
          renderCatalogViews();
        });
      });
    }

    // Shuffle All / Play All
    const shuffleAllBtn = document.getElementById('ytmc-shuffle-all-btn');
    const playAllBtn = document.getElementById('ytmc-play-all-btn');
    const shuffleBtn = document.getElementById('ytmc-shuffle-btn');

    const playRandomTrack = () => {
      const randomTrack = YTM_CATALOG[Math.floor(Math.random() * YTM_CATALOG.length)];
      triggerPlayTrack(randomTrack, true);
    };
    if (shuffleAllBtn) shuffleAllBtn.addEventListener('click', playRandomTrack);
    if (shuffleBtn) shuffleBtn.addEventListener('click', playRandomTrack);
    if (playAllBtn) {
      playAllBtn.addEventListener('click', () => {
        const list = getFilteredTracks();
        if (list.length > 0) triggerPlayTrack(list[0], true);
      });
    }

    // Like Button & Share Button
    const likeBtn = document.getElementById('ytmc-like-btn');
    if (likeBtn) {
      likeBtn.addEventListener('click', () => {
        const id = currentTrackState.videoId || 'default';
        if (likedIds.has(id)) likedIds.delete(id);
        else likedIds.add(id);
        likeBtn.style.background = likedIds.has(id)
          ? 'rgba(255, 0, 51, 0.28)'
          : 'rgba(255, 255, 255, 0.06)';
      });
    }

    const shareBtn = document.getElementById('ytmc-pill-share');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        const url = currentTrackState.videoId
          ? `https://music.youtube.com/watch?v=${currentTrackState.videoId}`
          : window.location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).catch(() => {});
        }
        shareBtn.textContent = '✓ Link Copied';
        setTimeout(() => {
          shareBtn.textContent = '↗ Share Track';
        }, 1600);
      });
    }

    // Main Player Play/Pause Button (for Local Mode; Remote Mode is handled by bridge.js interceptor)
    const playBtn = document.getElementById('play-pause-button');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (!window.YTMConnectMobile) return;
        const st = window.YTMConnectMobile.getState();
        if (st.activeDeviceId === st.deviceId) {
          window.YTMConnectMobile.dispatchUserControl(st.track.isPaused ? 'PLAY' : 'PAUSE');
        }
      });
    }

    // Main Player Scrubber
    const playerSeek = document.getElementById('ytmc-player-seek');
    const playerCur = document.getElementById('ytmc-player-cur');
    if (playerSeek) {
      playerSeek.addEventListener('input', () => {
        isPlayerScrubbing = true;
        if (playerCur) playerCur.textContent = formatTime(playerSeek.value);
      });
      playerSeek.addEventListener('change', () => {
        isPlayerScrubbing = false;
        if (window.YTMConnectMobile) {
          window.YTMConnectMobile.dispatchUserControl('SEEK', Number(playerSeek.value));
        }
      });
    }

    // Up Next / Lyrics / Related Tabs inside Now Playing
    document.querySelectorAll('.ytm-np-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ytm-np-tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeNpTab = btn.getAttribute('data-np-tab') || 'upnext';
        renderNowPlayingDrawer();
      });
    });

    // Bottom Navigation Bar
    document.querySelectorAll('.ytm-nav-item').forEach((navBtn) => {
      navBtn.addEventListener('click', () => {
        document.querySelectorAll('.ytm-nav-item').forEach((b) => b.classList.remove('active'));
        navBtn.classList.add('active');
        const tab = navBtn.getAttribute('data-nav');

        if (tab === 'samples') {
          openNowPlayingSheet(true);
          setSongOrVideoMode(true);
        } else {
          openNowPlayingSheet(false);
          const heading = document.getElementById('ytmc-quick-picks-heading');
          if (heading) {
            if (tab === 'explore') heading.textContent = 'Top Global Charts';
            else if (tab === 'library') heading.textContent = 'Your Liked & Recent Songs';
            else heading.textContent = 'Quick picks';
          }
        }
      });
    });

    // Listen to state updates from bridge.js
    window.addEventListener('ytm-connect:state-rendered', (e) => {
      const d = e.detail || {};
      const t = d.track || {};
      currentTrackState = { ...currentTrackState, ...t };

      const artEl = document.getElementById('ytmc-stage-art');
      const ambientEl = document.getElementById('ytmc-ambient-glow');
      const titleEl = document.getElementById('ytmc-stage-title');
      const artistEl = document.getElementById('ytmc-stage-artist');
      const modePill = document.getElementById('ytmc-stage-mode-pill');
      const roomCodeEl = document.getElementById('ytmc-header-room-code');
      const domTitle = document.getElementById('ytmc-dom-title');
      const domArtist = document.getElementById('ytmc-dom-artist');
      const durEl = document.getElementById('ytmc-player-dur');

      if (roomCodeEl && d.roomId) roomCodeEl.textContent = d.roomId;

      if (t.artwork) {
        if (artEl && artEl.src !== t.artwork) artEl.src = t.artwork;
        if (ambientEl) ambientEl.style.backgroundImage = `url("${t.artwork}")`;
      }

      if (titleEl) titleEl.textContent = t.title || 'YouTube Music';
      if (artistEl) artistEl.textContent = t.artist || 'Ready';
      if (domTitle) domTitle.textContent = t.title || '';
      if (domArtist) domArtist.textContent = t.artist || '';
      if (playBtn) playBtn.textContent = t.isPaused ? '▶' : '⏸';

      if (playerSeek && !isPlayerScrubbing) {
        playerSeek.max = String(Math.max(1, Math.floor(t.duration || 210)));
        playerSeek.value = String(Math.floor(t.currentTime || 0));
      }
      if (playerCur && !isPlayerScrubbing) {
        playerCur.textContent = formatTime(t.currentTime || 0);
      }
      if (durEl) {
        durEl.textContent = formatTime(t.duration || 210);
      }

      if (modePill) {
        if (d.isMobileActive) {
          modePill.textContent = `🔊 Playing on this Phone (Room ${d.roomId || ''})`;
        } else {
          const activeDev = (d.devices || []).find((x) => x.deviceId === d.activeDeviceId);
          modePill.textContent =
            '🟢 Controlling ' + (activeDev ? activeDev.deviceName : 'Desktop YouTube Music');
        }
      }

      renderCatalogViews();
    });

    window.addEventListener('ytm-connect:mobile-handoff-active', (e) => {
      const detail = e.detail || {};
      if (!detail.videoId) return;
      mountOrUpdateYoutubeEmbed(detail.videoId, detail.startSeconds || 0, isVideoMode);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShell);
  } else {
    initShell();
  }
})();
