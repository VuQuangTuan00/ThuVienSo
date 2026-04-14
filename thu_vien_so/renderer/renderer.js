// ═══════════════════════════════════════════
//  thu_vien.js — Thư Viện Số Sáng Kiến
//  Đọc dữ liệu từ SQLite qua IPC (Electron)
//  Hoặc dùng Mock khi test trên browser
// ═══════════════════════════════════════════

// ── IPC Bridge (chỉ Electron — không dùng mock) ──
let ipc = null;
try {
  ipc = require('electron').ipcRenderer;
} catch (_) {
  ipc = null;
}
const isElectron = !!ipc;

async function call(channel, ...args) {
  if (!ipc) {
    return {
      ok: false,
      error: 'Chạy ứng dụng bằng Electron (npm start) để đọc SQLite.'
    };
  }
  return await ipc.invoke(channel, ...args);
}

// ── State ──
let allData    = [];
let currentTab = 'all';
let currentItem = null;

// ── Constants ──
const TAB_LABELS = {
  thammu:  'Ngành Tham mưu',
  chinhri: 'Ngành Chính trị',
  hckt:    'Ngành HC-KT'
};

// ══════════════════════════════════════
//  KHỞI ĐỘNG
// ══════════════════════════════════════

async function init() {
  // Hiện loading trong khi tải dữ liệu
  show('screen-loading');

  try {
    const res = await call('sangkien:getAll');
    if (res.ok) {
      allData = res.data;
    } else {
      console.error('[Thu Vien] Lỗi tải dữ liệu:', res.error);
      allData = [];
    }
  } catch (e) {
    console.error('[Thu Vien] Exception:', e);
    allData = [];
  }

  // Cập nhật stats trên splash / home
  updateStats();

  // Chuyển sang splash sau khi load xong
  show('screen-splash');
}

// ══════════════════════════════════════
//  STATS
// ══════════════════════════════════════

function updateStats() {
  // Top bar stats
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  const total   = allData.length;
  const thammu  = allData.filter(d => d.linh_vuc === 'thammu').length;
  const chinhri = allData.filter(d => d.linh_vuc === 'chinhri').length;
  const hckt    = allData.filter(d => d.linh_vuc === 'hckt').length;

  setEl('stat-total',  total);
  setEl('stat-thammu', thammu);
  setEl('stat-ct',     chinhri);
  setEl('stat-hk',     hckt);
}

// ══════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════

