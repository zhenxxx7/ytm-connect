/**
 * YTM-Connect — Authentic YouTube Music Mobile App Clone & Real-Time Sync Controller
 * Syncs live Queue (Up Next), Prev/Next tracks, Real-Time Synced Lyrics, Like/Repeat/Shuffle,
 * and Seamless Bidirectional Playback Handoff with Desktop YouTube Music.
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

  // Live Lyrics Cache & Synced Lines
  const lyricsCache = new Map();
  let lastLyricsLookupKey = '';
  let currentLyricsState = {
    loading: false,
    syncedLines: [], // [{ time: number, text: string }]
    plainText: '',
    activeLineIndex: -1
  };

  let currentTrackState = {
    videoId: '',
    listId: '',
    title: 'Ready to Connect',
    artist: 'Play any song below or on Desktop',
    album: '',
    artwork: '',
    currentTime: 0,
    duration: 210,
    isPaused: true,
    likeStatus: 'INDIFFERENT',
    repeatMode: 'OFF',
    queue: [],
    prevTrack: null,
    nextTrack: null,
    lyrics: ''
  };

  function getArtUrl(videoId) {
    return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '../icons/icon-128.png';
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

  /**
   * Parse LRC format "[mm:ss.xx] Lyric text" into array of { time, text }
   */
  function parseLrcLyrics(lrcText) {
    if (!lrcText || typeof lrcText !== 'string') return [];
    const lines = lrcText.split(/\r?\n/);
    const parsed = [];
    const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

    for (const line of lines) {
      let match;
      const timestamps = [];
      while ((match = timeRegex.exec(line)) !== null) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
        timestamps.push(mins * 60 + secs + ms / 1000);
      }
      const text = line.replace(/\[.*?\]/g, '').trim();
      if (timestamps.length > 0 && text) {
        for (const t of timestamps) {
          parsed.push({ time: t, text });
        }
      }
    }
    return parsed.sort((a, b) => a.time - b.time);
  }

  /**
   * Automatically fetch real synchronized or plain lyrics for the current Desktop/Mobile song
   */
  async function ensureLyricsForTrack(title, artist, desktopLyrics = '') {
    const cleanTitle = String(title || '')
      .replace(/\(Official.*?\)|\[Official.*?\]|\(Lyrics.*?\)|\(Audio.*?\)|\(Video.*?\)/gi, '')
      .trim();
    const cleanArtist = String(artist || '').split('•')[0].trim();

    if (
      !cleanTitle ||
      cleanTitle === 'Ready to Connect' ||
      cleanTitle === 'YouTube Music' ||
      cleanTitle === 'Not Playing'
    ) {
      return;
    }

    if (desktopLyrics && desktopLyrics.length > 20) {
      currentLyricsState = {
        loading: false,
        syncedLines: [],
        plainText: desktopLyrics,
        activeLineIndex: -1
      };
      if (activeNpTab === 'lyrics') renderNowPlayingDrawer();
      return;
    }

    const key = `${cleanTitle.toLowerCase()}|${cleanArtist.toLowerCase()}`;
    if (key === lastLyricsLookupKey) return;
    lastLyricsLookupKey = key;

    if (lyricsCache.has(key)) {
      currentLyricsState = { ...lyricsCache.get(key), activeLineIndex: -1 };
      if (activeNpTab === 'lyrics') renderNowPlayingDrawer();
      return;
    }

    currentLyricsState = {
      loading: true,
      syncedLines: [],
      plainText: '',
      activeLineIndex: -1
    };
    if (activeNpTab === 'lyrics') renderNowPlayingDrawer();

    try {
      const q = encodeURIComponent(`${cleanTitle} ${cleanArtist}`);
      const res = await fetch(`https://lrclib.net/api/search?q=${q}`);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          const best = list.find((item) => item.syncedLyrics) || list[0];
          const syncedLines = best.syncedLyrics ? parseLrcLyrics(best.syncedLyrics) : [];
          const plainText = best.plainLyrics || '';
          const entry = {
            loading: false,
            syncedLines,
            plainText,
            activeLineIndex: -1
          };
          lyricsCache.set(key, entry);
          if (lastLyricsLookupKey === key) {
            currentLyricsState = { ...entry };
            if (activeNpTab === 'lyrics') renderNowPlayingDrawer();
          }
          return;
        }
      }
    } catch {}

    currentLyricsState = {
      loading: false,
      syncedLines: [],
      plainText: '',
      activeLineIndex: -1
    };
    if (activeNpTab === 'lyrics') renderNowPlayingDrawer();
  }

  function updateSyncedLyricsHighlight(currentTimeSec) {
    if (activeNpTab !== 'lyrics' || currentLyricsState.syncedLines.length === 0) return;
    const lines = currentLyricsState.syncedLines;
    let activeIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (currentTimeSec >= lines[i].time - 0.3) {
        activeIdx = i;
      } else {
        break;
      }
    }
    if (activeIdx !== currentLyricsState.activeLineIndex) {
      currentLyricsState.activeLineIndex = activeIdx;
      const body = document.getElementById('ytmc-np-drawer-body');
      if (!body) return;
      const lineNodes = body.querySelectorAll('.ytm-lyric-line');
      lineNodes.forEach((node, idx) => {
        if (idx === activeIdx) {
          node.style.color = '#ffffff';
          node.style.fontWeight = '800';
          node.style.transform = 'scale(1.03)';
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          node.style.color = idx < activeIdx ? '#777777' : '#9a9a9a';
          node.style.fontWeight = '600';
          node.style.transform = 'scale(1)';
        }
      });
    }
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
    if (!track) return;

    const st = window.YTMConnectMobile ? window.YTMConnectMobile.getState() : null;
    const isMobileActive = st && st.activeDeviceId === st.deviceId;

    // If this track comes from Desktop's live queue and Desktop is active, jump directly to that queue index!
    if (!isMobileActive && typeof track.index === 'number' && !track.videoId) {
      window.YTMConnectMobile.dispatchUserControl('PLAY_QUEUE_INDEX', track.index);
      if (openFullPlayer) openNowPlayingSheet(true);
      return;
    }

    if (!track.videoId && typeof track.index === 'number') {
      window.YTMConnectMobile.dispatchUserControl('PLAY_QUEUE_INDEX', track.index);
      if (openFullPlayer) openNowPlayingSheet(true);
      return;
    }

    if (!track.videoId) return;
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

    if (isMobileActive) {
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

    const st = window.YTMConnectMobile ? window.YTMConnectMobile.getState() : null;
    const isMobileActive = st && st.activeDeviceId === st.deviceId;
    if (!isMobileActive) {
      wrap.replaceChildren();
      wrap.style.display = 'none';
      return;
    }

    const start = Math.max(0, Math.floor(Number(startSeconds || 0)));
    wrap.style.display = 'block';
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
    const desktopQueue = Array.isArray(currentTrackState.queue) ? currentTrackState.queue : [];

    // 1. Speed Dial Grid (Top 9)
    const dialGrid = document.getElementById('ytmc-speed-dial-grid');
    if (dialGrid) {
      dialGrid.replaceChildren();
      tracks.slice(0, 9).forEach((track) => {
        const isCurrent =
          (currentTrackState.videoId && currentTrackState.videoId === track.videoId) ||
          (currentTrackState.title && currentTrackState.title === track.title);
        const card = createEl('div', `ytm-dial-card ${isCurrent ? 'playing' : ''}`);
        const img = document.createElement('img');
        img.src = track.artwork || getArtUrl(track.videoId);
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

    // 2. Quick Picks / Live Desktop Queue List
    const picksList = document.getElementById('ytmc-quick-picks-list');
    const picksHeading = document.getElementById('ytmc-quick-picks-heading');
    if (picksList) {
      picksList.replaceChildren();
      const sourceList =
        desktopQueue.length > 0 && !searchQuery.trim() && selectedMood === 'All'
          ? desktopQueue
          : tracks;

      if (picksHeading && !searchQuery.trim() && selectedMood === 'All') {
        picksHeading.textContent =
          desktopQueue.length > 0 ? 'Desktop Queue (Up Next)' : 'Quick picks';
      }

      sourceList.forEach((track, idx) => {
        const isCurrent =
          Boolean(track.selected) ||
          (currentTrackState.videoId &&
            track.videoId &&
            currentTrackState.videoId === track.videoId) ||
          (currentTrackState.title && currentTrackState.title === track.title);

        const row = createEl('div', `ytm-song-row ${isCurrent ? 'playing' : ''}`);

        const thumbWrap = createEl('div', 'ytm-song-thumb-wrap');
        const img = document.createElement('img');
        img.className = 'ytm-song-thumb';
        img.src = track.artwork || getArtUrl(track.videoId);
        img.alt = track.title;
        img.loading = 'lazy';
        thumbWrap.appendChild(img);

        const meta = createEl('div', 'ytm-song-meta');
        const title = createEl(
          'div',
          'ytm-song-title',
          (isCurrent ? '🔊 ' : '') + track.title
        );
        const subText = track.durationText
          ? `${track.artist} • ${track.durationText}`
          : `${track.artist} • ${track.plays || formatTime(track.duration)}`;
        const sub = createEl('div', 'ytm-song-sub', subText);
        meta.appendChild(title);
        meta.appendChild(sub);

        const moreBtn = createEl('button', 'ytm-song-more', '▶');
        moreBtn.type = 'button';
        moreBtn.title = 'Play Track';
        moreBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerPlayTrack({ ...track, index: track.index ?? idx }, true);
        });

        row.appendChild(thumbWrap);
        row.appendChild(meta);
        row.appendChild(moreBtn);
        row.addEventListener('click', () =>
          triggerPlayTrack({ ...track, index: track.index ?? idx }, false)
        );
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

    // TAB 2: LYRICS (Synchronized Live Lyrics or Desktop Lyrics)
    if (activeNpTab === 'lyrics') {
      const box = createEl('div');
      box.style.cssText = 'padding:10px 8px;text-align:center;line-height:1.7;';

      if (currentLyricsState.loading) {
        const loadingEl = createEl('div', '', 'Loading synchronized lyrics...');
        loadingEl.style.cssText = 'color:#aaa;font-size:13px;padding:18px 0;';
        box.appendChild(loadingEl);
        body.appendChild(box);
        return;
      }

      if (currentLyricsState.syncedLines && currentLyricsState.syncedLines.length > 0) {
        currentLyricsState.syncedLines.forEach((item, idx) => {
          const lineEl = createEl('div', 'ytm-lyric-line', item.text);
          lineEl.style.cssText =
            'padding:6px 4px;font-size:14.5px;font-weight:600;color:#9a9a9a;cursor:pointer;transition:all 0.2s ease;';
          if (idx === currentLyricsState.activeLineIndex) {
            lineEl.style.color = '#ffffff';
            lineEl.style.fontWeight = '800';
          }
          lineEl.addEventListener('click', () => {
            if (window.YTMConnectMobile) {
              window.YTMConnectMobile.dispatchUserControl('SEEK', Math.floor(item.time));
            }
          });
          box.appendChild(lineEl);
        });
        body.appendChild(box);
        return;
      }

      const plain = currentTrackState.lyrics || currentLyricsState.plainText;
      if (plain) {
        plain.split(/\r?\n/).forEach((line) => {
          const lineEl = createEl('div', '', line || '♪');
          lineEl.style.cssText = 'padding:3px 4px;font-size:13.5px;color:#e2e8f0;';
          box.appendChild(lineEl);
        });
        body.appendChild(box);
        return;
      }

      const header = createEl('div', '', `♪ ${currentTrackState.title}`);
      header.style.cssText = 'font-weight:800;color:#fff;font-size:14.5px;margin-bottom:4px;';
      const artistLine = createEl('div', '', currentTrackState.artist);
      artistLine.style.cssText = 'color:#aaa;font-size:12.5px;margin-bottom:8px;';
      const note = createEl(
        'div',
        '',
        'No timed lyrics found for this track — open the Lyrics tab on Desktop YouTube Music or play another song.'
      );
      note.style.cssText = 'color:#777;font-size:12px;';
      box.appendChild(header);
      box.appendChild(artistLine);
      box.appendChild(note);
      body.appendChild(box);
      return;
    }

    // TAB 1 (UP NEXT) & TAB 3 (RELATED)
    const desktopQueue = Array.isArray(currentTrackState.queue) ? currentTrackState.queue : [];
    const queueList =
      activeNpTab === 'related'
        ? YTM_CATALOG.slice(0, 8)
        : desktopQueue.length > 0
        ? desktopQueue
        : YTM_CATALOG.slice(0, 8);

    // Show Prev / Next summary banner at top of Up Next
    if (activeNpTab === 'upnext' && (currentTrackState.nextTrack || currentTrackState.prevTrack)) {
      const summary = createEl('div');
      summary.style.cssText =
        'display:flex;justify-content:space-between;gap:8px;padding:6px 8px 8px;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:11.5px;color:#aaa;';
      const prevText = currentTrackState.prevTrack
        ? `⏮ Prev: ${currentTrackState.prevTrack.title}`
        : '⏮ Start of Queue';
      const nextText = currentTrackState.nextTrack
        ? `⏭ Next: ${currentTrackState.nextTrack.title}`
        : '⏭ Autoplay Next';
      const prevSpan = createEl('span', '', prevText);
      prevSpan.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:48%;';
      const nextSpan = createEl('span', '', nextText);
      nextSpan.style.cssText =
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:48%;color:#1ed760;font-weight:700;';
      summary.appendChild(prevSpan);
      summary.appendChild(nextSpan);
      body.appendChild(summary);
    }

    queueList.forEach((track, idx) => {
      const isCurrent =
        Boolean(track.selected) ||
        (currentTrackState.videoId &&
          track.videoId &&
          currentTrackState.videoId === track.videoId) ||
        (currentTrackState.title && currentTrackState.title === track.title);

      const row = createEl('div', `ytm-song-row ${isCurrent ? 'playing' : ''}`);

      const thumbWrap = createEl('div', 'ytm-song-thumb-wrap');
      thumbWrap.style.width = '40px';
      thumbWrap.style.height = '40px';
      const img = document.createElement('img');
      img.className = 'ytm-song-thumb';
      img.src = track.artwork || getArtUrl(track.videoId);
      thumbWrap.appendChild(img);

      const meta = createEl('div', 'ytm-song-meta');
      const title = createEl(
        'div',
        'ytm-song-title',
        (isCurrent ? '🔊 ' : '') + track.title
      );
      title.style.fontSize = '13px';
      const durStr = track.durationText || formatTime(track.duration);
      const sub = createEl('div', 'ytm-song-sub', `${track.artist}${durStr ? ' • ' + durStr : ''}`);
      meta.appendChild(title);
      meta.appendChild(sub);

      row.appendChild(thumbWrap);
      row.appendChild(meta);
      row.addEventListener('click', () =>
        triggerPlayTrack({ ...track, index: track.index ?? idx }, false)
      );
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
      const st = window.YTMConnectMobile ? window.YTMConnectMobile.getState() : null;
      const isMobileActive = st && st.activeDeviceId === st.deviceId;
      if (isVideoMode && isMobileActive && currentTrackState.videoId) {
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

    // Shuffle / Repeat / Play All
    const shuffleAllBtn = document.getElementById('ytmc-shuffle-all-btn');
    const playAllBtn = document.getElementById('ytmc-play-all-btn');
    const shuffleBtn = document.getElementById('ytmc-shuffle-btn');
    const repeatBtn = document.getElementById('ytmc-repeat-btn');

    if (shuffleAllBtn) {
      shuffleAllBtn.addEventListener('click', () => {
        const randomTrack = YTM_CATALOG[Math.floor(Math.random() * YTM_CATALOG.length)];
        triggerPlayTrack(randomTrack, true);
      });
    }
    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', () => {
        const st = window.YTMConnectMobile ? window.YTMConnectMobile.getState() : null;
        if (st && st.activeDeviceId !== st.deviceId) {
          window.YTMConnectMobile.dispatchUserControl('SHUFFLE');
        } else {
          const randomTrack = YTM_CATALOG[Math.floor(Math.random() * YTM_CATALOG.length)];
          triggerPlayTrack(randomTrack, true);
        }
      });
    }
    if (repeatBtn) {
      repeatBtn.addEventListener('click', () => {
        if (window.YTMConnectMobile) {
          window.YTMConnectMobile.dispatchUserControl('REPEAT');
        }
      });
    }
    if (playAllBtn) {
      playAllBtn.addEventListener('click', () => {
        const list = getFilteredTracks();
        if (list.length > 0) triggerPlayTrack(list[0], true);
      });
    }

    // Like Button (Synced with Desktop YouTube Music)
    const likeBtn = document.getElementById('ytmc-like-btn');
    if (likeBtn) {
      likeBtn.addEventListener('click', () => {
        const id = currentTrackState.videoId || 'default';
        if (likedIds.has(id)) likedIds.delete(id);
        else likedIds.add(id);
        likeBtn.style.background = likedIds.has(id)
          ? 'rgba(255, 0, 51, 0.28)'
          : 'rgba(255, 255, 255, 0.06)';
        if (window.YTMConnectMobile) {
          window.YTMConnectMobile.dispatchUserControl('LIKE');
        }
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

    // Main Player Play/Pause, Prev, Next (Local Mode handlers; Remote Mode is handled by bridge.js interceptor)
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

    const prevBtn = document.querySelector('ytmusic-player-bar .previous-button');
    const nextBtn = document.querySelector('ytmusic-player-bar .next-button');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (!window.YTMConnectMobile) return;
        const st = window.YTMConnectMobile.getState();
        if (st.activeDeviceId === st.deviceId) {
          window.YTMConnectMobile.dispatchUserControl('PREV');
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (!window.YTMConnectMobile) return;
        const st = window.YTMConnectMobile.getState();
        if (st.activeDeviceId === st.deviceId) {
          window.YTMConnectMobile.dispatchUserControl('NEXT');
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
            else
              heading.textContent =
                currentTrackState.queue && currentTrackState.queue.length > 0
                  ? 'Desktop Queue (Up Next)'
                  : 'Quick picks';
          }
        }
      });
    });

    // Listen to state updates from bridge.js
    window.addEventListener('ytm-connect:state-rendered', (e) => {
      const d = e.detail || {};
      const t = d.track || {};
      const prevTitle = currentTrackState.title;
      const prevQueueLen = Array.isArray(currentTrackState.queue)
        ? currentTrackState.queue.length
        : 0;

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
      if (artistEl) {
        const subParts = [t.artist || 'Ready'];
        if (t.album) subParts.push(t.album);
        artistEl.textContent = subParts.join(' • ');
      }
      if (domTitle) domTitle.textContent = t.title || '';
      if (domArtist) domArtist.textContent = t.artist || '';
      if (playBtn) playBtn.textContent = t.isPaused ? '▶' : '⏸';

      if (likeBtn && t.likeStatus) {
        likeBtn.style.background =
          t.likeStatus === 'LIKE' ? 'rgba(255, 0, 51, 0.28)' : 'rgba(255, 255, 255, 0.06)';
      }

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

      // Highlight active Phone vs Desktop pill inside Now Playing
      if (pillPhoneBtn && pillDesktopBtn) {
        pillPhoneBtn.classList.toggle('active-green', Boolean(d.isMobileActive));
        pillDesktopBtn.classList.toggle('active-green', !d.isMobileActive);
      }

      // Ensure lyrics are fetched and synced for the current track
      ensureLyricsForTrack(t.title, t.artist, t.lyrics);
      updateSyncedLyricsHighlight(Number(t.currentTime || 0));

      const newQueueLen = Array.isArray(t.queue) ? t.queue.length : 0;
      if (t.title !== prevTitle || newQueueLen !== prevQueueLen) {
        renderCatalogViews();
        renderNowPlayingDrawer();
      }
    });

    window.addEventListener('ytm-connect:mobile-handoff-active', (e) => {
      const detail = e.detail || {};
      if (!detail.videoId) return;
      mountOrUpdateYoutubeEmbed(detail.videoId, detail.startSeconds || 0, isVideoMode);
    });

    window.addEventListener('ytm-connect:mobile-handoff-stopped', () => {
      const wrap = document.getElementById('ytmc-yt-embed-wrap');
      if (wrap) {
        wrap.replaceChildren();
        wrap.style.display = 'none';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShell);
  } else {
    initShell();
  }
})();
