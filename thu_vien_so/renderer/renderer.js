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
  // Electron thật → dùng IPC → SQLite
  if (ipc) return await ipc.invoke(channel, ...args);

  // Không có Electron → fallback sang MOCK_DATA (window.MOCK_DATA từ mock_data.js)
  return mockCall(channel, ...args);
}

// Mock IPC handler — dùng khi chạy trên browser hoặc test
function mockCall(channel, ...args) {
  const data = window.MOCK_DATA || [];
  switch (channel) {
    case 'sangkien:getAll':
      return { ok:true, data: args[0]
        ? data.filter(d => d.linh_vuc === args[0])
        : [...data] };
    case 'sangkien:getById':
      return { ok:true, data: data.find(d => d.id === args[0]) || null };
    case 'stats:get':
      return { ok:true, data: window.MOCK_STATS ||
        { total:data.length, thammu:0, chinhri:0, hckt:0 } };
    case 'open-file':
      return { ok:false, error:'Không tìm thấy — chạy Electron để mở file thật' };
    case 'open-link-external':
      window.open(args[0], '_blank', 'noopener,noreferrer');
      return { ok:true };
    default:
      return { ok:false, error:'Mock không hỗ trợ: ' + channel };
  }
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

window.openHoSoPath = async function(p) {
  console.log("Đang yêu cầu mở file:", p);
  if (!p) {
    console.warn("Đường dẫn trống.");
    return;
  }
  
  try {
    // Gọi sang main process (bạn đã cấu hình trong main.js)
    const res = await call('open-file', p); 
    console.log("Kết quả mở file:", res);
    
    if (!res || !res.ok) {
      alert("Không thể mở file. Lỗi: " + (res ? res.error : "Unknown"));
    }
  } catch (err) {
    console.error("Lỗi thực thi IPC:", err);
  }
};

async function init() {
  show('screen-loading');

  try {
    const res = await call('sangkien:getAll');
    if (res.ok && res.data && res.data.length > 0) {
      allData = res.data;
      console.log(`[Thu Vien] Tải ${allData.length} sáng kiến từ SQLite`);
    } else {
      // Fallback: dùng MOCK_DATA nếu DB rỗng hoặc lỗi
      allData = window.MOCK_DATA || [];
      console.warn('[Thu Vien] Dùng dữ liệu mẫu:', res.error || 'DB rỗng');
    }
  } catch (e) {
    allData = window.MOCK_DATA || [];
    console.warn('[Thu Vien] Exception, dùng mock:', e.message);
  }

  updateStats();
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

  renderFilePreview(item);
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

  // Kiểm tra link video có tồn tại không
  const v = item && item.link_video && String(item.link_video).trim();

  if (v) {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';

    // Gán sự kiện click để mở link y hệt như trong openHoSoModal
    btn.onclick = () => {
      console.log("Đang mở video:", v);
      // Cách 1: Mở bằng cửa sổ trình duyệt (như bạn yêu cầu)
      window.open(v, '_blank', 'noopener,noreferrer');
      
      // Cách 2: (Khuyên dùng cho Electron) Mở bằng trình duyệt mặc định của hệ thống
      // call('open-link-external', v); 
    };
  } else {
    btn.disabled = true;
    btn.style.opacity = '0.55';
    btn.style.cursor = 'not-allowed';
    btn.onclick = null;
  }
}

function renderFilePreview(item) {
  const el = document.getElementById('d-file-preview');
  if (!el) return;

  // Chỉ lưu TÊN FILE (đã lưu trong DB)
  const files = [
    { ten: 'Thuyết minh', file: item.file_thuyet_minh },
    { ten: 'Quyết định',  file: item.file_quyet_dinh },
    { ten: 'Hình ảnh',    file: item.file_anh },
    { ten: 'Bản vẽ',      file: item.file_ban_ve },
    { ten: 'Hiệu quả',    file: item.file_hieu_qua }
  ].filter(f => f.file && String(f.file).trim() !== '');

  if (files.length === 0) {
    el.innerHTML =
      '<p style="color:#888;font-size:13px;font-style:italic;">Chưa có tệp đính kèm.</p>';
    return;
  }

  el.innerHTML = files.map((f, i) => `
    <div class="file-item" data-idx="${i}">
      <div class="fi-icon"><i class="fas fa-file-alt"></i></div>
      <div>
        <div class="fi-name">${f.ten}</div>
        <div class="fi-sub">${f.file}</div>
      </div>
      <i class="fas fa-chevron-right fi-arrow"></i>
    </div>
  `).join('');

  // Gán sự kiện click
  el.querySelectorAll('.file-item').forEach(row => {
    const idx = Number(row.dataset.idx);
    row.addEventListener('click', () => {
      console.log('[renderFilePreview] Mở file:', files[idx].file);
      openHoSoPath(files[idx].file);
    });
  });
}

function openHoSoPath(fileName) {
  if (!fileName) return;

  call('open-file', fileName).then(res => {
    console.log('[openHoSoPath] Result:', res);
    if (!res || !res.ok) {
      alert('Không thể mở tệp: ' + (res?.error || 'Unknown error'));
    }
  }).catch(err => {
    console.error('[openHoSoPath] IPC error:', err);
    alert('Lỗi IPC khi mở file');
  });
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

  // 1. Thu thập các tệp tin từ các trường dữ liệu mới
  const files = [
    { ten: 'Thuyết minh', path: item.file_thuyet_minh },
    { ten: 'Quyết định', path: item.file_quyet_dinh },
    { ten: 'Hình ảnh sáng kiến', path: item.file_anh },
    { ten: 'Bản vẽ kỹ thuật', path: item.file_ban_ve },
    { ten: 'Đánh giá hiệu quả', path: item.file_hieu_qua }
  ].filter(f => f.path && String(f.path).trim() !== '');

  let html = '';

  // 2. Hiển thị danh sách tệp đính kèm
  html += '<div class="hoso-section-title">Tệp đính kèm</div>';
  if (files.length) {
    html += '<div class="file-list">';
    files.forEach(f => {
        // FIX: dùng index thay vì nhúng path vào HTML
      html += `
        <div class="file-item hoso-file-item" data-idx="${files.indexOf(f)}">
          <div class="fi-icon"><i class="fas fa-file-alt"></i></div>
          <div>
            <div class="fi-name">${escapeHtml(f.ten)}</div>
            <div class="fi-sub">Bấm để xem chi tiết</div>
          </div>
          <i class="fas fa-external-link-alt fi-arrow"></i>
        </div>`;
    });
    html += '</div>';
  } else {
    html += '<div class="file-empty">Chưa có tệp đính kèm nào được cập nhật.</div>';
  }

  // 3. GIỮ LẠI: Phần Mã QR
  const qrText = (item.qr_noi_dung || '').trim();
  if (qrText) {
    html += `
      <div class="hoso-section-title">Mã QR Nội dung</div>
      <div class="hoso-qr-wrap">
        <div id="hoso-qrcode"></div>
        <div class="hoso-qr-caption">${escapeHtml(qrText)}</div>
      </div>`;
  }

  // 4. GIỮ LẠI: Phần Liên kết Video
  const v = (item.link_video || '').trim();
  if (v) {
    html += `
      <div class="hoso-section-title">Liên kết video</div>
      <p class="lib-video-fallback">${escapeHtml(v)}</p>
      <button type="button" class="action-btn secondary" id="modal-hoso-open-video" style="margin-top:8px">
        <i class="fas fa-external-link-alt"></i> Mở video
      </button>`;
  }

  // Đưa toàn bộ nội dung vào modal body
  body.innerHTML = `<div class="hoso-center-wrap">${html}</div>`;

  // FIX: Gán sự kiện dùng index → đọc path từ mảng files (không từ HTML)
  body.querySelectorAll('.hoso-file-item[data-idx]').forEach(row => {
    const idx = Number(row.dataset.idx);
    row.addEventListener('click', () => {
      const p = files[idx] && files[idx].path.replace(/\\/g, '/');
      console.log('[openHoSoModal] Mở file idx:', idx, 'path:', p);
      openHoSoPath(p);
    });
  });

  // Xử lý sự kiện mở video ngoài
  const hv = document.getElementById('modal-hoso-open-video');
  if (hv && v) hv.onclick = () => window.open(v, '_blank', 'noopener,noreferrer');

  // Khởi tạo QR Code nếu có dữ liệu (Sử dụng thư viện QRCode.js có sẵn)
  if (qrText && typeof QRCode !== 'undefined') {
    const host = document.getElementById('hoso-qrcode');
    if (host) {
      host.innerHTML = '';
      new QRCode(host, { text: qrText, width: 180, height: 180 });
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