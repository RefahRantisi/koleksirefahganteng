/* ============================================================
   dashboard.js — Rich interactive animation engine
   For index.html only: mesh canvas, parallax, nav, counters
   ============================================================ */

(function () {
  'use strict';

  /* ══ 1. ANIMATED MESH CANVAS ═════════════════════════════════
     Optimasi Android Chrome:
     - Canvas = viewport height saja (scrollHeight bisa 10.000px di Android)
     - Throttle 30fps (Android GPU tidak perlu 60fps untuk background blur)
     - Blob lebih sedikit & kecil di layar mobile
  ═════════════════════════════════════════════════════════════ */
  function initMesh() {
    const canvas = document.getElementById('mesh-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const colours = [
      [99, 60, 219],    // violet
      [244, 114, 182],  // pink
      [56, 189, 248],   // cyan
      [167, 139, 250],  // lavender
      [52, 211, 153],   // emerald
    ];

    // Mobile = 4 blob kecil, Desktop = 7 blob
    const isMobile = window.innerWidth < 768;
    const blobCount = isMobile ? 4 : 7;
    const blobR     = isMobile ? 160 + Math.random() * 140 : 280 + Math.random() * 380;

    const blobs = Array.from({ length: blobCount }, (_, i) => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * (isMobile ? 0.4 : 0.8),
      vy: (Math.random() - 0.5) * (isMobile ? 0.3 : 0.6),
      r: isMobile ? (120 + Math.random() * 120) : (280 + Math.random() * 380),
      colour: colours[i % colours.length],
      phase: Math.random() * Math.PI * 2,
      speed: 0.003 + Math.random() * 0.003,
    }));

    function resize() {
      canvas.width  = window.innerWidth;
      // viewport height saja — bukan scrollHeight!
      // scrollHeight bisa 8000px+ dan membuat Android render canvas raksasa
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    // Throttle: 30fps di mobile (33ms), 60fps di desktop (0ms skip)
    const frameBudget = isMobile ? 33 : 0;
    let lastT = 0;
    function draw(t) {
      requestAnimationFrame(draw);
      if (t - lastT < frameBudget) return;
      lastT = t;

      // fillRect fade lebih ringan dari clearRect pada canvas besar
      ctx.fillStyle = 'rgba(6,6,16,0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      blobs.forEach(b => {
        b.phase += b.speed;
        b.x += b.vx + Math.sin(b.phase) * 0.5;
        b.y += b.vy + Math.cos(b.phase * 0.7) * 0.4;

        // Wrap di dalam viewport
        if (b.x < -b.r) b.x = canvas.width + b.r;
        if (b.x > canvas.width + b.r) b.x = -b.r;
        if (b.y < -b.r) b.y = canvas.height + b.r;
        if (b.y > canvas.height + b.r) b.y = -b.r;

        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, `rgba(${b.colour.join(',')},0.16)`);
        g.addColorStop(1, `rgba(${b.colour.join(',')},0)`);

        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      });
    }
    requestAnimationFrame(draw);
  }

  /* ══ 2. FLOATING NAV — sliding pill indicator ═════════════════
     Sebuah .db-nav__pill melayang di dalam .db-links dan bergeser
     mengikuti link aktif dengan transisi spring.
     Bergerak saat: klik link, scroll (intersection observer).
  ══════════════════════════════════════════════════════════════ */
  function initNav() {
    const nav    = document.getElementById('db-nav');
    const inner  = nav?.querySelector('.db-nav__inner');
    const linksEl = nav?.querySelector('.db-links');
    const links  = Array.from(document.querySelectorAll('.db-link'));
    const sects  = document.querySelectorAll('section[id], footer[id]');
    if (!nav || !linksEl || !links.length) return;

    /* ── Create sliding pill ───────────────────────────────────── */
    let pill = linksEl.querySelector('.db-nav__pill');
    if (!pill) {
      pill = document.createElement('span');
      pill.className = 'db-nav__pill';
      pill.setAttribute('aria-hidden', 'true');
      linksEl.insertBefore(pill, linksEl.firstChild);
    }

    /* ── Move pill to target link ─────────────────────────────── */
    let pillReady = false;

    function movePill(targetLink, animate = true) {
      if (!targetLink) return;

      const linksRect = linksEl.getBoundingClientRect();
      const linkRect  = targetLink.getBoundingClientRect();

      const left  = linkRect.left  - linksRect.left;
      const width = linkRect.width;

      if (!pillReady) {
        pill.style.transition = 'none';
        pill.style.left  = left  + 'px';
        pill.style.width = width + 'px';
        pill.style.opacity = '0';
        pill.getBoundingClientRect();
        pill.style.transition = '';
        pill.style.opacity = '1';
        pillReady = true;
      } else if (!animate) {
        pill.style.transition = 'none';
        pill.style.left  = left  + 'px';
        pill.style.width = width + 'px';
        pill.getBoundingClientRect();
        pill.style.transition = '';
      } else {
        pill.style.left  = left  + 'px';
        pill.style.width = width + 'px';
      }
    }

    /* ── Set active link + move pill ─────────────────────────── */
    function setActive(sectionId, animate = true) {
      const target = links.find(l => l.dataset.section === sectionId);
      if (!target) return;

      links.forEach(l => l.classList.toggle('active', l === target));
      movePill(target, animate);
    }

    /* ── Click: move immediately ──────────────────────────────── */
    links.forEach(link => {
      link.addEventListener('click', e => {
        const sec = link.dataset.section;
        if (window.location.pathname.includes('gallery.html')) {
          if (sec === 'video' || sec === 'foto') {
            e.preventDefault();
            setActive(sec, true);
            window.history.pushState(null, '', link.href);
            const targetType = (sec === 'video') ? 'video' : 'drive_album';
            if (typeof window.switchGalleryCategory === 'function') {
              window.switchGalleryCategory(targetType, true);
            }
            return;
          }
        }
        if (sec && sects.length > 0) {
          setActive(sec, true);
        }
      });
    });

    window.addEventListener('popstate', () => {
      if (window.location.pathname.includes('gallery.html')) {
        const params = new URLSearchParams(window.location.search);
        const type = params.get('type') || 'all';
        const targetSec = (type === 'video') ? 'video' : (type === 'drive_album' || type === 'photo' ? 'foto' : null);
        if (targetSec) setActive(targetSec, true);
        if (typeof window.switchGalleryCategory === 'function') {
          window.switchGalleryCategory(type, true);
        }
      }
    });

    /* ── Scroll: Intersection Observer → update active (only when sections present) ── */
    if (sects.length > 0) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            setActive(e.target.id, true);
          }
        });
      }, { threshold: 0.35 });

      sects.forEach(s => io.observe(s));
    }

    /* ── Scroll header darken ─────────────────────────────────── */
    window.addEventListener('scroll', () => {
      inner?.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });

    /* ── Init: snap pill to active link ─────────────────── */
    requestAnimationFrame(() => {
      let activeTarget = null;
      if (window.location.pathname.includes('gallery.html')) {
        const params = new URLSearchParams(window.location.search);
        const type = params.get('type');
        if (type === 'video') {
          activeTarget = links.find(l => l.dataset.section === 'video');
        } else if (type === 'drive_album' || type === 'photo') {
          activeTarget = links.find(l => l.dataset.section === 'foto');
        } else {
          activeTarget = links.find(l => l.dataset.section === 'video' || l.classList.contains('active')) || links[0];
        }
      }
      if (!activeTarget) {
        activeTarget = links.find(l => l.classList.contains('active')) || links[0];
      }
      if (activeTarget) {
        links.forEach(l => l.classList.toggle('active', l === activeTarget));
        movePill(activeTarget, false);
      }
    });

    /* ── Resize: reposition without animation ─────────────────── */
    window.addEventListener('resize', () => {
      const active = links.find(l => l.classList.contains('active')) || links[0];
      movePill(active, false);
    }, { passive: true });
  }

  /* ══ 3. ANIMATED COUNTER ═══════════════════════════════════════ */
  function animateCount(el, target, ms) {
    if (!el || isNaN(target)) return;
    const start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / ms, 1);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(target * e)).padStart(2, '0');
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function initCounters() {
    const el = document.getElementById('project-count');
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        animateCount(el, parseInt(el.textContent, 10) || 0, 1400);
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(el);
  }
  window.addEventListener('pdd-data-loaded', initCounters);

  /* ══ 4. SCROLL REVEAL ══════════════════════════════════════════ */
  function initReveal() {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.reveal, [data-reveal]').forEach(el => io.observe(el));
  }
  window.addEventListener('pdd-portfolio-rendered', initReveal);
  window.addEventListener('pdd-data-loaded', initReveal);

  /* ══ 5. PORTFOLIO CARD STAGGER (re-runs on grid mutation) ══════ */
  function staggerCards() {
    document.querySelectorAll('.db-grid .portfolio-card:not(.staged)').forEach((c, i) => {
      c.classList.add('staged');
      c.style.opacity = '0';
      c.style.transform = 'translateY(50px)';
      c.style.transition = `opacity 0.55s ease ${i * 80}ms, transform 0.55s cubic-bezier(0.34,1.56,0.64,1) ${i * 80}ms`;
      requestAnimationFrame(() => {
        setTimeout(() => { c.style.opacity = '1'; c.style.transform = ''; }, 40 + i * 80);
      });
    });
  }

  function watchGrid() {
    const grid = document.getElementById('portfolio-grid');
    if (!grid) return;
    new MutationObserver(staggerCards).observe(grid, { childList: true });
  }

  /* ══ 6. PARALLAX — foto hero saja, bukan orbs ══════════════════════
     Orbs sudah bergerak via CSS @keyframes orbDrift.
     Kalau JS juga scroll-parallax orbs di atas CSS animation = double GPU paint,
     sangat berat di Android. Cukup parallax foto hero saja. */
  function initParallax() {
    const photo = document.getElementById('hero-photo-bg');
    if (!photo) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        photo.style.backgroundPositionY = `calc(center + ${window.scrollY * 0.15}px)`;
        ticking = false;
      });
    }, { passive: true });
  }

  /* ══ 7. MOUSE GLOW FOLLOWING CURSOR ═══════════════════════════
     Hanya untuk desktop (pointer: fine).
     Pakai transform:translate3d — GPU composite layer, TIDAK memicu
     layout reflow seperti style.left/top. */
  function initCursorGlow() {
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const glow = document.createElement('div');
    glow.style.cssText = [
      'position:fixed', 'pointer-events:none', 'z-index:9999',
      'width:350px', 'height:350px', 'border-radius:50%',
      'background:radial-gradient(circle,rgba(167,139,250,0.07) 0%,transparent 70%)',
      'top:0', 'left:0',            // anchor di pojok, gerak via transform
      'will-change:transform',       // buat GPU layer terpisah
    ].join(';');
    document.body.appendChild(glow);

    let mx = -500, my = -500, gx = -500, gy = -500;
    document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });

    let lastT = 0;
    (function loop(t) {
      requestAnimationFrame(loop);
      if (t - lastT < 32) return; // 30fps cukup untuk glow
      lastT = t;
      gx += (mx - gx) * 0.09;
      gy += (my - gy) * 0.09;
      // translate3d: zero layout cost, GPU handles it
      glow.style.transform = `translate3d(${gx - 175}px,${gy - 175}px,0)`;
    })(0);
  }

  /* ══ 8. GLASS CARD INNER GLOW on hover ═════════════════════════ */
  function initCardGlow() {
    document.querySelectorAll('.glass-card').forEach(card => {
      card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width  * 100).toFixed(1);
        const y = ((e.clientY - r.top)  / r.height * 100).toFixed(1);
        card.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(167,139,250,0.1) 0%, rgba(255,255,255,0.04) 50%)`;
      });
      card.addEventListener('mouseleave', () => { card.style.background = ''; });
    });
  }

  /* ══ 9. PORTFOLIO CARD 3D TILT (image/iframe only) ═══════════ */
  function initTilt() {
    function onMove(e) {
      const card = e.target.closest('.portfolio-card:not(.is-video)');
      if (!card) return;
      const r  = card.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2))  / (r.width  / 2);
      const dy = (e.clientY - (r.top  + r.height / 2)) / (r.height / 2);
      card.style.transform  = `perspective(800px) rotateX(${-dy * 5}deg) rotateY(${dx * 5}deg) translateY(-8px) scale(1.01)`;
      card.style.transition = 'transform 0.1s ease';
    }
    function onLeave(e) {
      const card = e.target.closest?.('.portfolio-card:not(.is-video)');
      if (!card) return;
      card.style.transform  = '';
      card.style.transition = 'transform 0.5s cubic-bezier(0.23,1,0.32,1)';
    }

    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave, { passive: true });

    const grid = document.getElementById('portfolio-grid');
    if (grid) {
      grid.addEventListener('mouseleave', e => {
        grid.querySelectorAll('.portfolio-card:not(.is-video)').forEach(c => {
          c.style.transform  = '';
          c.style.transition = 'transform 0.5s cubic-bezier(0.23,1,0.32,1)';
        });
      });
    }
  }

  /* ══ 9B. LUXURY FEATURED GLASS CARD 3D TILT & SPOTLIGHT ════════ */
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
      const rotateX = ((y - centerY) / centerY) * -3;
      const rotateY = ((x - centerX) / centerX) * 3;

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

  /* ══ 10. FLOATING PARTICLES ══════════════════════════════════════
     Mobile/Android: 0 partikel. CSS orbs sudah memberikan ambient motion.
     Partikel di mobile (dengan boxShadow glow) = sumber lag utama.
     Desktop: 8 partikel tanpa boxShadow (ringan). */
  function initParticles() {
    // Touch device (HP) = skip, CSS orbs sudah cukup
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const body = document.body;
    const count = 8;
    const colours = ['rgba(167,139,250,', 'rgba(244,114,182,', 'rgba(56,189,248,', 'rgba(52,211,153,'];

    for (let i = 0; i < count; i++) {
      const p   = document.createElement('div');
      const sz  = 2 + Math.random() * 3;
      const col = colours[Math.floor(Math.random() * colours.length)];
      const op  = (0.25 + Math.random() * 0.4).toFixed(2);
      const x   = Math.random() * 100;
      const y   = Math.random() * 100;
      const dur = 15 + Math.random() * 20;
      const del = Math.random() * 8;

      Object.assign(p.style, {
        position: 'fixed',
        width: sz + 'px', height: sz + 'px',
        borderRadius: '50%',
        background: `${col}${op})`,
        left: x + 'vw', top: y + 'vh',
        pointerEvents: 'none',
        zIndex: '0',
        // boxShadow dihapus: tiap frame browser repaint shadow = lag di mobile
        willChange: 'transform',
        animation: `orbDrift ${dur}s ease-in-out ${del}s infinite`,
      });
      body.appendChild(p);
    }
  }

  /* ══ 11. HERO TYPEWRITER on name load ═════════════════════════ */
  function initTypewriter() {
    const el = document.getElementById('owner-name-hero');
    if (!el) return;
    const original = el.textContent;

    const mo = new MutationObserver(() => {
      const text = el.textContent;
      if (text && text !== original && text !== 'Owner PDD.') {
        el.textContent = '';
        const chars = [...text];
        chars.forEach((ch, i) => {
          setTimeout(() => { el.textContent += ch; }, i * 45);
        });
        mo.disconnect();
      }
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
  }

  /* ══ 12. SCROLL-ACTIVATED FOOTER SOCIAL LINKS SYNC ══════════ */
  function syncFooterSocial() {
    const main   = document.getElementById('social-links');
    const footer = document.getElementById('footer-social-links');
    if (!main || !footer) return;

    const mo = new MutationObserver(() => {
      footer.innerHTML = main.innerHTML;
    });
    mo.observe(main, { childList: true, subtree: true });
  }

  /* ══ 13. WORKS CATEGORY TABS ══════════════════════════════════
     Membaca data karya dari window.works dan window.tools (sudah
     diisi oleh script.js sebelum dispatch pdd-data-loaded).
     Membangun tab "Semua" + satu tab per tool yang digunakan.
     Sliding pill identik dengan navbar.
  ══════════════════════════════════════════════════════════════ */
  /* ══ 13. DUAL-TIER WORKS FILTER SYSTEM ═════════════════════════
     Tier 1: Kategori Media (Semua, Video Cloudflare R2, Foto Google Drive)
     Tier 2: Sub-kategori Tools (Menyesuaikan secara dinamis dengan kategori media)
     Masing-masing memiliki indikator sliding pill halus ala iOS/glassmorphism.
  ══════════════════════════════════════════════════════════════ */
  function initWorksFilterSystem() {
    const wrapEl       = document.getElementById('works-tabs-wrap');
    const mediaTabsEl  = document.getElementById('media-tabs');
    const toolsTabsEl  = document.getElementById('tools-tabs');
    const toolsTabsRow = document.getElementById('tools-tabs-row');
    const gridEl       = document.getElementById('portfolio-grid');
    if (!wrapEl || !mediaTabsEl || !toolsTabsEl || !gridEl) return;

    const works = window.works || [];
    const tools = window.tools || [];
    if (!works.length) return;

    let currentMedia = 'all';
    let currentTool  = 'all';
    let filterTimer  = null;

    function isDriveWork(w) {
      return w.media_type === 'drive_album' || w.media_type === 'album' || (w.drive_url && w.drive_url.includes('/folders/'));
    }

    function getWorkToolIds(w) {
      if (Array.isArray(w.tool_ids) && w.tool_ids.length) return w.tool_ids.map(String);
      if (w.tool_id) return [String(w.tool_id)];
      return [];
    }

    const videoWorks = works.filter(w => !isDriveWork(w));
    const driveWorks = works.filter(w => isDriveWork(w));

    /* ── Helper: Pill movement animation ────────────────────── */
    function createPillController(containerEl) {
      let pill = containerEl.querySelector('.db-tabs__pill');
      if (!pill) {
        pill = document.createElement('span');
        pill.className = 'db-tabs__pill';
        pill.setAttribute('aria-hidden', 'true');
        containerEl.appendChild(pill);
      }
      let ready = false;

      function move(targetBtn, animate) {
        if (!targetBtn) return;
        const cRect = containerEl.getBoundingClientRect();
        const bRect = targetBtn.getBoundingClientRect();
        const left  = bRect.left - cRect.left;
        const width = bRect.width;

        if (!ready) {
          pill.style.transition = 'none';
          pill.style.left  = left + 'px';
          pill.style.width = width + 'px';
          pill.getBoundingClientRect();
          pill.style.transition = '';
          pill.style.opacity = '1';
          ready = true;
        } else if (!animate) {
          pill.style.transition = 'none';
          pill.style.left  = left + 'px';
          pill.style.width = width + 'px';
          pill.getBoundingClientRect();
          pill.style.transition = '';
        } else {
          pill.style.left  = left + 'px';
          pill.style.width = width + 'px';
        }
      }

      return { move, reset: () => { ready = false; } };
    }

    let mediaPillCtrl = null;
    let toolPillCtrl  = null;

    /* ── Filter grid cards with 3-phase masonry reflow ───────── */
    function applyCombinedFilter() {
      if (filterTimer) { clearTimeout(filterTimer); filterTimer = null; }

      const cards = Array.from(gridEl.querySelectorAll('.portfolio-card'));
      let visibleCount = 0;

      cards.forEach(card => {
        const cardMedia = card.dataset.mediaType || 'video';
        const cardTools = (card.dataset.toolIds || '').split(',').filter(Boolean);

        const matchMedia = (currentMedia === 'all') || (cardMedia === currentMedia);
        const matchTool  = (currentTool  === 'all') || (cardTools.includes(currentTool));
        const shouldShow = matchMedia && matchTool;

        if (shouldShow) visibleCount++;

        if (!shouldShow) {
          // Fase 1: Animate fade out & scale
          card.style.transition    = 'opacity 0.22s ease, transform 0.22s ease';
          card.style.opacity       = '0';
          card.style.transform     = 'scale(0.93)';
          card.style.pointerEvents = 'none';
        } else {
          if (card.style.display === 'none') {
            card.style.display    = '';
            card.style.opacity    = '0';
            card.style.transform  = 'scale(0.93)';
            card.style.transition = 'none';
          }
          card.style.pointerEvents = '';
        }
      });

      // Fase 2: Setelah fade selesai, ubah display ke none agar masonry reflow
      filterTimer = setTimeout(() => {
        cards.forEach(card => {
          const cardMedia = card.dataset.mediaType || 'video';
          const cardTools = (card.dataset.toolIds || '').split(',').filter(Boolean);
          const matchMedia = (currentMedia === 'all') || (cardMedia === currentMedia);
          const matchTool  = (currentTool  === 'all') || (cardTools.includes(currentTool));
          const shouldShow = matchMedia && matchTool;
          if (!shouldShow) card.style.display = 'none';
        });

        // Fase 3: Fade-in kartu yang tersisa dengan stagger
        requestAnimationFrame(() => requestAnimationFrame(() => {
          let delay = 0;
          cards.forEach(card => {
            const cardMedia = card.dataset.mediaType || 'video';
            const cardTools = (card.dataset.toolIds || '').split(',').filter(Boolean);
            const matchMedia = (currentMedia === 'all') || (cardMedia === currentMedia);
            const matchTool  = (currentTool  === 'all') || (cardTools.includes(currentTool));
            const shouldShow = matchMedia && matchTool;

            if (shouldShow) {
              card.style.transition = `opacity 0.3s ease ${delay}ms, transform 0.3s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`;
              card.style.opacity    = '1';
              card.style.transform  = '';
              delay += 40;
            }
          });
        }));
      }, 240);

      // Handle empty state indicator
      const emptyEl = document.getElementById('empty-state');
      if (emptyEl) emptyEl.hidden = visibleCount > 0;
    }

    /* ── Render Sub-Category (Tools) Tabs ────────────────────── */
    function renderSubToolsTabs() {
      toolsTabsEl.innerHTML = '';
      if (toolPillCtrl) toolPillCtrl.reset();

      // Filter karya sesuai media aktif
      const relevantWorks = currentMedia === 'all' 
        ? works 
        : (currentMedia === 'drive_album' ? driveWorks : videoWorks);

      // Kumpulkan tool IDs yang dipakai di kategori media ini
      const usedIds = new Set();
      relevantWorks.forEach(w => getWorkToolIds(w).forEach(id => usedIds.add(id)));

      const activeTools = tools.filter(t => usedIds.has(String(t.id)));

      // Jika tidak ada tool atau hanya 1 tool, sembunyikan baris sub-kategori
      if (!activeTools.length) {
        if (toolsTabsRow) toolsTabsRow.hidden = true;
        currentTool = 'all';
        return;
      }

      if (toolsTabsRow) toolsTabsRow.hidden = false;

      // Daftar sub-tab
      const subDefs = [
        { key: 'all', label: 'Semua Tool', count: relevantWorks.length },
        ...activeTools.map(t => ({
          key: String(t.id),
          label: t.name,
          count: relevantWorks.filter(w => getWorkToolIds(w).includes(String(t.id))).length
        }))
      ];

      // Reset currentTool jika tool aktif tidak ada lagi di kategori ini
      if (currentTool !== 'all' && !usedIds.has(currentTool)) {
        currentTool = 'all';
      }

      toolPillCtrl = createPillController(toolsTabsEl);

      subDefs.forEach(def => {
        const btn = document.createElement('button');
        const isActive = (def.key === currentTool);
        btn.className = 'db-tab db-tab--sub' + (isActive ? ' active' : '');
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.dataset.subToolKey = def.key;
        btn.innerHTML = `${def.label}<span class="db-tab__count">${def.count}</span>`;
        toolsTabsEl.appendChild(btn);
      });

      requestAnimationFrame(() => {
        const activeBtn = toolsTabsEl.querySelector('.db-tab.active') || toolsTabsEl.querySelector('.db-tab');
        if (activeBtn) toolPillCtrl.move(activeBtn, false);
      });
    }

    /* ── Render Primary (Media) Tabs ─────────────────────────── */
    function renderMediaTabs() {
      mediaTabsEl.innerHTML = '';
      if (mediaPillCtrl) mediaPillCtrl.reset();

      const mediaDefs = [
        { key: 'all', label: 'Semua Karya', count: works.length, icon: '✦' },
        { key: 'video', label: 'Video Cloudflare', count: videoWorks.length, icon: '🎬' },
        { key: 'drive_album', label: 'Foto Google Drive', count: driveWorks.length, icon: '📷' }
      ];

      mediaPillCtrl = createPillController(mediaTabsEl);

      mediaDefs.forEach(def => {
        const btn = document.createElement('button');
        const isActive = (def.key === currentMedia);
        btn.className = 'db-tab db-tab--primary' + (isActive ? ' active' : '');
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.dataset.mediaKey = def.key;
        btn.innerHTML = `<span class="db-tab__icon">${def.icon}</span> ${def.label}<span class="db-tab__count">${def.count}</span>`;
        mediaTabsEl.appendChild(btn);
      });

      requestAnimationFrame(() => {
        const activeBtn = mediaTabsEl.querySelector('.db-tab.active') || mediaTabsEl.querySelector('.db-tab');
        if (activeBtn) mediaPillCtrl.move(activeBtn, false);
      });
    }

    /* ── Event Listeners ─────────────────────────────────────── */
    // Klik Kategori Media (Tier 1)
    mediaTabsEl.addEventListener('click', e => {
      const btn = e.target.closest('.db-tab');
      if (!btn || btn.classList.contains('active')) return;

      mediaTabsEl.querySelectorAll('.db-tab').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });

      mediaPillCtrl.move(btn, true);
      currentMedia = btn.dataset.mediaKey;
      currentTool  = 'all';

      // Re-render sub tools untuk media ini
      renderSubToolsTabs();
      applyCombinedFilter();
    });

    // Klik Sub-kategori Tool (Tier 2)
    toolsTabsEl.addEventListener('click', e => {
      const btn = e.target.closest('.db-tab');
      if (!btn) return;

      toolsTabsEl.querySelectorAll('.db-tab').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });

      toolPillCtrl.move(btn, true);
      currentTool = btn.dataset.subToolKey;
      applyCombinedFilter();
    });

    // Reposition on window resize
    window.addEventListener('resize', () => {
      const activeMediaBtn = mediaTabsEl.querySelector('.db-tab.active');
      if (activeMediaBtn && mediaPillCtrl) mediaPillCtrl.move(activeMediaBtn, false);

      const activeToolBtn = toolsTabsEl.querySelector('.db-tab.active');
      if (activeToolBtn && toolPillCtrl) toolPillCtrl.move(activeToolBtn, false);
    }, { passive: true });

    // Show filter system wrap
    wrapEl.hidden = false;

    // Render initial tabs
    renderMediaTabs();
    renderSubToolsTabs();
  }

  // Call filter system after data is loaded
  window.addEventListener('pdd-data-loaded', () => {
    initWorksFilterSystem();
    initCounters();
  });

  /* ══ 13. GOOGLE DRIVE ALBUM MODAL (GLASSMORPHISM) ════════════ */
  function initDriveAlbumModal() {
    const modal = document.getElementById('drive-album-modal');
    if (!modal) return;

    const backdrop = document.getElementById('drive-modal-backdrop');
    const closeBtn = document.getElementById('drive-modal-close');
    const titleEl = document.getElementById('drive-modal-title');
    const extLink = document.getElementById('drive-modal-ext-link');
    const iframe = document.getElementById('drive-modal-iframe');
    const loading = document.getElementById('drive-modal-loading');

    function openModal(folderId, title, rawUrl) {
      if (!folderId) return;
      if (titleEl) titleEl.textContent = title || 'Galeri Foto';
      const driveUrl = rawUrl || `https://drive.google.com/drive/folders/${folderId}`;
      if (extLink) extLink.href = driveUrl;

      if (loading) loading.style.display = 'flex';
      if (iframe) {
        iframe.src = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#grid`;
        iframe.onload = () => {
          if (loading) loading.style.display = 'none';
        };
      }

      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }

    function closeModal() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      if (iframe) iframe.src = '';
      document.body.classList.remove('modal-open');
    }

    const screenCloseBtn = document.getElementById('drive-modal-screen-close');

    closeBtn?.addEventListener('click', closeModal);
    screenCloseBtn?.addEventListener('click', closeModal);
    backdrop?.addEventListener('click', closeModal);

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) {
        closeModal();
      }
    });

    // Delegate click: old portfolio-grid + new featured sections
    document.addEventListener('click', e => {
      const el = e.target.closest('.is-drive-album');
      if (!el) return;
      e.preventDefault();
      const folderId = el.getAttribute('data-drive-folder');
      const title = el.getAttribute('data-title') || el.getAttribute('data-drive-title');
      const driveUrl = el.getAttribute('data-drive-url');
      if (folderId) openModal(folderId, title, driveUrl);
    });
  }

  /* ══ 14. VIDEO POPUP MODAL ════════════════════════════════════ */
  function initVideoModal() {
    const modal = document.getElementById('video-modal');
    if (!modal) return;

    const backdrop = document.getElementById('video-modal-backdrop');
    const closeBtn = document.getElementById('video-modal-close');
    const screenCloseBtn = document.getElementById('video-modal-screen-close');
    const titleEl = document.getElementById('video-modal-title');
    const player = document.getElementById('video-modal-player');

    function openModal(src, title) {
      if (!src) return;
      if (titleEl) titleEl.textContent = title || 'Video';
      const frameWrap = modal.querySelector('.video-modal__frame-wrap');
      const oldIframe = frameWrap?.querySelector('iframe');
      if (oldIframe) oldIframe.remove();

      // Cek apakah video berasal dari link Google Drive
      const driveMatch = src.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || src.match(/\/d\/([a-zA-Z0-9_-]+)/) || src.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      const driveId = driveMatch ? driveMatch[1] : null;

      if (driveId) {
        if (player) {
          player.pause();
          player.src = '';
          player.style.display = 'none';
        }
        const iframe = document.createElement('iframe');
        iframe.src = `https://drive.google.com/file/d/${driveId}/preview`;
        iframe.className = 'video-modal__iframe';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.setAttribute('allow', 'autoplay; fullscreen');
        iframe.setAttribute('allowfullscreen', 'true');
        frameWrap?.appendChild(iframe);
      } else {
        if (player) {
          player.style.display = 'block';
          player.src = src;
          player.load();
          player.play().catch(() => {});
        }
      }

      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }

    function closeModal() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      const frameWrap = modal.querySelector('.video-modal__frame-wrap');
      const iframe = frameWrap?.querySelector('iframe');
      if (iframe) iframe.remove();
      if (player) {
        player.pause();
        player.src = '';
      }
      document.body.classList.remove('modal-open');
    }

    closeBtn?.addEventListener('click', closeModal);
    screenCloseBtn?.addEventListener('click', closeModal);
    backdrop?.addEventListener('click', closeModal);

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
    });

    // Delegate click: featured video thumbs and CTA buttons
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-video-src]');
      if (!el) return;
      const src = el.getAttribute('data-video-src');
      const title = el.getAttribute('data-video-title');
      if (src) openModal(src, title);
    });
  }

  /* ══ INIT ALL ══════════════════════════════════════════════════ */
  function init() {
    initMesh();
    initNav();
    initReveal();
    watchGrid();
    initParallax();
    initCursorGlow();
    initCardGlow();
    initTilt();
    initFeaturedCardEffects();
    initParticles();
    initTypewriter();
    syncFooterSocial();
    initDriveAlbumModal();
    initVideoModal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
