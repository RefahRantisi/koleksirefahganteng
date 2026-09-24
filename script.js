const supabaseClient = window.PDD_SUPABASE_CONFIG?.url && window.PDD_SUPABASE_CONFIG?.anonKey && window.supabase
  ? window.supabase.createClient(window.PDD_SUPABASE_CONFIG.url, window.PDD_SUPABASE_CONFIG.anonKey)
  : null;
let profile = null;
let tools = [];
let works = [];
let socialMedia = [];
let editingWorkId = null;
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

function requireSupabase() {
  if (!supabaseClient) throw new Error('Isi URL dan anon key Supabase di supabase-config.js terlebih dahulu.');
}

function getLocalFeaturedMap() {
  try {
    return JSON.parse(localStorage.getItem('pdd_featured_works') || '{}');
  } catch (_) {
    return {};
  }
}

function setLocalFeatured(workId, isFeatured) {
  try {
    const map = getLocalFeaturedMap();
    map[String(workId)] = !!isFeatured;
    localStorage.setItem('pdd_featured_works', JSON.stringify(map));
  } catch (_) {}
}

function isDriveWork(w) {
  if (!w) return false;
  return w.media_type === 'drive_album' || w.media_type === 'album' || (w.drive_url && w.drive_url.includes('/folders/'));
}

function isFeaturedWork(w) {
  if (!w) return false;
  const localMap = getLocalFeaturedMap();
  if (localMap && localMap[String(w.id)] !== undefined) {
    return localMap[String(w.id)] === true;
  }
  return w.is_featured === true || w.is_featured === 'true' || w.is_featured === 1 || w.is_featured === '1';
}

function getLocalDescriptionsMap() {
  try {
    return JSON.parse(localStorage.getItem('pdd_work_descriptions') || '{}');
  } catch (_) {
    return {};
  }
}

function setLocalDescription(workId, description) {
  try {
    const map = getLocalDescriptionsMap();
    map[String(workId)] = description || '';
    localStorage.setItem('pdd_work_descriptions', JSON.stringify(map));
  } catch (_) {}
}

async function loadData() {
  requireSupabase();
  const [profileResult, toolsResult, worksResult, socialResult] = await Promise.all([
    supabaseClient.from('owner_profile').select('*').eq('id', true).single(),
    supabaseClient.from('tools').select('*').order('name'),
    supabaseClient.from('works').select('*, tools(name)').order('work_date', { ascending: false }),
    supabaseClient.from('social_media').select('*').order('created_at')
  ]);
  if (profileResult.error) throw profileResult.error;
  if (toolsResult.error) throw toolsResult.error;
  if (worksResult.error) throw worksResult.error;
  if (socialResult.error) throw socialResult.error;
  profile = profileResult.data;
  tools = toolsResult.data;
  socialMedia = socialResult.data;

  // Merge status is_featured dan description dari localStorage
  const localMap = getLocalFeaturedMap();
  const descMap = getLocalDescriptionsMap();
  works = (worksResult.data || []).map(w => {
    if (localMap && localMap[String(w.id)] !== undefined) {
      w.is_featured = localMap[String(w.id)] === true;
    } else {
      w.is_featured = w.is_featured === true || w.is_featured === 'true' || w.is_featured === 1;
    }
    if (descMap && descMap[String(w.id)] !== undefined) {
      w.description = descMap[String(w.id)];
    }
    return w;
  });
}

function publicFileUrl(path) {
  return supabaseClient.storage.from('portfolio-files').getPublicUrl(path).data.publicUrl;
}

function renderProfile() {
  const photoUrl = profile?.profile_photo_path ? publicFileUrl(profile.profile_photo_path) : null;

  // About text (both about-band and hero bio)
  const about = document.getElementById('owner-about');
  if (about && profile) about.textContent = profile.about;
  const secondaryAbout = document.getElementById('owner-about-secondary');
  if (secondaryAbout && profile) secondaryAbout.textContent = profile.about;

  // Brand name (nav + footer)
  document.querySelectorAll('#owner-brand-name, #footer-owner-name, #footer-copyright-name').forEach(el => {
    if (el && profile?.name) el.textContent = profile.name;
  });

  // Avatar mark (nav pill brand-mark)
  const avatar = document.getElementById('owner-avatar');
  if (avatar && photoUrl) {
    avatar.innerHTML = `<img src="${photoUrl}" alt="Foto ${escapeHtml(profile.name || 'owner')}">`;
  }
  const footerAvatar = document.getElementById('footer-owner-avatar');
  if (footerAvatar && photoUrl) {
    footerAvatar.innerHTML = `<img src="${photoUrl}" alt="Foto ${escapeHtml(profile.name || 'owner')}">`;
  }

  // Hero name (typewriter target)
  const nameHero = document.getElementById('owner-name-hero');
  if (nameHero && profile?.name) nameHero.textContent = profile.name + '.';

  // Hero photo background (new dashboard layout)
  const heroBg = document.getElementById('hero-photo-bg');
  if (heroBg && photoUrl) heroBg.style.backgroundImage = `url("${photoUrl}")`;

  // Legacy .visual-main fallback
  const visual = document.querySelector('.visual-main');
  if (visual && photoUrl) visual.style.backgroundImage = `url("${photoUrl}")`;

  // Birth date
  const birth = document.getElementById('owner-birth');
  if (birth && profile?.birth_date) birth.textContent = formatDate(profile.birth_date);

  renderSocialMedia();
}

function getWorkToolNames(work) {
  if (Array.isArray(work.tool_ids) && work.tool_ids.length > 0) {
    const names = work.tool_ids
      .map(id => tools.find(t => String(t.id) === String(id))?.name)
      .filter(Boolean);
    if (names.length > 0) return names;
  }
  if (work.tools?.name) return [work.tools.name];
  if (work.tool_id) {
    const found = tools.find(t => String(t.id) === String(work.tool_id));
    if (found) return [found.name];
  }
  return [];
}


