/* ============================================================
   animations.js — Global animation & interactivity engine
   Scroll reveal, cursor glow, parallax, stagger, counters
   ============================================================ */

(function () {
  'use strict';

  /* ── CURSOR GLOW ─────────────────────────────────────────── */
  const cursorGlow = document.getElementById('cursor-glow');
  if (cursorGlow && window.matchMedia('(pointer: fine)').matches) {
    let mouseX = 0, mouseY = 0;
    let glowX = 0, glowY = 0;
    let raf;

    document.addEventListener('mousemove', e => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { passive: true });

    function animateCursor() {
      glowX += (mouseX - glowX) * 0.08;
      glowY += (mouseY - glowY) * 0.08;
      cursorGlow.style.left = glowX + 'px';
      cursorGlow.style.top  = glowY + 'px';
      raf = requestAnimationFrame(animateCursor);
    }
    animateCursor();
  }

  /* ── SCROLL REVEAL ────────────────────────────────────────── */
  function initScrollReveal() {
    const selectors = '.reveal, .reveal-left, .reveal-right, .reveal-scale';
    const elements = document.querySelectorAll(selectors);
    if (!elements.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const delay = Number(el.dataset.delay || 0);
          setTimeout(() => {
            el.classList.add('visible');
          }, delay);
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

    elements.forEach((el, i) => {
      // Stagger sibling groups automatically
      const siblings = el.parentElement?.querySelectorAll(':scope > .reveal, :scope > .reveal-left, :scope > .reveal-right, :scope > .reveal-scale');
      if (siblings && siblings.length > 1) {
        const idx = Array.from(siblings).indexOf(el);
        if (!el.dataset.delay) el.dataset.delay = idx * 90;
      }
      observer.observe(el);
    });
  }

  /* ── PORTFOLIO CARD STAGGER ─────────────────────────────── */
  function initCardStagger() {
    const observer = new MutationObserver(() => {
      document.querySelectorAll('.portfolio-card:not(.staggered)').forEach((card, i) => {
        card.classList.add('staggered');
        card.style.opacity = '0';
        card.style.transform = 'translateY(50px) scale(0.95)';
        card.style.transition = `opacity 0.6s cubic-bezier(0.23,1,0.32,1) ${i * 90}ms, transform 0.6s cubic-bezier(0.34,1.56,0.64,1) ${i * 90}ms`;
        setTimeout(() => {
          card.style.opacity = '1';
          card.style.transform = '';
        }, 80 + i * 90);
      });
    });

    const grid = document.getElementById('portfolio-grid');
    if (grid) observer.observe(grid, { childList: true });
  }

  /* ── PARALLAX HERO ────────────────────────────────────────── */
  function initParallax() {
    const photo = document.querySelector('.profile-photo, .visual-main');
    if (!photo) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          const offset  = scrollY * 0.15;
          photo.style.backgroundPositionY = `calc(center + ${offset}px)`;
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* ── ANIMATED COUNTER ─────────────────────────────────────── */
  function animateCounter(el, target, duration) {
    if (!el || isNaN(target)) return;
    const start = performance.now();
    const from  = 0;

    function tick(now) {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      const current  = Math.round(from + (target - from) * eased);
      el.textContent = String(current).padStart(2, '0');
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function initCounters() {
    const countEl = document.getElementById('project-count');
    if (!countEl) return;

    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        const target = parseInt(countEl.textContent, 10) || 0;
        animateCounter(countEl, target, 1200);
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(countEl);
  }

  /* ── CARD TILT EFFECT ─────────────────────────────────────── */
  function initCardTilt() {
    document.addEventListener('mousemove', e => {
      const card = e.target.closest('.portfolio-card');
      // Skip tilt for video cards — controls need precise clicking
      if (!card || card.classList.contains('is-video')) return;

      const rect   = card.getBoundingClientRect();
      const cx     = rect.left + rect.width / 2;
      const cy     = rect.top  + rect.height / 2;
      const dx     = (e.clientX - cx) / (rect.width  / 2);
      const dy     = (e.clientY - cy) / (rect.height / 2);
      const rotX   = -dy * 6;
      const rotY   =  dx * 6;

      card.style.transform   = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-10px) scale(1.01)`;
      card.style.transition  = 'transform 0.1s ease';
    }, { passive: true });

    document.addEventListener('mouseleave', e => {
      const card = e.target.closest?.('.portfolio-card');
      if (!card || card.classList.contains('is-video')) return;
      card.style.transform = '';
      card.style.transition = 'transform 0.5s cubic-bezier(0.23,1,0.32,1)';
    }, { passive: true });

    // Reset on mouse leave card
    document.querySelectorAll('.portfolio-card:not(.is-video)').forEach(card => {
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        card.style.transition = 'transform 0.5s cubic-bezier(0.23,1,0.32,1)';
      });
    });
  }

  /* ── CARD TILT — live update for dynamically added cards ──── */
  function watchCardTilt() {
    const grid = document.getElementById('portfolio-grid');
    if (!grid) return;
    const mo = new MutationObserver(() => initCardTilt());
    mo.observe(grid, { childList: true });
  }

  /* ── GLASS HEADER BLUR ON SCROLL ───────────────────────────  */
  function initHeaderGlass() {
    const header = document.querySelector('.site-header, .dashboard-header');
    if (!header) return;
    window.addEventListener('scroll', () => {
      const scrolled = window.scrollY > 20;
      header.style.background = scrolled
        ? 'rgba(8,8,18,0.85)'
        : 'rgba(8,8,18,0.6)';
      header.style.boxShadow = scrolled
        ? '0 4px 40px rgba(0,0,0,0.4)'
        : 'none';
    }, { passive: true });
  }

  /* ── FLOATING DECORATION PARTICLES ─────────────────────────  */
  function initParticles() {
    const hero = document.querySelector('.profile-hero');
    if (!hero) return;

    const colors = ['rgba(167,139,250,0.5)', 'rgba(244,114,182,0.5)', 'rgba(56,189,248,0.4)'];
    const count  = window.innerWidth > 760 ? 12 : 5;

    for (let i = 0; i < count; i++) {
      const dot = document.createElement('div');
      const size = Math.random() * 4 + 2;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const x  = Math.random() * 100;
      const y  = Math.random() * 100;
      const dur = 8 + Math.random() * 12;
      const del = Math.random() * 6;

      Object.assign(dot.style, {
        position: 'absolute',
        width: size + 'px',
        height: size + 'px',
        borderRadius: '50%',
        background: color,
        left: x + '%',
        top:  y + '%',
        pointerEvents: 'none',
        zIndex: '0',
        boxShadow: `0 0 ${size * 4}px ${color}`,
        animation: `orbFloat ${dur}s ease-in-out ${del}s infinite`,
        opacity: Math.random() * 0.7 + 0.3,
      });

      hero.appendChild(dot);
    }
  }

  /* ── TYPEWRITER EFFECT for hero h1 ──────────────────────────  */
  function initTypewriter() {
    const nameEl = document.getElementById('owner-name-hero');
    if (!nameEl) return;

    // Re-run when name changes (e.g. after data loaded)
    const originalName = nameEl.textContent;

    function typewrite(el, text, duration) {
      if (!text || text === '—') return;
      el.textContent = '';
      const chars = [...text];
      const delay = duration / chars.length;
      chars.forEach((ch, i) => {
        setTimeout(() => {
          el.textContent += ch;
        }, i * delay);
      });
    }

    const targetObserver = new MutationObserver(() => {
      const newText = nameEl.textContent;
      if (newText && newText !== originalName) {
        typewrite(nameEl, newText, 600);
        targetObserver.disconnect();
      }
    });
    targetObserver.observe(nameEl, { childList: true, characterData: true, subtree: true });
  }

  /* ── MAGNETIC BUTTON EFFECT ─────────────────────────────────  */
  function initMagneticButtons() {
    document.querySelectorAll('.primary-button').forEach(btn => {
      btn.addEventListener('mousemove', e => {
        const rect   = btn.getBoundingClientRect();
        const cx     = rect.left + rect.width / 2;
        const cy     = rect.top  + rect.height / 2;
        const dx     = (e.clientX - cx) * 0.3;
        const dy     = (e.clientY - cy) * 0.3;
        btn.style.transform = `translateY(-3px) translate(${dx}px, ${dy}px) scale(1.03)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
        btn.style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
      });
    });
  }

  /* ── NAV ACTIVE LINK on scroll ──────────────────────────────  */
  function initActiveNav() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.main-nav a[href^="#"]');
    if (!sections.length || !navLinks.length) return;

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === '#' + entry.target.id);
          });
        }
      });
    }, { threshold: 0.4 });

    sections.forEach(s => observer.observe(s));
  }

  /* ── ADMIN PANEL ITEMS STAGGER ──────────────────────────────  */
  function initAdminStagger() {
    const adminList = document.getElementById('admin-list');
    if (!adminList) return;

    new MutationObserver(() => {
      adminList.querySelectorAll('.admin-item:not(.staggered)').forEach((item, i) => {
        item.classList.add('staggered');
        item.style.animationDelay = `${i * 60}ms`;
      });
    }).observe(adminList, { childList: true });
  }

  /* ── GLOW HOVER on glass panels ─────────────────────────────  */
  function initPanelGlow() {
    document.querySelectorAll('.form-panel, .list-panel').forEach(panel => {
      panel.addEventListener('mousemove', e => {
        const rect = panel.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1);
        const y = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
        panel.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(167,139,250,0.07) 0%, rgba(255,255,255,0.04) 60%)`;
      });
      panel.addEventListener('mouseleave', () => {
        panel.style.background = '';
      });
    });
  }

  /* ── INIT ALL ────────────────────────────────────────────────  */
  function init() {
    initScrollReveal();
    initCardStagger();
    initParallax();
    initCounters();
    initCardTilt();
    watchCardTilt();
    initHeaderGlass();
    initParticles();
    initTypewriter();
    initMagneticButtons();
    initActiveNav();
    initAdminStagger();
    initPanelGlow();

    // Re-run magnetic buttons after DOM updates (admin)
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initMagneticButtons, 800);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-init counters when works data loads
  window.addEventListener('pdd-data-loaded', () => {
    initCounters();
    setTimeout(initScrollReveal, 100);
  });
})();
