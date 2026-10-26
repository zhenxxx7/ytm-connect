/**
 * YTM-Connect — Page World Bridge (Injected into MAIN world of music.youtube.com)
 * Provides direct access to YouTube Music's internal #movie_player API and Polymer Queue
 * for exact videoId/listId/queue extraction and zero-reload LOAD_AND_PLAY handoff.
 */
(function () {
  if (window.__YTM_CONNECT_PAGE_BRIDGE__) return;
  window.__YTM_CONNECT_PAGE_BRIDGE__ = true;

  function getMoviePlayer() {
    return document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  }

  function extractPlaylistIdsFromPlayer(player) {
    try {
      if (player && typeof player.getPlaylist === 'function') {
        const list = player.getPlaylist();
        if (Array.isArray(list)) return list;
      }
    } catch {}
    return [];
  }

  function extractQueueItemsFromPolymer(playlistIds = []) {
    const items = [];
    try {
      const domItems = document.querySelectorAll('ytmusic-player-queue#queue ytmusic-player-queue-item');
      const nodeList =
        domItems && domItems.length > 0
          ? domItems
          : document.querySelectorAll('ytmusic-player-queue-item');

      nodeList.forEach((el, idx) => {
        if (idx >= 30) return;
        const data = el.data || el.__data?.data || el.item || {};
        let videoId =
          data.videoId ||
          data.navigationEndpoint?.watchEndpoint?.videoId ||
          playlistIds[idx] ||
          '';

        const titleEl = el.querySelector('.song-title');
        const bylineEl = el.querySelector('.byline');
        const durationEl = el.querySelector('.duration');
        const imgEl = el.querySelector('img');

        const title = (titleEl && titleEl.textContent ? titleEl.textContent.trim() : '') ||
          data?.title?.runs?.[0]?.text ||
          '';
        const artist = (bylineEl && bylineEl.textContent ? bylineEl.textContent.trim() : '') ||
          data?.longBylineText?.runs?.[0]?.text ||
          '';
        const durationText =
          (durationEl && durationEl.textContent ? durationEl.textContent.trim() : '') ||
          data?.lengthText?.runs?.[0]?.text ||
          '';
        let artwork = (imgEl && imgEl.src ? imgEl.src : '') ||
          data?.thumbnail?.thumbnails?.[0]?.url ||
          '';
        if ((!artwork || artwork.startsWith('data:')) && videoId) {
          artwork = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        }

        const selected =
          el.hasAttribute('selected') ||
          el.getAttribute('play-button-state') === 'playing' ||
          el.getAttribute('play-button-state') === 'paused' ||
          Boolean(data.selected);

        if (title) {
          items.push({
            index: idx,
            videoId,
            title,
            artist,
            durationText,
            artwork,
            selected
          });
        }
      });
    } catch {}
    return items;
  }

  function extractInternalPlayerMeta() {
    const player = getMoviePlayer();
    const result = {
      videoId: '',
      listId: '',
      title: '',
      artist: '',
      currentTime: null,
      duration: null,
      playlistIndex: -1,
      queue: []
    };

    let playlistIds = [];

    try {
      if (player) {
        if (typeof player.getVideoData === 'function') {
          const data = player.getVideoData();
          if (data) {
            result.videoId = data.video_id || '';
            result.title = data.title || '';
            result.artist = data.author || '';
          }
        }
        if (typeof player.getPlaylistId === 'function') {
          result.listId = player.getPlaylistId() || '';
        }
        if (typeof player.getPlaylistIndex === 'function') {
          result.playlistIndex = Number(player.getPlaylistIndex());
        }
        playlistIds = extractPlaylistIdsFromPlayer(player);

        if (typeof player.getVideoUrl === 'function' && (!result.videoId || !result.listId)) {
          const videoUrl = player.getVideoUrl();
          if (videoUrl) {
            const parsed = new URL(videoUrl, window.location.origin);
            if (!result.videoId) result.videoId = parsed.searchParams.get('v') || '';
            if (!result.listId) result.listId = parsed.searchParams.get('list') || '';
          }
        }
        if (typeof player.getCurrentTime === 'function') {
          result.currentTime = Number(player.getCurrentTime()) || 0;
        }
        if (typeof player.getDuration === 'function') {
          result.duration = Number(player.getDuration()) || 0;
        }
      }
    } catch {
      // ignore internal player read errors
    }

    try {
      const playerBar = document.querySelector('ytmusic-player-bar');
      if (playerBar) {
        const currentItem =
          playerBar.currentItem_ ||
          playerBar.playerPage?.currentItem ||
          playerBar.__data?.currentItem;
        if (currentItem?.videoId && !result.videoId) {
          result.videoId = currentItem.videoId;
        }
      }
    } catch {}

    result.queue = extractQueueItemsFromPolymer(playlistIds);
    return result;
  }

  function broadcastMeta() {
    const meta = extractInternalPlayerMeta();
    window.dispatchEvent(
      new CustomEvent('ytm-connect:page-meta', {
        detail: meta
      })
    );
  }

  window.addEventListener('ytm-connect:page-command', (event) => {
    const detail = event.detail || {};
    const { action, payload = {} } = detail;
    const player = getMoviePlayer();

    try {
      switch (action) {
        case 'QUERY_META': {
          broadcastMeta();
          break;
        }

        case 'PLAY': {
          if (player && typeof player.playVideo === 'function') {
            player.playVideo();
          }
          setTimeout(broadcastMeta, 120);
          break;
        }

        case 'PAUSE': {
          if (player && typeof player.pauseVideo === 'function') {
            player.pauseVideo();
          }
          setTimeout(broadcastMeta, 120);
          break;
        }

        case 'NEXT': {
          if (player && typeof player.nextVideo === 'function') {
            player.nextVideo();
          }
          setTimeout(broadcastMeta, 300);
          break;
        }

        case 'PREV': {
          if (player && typeof player.previousVideo === 'function') {
            player.previousVideo();
          }
          setTimeout(broadcastMeta, 300);
          break;
        }

        case 'SEEK': {
          const seconds = Number(payload.time ?? payload.value ?? 0);
          if (player && typeof player.seekTo === 'function' && Number.isFinite(seconds)) {
            player.seekTo(seconds, true);
          }
          setTimeout(broadcastMeta, 120);
          break;
        }

        case 'VOLUME': {
          const vol = Math.max(0, Math.min(100, Number(payload.volume ?? payload.value ?? 100)));
          if (player && typeof player.setVolume === 'function') {
            player.setVolume(vol);
          }
          setTimeout(broadcastMeta, 120);
          break;
        }

        case 'PLAY_QUEUE_INDEX': {
          const idx = Number(payload.index ?? payload.value ?? -1);
          if (idx >= 0) {
            const domItems = document.querySelectorAll(
              'ytmusic-player-queue#queue ytmusic-player-queue-item'
            );
            const targetItem = domItems[idx];
            if (targetItem) {
              const playBtn =
                targetItem.querySelector('ytmusic-play-button-renderer') ||
                targetItem.querySelector('#play-button') ||
                targetItem;
              playBtn.click();
            } else if (player && typeof player.playVideoAt === 'function') {
              player.playVideoAt(idx);
            }
          }
          setTimeout(broadcastMeta, 350);
          break;
        }

        case 'LOAD_AND_PLAY': {
          const { videoId, listId, startSeconds = 0, autoPlay = true } = payload;
          let handled = false;

          if (player && videoId) {
            const currentMeta = extractInternalPlayerMeta();
            if (currentMeta.videoId === videoId) {
              if (typeof player.seekTo === 'function') {
                player.seekTo(Number(startSeconds) || 0, true);
              }
              if (autoPlay && typeof player.playVideo === 'function') {
                player.playVideo();
              }
              handled = true;
            } else if (typeof player.loadVideoById === 'function') {
              player.loadVideoById({
                videoId,
                startSeconds: Number(startSeconds) || 0
              });
              if (autoPlay && typeof player.playVideo === 'function') {
                setTimeout(() => {
                  try {
                    player.seekTo(Number(startSeconds) || 0, true);
                    player.playVideo();
                  } catch {}
                }, 350);
              }
              handled = true;
            }
          }

          window.dispatchEvent(
            new CustomEvent('ytm-connect:load-result', {
              detail: { handled, videoId, listId, startSeconds }
            })
          );
          setTimeout(broadcastMeta, 400);
          break;
        }
      }
    } catch (err) {
      console.warn('[YTM-Connect PageBridge] Command failed:', err);
    }
  });

  setInterval(broadcastMeta, 1500);
  setTimeout(broadcastMeta, 300);
})();