function renderPortfolio() {
  // Update project count stat
  const projectCountEl = document.getElementById('project-count');
  if (projectCountEl) projectCountEl.textContent = String(works.length).padStart(2, '0');

  // Hanya tampilkan karya yang berstatus 'Showing' (isFeaturedWork === true), maksimal 3 karya
  const videoFeatured = works.filter(w => !isDriveWork(w) && isFeaturedWork(w)).slice(0, 3);
  const photoFeatured = works.filter(w => isDriveWork(w) && isFeaturedWork(w)).slice(0, 3);

  // ── Render Featured Videos ─────────────────────────────────────
  const videoList = document.getElementById('video-featured-list');
  const videoEmpty = document.getElementById('video-empty-state');
  if (videoList) {
    if (videoFeatured.length === 0) {
      videoList.innerHTML = '';
      if (videoEmpty) {
        videoEmpty.hidden = false;
        videoEmpty.style.display = 'flex';
      }
    } else {
      if (videoEmpty) {
        videoEmpty.hidden = true;
        videoEmpty.style.display = 'none';
      }
      videoList.innerHTML = videoFeatured.map((work, index) => {
        const isReversed = index % 2 !== 0;
        const toolNames = getWorkToolNames(work);
        const toolsBadges = toolNames.map(name => `<span class="feat-tool-tag">${escapeHtml(name)}</span>`).join('');
        const videoSrc = escapeHtml(work.r2_url || '');
        const num = String(index + 1).padStart(2, '0');
        const desc = work.description ? escapeHtml(work.description) : 'Karya video dokumentasi dengan teknik sinematik yang kuat.';

        let videoPreviewHtml = '';
        if (videoSrc) {
          const fId = extractDriveFileId(videoSrc);
          if (fId) {
            const thumbUrl = `https://drive.google.com/thumbnail?id=${fId}&sz=w1200`;
            videoPreviewHtml = `<img class="feat-video-preview" src="${thumbUrl}" alt="${escapeHtml(work.title || 'Video')}" loading="lazy" referrerpolicy="no-referrer" onerror="if(!this.dataset.triedLh3){ this.dataset.triedLh3='1'; this.src='https://lh3.googleusercontent.com/d/${fId}'; }">`;
          } else {
            videoPreviewHtml = `<video class="feat-video-preview" src="${videoSrc}" preload="metadata" muted playsinline loop autoplay></video>`;
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
              <div class="feat-caption__date">${formatDate(work.work_date)}</div>
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
      }).join('');
    }
  }

  // ── Render Featured Photos ─────────────────────────────────────
  const photoList = document.getElementById('photo-featured-list');
  const photoEmpty = document.getElementById('photo-empty-state');
  if (photoList) {
    if (photoFeatured.length === 0) {
      photoList.innerHTML = '';
      if (photoEmpty) {
        photoEmpty.hidden = false;
        photoEmpty.style.display = 'flex';
      }
    } else {
      if (photoEmpty) {
        photoEmpty.hidden = true;
        photoEmpty.style.display = 'none';
      }
      photoList.innerHTML = photoFeatured.map((work, index) => {
        const isReversed = index % 2 !== 0;
        const toolNames = getWorkToolNames(work);
        const toolsBadges = toolNames.map(name => `<span class="feat-tool-tag">${escapeHtml(name)}</span>`).join('');
        const num = String(index + 1).padStart(2, '0');
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
              <div class="feat-caption__date">${formatDate(work.work_date)}</div>
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
      }).join('');
    }
  }

  window.dispatchEvent(new CustomEvent('pdd-portfolio-rendered'));
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

function driveEmbedUrl(fileId) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}

function renderAdminProfile() {
  const nameInput = document.getElementById('owner-name');
  const birthInput = document.getElementById('birth-date');
  const aboutInput = document.getElementById('owner-about-input');
  if (!profile || !nameInput || !birthInput || !aboutInput) return;
  nameInput.value = profile.name || '';
  birthInput.value = profile.birth_date || '';
  aboutInput.value = profile.about || '';
}

function renderToolOptions() {
  const group = document.getElementById('tool-checkbox-group');
  if (group) {
    group.innerHTML = tools.length
      ? tools.map(tool => `
          <label class="tool-chip">
            <input type="checkbox" name="work-tools" value="${tool.id}">
            <span>${escapeHtml(tool.name)}</span>
          </label>
        `).join('')
      : '<span class="empty-hint">Belum ada tool. Tambah di panel 03 terlebih dahulu.</span>';
  }

  const select = document.getElementById('tool-id');
  if (select) select.innerHTML = tools.map(tool => `<option value="${tool.id}">${escapeHtml(tool.name)}</option>`).join('');

  const list = document.getElementById('tool-list');
  if (list) list.innerHTML = tools.map(tool => `<div class="tool-item"><span>${escapeHtml(tool.name)}</span><button class="delete-button" data-tool-delete="${tool.id}" type="button">Hapus</button></div>`).join('');
  list?.querySelectorAll('[data-tool-delete]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm('Hapus tool ini?')) return;
    try {
      const { error } = await supabaseClient.from('tools').delete().eq('id', button.dataset.toolDelete);
      if (error) throw error;
      await loadData();
      renderToolOptions();
      renderPortfolio();
      renderAdminWorks();
    } catch (error) { window.alert(`Tool tidak dapat dihapus: ${error.message}`); }
  }));
}