function show(id) {
  document.querySelectorAll('.screen')
    .forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function goHome() {
  show('screen-home');
  renderItems(currentTab);
}

function goAdmin() {
  // Mở trang admin trong cùng cửa sổ
  if (isElectron) {
    const path = require('path');
    const { remote } = require('electron');
    // Dùng ipc để mở cửa sổ admin mới
    if (ipc) ipc.send('open-admin');
  } else {
    window.location.href = './admin/sign_up_admin.html';
  }
}

function switchTab(tab, el) {
  currentTab = tab;
  document.querySelectorAll('.nav-tab')
    .forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderItems(tab);
}

// ══════════════════════════════════════
//  RENDER DANH SÁCH
// ══════════════════════════════════════

function renderItems(tab) {
  const container = document.getElementById('home-content');

  if (tab === 'all') {
    // Nhóm theo lĩnh vực
    let html = '';
    ['thammu', 'chinhri', 'hckt'].forEach(t => {
      const group = allData.filter(d => d.linh_vuc === t);
      if (group.length === 0) return;
      html += `
        <div class="section-header">
          <h2>
            <i class="fas fa-chevron-right"
               style="color:var(--gold);margin-right:6px"></i>
            ${TAB_LABELS[t]}
          </h2>
        </div>
        <div class="items-grid" style="margin-bottom:28px">
          ${group.map(cardHTML).join('')}
        </div>`;
    });

    if (!html) html = emptyStateHTML();
    container.innerHTML = html;

  } else {
    const items = allData.filter(d => d.linh_vuc === tab);
    container.innerHTML = `
      <div class="section-header">
        <h2>
          <i class="fas fa-chevron-right"
             style="color:var(--gold);margin-right:6px"></i>
          ${TAB_LABELS[tab]}
        </h2>
      </div>
      <div class="items-grid">
        ${items.length ? items.map(cardHTML).join('') : emptyStateHTML()}
      </div>`;
  }
}

function cardHTML(item) {
  // authors có thể là JSON string (từ SQLite) hoặc array
  const authors = parseAuthors(item.authors);
  const authorCount = authors.length;
  const unitShort   = (item.don_vi || '').split('/')[0];

  return `
    <div class="item-card" onclick="openDetail(${item.id})">
      <div class="ic-type">${item.loai || ''}</div>
      <div class="ic-name">${item.ten}</div>
      <div class="ic-meta">
        <span>
          <i class="fas fa-calendar" style="color:var(--gold-d)"></i>
          ${item.ngay_ap_dung || ''}
        </span>
        ${unitShort ? `<span>
          <i class="fas fa-building" style="color:var(--gold-d)"></i>
          ${unitShort}
        </span>` : ''}
        ${authorCount ? `<span>
          <i class="fas fa-users" style="color:var(--gold-d)"></i>
          ${authorCount} tác giả
        </span>` : ''}
      </div>
      <div class="ic-stars">★★★★★</div>
      <i class="fas fa-arrow-right ic-arrow"></i>
    </div>`;
}

function emptyStateHTML() {
  return `
    <div class="empty-state">
      <i class="fas fa-inbox"></i>
      <p>Chưa có sáng kiến nào</p>
    </div>`;
}

// ══════════════════════════════════════
//  CHI TIẾT SÁNG KIẾN
// ══════════════════════════════════════

async function openDetail(id) {
  const nid = Number(id);
  let item = allData.find(d => Number(d.id) === nid);
  try {
    const res = await call('sangkien:getById', nid);
    if (res.ok && res.data) item = res.data;
  } catch (e) {
    console.error('[Thu Vien] getById:', e);
  }
  if (!item) return;

  currentItem = item;

  // Topbar
  document.getElementById('detail-topbar-title').textContent = item.ten;

  // Nút back về đúng tab
  const backLabel = TAB_LABELS[item.linh_vuc] || 'Quay lại';
  document.getElementById('detail-back-label').textContent = backLabel;
  document.getElementById('detail-back-btn').onclick = () => {
    show('screen-home');
    currentTab = item.linh_vuc;
    const tabMap = { thammu:1, chinhri:2, hckt:3 };
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(t => t.classList.remove('active'));
    if (tabMap[item.linh_vuc] !== undefined) {
      tabs[tabMap[item.linh_vuc]].classList.add('active');
    }
    renderItems(item.linh_vuc);
  };

  document.getElementById('d-category').textContent = item.loai || '';
  document.getElementById('d-title').textContent    = item.ten;
  document.getElementById('d-unit').textContent     = item.don_vi || '';
  document.getElementById('d-date').textContent     = item.ngay_ap_dung || '';
  document.getElementById('d-field').textContent    = TAB_LABELS[item.linh_vuc] || '';

  const authors = parseAuthors(item.authors);
  let authHTML  = '';
  if (authors.length) {
    authors.forEach(a => {
      authHTML += `
        <div class="info-row">
          <span class="lbl">${escapeHtml(a.cap_bac || '')}</span>
          <span class="val">${escapeHtml(a.ho_ten)}${a.chuc_vu ? ' – ' + escapeHtml(a.chuc_vu) : ''}</span>
        </div>`;
    });
  } else {
    authHTML = `<div class="info-row">
      <span class="val" style="color:var(--dim)">Đang cập nhật</span>
    </div>`;
  }
  document.getElementById('d-authors').innerHTML = authHTML;

  renderFilePreview(item.hoSo || []);
  updateVideoButtonState(item);

  show('screen-detail');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toYouTubeEmbed(url) {
  if (!url) return '';
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch { /* ignore */ }
  return '';
}

function updateVideoButtonState(item) {
  const btn = document.getElementById('btn-xem-video');
  if (!btn) return;
  const has = item && item.link_video && String(item.link_video).trim();
  btn.disabled = !has;
  btn.style.opacity = has ? '1' : '0.55';
}

function renderFilePreview(hoSo) {
  const el = document.getElementById('d-file-preview');
  if (!el) return;
  if (!hoSo || !hoSo.length) {
    el.innerHTML = '<div class="file-empty">Chưa có tệp trong cơ sở dữ liệu.</div>';
    return;
  }
  const max = 4;
  const slice = hoSo.slice(0, max);
  const iconFor = (loai) => {
    const t = (loai || '').toLowerCase();
    if (t.includes('pdf')) return 'fa-file-pdf';
    if (t.includes('video') || t.includes('mp4')) return 'fa-file-video';
    if (t.includes('image') || t.includes('png') || t.includes('jpg')) return 'fa-file-image';
    return 'fa-file';
  };
  let html = '';
  slice.forEach((f, i) => {
    html += `
      <div class="file-item" onclick="openHoSoFile(${i})">
        <div class="fi-icon"><i class="fas ${iconFor(f.loai_file)}"></i></div>
        <div>
          <div class="fi-name">${escapeHtml(f.ten_file || 'Tệp')}</div>
          <div class="fi-sub">${escapeHtml(f.loai_file || '')}${f.duong_dan ? ' · Nhấn để mở' : ''}</div>
        </div>
        <i class="fas fa-chevron-right fi-arrow"></i>
      </div>`;
  });
  if (hoSo.length > max) {
    html += `<div class="file-empty" style="margin-top:8px">+ ${hoSo.length - max} tệp khác — mở <strong>Xem Hồ Sơ</strong> để xem đầy đủ.</div>`;
  }
  el.innerHTML = html;
}

function openHoSoPath(p) {
  if (!p || !String(p).trim()) {
    window.alert('Chưa có đường dẫn tệp trong dữ liệu. Vui lòng cập nhật trong Admin khi có chức năng đính kèm file.');
    return;
  }
  if (isElectron) {
    try {
      const { shell } = require('electron');
      shell.openPath(p);
    } catch (e) {
      console.error(e);
    }
  } else {
    window.open(p, '_blank', 'noopener,noreferrer');
  }
}

window.openHoSoFile = function (index) {
  const hs = currentItem && currentItem.hoSo;
  if (!hs || !hs[index]) return;
  openHoSoPath(hs[index].duong_dan);
};

function openVideoModal() {
  const item = currentItem;
  const overlay = document.getElementById('modal-video');
  const body = document.getElementById('modal-video-body');
  const title = document.getElementById('modal-video-title');
  if (!item || !overlay || !body) return;

  const url = (item.link_video || '').trim();
  if (!url) {
    body.innerHTML = '<p class="lib-video-fallback">Chưa cấu hình liên kết video trong Admin.</p>';
    title.textContent = 'Video';
    overlay.classList.add('open');
    return;
  }

  title.textContent = 'Video — ' + item.ten;
  const embed = toYouTubeEmbed(url);
  if (embed) {
    body.innerHTML = `<div class="lib-video-wrap"><iframe src="${embed}" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  } else if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) {
    body.innerHTML = `<div class="lib-video-wrap"><video src="${escapeHtml(url)}" controls playsinline></video></div>`;
  } else {
    body.innerHTML = `
      <p class="lib-video-fallback">${escapeHtml(url)}</p>
      <button type="button" class="action-btn primary" id="modal-video-open-external" style="margin-top:12px">
        <i class="fas fa-external-link-alt"></i> Mở liên kết
      </button>`;
    const ob = document.getElementById('modal-video-open-external');
    if (ob) ob.onclick = () => window.open(url, '_blank', 'noopener,noreferrer');
  }
  overlay.classList.add('open');
}

function closeVideoModal() {
  const overlay = document.getElementById('modal-video');
  const body = document.getElementById('modal-video-body');
  if (body) body.innerHTML = '';
  if (overlay) overlay.classList.remove('open');
}

function openHoSoModal() {
  const item = currentItem;
  const overlay = document.getElementById('modal-hoso');
  const body = document.getElementById('modal-hoso-body');
  const title = document.getElementById('modal-hoso-title');
  if (!item || !overlay || !body) return;

  title.textContent = 'Hồ sơ — ' + item.ten;

  const hoSo = item.hoSo || [];
  let html = '';

  if (hoSo.length) {
    html += '<div class="hoso-section-title">Tệp đính kèm</div><div class="file-list">';
    hoSo.forEach((f, i) => {
      html += `
        <div class="file-item" onclick="openHoSoFile(${i})">
          <div class="fi-icon"><i class="fas fa-folder-open"></i></div>
          <div>
            <div class="fi-name">${escapeHtml(f.ten_file || 'Tệp')}</div>
            <div class="fi-sub">${escapeHtml(f.loai_file || 'file')}</div>
          </div>
          <i class="fas fa-external-link-alt fi-arrow"></i>
        </div>`;
    });
    html += '</div>';
  } else {
    html += '<div class="file-empty">Chưa có tệp đính kèm trong cơ sở dữ liệu.</div>';
  }

  const qrText = (item.qr_noi_dung || '').trim();
  if (qrText) {
    html += `
      <div class="hoso-section-title">Mã QR</div>
      <div class="hoso-qr-wrap">
        <div id="hoso-qrcode"></div>
        <div class="hoso-qr-caption">${escapeHtml(qrText)}</div>
      </div>`;
  }

  const v = (item.link_video || '').trim();
  if (v) {
    html += `
      <div class="hoso-section-title">Liên kết video</div>
      <p class="lib-video-fallback">${escapeHtml(v)}</p>
      <button type="button" class="action-btn secondary" id="modal-hoso-open-video" style="margin-top:8px">
        <i class="fas fa-external-link-alt"></i> Mở video
      </button>`;
  }

  body.innerHTML = html;

  const hv = document.getElementById('modal-hoso-open-video');
  if (hv && v) hv.onclick = () => window.open(v, '_blank', 'noopener,noreferrer');

  if (qrText && typeof QRCode !== 'undefined') {
    const host = document.getElementById('hoso-qrcode');
    if (host) {
      host.innerHTML = '';
      // eslint-disable-next-line no-new
      new QRCode(host, { text: qrText, width: 180, height: 180 });
    }
  } else if (qrText) {
    const host = document.getElementById('hoso-qrcode');
    if (host) {
      host.innerHTML = '<p class="lib-video-fallback">Không tải được thư viện QR (kiểm tra mạng/CDN).</p>';
    }
  }

  overlay.classList.add('open');
}

function closeHoSoModal() {
  const overlay = document.getElementById('modal-hoso');
  const body = document.getElementById('modal-hoso-body');
  if (body) body.innerHTML = '';
  if (overlay) overlay.classList.remove('open');
}

// ── Parse authors (SQLite trả về JSON string) ──
function parseAuthors(authors) {
  if (!authors) return [];
  if (Array.isArray(authors)) return authors;
  try { return JSON.parse(authors); } catch { return []; }
}

// ── Khởi động khi trang load ──
window.addEventListener('DOMContentLoaded', init);