/**
 * YTM-Connect — Page World Bridge (Injected into MAIN world of music.youtube.com)
 * Provides direct access to YouTube Music's internal #movie_player API for
 * exact videoId/listId extraction and zero-reload LOAD_AND_PLAY handoff.
 */
(function () {
  if (window.__YTM_CONNECT_PAGE_BRIDGE__) return;
  window.__YTM_CONNECT_PAGE_BRIDGE__ = true;

  function getMoviePlayer() {
    return document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  }

  function extractInternalPlayerMeta() {
    const player = getMoviePlayer();
    const result = {
      videoId: '',
      listId: '',
      title: '',
      artist: '',
      currentTime: null,
      duration: null
    };

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

    // Fallback: inspect ytmusic-player-bar Polymer properties if available
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
    } catch {
      // ignore
    }

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
          break;
        }

        case 'PAUSE': {
          if (player && typeof player.pauseVideo === 'function') {
            player.pauseVideo();
          }
          break;
        }

        case 'NEXT': {
          if (player && typeof player.nextVideo === 'function') {
            player.nextVideo();
          }
          break;
        }

        case 'PREV': {
          if (player && typeof player.previousVideo === 'function') {
            player.previousVideo();
          }
          break;
        }

        case 'SEEK': {
          const seconds = Number(payload.time ?? payload.value ?? 0);
          if (player && typeof player.seekTo === 'function' && Number.isFinite(seconds)) {
            player.seekTo(seconds, true);
          }
          break;
        }

        case 'VOLUME': {
          const vol = Math.max(0, Math.min(100, Number(payload.volume ?? payload.value ?? 100)));
          if (player && typeof player.setVolume === 'function') {
            player.setVolume(vol);
          }
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
                  } catch {
                    // ignore
                  }
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