function renderAdminWorks() {
  const list = document.getElementById('admin-list');
  if (!list) return;
  document.getElementById('admin-count').textContent = `${works.length} karya`;

  // Compute featured counts
  const featuredVideos = works.filter(w => !isDriveWork(w) && isFeaturedWork(w)).length;
  const featuredPhotos = works.filter(w => isDriveWork(w) && isFeaturedWork(w)).length;
  const videoCount = works.filter(w => !isDriveWork(w)).length;
  const photoCount = works.filter(w => isDriveWork(w)).length;

  // Update warning banner
  const warningBanner = document.getElementById('featured-warning-banner');
  if (warningBanner) {
    const messages = [];
    if (videoCount > 0 && featuredVideos === 0) {
      messages.push(`<span>🎬 <strong>${videoCount} video</strong> belum ada yang dipilih sebagai karya pilihan beranda.</span>`);
    } else if (featuredVideos > 0) {
      messages.push(`<span>🎬 Video pilihan: <strong>${featuredVideos}/3</strong>${featuredVideos < 3 ? ` — bisa ditambah hingga 3` : ''}</span>`);
    }
    if (photoCount > 0 && featuredPhotos === 0) {
      messages.push(`<span>📷 <strong>${photoCount} album foto</strong> belum ada yang dipilih sebagai karya pilihan beranda.</span>`);
    } else if (featuredPhotos > 0) {
      messages.push(`<span>📷 Foto pilihan: <strong>${featuredPhotos}/3</strong>${featuredPhotos < 3 ? ` — bisa ditambah hingga 3` : ''}</span>`);
    }

    if (messages.length > 0) {
      const hasWarning = (videoCount > 0 && featuredVideos === 0) || (photoCount > 0 && featuredPhotos === 0);
      warningBanner.hidden = false;
      warningBanner.className = `featured-warning-banner${hasWarning ? ' featured-warning-banner--warn' : ' featured-warning-banner--ok'}`;
      warningBanner.innerHTML = `<span class="featured-warning-banner__icon">${hasWarning ? '⚠️' : '✅'}</span><div>${messages.join('')}</div><a href="#admin-list" class="featured-warning-banner__link">Atur switch di bawah ↓</a>`;
    } else {
      warningBanner.hidden = true;
    }
  }

  list.innerHTML = works.length ? works.map(work => {
    const isDrive = isDriveWork(work);
    const isR2 = !!work.r2_url && !isDrive;
    const badge = isDrive
      ? '<span class="badge-gdrive">📁 Album Drive</span>'
      : (isR2 
        ? '<span class="badge-r2">R2 Video</span>' 
        : (work.drive_file_id ? '<span class="badge-gdrive">GDrive</span>' : ''));
    const isFeatured = isFeaturedWork(work);
    const featuredBadge = isFeatured ? '<span class="badge-featured">⭐ Pilihan Beranda</span>' : '';
    const toolNames = getWorkToolNames(work);
    const toolText = toolNames.length ? toolNames.join(', ') : 'Tanpa tool';
    const descPreview = work.description ? `<em class="admin-item-desc">"${escapeHtml(work.description.slice(0, 60))}${work.description.length > 60 ? '…' : ''}"</em>` : '';

    return `<div class="admin-item${isFeatured ? ' admin-item--featured' : ''}" data-work-card="${work.id}">
      <div>
        <h3>${escapeHtml(work.title || work.file_name || 'Karya')} ${badge} ${featuredBadge}</h3>
        <p>${escapeHtml(toolText)} · ${formatDate(work.work_date)}</p>
        ${descPreview}
      </div>
      <div class="admin-item-actions">
        <label class="switch-toggle-wrap ${isFeatured ? 'switch-active' : ''}" title="${isFeatured ? 'Sedang tampil di beranda (Showing). Klik untuk sembunyikan.' : 'Disembunyikan dari beranda (Hiding). Klik untuk tampilkan di beranda.'}">
          <input type="checkbox" class="switch-toggle-input" data-work-toggle="${work.id}" ${isFeatured ? 'checked' : ''}>
          <span class="switch-toggle-slider"></span>
          <span class="switch-toggle-status ${isFeatured ? 'status-showing' : 'status-hiding'}">
            <span class="status-indicator-dot"></span>
            <span class="status-text">${isFeatured ? 'Showing' : 'Hiding'}</span>
          </span>
        </label>
        <button class="edit-button" data-work-edit="${work.id}" type="button">Edit</button>
        <button class="delete-button" data-work-delete="${work.id}" type="button">Hapus</button>
      </div>
    </div>`;
  }).join('') : '<div class="no-items">Belum ada karya tersimpan.</div>';

  // Handler Switch Showing / Hiding (Direct update to Supabase)
  list.querySelectorAll('[data-work-toggle]').forEach(input => input.addEventListener('change', async () => {
    const workId = input.dataset.workToggle;
    const targetWork = works.find(w => String(w.id) === String(workId));
    if (!targetWork) return;

    const isTurningOn = input.checked;
    const isDrive = isDriveWork(targetWork);
    const categoryName = isDrive ? 'album foto' : 'video';

    // Konfirmasi jika sudah ada 3 karya aktif di kategori ini
    if (isTurningOn) {
      const currentActive = works.filter(w => isDriveWork(w) === isDrive && isFeaturedWork(w)).length;
      if (currentActive >= 3) {
        const proceed = window.confirm(
          `Sudah ada 3 karya ${categoryName} pilihan di beranda.\n` +
          `Beranda hanya menampilkan maksimal 3 karya terbaik.\n\n` +
          `Apakah Anda tetap ingin mengaktifkan karya ini sebagai pilihan beranda?`
        );
        if (!proceed) {
          input.checked = false;
          return;
        }
      }
    }

    // 1. Simpan segera ke localStorage & update objek karya di memori
    setLocalFeatured(workId, isTurningOn);
    targetWork.is_featured = isTurningOn;

    // 2. Re-render UI seketika agar status langsung berubah di admin & beranda
    renderAdminWorks();
    renderPortfolio();

    // 3. Sync ke Supabase di background (jika RLS belum dibuka, tetap aman di browser)
    try {
      if (supabaseClient) {
        await supabaseClient
          .from('works')
          .update({ is_featured: isTurningOn })
          .eq('id', workId);
      }
    } catch (err) {
      console.warn('Sync ke Supabase server:', err);
    }
  }));

  list.querySelectorAll('[data-work-edit]').forEach(button => button.addEventListener('click', () => {
    startEditWork(button.dataset.workEdit);
  }));

  list.querySelectorAll('[data-work-delete]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus karya ini?')) return;
    try {
      const { error } = await supabaseClient.from('works').delete().eq('id', button.dataset.workDelete);
      if (error) throw error;
      if (editingWorkId && String(editingWorkId) === String(button.dataset.workDelete)) {
        cancelEditWork();
      }
      await loadData();
      renderAdminWorks();
      renderPortfolio();
    } catch (error) { window.alert(`Karya tidak dapat dihapus: ${error.message}`); }
  }));
}

