/* ============================================================
   gallery.js — Standalone script for gallery.html
   Dashboard-identical layout (.feat-item zigzag), progressive
   chunk rendering (anti-lag), and rich interactive animations.
   ============================================================ */

(function () {
  'use strict';

  const supabaseClient = window.PDD_SUPABASE_CONFIG?.url && window.PDD_SUPABASE_CONFIG?.anonKey && window.supabase
    ? window.supabase.createClient(window.PDD_SUPABASE_CONFIG.url, window.PDD_SUPABASE_CONFIG.anonKey)
    : null;

  let works = [];
  let tools = [];
  let currentFilteredWorks = [];
  let renderedCount = 0;
  let isRenderingBatch = false;
  const BATCH_SIZE = 4; // Progressive chunk size to prevent lag

  /* ── Helpers ─────────────────────────────────────────────── */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(str) {
    if (!str) return '';
    try {
      return new Date(str).toLocaleDateString('id-ID', { year: 'numeric', month: 'long' });
    } catch (_) { return str; }
  }

  function extractDriveFileId(value) {
    if (!value) return null;
    const input = value.trim();
    const match = input.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || input.match(/\/d\/([a-zA-Z0-9_-]+)/) || input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : (/^[a-zA-Z0-9_-]{10,}$/.test(input) ? input : null);
  }

  function extractDriveFolderId(value) {
    if (!value) return null;
    const input = value.trim();
    const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/) || input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : (/^[a-zA-Z0-9_-]{15,}$/.test(input) ? input : null);
  }

  function isDriveWork(w) {
    return w.media_type === 'drive_album' || w.media_type === 'album' || (w.drive_url && w.drive_url.includes('/folders/'));
  }

  function isFeaturedWork(w) {
    if (!w) return false;
    try {
      const localMap = JSON.parse(localStorage.getItem('pdd_featured_works') || '{}');
      if (localMap && localMap[String(w.id)] !== undefined) {
        return localMap[String(w.id)] === true;
      }
    } catch (_) {}
    return w.is_featured === true || w.is_featured === 'true' || w.is_featured === 1 || w.is_featured === '1';
  }

  function getWorkToolNames(work) {
    if (Array.isArray(work.tool_ids) && work.tool_ids.length > 0) {
      const names = work.tool_ids.map(id => tools.find(t => String(t.id) === String(id))?.name).filter(Boolean);
      if (names.length > 0) return names;
    }
    if (work.tools?.name) return [work.tools.name];
    if (work.tool_id) {
      const found = tools.find(t => String(t.id) === String(work.tool_id));
      if (found) return [found.name];
    }
    return [];
  }

  /* ── Intersection Observers ──────────────────────────────── */
  let revealObserver = null;
  function getRevealObserver() {
    if (!revealObserver && 'IntersectionObserver' in window) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    }
    return revealObserver;
  }

  // Optimize video decoding: only play video when visible in viewport
  let videoViewportObserver = null;
  function getVideoViewportObserver() {
    if (!videoViewportObserver && 'IntersectionObserver' in window) {
      videoViewportObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const video = entry.target;
          if (entry.isIntersecting) {
            // Lazy load video src if stored in data-lazy-src
            if (video.dataset.lazySrc && !video.src) {
              video.src = video.dataset.lazySrc;
              video.load();
            }
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      }, { threshold: 0.15, rootMargin: '100px 0px' });
    }
    return videoViewportObserver;
  }

  /* ── Render single item HTML (Dashboard-Identical Zigzag) ──── */
  function createFeaturedItemHtml(work, index) {
    const isReversed = index % 2 !== 0;
    const isPhoto = isDriveWork(work);
    const toolNames = getWorkToolNames(work);
    const toolsBadges = toolNames.map(name => `<span class="feat-tool-tag">${escapeHtml(name)}</span>`).join('');
    const num = String(index + 1).padStart(2, '0');
    const isFeat = isFeaturedWork(work);

    const typeBadgeHtml = isPhoto
      ? `<span class="feat-caption__badge-pill feat-caption__badge-pill--photo">📷 Album Foto</span>`
      : `<span class="feat-caption__badge-pill feat-caption__badge-pill--video">🎬 Video</span>`;
    const featBadgeHtml = isFeat
      ? `<span class="feat-caption__badge-pill feat-caption__badge-pill--feat">⭐ Pilihan</span>`
      : '';

    if (!isPhoto) {
      // ── Video Item ──
      const videoSrc = escapeHtml(work.r2_url || '');
      const desc = work.description ? escapeHtml(work.description) : 'Karya video dokumentasi dengan teknik sinematik yang kuat.';

      let videoPreviewHtml = '';
      if (videoSrc) {
        const fId = extractDriveFileId(videoSrc);
        if (fId) {
          const thumbUrl = `https://drive.google.com/thumbnail?id=${fId}&sz=w1200`;
          videoPreviewHtml = `<img class="feat-video-preview" src="${thumbUrl}" alt="${escapeHtml(work.title || 'Video')}" loading="lazy" referrerpolicy="no-referrer" onerror="if(!this.dataset.triedLh3){ this.dataset.triedLh3='1'; this.src='https://lh3.googleusercontent.com/d/${fId}'; }">`;
        } else {
          videoPreviewHtml = `<video class="feat-video-preview" data-lazy-src="${videoSrc}" preload="metadata" muted playsinline loop></video>`;
        }
      }

      const mediaCard = `
        <div class="feat-item__media">
          <div class="feat-media-card">
            <div class="feat-media-card__inner feat-media-card__inner--video">
              <div class="feat-video-thumb" data-video-src="${videoSrc}" data-video-title="${escapeHtml(work.title || 'Video')}">
                ${videoPreviewHtml}
                <div class="feat-video-thumb__overlay">
                  <div class="feat-video-thumb__play">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                  <div class="feat-video-thumb__label">🎬 Putar Video</div>
                </div>
              </div>
            </div>
          </div>
        </div>`;

      const captionCard = `
        <div class="feat-item__caption">
          <div class="feat-caption">
            <span class="feat-caption__num">${num}</span>
            <div class="feat-caption__meta-row">
              <div class="feat-caption__date">${formatDate(work.work_date)}</div>
              ${typeBadgeHtml}
              ${featBadgeHtml}
            </div>
            <h3 class="feat-caption__title">${escapeHtml(work.title || 'Karya Video')}</h3>
            <p class="feat-caption__desc">${desc}</p>
            ${toolNames.length ? `<div class="feat-caption__tools">${toolsBadges}</div>` : ''}
            <button class="feat-caption__cta" data-video-src="${videoSrc}" data-video-title="${escapeHtml(work.title || 'Video')}">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>
              Putar Video
            </button>
          </div>
        </div>`;

      return `<div class="feat-item glass-card${isReversed ? ' feat-item--reversed' : ''}" data-reveal>
        ${isReversed ? captionCard + mediaCard : mediaCard + captionCard}
      </div>`;
    } else {
      // ── Photo / Album Item ──
      const desc = work.description ? escapeHtml(work.description) : 'Album foto dokumentasi dengan ratusan momen yang diabadikan.';
      let coverUrl = work.r2_url || work.file_path || '';
      let driveFileId = extractDriveFileId(coverUrl);
      if (!driveFileId && work.drive_file_id && !work.drive_url?.includes('/folders/')) {
        driveFileId = work.drive_file_id;
      }
      if (driveFileId) {
        coverUrl = `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1200`;
      }
      const folderId = work.drive_file_id || extractDriveFolderId(work.drive_url) || '';
      const driveUrl = work.drive_url || '';

      const mediaCard = `
        <div class="feat-item__media">
          <div class="feat-media-card">
            <div class="feat-media-card__inner feat-media-card__inner--photo">
              <div class="feat-photo-thumb is-drive-album" data-drive-folder="${escapeHtml(folderId)}" data-drive-url="${escapeHtml(driveUrl)}" data-title="${escapeHtml(work.title || 'Album Foto')}">
                ${coverUrl
                  ? `<img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(work.title || 'Album')}" loading="lazy" referrerpolicy="no-referrer" onerror="if(!this.dataset.fallback && '${driveFileId || ''}'){ this.dataset.fallback='1'; this.src='https://lh3.googleusercontent.com/d/${driveFileId}'; } else { this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex'; }">
                     <div class="feat-photo-thumb__fallback" style="display:none;">
                       <span class="feat-photo-thumb__fallback-icon">📷</span>
                       <span class="feat-photo-thumb__fallback-text">Album Foto Dokumentasi</span>
                       <span class="feat-photo-thumb__fallback-hint">Klik untuk membuka galeri</span>
                     </div>`
                  : `<div class="feat-photo-thumb__fallback">
                       <span class="feat-photo-thumb__fallback-icon">📷</span>
                       <span class="feat-photo-thumb__fallback-text">Album Foto Dokumentasi</span>
                       <span class="feat-photo-thumb__fallback-hint">Klik untuk membuka galeri</span>
                     </div>`}
                <div class="feat-photo-thumb__overlay">
                  <span>📁 Buka Album</span>
                </div>
              </div>
            </div>
          </div>
        </div>`;

      const captionCard = `
        <div class="feat-item__caption">
          <div class="feat-caption">
            <span class="feat-caption__num">${num}</span>
            <div class="feat-caption__meta-row">
              <div class="feat-caption__date">${formatDate(work.work_date)}</div>
              ${typeBadgeHtml}
              ${featBadgeHtml}
            </div>
            <h3 class="feat-caption__title">${escapeHtml(work.title || 'Album Foto')}</h3>
            <p class="feat-caption__desc">${desc}</p>
            ${toolNames.length ? `<div class="feat-caption__tools">${toolsBadges}</div>` : ''}
            <button class="feat-caption__cta feat-caption__cta--photo is-drive-album" data-drive-folder="${escapeHtml(folderId)}" data-drive-url="${escapeHtml(driveUrl)}" data-title="${escapeHtml(work.title || 'Album Foto')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M3 3h18v14H3zM8 21h8M12 17v4"/></svg>
              Buka Album Foto
            </button>
          </div>
        </div>`;

      return `<div class="feat-item glass-card${isReversed ? ' feat-item--reversed' : ''}" data-reveal>
        ${isReversed ? captionCard + mediaCard : mediaCard + captionCard}
      </div>`;
    }
  }

  /* ── Progressive Batch Renderer (Anti-Lag) ────────────────── */
  function renderNextBatch(animate = true) {
    if (isRenderingBatch) return;
    if (renderedCount >= currentFilteredWorks.length) {
      updateSentinelState();
      return;
    }

    isRenderingBatch = true;
    const listEl = document.getElementById('gallery-list');
    if (!listEl) {
      isRenderingBatch = false;
      return;
    }

    const nextBatch = currentFilteredWorks.slice(renderedCount, renderedCount + BATCH_SIZE);
    const fragment = document.createDocumentFragment();
    const tempWrapper = document.createElement('div');

    const newCardsHtml = nextBatch.map((work, i) => createFeaturedItemHtml(work, renderedCount + i)).join('');
    tempWrapper.innerHTML = newCardsHtml;

    const newCards = Array.from(tempWrapper.children);
    newCards.forEach((card, i) => {
      fragment.appendChild(card);
    });

    listEl.appendChild(fragment);

    // Attach IntersectionObserver for scroll reveal and video lazy loading
    const obs = getRevealObserver();
    const videoObs = getVideoViewportObserver();

    newCards.forEach((card, i) => {
      if (obs) obs.observe(card);
      else {
        card.classList.add('visible');
        card.classList.add('is-visible');
      }

      // Check for videos
      const video = card.querySelector('video.feat-video-preview');
      if (video && videoObs) {
        videoObs.observe(video);
      }
    });

    renderedCount += nextBatch.length;
    updateSentinelState();

    isRenderingBatch = false;
  }

  function updateSentinelState() {
    const sentinelEl = document.getElementById('gallery-sentinel');
    const endEl = document.getElementById('gallery-end');

    if (currentFilteredWorks.length === 0) {
      if (sentinelEl) sentinelEl.hidden = true;
      if (endEl) endEl.hidden = true;
      return;
    }

    const hasMore = renderedCount < currentFilteredWorks.length;
    if (sentinelEl) sentinelEl.hidden = !hasMore;
    if (endEl) {
      endEl.hidden = hasMore;
      if (!hasMore) {
        endEl.innerHTML = `<span>✦ Menampilkan seluruh ${currentFilteredWorks.length} karya</span>`;
      }
    }
  }

  /* ── Setup Infinite Scroll Sentinel ────────────────────────── */
  let sentinelObserver = null;
  function initSentinelObserver() {
    const sentinelEl = document.getElementById('gallery-sentinel');
    if (!sentinelEl || !('IntersectionObserver' in window)) return;

    if (sentinelObserver) sentinelObserver.disconnect();

    sentinelObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        if (renderedCount < currentFilteredWorks.length) {
          renderNextBatch(true);
        }
      }
    }, { rootMargin: '300px 0px' });

    sentinelObserver.observe(sentinelEl);
  }

  /* ── Switch Category & Animate ────────────────────────────── */
  function switchGalleryCategory(mediaType, animate = true) {
    const listEl  = document.getElementById('gallery-list');
    const emptyEl = document.getElementById('gallery-empty');
    const emptyIcon = document.getElementById('gallery-empty-icon');
    const emptyText = document.getElementById('gallery-empty-text');
    const chipEl  = document.getElementById('gallery-hero-chip');
    const titleEl = document.getElementById('gallery-hero-title');
    const subEl   = document.getElementById('gallery-hero-sub');
    if (!listEl) return;

    if (mediaType === 'video') {
      currentFilteredWorks = works.filter(w => !isDriveWork(w));
      if (chipEl) chipEl.innerHTML = '<span>🎬</span> Karya Video';
      if (titleEl) titleEl.innerHTML = 'Koleksi <em>video</em><br>dokumentasi.';
      if (subEl) subEl.textContent = 'Karya video dan sinematografi pilihan yang telah diproduksi.';
      if (emptyIcon) emptyIcon.textContent = '🎬';
      if (emptyText) emptyText.innerHTML = 'Belum ada karya video yang ditampilkan.<br><small>Karya video yang ditambahkan akan tampil di sini.</small>';
    } else if (mediaType === 'drive_album' || mediaType === 'photo' || mediaType === 'foto') {
      currentFilteredWorks = works.filter(w => isDriveWork(w));
      if (chipEl) chipEl.innerHTML = '<span>📷</span> Album Foto';
      if (titleEl) titleEl.innerHTML = 'Koleksi <em>album</em><br><em>foto</em> dokumentasi.';
      if (subEl) subEl.textContent = 'Ratusan momen dan arsip visual yang diabadikan dalam album foto.';
      if (emptyIcon) emptyIcon.textContent = '📷';
      if (emptyText) emptyText.innerHTML = 'Belum ada album foto yang ditampilkan.<br><small>Album foto yang ditambahkan akan tampil di sini.</small>';
    } else {
      currentFilteredWorks = [...works];
      if (chipEl) chipEl.innerHTML = '<span>✦</span> Semua Karya';
      if (titleEl) titleEl.innerHTML = 'Galeri <em>lengkap</em><br>karya kami.';
      if (subEl) subEl.textContent = 'Semua karya video dan album foto dalam satu tempat.';
      if (emptyIcon) emptyIcon.textContent = '✦';
      if (emptyText) emptyText.innerHTML = 'Belum ada karya yang ditampilkan.<br><small>Karya yang ditambahkan akan tampil di sini.</small>';
    }

    renderedCount = 0;

    if (!animate) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = currentFilteredWorks.length > 0;
      renderNextBatch(false);
      return;
    }

    // Smooth exit transition
    listEl.style.transition = 'opacity 0.22s cubic-bezier(0.4, 0, 1, 1), transform 0.22s cubic-bezier(0.4, 0, 1, 1)';
    listEl.style.opacity = '0';
    listEl.style.transform = 'translateY(14px) scale(0.98)';

    setTimeout(() => {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = currentFilteredWorks.length > 0;

      listEl.style.transition = 'none';
      listEl.style.opacity = '1';
      listEl.style.transform = 'translateY(0) scale(1)';

      renderNextBatch(true);
    }, 200);
  }

  window.switchGalleryCategory = switchGalleryCategory;

  /* ── Gallery Nav Controller (Sliding Pill) ────────────────── */
  function initGalleryNav() {
    const nav     = document.getElementById('db-nav');
    const inner   = nav?.querySelector('.db-nav__inner');
    const linksEl = nav?.querySelector('.db-links');
    const links   = Array.from(document.querySelectorAll('.db-link'));
    if (!nav || !linksEl || !links.length) return;

    let pill = linksEl.querySelector('.db-nav__pill');
    if (!pill) {
      pill = document.createElement('span');
      pill.className = 'db-nav__pill';
      pill.setAttribute('aria-hidden', 'true');
      linksEl.insertBefore(pill, linksEl.firstChild);
    }

    let pillReady = false;

    function movePill(targetLink, animate = true) {
      if (!targetLink) return;
      const linksRect = linksEl.getBoundingClientRect();
      const linkRect  = targetLink.getBoundingClientRect();
      const left  = linkRect.left - linksRect.left;
      const width = linkRect.width;

      if (!pillReady || !animate) {
        pill.style.transition = 'none';
        pill.style.left  = left  + 'px';
        pill.style.width = width + 'px';
        pill.style.opacity = '1';
        pill.getBoundingClientRect();
        pill.style.transition = '';
        pillReady = true;
      } else {
        pill.style.left  = left  + 'px';
        pill.style.width = width + 'px';
      }
    }

    function setActive(sectionId, animate = true) {
      const target = links.find(l => l.dataset.section === sectionId);
      if (!target) return;
      links.forEach(l => l.classList.toggle('active', l === target));
      movePill(target, animate);
    }

    links.forEach(link => {
      link.addEventListener('click', e => {
        const sec = link.dataset.section;
        if (sec === 'all' || sec === 'video' || sec === 'foto') {
          e.preventDefault();
          setActive(sec, true);
          window.history.pushState(null, '', link.href);
          let targetType = 'all';
          if (sec === 'video') targetType = 'video';
          else if (sec === 'foto') targetType = 'drive_album';
          switchGalleryCategory(targetType, true);
        }
      });
    });

    window.addEventListener('popstate', () => {
      const params = new URLSearchParams(window.location.search);
      const type = params.get('type') || 'all';
      let targetSec = 'all';
      if (type === 'video') targetSec = 'video';
      else if (type === 'drive_album' || type === 'photo' || type === 'foto') targetSec = 'foto';
      setActive(targetSec, true);
      switchGalleryCategory(type, true);
    });

    window.addEventListener('scroll', () => {
      inner?.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });

    requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      const type = params.get('type');
      let activeTarget = null;
      if (type === 'video') {
        activeTarget = links.find(l => l.dataset.section === 'video');
      } else if (type === 'drive_album' || type === 'photo' || type === 'foto') {
        activeTarget = links.find(l => l.dataset.section === 'foto');
      } else {
        activeTarget = links.find(l => l.dataset.section === 'all') || links[0];
      }
      if (activeTarget) {
        links.forEach(l => l.classList.toggle('active', l === activeTarget));
        movePill(activeTarget, false);
      }
    });

    window.addEventListener('resize', () => {
      const active = links.find(l => l.classList.contains('active')) || links[0];
      movePill(active, false);
    }, { passive: true });
  }

  /* ── Interactive 3D Tilt & Specular Spotlight (Dashboard) ─── */
  function initFeaturedCardEffects() {
    document.addEventListener('mousemove', e => {
      const card = e.target.closest('.feat-item.glass-card');
      if (!card) return;

      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -2.8;
      const rotateY = ((x - centerX) / centerX) * 2.8;

      card.style.transform = `perspective(1200px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-6px)`;
      card.style.transition = 'transform 0.1s cubic-bezier(0.1, 1, 0.1, 1)';
    }, { passive: true });

    document.addEventListener('mouseout', e => {
      const card = e.target.closest?.('.feat-item.glass-card');
      if (!card) return;
      const related = e.relatedTarget;
      if (related && card.contains(related)) return;

      card.style.transform = '';
      card.style.transition = 'transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)';
    }, { passive: true });
  }

  /* ── Cursor Glow Following Mouse ───────────────────────────── */
  function initCursorGlow() {
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const glow = document.createElement('div');
    glow.style.cssText = [
      'position:fixed', 'pointer-events:none', 'z-index:9999',
      'width:350px', 'height:350px', 'border-radius:50%',
      'background:radial-gradient(circle,rgba(167,139,250,0.08) 0%,transparent 70%)',
      'transform:translate(-50%,-50%)',
      'will-change:left,top',
      'transition:left 0.12s ease,top 0.12s ease',
    ].join(';');
    document.body.appendChild(glow);

    let mx = 0, my = 0, gx = 0, gy = 0;
    document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });

    (function loop() {
      gx += (mx - gx) * 0.09;
      gy += (my - gy) * 0.09;
      glow.style.left = gx + 'px';
      glow.style.top  = gy + 'px';
      requestAnimationFrame(loop);
    })();
  }

  /* ── Floating Background Particles ─────────────────────────── */
  function initParticles() {
    const body = document.body;
    const count = window.innerWidth > 700 ? 16 : 8;
    const colours = ['rgba(167,139,250,', 'rgba(244,114,182,', 'rgba(56,189,248,', 'rgba(52,211,153,'];

    for (let i = 0; i < count; i++) {
      const p   = document.createElement('div');
      const sz  = 1.5 + Math.random() * 3.5;
      const col = colours[Math.floor(Math.random() * colours.length)];
      const op  = (0.3 + Math.random() * 0.5).toFixed(2);
      const x   = Math.random() * 100;
      const y   = Math.random() * 300;
      const dur = 12 + Math.random() * 20;
      const del = Math.random() * 10;

      Object.assign(p.style, {
        position: 'fixed',
        width: sz + 'px', height: sz + 'px',
        borderRadius: '50%',
        background: `${col}${op})`,
        left: x + 'vw', top: y + 'vh',
        pointerEvents: 'none',
        zIndex: '0',
        boxShadow: `0 0 ${sz * 5}px ${col}0.5)`,
        animation: `orbDrift ${dur}s ease-in-out ${del}s infinite`,
      });
      body.appendChild(p);
    }
  }

  /* ── Drive Album Modal ────────────────────────────────────── */
  function initDriveModal() {
    const modal = document.getElementById('drive-album-modal');
    if (!modal) return;
    const backdrop = document.getElementById('drive-modal-backdrop');
    const closeBtn = document.getElementById('drive-modal-close');
    const screenClose = document.getElementById('drive-modal-screen-close');
    const titleEl = document.getElementById('drive-modal-title');
    const extLink = document.getElementById('drive-modal-ext-link');
    const iframe  = document.getElementById('drive-modal-iframe');
    const loading = document.getElementById('drive-modal-loading');

    function open(folderId, title, rawUrl) {
      if (!folderId) return;
      if (titleEl) titleEl.textContent = title || 'Galeri Foto';
      const driveUrl = rawUrl || `https://drive.google.com/drive/folders/${folderId}`;
      if (extLink) extLink.href = driveUrl;
      if (loading) loading.style.display = 'flex';
      if (iframe) {
        iframe.src = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#grid`;
        iframe.onload = () => { if (loading) loading.style.display = 'none'; };
      }
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }

    function close() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      if (iframe) iframe.src = '';
      document.body.classList.remove('modal-open');
    }

    closeBtn?.addEventListener('click', close);
    screenClose?.addEventListener('click', close);
    backdrop?.addEventListener('click', close);
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('is-open')) close(); });

    document.addEventListener('click', e => {
      const el = e.target.closest('.is-drive-album');
      if (!el) return;
      e.preventDefault();
      open(el.dataset.driveFolder, el.dataset.title, el.dataset.driveUrl);
    });
  }

  /* ── Video Modal ──────────────────────────────────────────── */
  function initVideoModal() {
    const modal = document.getElementById('video-modal');
    if (!modal) return;
    const backdrop  = document.getElementById('video-modal-backdrop');
    const closeBtn  = document.getElementById('video-modal-close');
    const screenClose = document.getElementById('video-modal-screen-close');
    const titleEl   = document.getElementById('video-modal-title');
    const player    = document.getElementById('video-modal-player');

    function open(src, title) {
      if (!src) return;
      if (titleEl) titleEl.textContent = title || 'Video';
      if (player) { player.src = src; player.load(); player.play().catch(() => {}); }
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }

    function close() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      if (player) { player.pause(); player.src = ''; }
      document.body.classList.remove('modal-open');
    }

    closeBtn?.addEventListener('click', close);
    screenClose?.addEventListener('click', close);
    backdrop?.addEventListener('click', close);
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('is-open')) close(); });

    document.addEventListener('click', e => {
      const el = e.target.closest('[data-video-src]');
      if (!el || el.closest('.is-drive-album')) return;
      const src   = el.getAttribute('data-video-src') || el.closest('[data-video-src]')?.getAttribute('data-video-src');
      const title = el.getAttribute('data-video-title') || el.closest('[data-video-title]')?.getAttribute('data-video-title');
      if (src) open(src, title);
    });
  }

  /* ── Animated Mesh Background (Gallery)
     Optimasi Android: viewport canvas, 30fps mobile, blob lebih kecil. ── */
  function initMesh() {
    const canvas = document.getElementById('mesh-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const colours = [[99,60,219],[244,114,182],[56,189,248],[167,139,250],[52,211,153]];
    const isMobile = window.innerWidth < 768;
    const blobs = Array.from({ length: isMobile ? 4 : 6 }, (_, i) => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * (isMobile ? 0.4 : 0.8),
      vy: (Math.random() - 0.5) * (isMobile ? 0.3 : 0.6),
      r: isMobile ? (110 + Math.random() * 110) : (260 + Math.random() * 340),
      colour: colours[i % colours.length],
      phase: Math.random() * Math.PI * 2, speed: 0.003 + Math.random() * 0.003,
    }));
    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight; // viewport only
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });
    const frameBudget = isMobile ? 33 : 0;
    let lastT = 0;
    function draw(t) {
      requestAnimationFrame(draw);
      if (t - lastT < frameBudget) return;
      lastT = t;
      ctx.fillStyle = 'rgba(6,6,16,0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      blobs.forEach(b => {
        b.phase += b.speed;
        b.x += b.vx + Math.sin(b.phase) * 0.5;
        b.y += b.vy + Math.cos(b.phase * 0.7) * 0.4;
        if (b.x < -b.r) b.x = canvas.width + b.r;
        if (b.x > canvas.width + b.r) b.x = -b.r;
        if (b.y < -b.r) b.y = canvas.height + b.r;
        if (b.y > canvas.height + b.r) b.y = -b.r;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, `rgba(${b.colour.join(',')},0.14)`);
        g.addColorStop(1, `rgba(${b.colour.join(',')},0)`);
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      });
    }
    requestAnimationFrame(draw);
  }

  /* ── Bootstrap ────────────────────────────────────────────── */
  async function init() {
    initMesh();
    initGalleryNav();
    initCursorGlow();
    initParticles();
    initFeaturedCardEffects();
    initDriveModal();
    initVideoModal();
    initSentinelObserver();

    // Initial check for static reveal items (hero etc.)
    const obs = getRevealObserver();
    document.querySelectorAll('.reveal').forEach(el => obs?.observe(el));

    const listEl = document.getElementById('gallery-list');
    if (!supabaseClient) {
      if (listEl) listEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">Konfigurasi Supabase belum diisi.</p>';
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const initialMedia = params.get('type') || 'all';

    try {
      const [worksResult, toolsResult, profileResult] = await Promise.all([
        supabaseClient.from('works').select('*, tools(name)').order('work_date', { ascending: false }),
        supabaseClient.from('tools').select('*').order('name'),
        supabaseClient.from('owner_profile').select('*').eq('id', true).maybeSingle(),
      ]);

      if (worksResult.error) throw worksResult.error;
      if (toolsResult.error) throw toolsResult.error;

      const localMap = (function() {
        try { return JSON.parse(localStorage.getItem('pdd_featured_works') || '{}'); } catch(_) { return {}; }
      })();

      works = (worksResult.data || []).map(w => {
        if (localMap && localMap[String(w.id)] !== undefined) {
          w.is_featured = localMap[String(w.id)] === true;
        } else {
          w.is_featured = w.is_featured === true || w.is_featured === 'true' || w.is_featured === 1;
        }
        return w;
      });
      tools = toolsResult.data || [];

      // Update owner brand and footer
      if (profileResult?.data) {
        const p = profileResult.data;
        const brandEl = document.getElementById('owner-brand-name');
        const avatarEl = document.getElementById('owner-avatar');
        const footerNameEl = document.getElementById('footer-owner-name');
        const footerAvatarEl = document.getElementById('footer-owner-avatar');
        const footerCopyEl = document.getElementById('footer-copyright-name');

        if (brandEl && p.name) brandEl.textContent = p.name;
        if (avatarEl && p.name) avatarEl.textContent = p.name.charAt(0).toUpperCase();
        if (footerNameEl && p.name) footerNameEl.textContent = p.name;
        if (footerAvatarEl && p.name) footerAvatarEl.textContent = p.name.charAt(0).toUpperCase();
        if (footerCopyEl && p.name) footerCopyEl.textContent = p.name;

        // Render footer social links if available
        const socialEl = document.getElementById('footer-social-links');
        if (socialEl && Array.isArray(p.social_links)) {
          socialEl.innerHTML = p.social_links.map(s => {
            const platform = escapeHtml(s.platform || 'Link');
            const url = escapeHtml(s.url || '#');
            return `<a class="social-link" href="${url}" target="_blank" rel="noopener noreferrer">${platform} ↗</a>`;
          }).join('');
        }
      }

      switchGalleryCategory(initialMedia, false);
    } catch (err) {
      console.error('Gallery load error:', err);
      if (listEl) listEl.innerHTML = `<p style="color:#f87171;text-align:center;padding:40px">Gagal memuat data: ${err.message}</p>`;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