function startEditWork(workId) {
  const work = works.find(w => String(w.id) === String(workId));
  if (!work) return;

  editingWorkId = work.id;
  const editIdInput = document.getElementById('edit-work-id');
  if (editIdInput) editIdInput.value = work.id;

  // Title and date
  const titleInput = document.getElementById('work-title');
  if (titleInput) titleInput.value = work.title || work.file_name || '';

  const dateInput = document.getElementById('work-date');
  if (dateInput) dateInput.value = work.work_date || '';

  // Description
  const descInput = document.getElementById('work-description');
  if (descInput) descInput.value = work.description || '';

  // Is Featured
  const featuredCheckbox = document.getElementById('work-is-featured');
  if (featuredCheckbox) featuredCheckbox.checked = isFeaturedWork(work);

  // Tools checkboxes
  const rawToolIds = Array.isArray(work.tool_ids) && work.tool_ids.length 
    ? work.tool_ids 
    : (work.tool_id ? [work.tool_id] : []);
  const activeToolIds = rawToolIds.map(Number);

  document.querySelectorAll('input[name="work-tools"]').forEach(cb => {
    cb.checked = activeToolIds.includes(Number(cb.value));
  });
  const fallbackToolSelect = document.getElementById('tool-id');
  if (fallbackToolSelect && activeToolIds.length) {
    fallbackToolSelect.value = String(activeToolIds[0]);
  }

  // Media Type & inputs
  const mediaTypeSelect = document.getElementById('work-media-type');
  const mediaR2Container = document.getElementById('media-r2-container');
  const mediaDriveContainer = document.getElementById('media-drive-container');

  const isDrive = work.media_type === 'drive_album' || work.media_type === 'album' || (work.drive_url && work.drive_url.includes('/folders/'));

  if (isDrive) {
    if (mediaTypeSelect) mediaTypeSelect.value = 'drive_album';
    if (mediaR2Container) mediaR2Container.hidden = true;
    if (mediaDriveContainer) mediaDriveContainer.hidden = false;

    const driveFolderInput = document.getElementById('work-drive-folder-url');
    if (driveFolderInput) {
      driveFolderInput.value = work.drive_url || (work.drive_file_id ? `https://drive.google.com/drive/folders/${work.drive_file_id}` : '');
    }

    const coverUrlInput = document.getElementById('work-album-cover-url');
    if (coverUrlInput) {
      coverUrlInput.value = work.r2_url || '';
    }

    const coverFileInput = document.getElementById('work-album-cover-file');
    if (coverFileInput) coverFileInput.value = '';
  } else {
    if (mediaTypeSelect) mediaTypeSelect.value = 'video';
    if (mediaR2Container) mediaR2Container.hidden = false;
    if (mediaDriveContainer) mediaDriveContainer.hidden = true;

    const r2UrlInput = document.getElementById('work-r2-url');
    if (r2UrlInput) {
      r2UrlInput.value = work.r2_url || '';
    }

    const fileInput = document.getElementById('work-file');
    if (fileInput) fileInput.value = '';
  }

  // Update UI heading and buttons
  const formHeading = document.getElementById('work-form-heading');
  if (formHeading) {
    formHeading.innerHTML = `Edit karya: <span style="font-weight:400;color:var(--gold-soft);font-size:0.85em;">"${escapeHtml(work.title || work.file_name || 'Karya')}"</span>`;
  }

  const submitBtn = document.getElementById('work-submit');
  if (submitBtn) {
    submitBtn.innerHTML = `Simpan perubahan <span>✓</span>`;
  }

  const cancelBtn = document.getElementById('cancel-edit-btn');
  if (cancelBtn) {
    cancelBtn.hidden = false;
  }

  // Smooth scroll to work form panel
  const panel = document.getElementById('work-form-panel');
  if (panel) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function cancelEditWork() {
  editingWorkId = null;
  const editIdInput = document.getElementById('edit-work-id');
  if (editIdInput) editIdInput.value = '';

  const portfolioForm = document.getElementById('portfolio-form');
  portfolioForm?.reset();

  // Reset description and featured checkbox explicitly (reset() may not always reset textarea)
  const descInput = document.getElementById('work-description');
  if (descInput) descInput.value = '';
  const featuredCheckbox = document.getElementById('work-is-featured');
  if (featuredCheckbox) featuredCheckbox.checked = false;

  const formHeading = document.getElementById('work-form-heading');
  if (formHeading) {
    formHeading.textContent = 'Tambah karya baru';
  }

  const submitBtn = document.getElementById('work-submit');
  if (submitBtn) {
    submitBtn.innerHTML = `Simpan karya <span>→</span>`;
  }

  const cancelBtn = document.getElementById('cancel-edit-btn');
  if (cancelBtn) {
    cancelBtn.hidden = true;
  }

  const mediaTypeSelect = document.getElementById('work-media-type');
  if (mediaTypeSelect) mediaTypeSelect.value = 'video';
  const mediaR2Container = document.getElementById('media-r2-container');
  const mediaDriveContainer = document.getElementById('media-drive-container');
  if (mediaR2Container) mediaR2Container.hidden = false;
  if (mediaDriveContainer) mediaDriveContainer.hidden = true;

  // Clear progress container if any
  const progressContainer = document.getElementById('upload-progress-container');
  if (progressContainer) progressContainer.hidden = true;
  const fileInfo = document.getElementById('work-file-info');
  if (fileInfo) fileInfo.hidden = true;
  const coverFileInfo = document.getElementById('work-album-cover-info');
  if (coverFileInfo) coverFileInfo.hidden = true;
}

function renderSocialMedia() {
  const links = document.getElementById('social-links');
  if (links) links.innerHTML = socialMedia.map(item => `<a class="social-link" href="${escapeHtml(item.profile_url)}" target="_blank" rel="noreferrer"><span><img src="${socialIconUrl(item)}" alt=""></span>${escapeHtml(item.username)}</a>`).join('');
  const list = document.getElementById('social-list');
  if (list) list.innerHTML = socialMedia.map(item => `<div class="tool-item"><span><b class="social-icon-small"><img src="${socialIconUrl(item)}" alt=""></b>${escapeHtml(item.platform)} · ${escapeHtml(item.username)}</span><button class="delete-button" data-social-delete="${item.id}" type="button">Hapus</button></div>`).join('');
  list?.querySelectorAll('[data-social-delete]').forEach(button => button.addEventListener('click', async () => {
    try {
      const { error } = await supabaseClient.from('social_media').delete().eq('id', button.dataset.socialDelete);
      if (error) throw error;
      await loadData(); renderSocialMedia();
    } catch (error) { window.alert(`Sosial media tidak dapat dihapus: ${error.message}`); }
  }));
}

function socialIconUrl(item) {
  const slugs = { Instagram: 'instagram', Facebook: 'facebook', YouTube: 'youtube', TikTok: 'tiktok', LinkedIn: 'linkedin', X: 'x' };
  const slug = slugs[item.platform] || item.icon;
  return `https://cdn.simpleicons.org/${encodeURIComponent(slug)}`;
}

function formatDate(value) { return value ? new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character])); }

async function uploadFile(file, folder, onProgress) {
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error(`Ukuran file terlalu besar. Maksimal ${formatFileSize(MAX_UPLOAD_SIZE)}.`);
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `${folder}/${Date.now()}-${safeName}`;
  const endpoint = `${window.PDD_SUPABASE_CONFIG.url}/storage/v1/object/portfolio-files/${path.split('/').map(encodeURIComponent).join('/')}`;
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', endpoint);
    request.setRequestHeader('Authorization', `Bearer ${window.PDD_SUPABASE_CONFIG.anonKey}`);
    request.setRequestHeader('apikey', window.PDD_SUPABASE_CONFIG.anonKey);
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.upload.addEventListener('progress', event => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) return resolve(path);
      let message = 'Upload file gagal.';
      try { message = JSON.parse(request.responseText).message || message; } catch {}
      reject(new Error(message));
    });
    request.addEventListener('error', () => reject(new Error('Koneksi upload terputus.')));
    request.addEventListener('abort', () => reject(new Error('Upload dibatalkan.')));
    request.send(file);
  });
}

function formatFileSize(bytes) {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

async function uploadToR2Worker(file, onProgress) {
  let workerUrl = window.PDD_SUPABASE_CONFIG?.r2WorkerUploadUrl;
  if (!workerUrl) {
    throw new Error('URL Cloudflare Worker belum diisi di supabase-config.js. Silakan atur r2WorkerUploadUrl atau masukkan link R2 langsung.');
  }
  if (!workerUrl.startsWith('http://') && !workerUrl.startsWith('https://')) {
    workerUrl = 'https://' + workerUrl;
  }

  // Batas ukuran Cloudflare Worker gratis (maksimum body request 95-100 MB)
  const MAX_WORKER_UPLOAD_SIZE = 95 * 1024 * 1024;
  if (file && file.size > MAX_WORKER_UPLOAD_SIZE) {
    throw new Error(
      `Ukuran file (${formatFileSize(file.size)}) melebihi batas upload langsung Worker (95 MB). ` +
      `Silakan kompres video terlebih dahulu, atau unggah langsung melalui dashboard Cloudflare R2 lalu masukkan tautan URL publiknya di form ini.`
    );
  }

  // Minta HMAC token dari Vercel Serverless Function.
  // Jika dibuka di lokal (file:// atau localhost), gunakan tokenApiUrl online dari supabase-config.js.
  const isLocal = window.location.protocol === 'file:' || 
                  window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1';
  const defaultTokenUrl = isLocal 
    ? (window.PDD_SUPABASE_CONFIG?.tokenApiUrl || 'https://koleksirefahganteng.vercel.app/api/get-upload-token')
    : '/api/get-upload-token';
  const tokenEndpoint = window.PDD_SUPABASE_CONFIG?.tokenApiUrl || defaultTokenUrl;

  let uploadToken = null;
  try {
    const tokenRes = await fetch(tokenEndpoint, { method: 'POST' });
    if (!tokenRes.ok) {
      const errData = await tokenRes.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${tokenRes.status}`);
    }
    const tokenData = await tokenRes.json();
    uploadToken = tokenData.token;
  } catch (err) {
    throw new Error(
      `Gagal menghubungi server token (${err.message}). ` +
      `Pastikan koneksi internet aktif, atau jika membuka secara lokal pastikan terhubung ke internet.`
    );
  }

  if (!uploadToken) {
    throw new Error('Token upload tidak diterima dari server.');
  }

  // Deteksi MIME type yang tepat agar tidak ditolak worker
  let mimeType = file.type;
  if (!mimeType || mimeType === 'application/octet-stream') {
    const ext = (file.name || '').split('.').pop().toLowerCase();
    const mimeMap = {
      mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/mp4',
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif'
    };
    mimeType = mimeMap[ext] || 'video/mp4';
  }

  // 1. TAHAP PRE-BUFFER (Paling penting untuk Google Drive di Android):
  // Saat user memilih file dari Google Drive di HP Android, file tersebut belum ada di memori internal.
  // Membaca file ke memori terlebih dahulu memastikan seluruh byte sudah terunduh sempurna ke HP
  // SEBELUM koneksi ke Cloudflare Worker dibuka, sehingga koneksi upload tidak akan stall / timeout!
  let readyBlob = file;
  try {
    const totalBytes = file.size || 0;
    const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
    onProgress?.(0, '0.0', totalMb, 'Menyiapkan file dari perangkat / Google Drive...');

    if (file.stream) {
      const reader = file.stream().getReader();
      const chunks = [];
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (totalBytes > 0) {
          const pct = Math.round((loaded / totalBytes) * 100);
          const loadedMb = (loaded / (1024 * 1024)).toFixed(1);
          onProgress?.(pct, loadedMb, totalMb, `Mengambil file dari Google Drive: ${pct}% (${loadedMb} MB / ${totalMb} MB)`);
        }
      }
      readyBlob = new Blob(chunks, { type: mimeType });
    } else {
      const buffer = await file.arrayBuffer();
      readyBlob = new Blob([buffer], { type: mimeType });
    }
  } catch (bufferErr) {
    console.warn('Pre-buffering file gagal, beralih ke streaming langsung:', bufferErr);
    readyBlob = file;
  }

  // 2. TAHAP UPLOAD KE CLOUDFLARE R2 (Menggunakan binary stream dari memori)
  const targetUrl = workerUrl + (workerUrl.includes('?') ? '&' : '?') + 'filename=' + encodeURIComponent(file.name || 'upload.mp4');

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', targetUrl);

    // Kirim token otorisasi dan Content-Type media langsung
    request.setRequestHeader('Authorization', `Bearer ${uploadToken}`);
    request.setRequestHeader('Content-Type', mimeType);

    request.upload.addEventListener('progress', event => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      const loadedMb = (event.loaded / (1024 * 1024)).toFixed(1);
      const totalMb = (event.total / (1024 * 1024)).toFixed(1);
      onProgress?.(percent, loadedMb, totalMb, `Mengunggah ke Cloudflare R2: ${percent}% (${loadedMb} MB / ${totalMb} MB)`);
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          const res = JSON.parse(request.responseText);
          if (res.url) {
            resolve(res.url);
          } else {
            reject(new Error(res.error || 'Upload gagal: URL tidak ditemukan pada response worker.'));
          }
        } catch (e) {
          reject(new Error('Format response Cloudflare Worker tidak valid.'));
        }
      } else {
        let msg = 'Upload ke Cloudflare R2 gagal.';
        try { msg = JSON.parse(request.responseText).error || msg; } catch {}
        reject(new Error(msg));
      }
    });

    request.addEventListener('error', () => {
      reject(new Error(
        'Koneksi upload ke Cloudflare Worker terputus. ' +
        'Kemungkinan penyebab: ukuran file melebihi limit (maks 95MB), ekstensi adblock/antivirus memblokir domain worker, atau koneksi internet terputus.'
      ));
    });
    request.addEventListener('abort', () => reject(new Error('Upload dibatalkan.')));
    request.send(readyBlob);
  });
}


// Helper kriptografi SHA-256 bawaan browser
async function computeSha256(text) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.warn('Crypto subtle tidak tersedia, fallback perbandingan langsung');
    return null;
  }
}

function setupAdminLogin() {
  const form = document.getElementById('login-form');
  const errorMessage = document.getElementById('login-error');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    errorMessage.hidden = true;
    try {
      const inputPhone = document.getElementById('login-name').value.trim();
      const inputPin = document.getElementById('login-password').value.trim();

      const inputPhoneHash = await computeSha256(inputPhone);
      const inputPinHash = await computeSha256(inputPin);

      const expectedPhoneHash = window.PDD_SUPABASE_CONFIG?.adminPhoneHash;
      const expectedPinHash = window.PDD_SUPABASE_CONFIG?.adminPinHash;

      // Fallback jika masih ada konfigurasi lama
      const legacyPhone = window.PDD_SUPABASE_CONFIG?.adminPhone;
      const legacyPin = window.PDD_SUPABASE_CONFIG?.adminPin;

      let isPhoneMatch = false;
      let isPinMatch = false;

      if (expectedPhoneHash && inputPhoneHash) {
        isPhoneMatch = inputPhoneHash === expectedPhoneHash;
      } else if (legacyPhone) {
        isPhoneMatch = inputPhone === String(legacyPhone).trim();
      }

      if (expectedPinHash && inputPinHash) {
        isPinMatch = inputPinHash === expectedPinHash;
      } else if (legacyPin) {
        isPinMatch = inputPin === String(legacyPin).trim();
      }

      if (isPhoneMatch && isPinMatch) {
        sessionStorage.setItem('pdd-admin-authenticated', 'true');
        window.location.replace('admin.html');
      } else {
        throw new Error('Nomor telepon atau PIN angka tidak sesuai.');
      }
    } catch (error) {
      errorMessage.textContent = error.message;
      errorMessage.hidden = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const adminContent = document.getElementById('admin-content');
  if (adminContent) window.scrollTo(0, 0);
  if (adminContent && sessionStorage.getItem('pdd-admin-authenticated') !== 'true') {
    window.location.replace('login.html');
    return;
  }
  if (adminContent) adminContent.hidden = false;
  if (!adminContent && document.getElementById('login-form')) setupAdminLogin();
  try {
    await loadData();
    renderProfile(); renderPortfolio(); renderAdminProfile(); renderToolOptions(); renderAdminWorks(); renderSocialMedia();
    // Expose data to window so dashboard.js (and other scripts) can read it
    window.works = works;
    window.tools = tools;
    window.profile = profile;
    window.dispatchEvent(new CustomEvent('pdd-data-loaded'));
  } catch (error) { console.error(error); window.alert(`Gagal memuat data: ${error.message}`); }

  const profileForm = document.getElementById('profile-form');
  profileForm?.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      let photoPath = profile.profile_photo_path;
      const photo = document.getElementById('profile-photo').files[0];
      if (photo) photoPath = await uploadFile(photo, 'profile');
      const { error } = await supabaseClient.from('owner_profile').update({ name: document.getElementById('owner-name').value.trim(), birth_date: document.getElementById('birth-date').value || null, profile_photo_path: photoPath, about: document.getElementById('owner-about-input').value.trim(), updated_at: new Date().toISOString() }).eq('id', true);
      if (error) throw error;
      await loadData(); renderProfile(); renderAdminProfile(); window.alert('Profil berhasil disimpan.');
    } catch (error) { window.alert(`Profil gagal disimpan: ${error.message}`); }
  });

  const toolForm = document.getElementById('tool-form');
  toolForm?.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const { error } = await supabaseClient.from('tools').insert({ name: document.getElementById('tool-name').value.trim() });
      if (error) throw error;
      toolForm.reset(); await loadData(); renderToolOptions(); window.alert('Tool berhasil ditambahkan.');
    } catch (error) { window.alert(`Tool gagal ditambahkan: ${error.message}`); }
  });

  const logoutBtn = document.getElementById('admin-logout-btn');
  logoutBtn?.addEventListener('click', () => {
    if (window.confirm('Yakin ingin keluar dari dashboard admin?')) {
      sessionStorage.removeItem('pdd-admin-authenticated');
      window.location.replace('login.html');
    }
  });

  // Switcher tipe media (Video R2 vs Album Google Drive)
  const mediaTypeSelect = document.getElementById('work-media-type');
  const mediaR2Container = document.getElementById('media-r2-container');
  const mediaDriveContainer = document.getElementById('media-drive-container');

  mediaTypeSelect?.addEventListener('change', () => {
    const isDrive = mediaTypeSelect.value === 'drive_album';
    if (mediaR2Container) mediaR2Container.hidden = isDrive;
    if (mediaDriveContainer) mediaDriveContainer.hidden = !isDrive;
  });

  // Tampilkan info ukuran file secara instan saat user memilih file
  const fileInputEl = document.getElementById('work-file');
  const fileInfoEl = document.getElementById('work-file-info');
  fileInputEl?.addEventListener('change', () => {
    const file = fileInputEl.files?.[0];
    if (!file) {
      if (fileInfoEl) fileInfoEl.hidden = true;
      return;
    }
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    if (fileInfoEl) {
      fileInfoEl.hidden = false;
      if (file.size > 95 * 1024 * 1024) {
        fileInfoEl.className = 'file-size-hint file-size-hint--warn';
        fileInfoEl.innerHTML = `⚠️ <strong>${escapeHtml(file.name)} (${sizeMb} MB)</strong>: Melebihi batas 95 MB. Silakan kompres video terlebih dahulu, atau unggah langsung ke dashboard Cloudflare R2 lalu masukkan URL publiknya di bawah.`;
      } else {
        fileInfoEl.className = 'file-size-hint file-size-hint--ok';
        fileInfoEl.innerHTML = `✓ <strong>${escapeHtml(file.name)} (${sizeMb} MB)</strong>: Ukuran aman dan siap diunggah ke Cloudflare R2.`;
      }
    }
  });

  const coverFileInputEl = document.getElementById('work-album-cover-file');
  const coverFileInfoEl = document.getElementById('work-album-cover-info');
  coverFileInputEl?.addEventListener('change', () => {
    const file = coverFileInputEl.files?.[0];
    if (!file) {
      if (coverFileInfoEl) coverFileInfoEl.hidden = true;
      return;
    }
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    if (coverFileInfoEl) {
      coverFileInfoEl.hidden = false;
      if (file.size > 20 * 1024 * 1024) {
        coverFileInfoEl.className = 'file-size-hint file-size-hint--warn';
        coverFileInfoEl.innerHTML = `⚠️ <strong>${escapeHtml(file.name)} (${sizeMb} MB)</strong>: Foto cover terlalu besar. Disarankan di bawah 10 MB.`;
      } else {
        coverFileInfoEl.className = 'file-size-hint file-size-hint--ok';
        coverFileInfoEl.innerHTML = `✓ <strong>${escapeHtml(file.name)} (${sizeMb} MB)</strong>: Siap diunggah sebagai foto cover album.`;
      }
    }
  });

  const portfolioForm = document.getElementById('portfolio-form');
  portfolioForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const submitBtn = document.getElementById('work-submit');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressFill = document.getElementById('upload-progress-fill');
    const progressText = document.getElementById('upload-progress-text');
    const isDriveAlbum = document.getElementById('work-media-type')?.value === 'drive_album';

    try {
      submitBtn.disabled = true;
      const title = document.getElementById('work-title').value.trim();
      const workDate = document.getElementById('work-date').value;
      const description = (document.getElementById('work-description')?.value || '').trim();
      const isFeatured = document.getElementById('work-is-featured')?.checked === true;

      const checkedTools = document.querySelectorAll('input[name="work-tools"]:checked');
      const selectedToolIds = Array.from(checkedTools).map(cb => Number(cb.value)).filter(Boolean);

      if (selectedToolIds.length === 0) {
        const select = document.getElementById('tool-id');
        if (select?.value) selectedToolIds.push(Number(select.value));
      }

      if (selectedToolIds.length === 0) {
        throw new Error('Pilih minimal satu tool yang digunakan untuk karya ini.');
      }

      if (isDriveAlbum) {
        // --- ALUR SIMPAN ALBUM FOTO GOOGLE DRIVE ---
        const folderUrl = document.getElementById('work-drive-folder-url')?.value.trim();
        const folderId = extractDriveFolderId(folderUrl);

        if (!folderId) {
          throw new Error('Link Folder Google Drive tidak valid. Masukkan URL folder lengkap, misal: https://drive.google.com/drive/folders/xxxx');
        }

        let coverUrl = document.getElementById('work-album-cover-url')?.value.trim() || '';
        const coverFileInput = document.getElementById('work-album-cover-file');
        const coverFile = coverFileInput?.files?.[0];

        if (coverFile) {
          if (progressContainer) {
            progressContainer.hidden = false;
            progressFill.style.width = '0%';
            progressText.textContent = 'Mengunggah foto cover ke R2: 0%';
          }
          coverUrl = await uploadToR2Worker(coverFile, (percent, loadedMb, totalMb, customText) => {
            if (progressFill) progressFill.style.width = `${percent}%`;
            if (progressText) {
              progressText.textContent = customText || (totalMb 
                ? `Mengunggah foto cover: ${percent}% (${loadedMb} MB / ${totalMb} MB)`
                : `Mengunggah foto cover: ${percent}%`);
            }
          });
        }

        // Jika cover dimasukkan lewat link share file Google Drive
        if (coverUrl.includes('drive.google.com')) {
          const fileId = extractDriveFileId(coverUrl);
          if (fileId) coverUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
        }

        // Jika dalam mode edit dan coverUrl tidak diubah / kosong, tetap gunakan coverUrl yang lama jika ada
        if (editingWorkId && !coverUrl) {
          const existingWork = works.find(w => String(w.id) === String(editingWorkId));
          if (existingWork?.r2_url) coverUrl = existingWork.r2_url;
        }

        if (editingWorkId) {
          setLocalFeatured(editingWorkId, isFeatured);
          setLocalDescription(editingWorkId, description);
          const { error } = await supabaseClient.from('works').update({
            title, file_name: title, r2_url: coverUrl,
            media_type: 'drive_album', drive_file_id: folderId, drive_url: folderUrl,
            work_date: workDate, tool_id: selectedToolIds[0], tool_ids: selectedToolIds,
            description: description, is_featured: isFeatured
          }).eq('id', editingWorkId);
          if (error) console.warn('Supabase update error:', error);
        } else {
          const { data, error } = await supabaseClient.from('works').insert({
            title, file_name: title, r2_url: coverUrl,
            media_type: 'drive_album', drive_file_id: folderId, drive_url: folderUrl,
            work_date: workDate, tool_id: selectedToolIds[0], tool_ids: selectedToolIds,
            description: description, is_featured: isFeatured
          }).select();
          if (error) throw error;
          if (data && data[0]) {
            setLocalFeatured(data[0].id, isFeatured);
            setLocalDescription(data[0].id, description);
          }
        }

      } else {
        // --- ALUR SIMPAN VIDEO R2 ---
        const fileInput = document.getElementById('work-file');
        const r2UrlInput = document.getElementById('work-r2-url');
        let finalMediaUrl = r2UrlInput?.value.trim() || '';
        let mediaType = 'video';

        const file = fileInput?.files?.[0];
        if (file) {
          mediaType = file.type.startsWith('image/') ? 'image' : 'video';
          if (progressContainer) {
            progressContainer.hidden = false;
            progressFill.style.width = '0%';
            progressText.textContent = 'Mengunggah ke Cloudflare R2: 0%';
          }
          finalMediaUrl = await uploadToR2Worker(file, (percent, loadedMb, totalMb, customText) => {
            if (progressFill) progressFill.style.width = `${percent}%`;
            if (progressText) {
              progressText.textContent = customText || (totalMb 
                ? `Mengunggah ke Cloudflare R2: ${percent}% (${loadedMb} MB / ${totalMb} MB)`
                : `Mengunggah ke Cloudflare R2: ${percent}%`);
            }
          });
        }

        if (editingWorkId && !finalMediaUrl) {
          const existingWork = works.find(w => String(w.id) === String(editingWorkId));
          if (existingWork?.r2_url) {
            finalMediaUrl = existingWork.r2_url;
            mediaType = existingWork.media_type || (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(finalMediaUrl) ? 'image' : 'video');
          }
        }

        if (!finalMediaUrl) {
          throw new Error('Pilih file media untuk diunggah ke R2 atau masukkan URL publik Cloudflare R2.');
        }

        if (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(finalMediaUrl)) {
          mediaType = 'image';
        }

        if (editingWorkId) {
          setLocalFeatured(editingWorkId, isFeatured);
          setLocalDescription(editingWorkId, description);
          const { error } = await supabaseClient.from('works').update({
            title, file_name: title, r2_url: finalMediaUrl, media_type: mediaType,
            work_date: workDate, tool_id: selectedToolIds[0], tool_ids: selectedToolIds,
            description: description, is_featured: isFeatured
          }).eq('id', editingWorkId);
          if (error) console.warn('Supabase update error:', error);
        } else {
          const { data, error } = await supabaseClient.from('works').insert({
            title, file_name: title, r2_url: finalMediaUrl, media_type: mediaType,
            work_date: workDate, tool_id: selectedToolIds[0], tool_ids: selectedToolIds,
            description: description, is_featured: isFeatured
          }).select();
          if (error) throw error;
          if (data && data[0]) {
            setLocalFeatured(data[0].id, isFeatured);
            setLocalDescription(data[0].id, description);
          }
        }
      }

      const wasEditing = Boolean(editingWorkId);
      cancelEditWork();
      await loadData();
      renderPortfolio();
      renderAdminWorks();
      window.alert(wasEditing ? 'Perubahan karya berhasil disimpan.' : 'Karya / album berhasil disimpan.');
    } catch (error) {
      window.alert(`Karya gagal disimpan: ${error.message}`);
    } finally {
      submitBtn.disabled = false;
      if (progressContainer) progressContainer.hidden = true;
    }
  });

  const cancelBtn = document.getElementById('cancel-edit-btn');
  cancelBtn?.addEventListener('click', () => {
    cancelEditWork();
  });

  const socialForm = document.getElementById('social-form');
  socialForm?.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const platform = document.getElementById('social-platform');
      const selected = platform.options[platform.selectedIndex];
      const { error } = await supabaseClient.from('social_media').insert({ platform: platform.value, icon: selected.dataset.icon, username: document.getElementById('social-username').value.trim(), profile_url: document.getElementById('social-url').value.trim() });
      if (error) throw error;
      socialForm.reset(); await loadData(); renderSocialMedia(); window.alert('Sosial media berhasil ditambahkan.');
    } catch (error) { window.alert(`Sosial media gagal ditambahkan: ${error.message}`); }
  });
});
