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
  hckt:    'Ngành Hậu cần - Kỹ thuật'
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
    container.innerHTML = `
      <div class="charts-wrap">
        <div class="chart-card">
          <div class="chart-title">
            <i class="fas fa-chart-bar" style="color:var(--gold)"></i>
            Tổng sáng kiến theo lĩnh vực
          </div>
          <canvas id="chart-bar" height="200"></canvas>
        </div>
        <div class="chart-card">
          <div class="chart-title">
            <i class="fas fa-chart-pie" style="color:var(--gold)"></i>
            Phân loại theo hình thức
          </div>
          <div class="pie-wrap">
            <canvas id="chart-pie" height="220"></canvas>
            <div id="pie-legend" class="pie-legend"></div>
          </div>
        </div>
      </div>`;
    requestAnimationFrame(() => buildCharts());

  } else if (tab === 'compare') {
    renderCompareView();

  } else if (tab === 'honor') {
    renderHonorView();

  } else {
    const items = allData.filter(d => d.linh_vuc === tab);
    container.innerHTML = `
      <div class="section-header">
        <h2>
          <i class="fas fa-chevron-right" style="color:var(--gold);margin-right:6px"></i>
          ${TAB_LABELS[tab]}
        </h2>
      </div>
      <div class="items-grid">
        ${items.length ? items.map(cardHTML).join('') : emptyStateHTML()}
      </div>`;
  }
}

// ══════════════════════════════════════
//  VẼ BIỂU ĐỒ
// ══════════════════════════════════════

function buildCharts() {
  buildBarChart();
  buildPieChart();
}

// ── Màu sắc ──
// CHART_COLORS replaced by CHART_COLORS_TEAL above


const LOAI_COLORS = [
  '#c8a020','#3ca050','#4a8adc','#c05050',
  '#9060c0','#40b0b0','#e08030','#708090',
];

// ── Biểu đồ cột: Tổng sáng kiến / lĩnh vực ──
const CHART_COLORS_TEAL = {
  thammu:  { top:'#c05050', bot:'rgba(130, 14, 14,0.6)',  label:'#2c6975' },
  chinhri: { top:'#c8a020', bot:'rgba(110, 85, 7,0.55)', label:'#4b8f8d' },
  hckt:    { top:'#3ca050', bot:'rgba(19, 74, 30,0.55)', label:'#1e5460' },
};

function buildBarChart() {
  const canvas = document.getElementById('chart-bar');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const labels = ['Tham mưu', 'Chính trị', 'HC-KT'];
  const keys   = ['thammu', 'chinhri', 'hckt'];
  const values = keys.map(k => allData.filter(d => d.linh_vuc === k).length);
  const max    = Math.max(...values, 1);

  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.offsetWidth  || 480;
  const H   = 260;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const padL = 44, padR = 16, padT = 32, padB = 52;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const barW   = Math.max(36, Math.floor(chartW / keys.length * 0.52));
  const gap    = Math.floor(chartW / keys.length);

  // Lưu thông tin bar để dùng cho tooltip
  const barRects = keys.map((k, i) => {
    const barH = values[i] === 0 ? 0 : Math.max(6, (values[i] / max) * chartH);
    const x    = padL + gap * i + (gap - barW) / 2;
    const y    = padT + chartH - barH;
    return { x, y, w: barW, h: barH, label: labels[i], value: values[i], key: k };
  });

  function drawBar(highlightIdx) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.0)';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    const steps = Math.min(max, 5);
    for (let i = 0; i <= steps; i++) {
      const val = Math.round(max / steps * i);
      const y   = padT + chartH - (chartH / steps * i);
      ctx.strokeStyle = 'rgba(44,105,117,0.15)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#2c6975';
      ctx.font      = 'bold 11px Oswald, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(val, padL - 8, y + 4);
    }

    // Bars
    barRects.forEach((b, i) => {
      const col     = CHART_COLORS_TEAL[b.key];
      const isHover = (i === highlightIdx);

      ctx.shadowColor   = isHover ? 'rgba(44,105,117,0.45)' : 'rgba(44,105,117,0.25)';
      ctx.shadowBlur    = isHover ? 16 : 8;
      ctx.shadowOffsetY = 4;

      const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      grad.addColorStop(0, isHover ? '#3a8090' : col.top);
      grad.addColorStop(1, isHover ? 'rgba(58,128,144,0.7)' : col.bot);
      ctx.fillStyle = grad;

      const r = Math.min(6, b.w / 2);
      ctx.beginPath();
      ctx.moveTo(b.x + r, b.y);
      ctx.lineTo(b.x + b.w - r, b.y);
      ctx.quadraticCurveTo(b.x + b.w, b.y, b.x + b.w, b.y + r);
      ctx.lineTo(b.x + b.w, b.y + b.h);
      ctx.lineTo(b.x, b.y + b.h);
      ctx.lineTo(b.x, b.y + r);
      ctx.quadraticCurveTo(b.x, b.y, b.x + r, b.y);
      ctx.closePath();
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur  = 0;
      ctx.shadowOffsetY = 0;

      const valStr = String(b.value);
      ctx.font      = 'bold 15px Oswald, sans-serif';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(valStr).width;
      const bx = b.x + b.w / 2 - tw / 2 - 6;
      const by = b.y - 22;
      ctx.fillStyle = isHover ? '#1e5460' : col.top;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + 12, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(valStr, b.x + b.w / 2, by + 14);

      ctx.fillStyle = isHover ? '#2c6975' : '#1a3a42';
      ctx.font      = isHover ? 'bold 14px Oswald, sans-serif' : 'bold 13px Oswald, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + b.w / 2, H - padB + 22);
    });

    // Trục
    ctx.strokeStyle = 'rgba(44,105,117,0.35)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + chartH);
    ctx.lineTo(padL + chartW, padT + chartH);
    ctx.stroke();
  }

  drawBar(-1);

  // Tooltip
  const tooltip = getOrCreateTooltip();
  canvas.style.cursor = 'default';

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    let found  = -1;
    barRects.forEach((b, i) => {
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) found = i;
    });
    if (found >= 0) {
      const b = barRects[found];
      const pct = allData.length ? ((b.value / allData.length) * 100).toFixed(1) : 0;
      tooltip.innerHTML = `
        <div style="font-weight:700;font-size:13px;color:#2c6975;margin-bottom:4px">${b.label}</div>
        <div style="font-size:22px;font-weight:800;color:#1a3a42">${b.value} <span style="font-size:13px;color:#68b2a0">sáng kiến</span></div>
        <div style="font-size:11px;color:#888;margin-top:2px">${pct}% tổng số</div>
      `;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top  = (e.clientY - 10) + 'px';
      canvas.style.cursor = 'pointer';
      drawBar(found);
    } else {
      tooltip.style.display = 'none';
      canvas.style.cursor = 'default';
      drawBar(-1);
    }
  };
  canvas.onmouseleave = () => {
    tooltip.style.display = 'none';
    canvas.style.cursor = 'default';
    drawBar(-1);
  };
}

// ── Biểu đồ tròn: phân loại Loại hình ──
function buildPieChart() {
  const canvas = document.getElementById('chart-pie');
  const legend = document.getElementById('pie-legend');
  if (!canvas || !legend) return;
  const ctx = canvas.getContext('2d');

  const loaiMap = {};
  allData.forEach(d => {
    const loai = (d.loai || 'KHÁC').trim().toUpperCase();
    loaiMap[loai] = (loaiMap[loai] || 0) + 1;
  });

  const entries = Object.entries(loaiMap).sort((a, b) => b[1] - a[1]);
  const total   = allData.length || 1;

  const W = canvas.offsetWidth || 220;
  const H = 220;
  canvas.width  = W;
  canvas.height = H;

  const cx = W / 2;
  const cy = H / 2;
  const R  = Math.min(cx, cy) - 16;
  const r  = R * 0.52;

  // Tính trước góc từng slice để dùng cho hit-test
  let angle = -Math.PI / 2;
  const slices = entries.map(([loai, count], i) => {
    const slice = (count / total) * Math.PI * 2;
    const obj   = { loai, count, color: LOAI_COLORS[i % LOAI_COLORS.length], start: angle, end: angle + slice };
    angle += slice;
    return obj;
  });

  function drawPie(highlightIdx) {
    ctx.clearRect(0, 0, W, H);

    slices.forEach((s, i) => {
      const isHover = (i === highlightIdx);
      const offset  = isHover ? 6 : 0;
      const mid     = (s.start + s.end) / 2;
      const ox      = Math.cos(mid) * offset;
      const oy      = Math.sin(mid) * offset;

      ctx.save();
      ctx.translate(ox, oy);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, isHover ? R + 4 : R, s.start, s.end);
      ctx.closePath();
      ctx.fillStyle = s.color;
      if (isHover) {
        ctx.shadowColor = s.color;
        ctx.shadowBlur  = 14;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = 'rgba(10,25,10,0.6)';
      ctx.lineWidth   = 2;
      ctx.stroke();

      ctx.restore();
    });

    // Lỗ donut
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Text giữa
    if (highlightIdx >= 0) {
      const s   = slices[highlightIdx];
      const pct = ((s.count / total) * 100).toFixed(0);
      ctx.fillStyle = s.color;
      ctx.font      = 'bold 20px Oswald, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.count, cx, cy + 2);
      ctx.fillStyle = 'rgba(44,105,117,0.8)';
      ctx.font      = '10px Oswald, sans-serif';
      ctx.fillText(pct + '%', cx, cy + 16);
    } else {
      ctx.fillStyle = '#2c6975';
      ctx.font      = 'bold 22px Oswald, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(total, cx, cy + 2);
      ctx.fillStyle = 'rgba(44,105,117,0.7)';
      ctx.font      = '11px Oswald, sans-serif';
      ctx.fillText('TỔNG', cx, cy + 18);
    }
  }

  drawPie(-1);

  // Legend
  legend.innerHTML = entries.map(([loai, count], i) => {
    const pct   = ((count / total) * 100).toFixed(0);
    const color = LOAI_COLORS[i % LOAI_COLORS.length];
    const label = loai.length > 18 ? loai.slice(0, 16) + '…' : loai;
    return `
      <div class="pie-legend-item" data-pie-idx="${i}" style="cursor:pointer">
        <span class="pie-dot" style="background:${color}"></span>
        <span class="pie-lbl">${label}</span>
        <span class="pie-val">${count} <small>(${pct}%)</small></span>
      </div>`;
  }).join('');

  // Hover legend → highlight slice
  legend.querySelectorAll('.pie-legend-item').forEach(item => {
    const idx = Number(item.dataset.pieIdx);
    item.addEventListener('mouseenter', () => {
      item.style.background = 'rgba(44,105,117,0.08)';
      item.style.borderRadius = '6px';
      drawPie(idx);
    });
    item.addEventListener('mouseleave', () => {
      item.style.background = '';
      drawPie(-1);
    });
  });

  // Tooltip + hover trên canvas
  const tooltip = getOrCreateTooltip();
  canvas.style.cursor = 'default';

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left - cx;
    const my   = e.clientY - rect.top  - cy;
    const dist = Math.sqrt(mx * mx + my * my);

    if (dist < r || dist > R + 8) {
      tooltip.style.display = 'none';
      canvas.style.cursor = 'default';
      drawPie(-1);
      return;
    }

    let ang = Math.atan2(my, mx);
    if (ang < -Math.PI / 2) ang += Math.PI * 2;
    const normAng = ang + Math.PI / 2;

    let found = -1;
    slices.forEach((s, i) => {
      let start = s.start + Math.PI / 2;
      let end   = s.end   + Math.PI / 2;
      if (start < 0) { start += Math.PI * 2; end += Math.PI * 2; }
      if (normAng >= start && normAng < end) found = i;
    });
    // Fallback nếu normAng ngoài range
    if (found < 0) {
      let minDiff = Infinity;
      slices.forEach((s, i) => {
        const mid = (s.start + s.end) / 2;
        const diff = Math.abs(ang - mid);
        if (diff < minDiff) { minDiff = diff; found = i; }
      });
    }

    if (found >= 0) {
      const s   = slices[found];
      const pct = ((s.count / total) * 100).toFixed(1);
      tooltip.innerHTML = `
        <div style="font-weight:700;font-size:13px;color:${s.color};margin-bottom:4px">${s.loai}</div>
        <div style="font-size:22px;font-weight:800;color:#1a3a42">${s.count} <span style="font-size:13px;color:#68b2a0">sáng kiến</span></div>
        <div style="font-size:11px;color:#888;margin-top:2px">${pct}% tổng số</div>
      `;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top  = (e.clientY - 10) + 'px';
      canvas.style.cursor = 'pointer';
      drawPie(found);
    }
  };

  canvas.onmouseleave = () => {
    tooltip.style.display = 'none';
    canvas.style.cursor = 'default';
    drawPie(-1);
  };
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

// ══════════════════════════════════════
//  SEARCH
// ══════════════════════════════════════

// ══════════════════════════════════════
//  SEARCH ENGINE — dùng chung renderer + admin
// ══════════════════════════════════════

/**
 * Chuẩn hóa chuỗi tiếng Việt: bỏ dấu, lowercase.
 * Giúp tìm kiếm mờ khi người dùng gõ thiếu/sai dấu.
 * Ví dụ: "Sáng Kiến" → "sang kien"
 */
function normalizeVI(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // bỏ dấu tổ hợp
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

/**
 * searchData(data, query)
 * Tìm kiếm không phân biệt hoa/thường, HỖ TRỢ tiếng Việt có dấu/không dấu.
 * Hỗ trợ: tên sáng kiến · đơn vị · năm · loại · mô tả · tác giả
 * Trả về mảng kết quả có thêm field _matchField để biết match ở đâu.
 */
function searchData(data, query) {
  if (!query || !query.trim()) return [];
  const q     = query.trim().toLowerCase();  // truy vấn gốc (có dấu)
  const qNorm = normalizeVI(query.trim());   // truy vấn không dấu

  // Kiểm tra match: ưu tiên khớp có dấu (score cao hơn), fallback không dấu
  function matchScore(fieldRaw, baseScore) {
    const fieldLow  = (fieldRaw || '').toLowerCase();
    const fieldNorm = normalizeVI(fieldRaw);
    if (fieldLow.includes(q))          return baseScore;       // khớp chính xác (có dấu)
    if (fieldNorm.includes(qNorm))     return baseScore - 5;   // khớp không dấu (điểm thấp hơn 5)
    return 0;
  }

  return data
    .map(item => {
      const authorsStr = parseAuthors(item.authors)
        .map(a => `${a.ho_ten} ${a.cap_bac} ${a.chuc_vu}`)
        .join(' ');

      let score = 0;
      let matchField = '';

      const tenScore    = matchScore(item.ten,    100);
      const donViScore  = matchScore(item.don_vi, 80);
      const namScore    = matchScore(String(item.nam || item.ngay_ap_dung || ''), 70);
      const loaiScore   = matchScore(item.loai,   60);
      const moTaScore   = matchScore(item.mo_ta,  40);
      const authorScore = matchScore(authorsStr,  50);

      if      (tenScore    > 0) { score = tenScore;    matchField = 'ten'; }
      else if (donViScore  > 0) { score = donViScore;  matchField = 'don_vi'; }
      else if (namScore    > 0) { score = namScore;    matchField = 'nam'; }
      else if (loaiScore   > 0) { score = loaiScore;   matchField = 'loai'; }
      else if (authorScore > 0) { score = authorScore; matchField = 'authors'; }
      else if (moTaScore   > 0) { score = moTaScore;   matchField = 'mo_ta'; }

      return score > 0 ? { ...item, _score: score, _matchField: matchField } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score);
}

/** Highlight từ khóa trong text (safe HTML).
 *  Highlight cả khớp có dấu lẫn không dấu.
 */
function highlightKeyword(text, query) {
  if (!text || !query) return escapeHtml(text || '');
  const safe = escapeHtml(text);
  // Escape ký tự regex trong query GỐC (không escape HTML trước)
  const escapedQ = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return safe.replace(
      new RegExp(`(${escapedQ})`, 'gi'),
      '<mark class="search-hl">$1</mark>'
    );
  } catch (e) {
    return safe; // Nếu regex lỗi, trả về text gốc đã escape
  }
}

// Debounce timer
let _searchTimer = null;

function onHomeSearch(value) {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => _execSearch(value), 180);
  console.log('[Search] Query:', value);
}

function _execSearch(value) {
  const q        = (value || '').trim();
  const overlay  = document.getElementById('search-overlay');
  const list     = document.getElementById('search-results-list');
  const countEl  = document.getElementById('search-result-count');
  const clearBtn = document.getElementById('search-clear-btn');

  // FIX: Kiểm tra DOM elements tồn tại
  if (!overlay) { console.error('[Search] #search-overlay không tìm thấy trong DOM'); return; }
  if (!list)    { console.error('[Search] #search-results-list không tìm thấy trong DOM'); return; }
  if (!countEl) { console.error('[Search] #search-result-count không tìm thấy trong DOM'); return; }

  if (!q) {
    overlay.classList.remove('open');
    if (clearBtn) clearBtn.style.display = 'none';
    return;
  }

  if (clearBtn) clearBtn.style.display = 'flex';

  // FIX: Kiểm tra allData đã load chưa
  console.log(`[Search] Query: "${q}" | allData.length: ${allData.length}`);
  if (!allData.length) {
    list.innerHTML = '<div class="search-empty"><i class="fas fa-spinner fa-spin"></i><p>Đang tải dữ liệu...</p></div>';
    overlay.classList.add('open');
    return;
  }

  const results = searchData(allData, q);
  console.log(`[Search] Kết quả: ${results.length}`);

  countEl.innerHTML = results.length
    ? `<i class="fas fa-search"></i> Tìm thấy <strong>${results.length}</strong> kết quả cho "<em>${escapeHtml(q)}</em>"`
    : `<i class="fas fa-search"></i> Không có kết quả cho "<em>${escapeHtml(q)}</em>"`;

  const MATCH_LABEL = {
    ten: '', don_vi: 'Đơn vị', nam: 'Năm',
    loai: 'Loại', mo_ta: 'Mô tả', authors: 'Tác giả',
  };

  list.innerHTML = results.length
    ? results.map(item => {
        const authors    = parseAuthors(item.authors);
        const authorStr  = authors.slice(0,3).map(a => a.ho_ten).join(', ');
        const fieldLabel = TAB_LABELS[item.linh_vuc] || item.linh_vuc;
        const matchBadge = item._matchField && MATCH_LABEL[item._matchField]
          ? `<span class="search-match-badge">${MATCH_LABEL[item._matchField]}</span>` : '';

        return `
          <div class="search-result-item" onclick="openDetail(${item.id})">
            <div class="sri-header">
              <span class="sri-type">${escapeHtml(item.loai || '')}</span>
              ${matchBadge}
            </div>
            <div class="sri-name">${highlightKeyword(item.ten, q)}</div>
            <div class="sri-meta">
              <span><i class="fas fa-layer-group"></i> ${escapeHtml(fieldLabel)}</span>
              <span><i class="fas fa-building"></i> ${escapeHtml((item.don_vi||'').split('/')[0])}</span>
              ${item.ngay_ap_dung ? `<span><i class="fas fa-calendar"></i> ${escapeHtml(String(item.ngay_ap_dung))}</span>` : ''}
              ${authorStr ? `<span><i class="fas fa-users"></i> ${escapeHtml(authorStr)}</span>` : ''}
            </div>
          </div>`;
      }).join('')
    : `<div class="search-empty">
         <i class="fas fa-box-open"></i>
         <p>Thử tìm theo tên, đơn vị hoặc năm</p>
       </div>`;

  overlay.classList.add('open');
}

function clearSearch() {
  const inp = document.getElementById('home-search');
  if (inp) inp.value = '';
  const overlay = document.getElementById('search-overlay');
  if (overlay) overlay.classList.remove('open');
  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) clearBtn.style.display = 'none';
}

// Export để admin.js dùng lại
window.searchData = searchData;
window.highlightKeyword = highlightKeyword;

// ══════════════════════════════════════
//  TAB: SO SÁNH THEO NĂM
// ══════════════════════════════════════

function renderCompareView() {
  const container = document.getElementById('home-content');
  container.innerHTML = `
    <div class="compare-view">
      <div class="compare-header">
        <div class="compare-title">
          <i class="fas fa-chart-bar" style="color:var(--gold)"></i>
          So sánh sáng kiến theo năm
        </div>
        <div class="compare-filters">
          <select id="cmp-field-filter" onchange="rebuildCompareChart()">
            <option value="">Tất cả lĩnh vực</option>
            <option value="thammu">Tham mưu</option>
            <option value="chinhri">Chính trị</option>
            <option value="hckt">HC-KT</option>
          </select>
        </div>
      </div>
      <div class="compare-chart-card">
        <canvas id="chart-compare" height="260"></canvas>
      </div>
      <div id="compare-year-summary" class="compare-year-summary"></div>
    </div>`;
  requestAnimationFrame(() => rebuildCompareChart());
}

function rebuildCompareChart() {
  const lv = (document.getElementById('cmp-field-filter') || {}).value || '';
  const utils = window.DataUtils;
  if (!utils) return;

  const source  = lv ? allData.filter(d => d.linh_vuc === lv) : allData;
  const grouped = utils.groupByYearAndField(source);
  const chart   = utils.toYearCompareChartData(grouped);
  buildCompareChart(chart);
  buildYearSummary(grouped);
}

function buildCompareChart({ labels, series, totals }) {
  const canvas = document.getElementById('chart-compare');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.offsetWidth || 560;
  const H   = 260;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const padL = 48, padR = 20, padT = 44, padB = 60;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const nYears  = labels.length || 1;
  const nSeries = series.length;
  const groupW  = Math.floor(chartW / nYears);
  const barW    = Math.max(16, Math.floor(groupW / (nSeries + 1) * 0.88));
  const maxVal  = Math.max(...totals, 1);

  // Màu riêng biệt cho từng năm — đủ sáng, dễ phân biệt
  const YEAR_PALETTE = [
    { solid:'#2c6975', light:'rgba(44,105,117,0.65)',  label:'#2c6975'  },
    { solid:'#e07b39', light:'rgba(224,123,57,0.65)',  label:'#c9651e'  },
    { solid:'#6a3d9a', light:'rgba(106,61,154,0.65)',  label:'#5a2d88'  },
    { solid:'#2ca06e', light:'rgba(44,160,110,0.65)',  label:'#1d8058'  },
    { solid:'#c8a020', light:'rgba(200,160,32,0.65)',  label:'#a07c10'  },
    { solid:'#d04060', light:'rgba(208,64,96,0.65)',   label:'#b02040'  },
  ];
  // Override màu series bằng YEAR_PALETTE theo index năm
  const yearColorMap = {};
  labels.forEach((yr, i) => {
    yearColorMap[yr] = YEAR_PALETTE[i % YEAR_PALETTE.length];
  });

  // Lưu vị trí bar để hit-test tooltip
  const barRects = [];

  function drawCompare(hoverKey) {
    ctx.clearRect(0, 0, W, H);

    // Grid
    const steps = Math.min(maxVal, 5);
    for (let i = 0; i <= steps; i++) {
      const val = Math.round(maxVal / steps * i);
      const y   = padT + chartH - (chartH / steps * i);
      ctx.strokeStyle = 'rgba(44,105,117,0.12)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + chartW, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#2c6975';
      ctx.font = 'bold 10px Oswald,sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(val, padL - 6, y + 4);
    }

    // Bars
    barRects.length = 0;
    labels.forEach((yr, yi) => {
      const groupX = padL + groupW * yi + (groupW - barW * nSeries) / 2;
      series.forEach((s, si) => {
        const val  = s.values[yi] || 0;
        const barH = val === 0 ? 0 : Math.max(4, (val / maxVal) * chartH);
        const x    = groupX + si * barW;
        const y    = padT + chartH - barH;
        const key  = `${yi}-${si}`;
        const isHov = (hoverKey === key);

        barRects.push({ x, y, w: barW - 2, h: barH, label: s.label, yr, val, key });

        // Dùng màu theo năm thay vì màu series để mỗi năm rõ ràng hơn
        const yrColor = yearColorMap[yr] || YEAR_PALETTE[yi % YEAR_PALETTE.length];
        ctx.shadowColor   = isHov ? yrColor.solid : 'transparent';
        ctx.shadowBlur    = isHov ? 14 : 0;
        const grad = ctx.createLinearGradient(x, y, x, y + barH);
        grad.addColorStop(0, isHov ? yrColor.solid : yrColor.light);
        grad.addColorStop(1, isHov ? yrColor.light : 'rgba(0,0,0,0.06)');
        ctx.fillStyle = grad;

        const r = Math.min(4, (barW - 2) / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barW - 2 - r, y);
        ctx.quadraticCurveTo(x + barW - 2, y, x + barW - 2, y + r);
        ctx.lineTo(x + barW - 2, y + barH);
        ctx.lineTo(x, y + barH);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        if (val > 0) {
          ctx.fillStyle = '#1a3a42';
          ctx.font = 'bold 10px Oswald,sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(val, x + (barW - 2) / 2, y - 4);
        }
      });

      // Nhãn năm
      ctx.fillStyle = '#1a3a42';
      ctx.font = 'bold 13px Oswald,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(yr, padL + groupW * yi + groupW / 2, H - padB + 20);

      // Tổng mỗi năm
      ctx.fillStyle = 'rgba(44,105,117,0.7)';
      ctx.font = '11px Oswald,sans-serif';
      ctx.fillText(`(${totals[yi]})`, padL + groupW * yi + groupW / 2, H - padB + 36);
    });

    // Trục
    ctx.strokeStyle = 'rgba(44,105,117,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + chartH);
    ctx.lineTo(padL + chartW, padT + chartH);
    ctx.stroke();

    // Legend theo năm — mỗi năm 1 màu riêng
    labels.forEach((yr, i) => {
      const yrC = yearColorMap[yr] || YEAR_PALETTE[i % YEAR_PALETTE.length];
      const lx  = padL + i * 80;
      const ly  = padT - 24;
      // Hình chữ nhật màu bo góc
      ctx.fillStyle = yrC.solid;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(lx, ly, 14, 10, 2);
      else ctx.rect(lx, ly, 14, 10);
      ctx.fill();
      ctx.fillStyle = '#1a3a42';
      ctx.font = 'bold 11px Oswald,sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(yr, lx + 18, ly + 9);
    });
  }

  drawCompare(null);

  const tooltip = getOrCreateTooltip();
  canvas.style.cursor = 'default';

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = barRects.find(b => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h);
    if (hit) {
      tooltip.innerHTML = `
        <div style="font-weight:800;font-size:15px;color:#2c6975;margin-bottom:2px">
          <i class="fas fa-calendar-alt" style="margin-right:4px"></i>Năm ${hit.yr}
        </div>
        <div style="font-size:12px;color:#68b2a0;margin-bottom:6px;font-weight:600">${hit.label}</div>
        <div style="font-size:26px;font-weight:900;color:#1a3a42;line-height:1">
          ${hit.val}
          <span style="font-size:13px;color:#68b2a0;font-weight:400"> sáng kiến</span>
        </div>`;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top  = (e.clientY - 10) + 'px';
      canvas.style.cursor = 'pointer';
      drawCompare(hit.key);
    } else {
      tooltip.style.display = 'none';
      canvas.style.cursor = 'default';
      drawCompare(null);
    }
  };
  canvas.onmouseleave = () => {
    tooltip.style.display = 'none';
    drawCompare(null);
  };
}

function buildYearSummary(grouped) {
  const el = document.getElementById('compare-year-summary');
  if (!el) return;
  const utils = window.DataUtils;
  const years = Object.keys(grouped).sort();
  el.innerHTML = years.map(yr => {
    const d = grouped[yr];
    return `
      <div class="cmp-year-card">
        <div class="cmp-year-label">${yr}</div>
        <div class="cmp-year-total">${d.total}</div>
        <div class="cmp-year-breakdown">
          <span style="color:#2c6975">TM: ${d.thammu}</span>
          <span style="color:#68b2a0">CT: ${d.chinhri}</span>
          <span style="color:#4b8f8d">HK: ${d.hckt}</span>
        </div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════
//  TAB: VINH DANH TÁC GIẢ
// ══════════════════════════════════════

function renderHonorView() {
  const container = document.getElementById('home-content');
  const utils = window.DataUtils;
  if (!utils) { container.innerHTML = '<p>Lỗi: DataUtils chưa tải.</p>'; return; }

  const ranks = utils.rankAuthors(allData, 10);
  const chart  = utils.toAuthorChartData(ranks);

  const MEDAL = ['🥇','🥈','🥉'];
  const MEDAL_COLORS = ['#c8a020','#9e9e9e','#cd7f32'];

  container.innerHTML = `
    <div class="honor-view">
      <div class="honor-header">
        <div class="honor-header-icon"><i class="fas fa-trophy"></i></div>
        <div class="honor-header-text">
          <div class="honor-header-title">Bảng Vinh Danh Tác Giả</div>
          <div class="honor-header-sub">Lữ đoàn 279 · BCCB · Top ${ranks.length} tác giả tiêu biểu</div>
        </div>
      </div>

      <!-- Podium top 3 -->
      <div class="honor-podium">
        ${ranks.slice(0,3).map((r,i) => `
          <div class="honor-podium-card honor-podium-rank-${i+1}">
            <div class="honor-podium-medal">${MEDAL[i]}</div>
            <div class="honor-podium-avatar" style="border-color:${MEDAL_COLORS[i]}">
              <i class="fas fa-user-tie"></i>
            </div>
            <div class="honor-podium-name">${escapeHtml(r.ho_ten)}</div>
            <div class="honor-podium-rank">${escapeHtml(r.cap_bac||'')} ${escapeHtml(r.chuc_vu||'')}</div>
            <div class="honor-podium-count" style="color:${MEDAL_COLORS[i]}">
              ${r.count}
              <span class="honor-podium-count-lbl">sáng kiến</span>
            </div>
          </div>`).join('')}
      </div>

      <div class="honor-body">
        <div class="honor-table-wrap">
          <table class="rank-table">
            <thead>
              <tr>
                <th class="rank-th-pos">Hạng</th>
                <th class="rank-th-name">Tác giả</th>
                <th class="rank-th-meta">Cấp bậc / Chức vụ</th>
                <th class="rank-th-count">Sáng kiến</th>
              </tr>
            </thead>
            <tbody>
              ${ranks.map(r => `
                <tr class="rank-row${r.rank <= 3 ? ' rank-top' : ''}">
                  <td>
                    <span class="rank-badge rank-${Math.min(r.rank,4)}">
                      ${r.rank <= 3 ? MEDAL[r.rank-1] : r.rank}
                    </span>
                  </td>
                  <td class="rank-name">${escapeHtml(r.ho_ten)}</td>
                  <td class="rank-meta">${r.cap_bac ? escapeHtml(r.cap_bac) + ' · ' : ''}${escapeHtml(r.chuc_vu || '—')}</td>
                  <td>
                    <span class="rank-count">${r.count}</span>
                    <span class="rank-count-bar" style="width:${Math.round((r.count / (ranks[0]?.count||1))*80)}px"></span>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="honor-chart-wrap">
          <div class="honor-chart-title">Biểu đồ đóng góp</div>
          <canvas id="chart-honor" height="320"></canvas>
        </div>
      </div>
    </div>`;

  requestAnimationFrame(() => buildHonorChart(ranks, chart));
}

function buildHonorChart(ranks, { labels, values, colors }) {
  const canvas = document.getElementById('chart-honor');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.offsetWidth || 300;
  const H   = 320;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const padL = 10, padR = 60, padT = 16, padB = 16;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n    = labels.length;
  const barH = Math.max(16, Math.floor(chartH / n) - 6);
  const maxV = Math.max(...values, 1);

  const barRects = [];

  function drawHonor(hoverIdx) {
    ctx.clearRect(0, 0, W, H);

    labels.forEach((name, i) => {
      const val   = values[i];
      const bw    = Math.max(4, (val / maxV) * chartW);
      const x     = padL;
      const y     = padT + i * (barH + 6);
      const color = colors[i];
      const isHov = (i === hoverIdx);

      barRects[i] = { x, y, w: bw, h: barH, name, val, color };

      // Bar
      ctx.shadowBlur = isHov ? 10 : 0;
      ctx.shadowColor = color;
      const grad = ctx.createLinearGradient(x, y, x + bw, y);
      grad.addColorStop(0, color);
      grad.addColorStop(1, isHov ? color : color + 'aa');
      ctx.fillStyle = grad;
      const r = Math.min(4, barH / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + bw - r, y);
      ctx.quadraticCurveTo(x + bw, y, x + bw, y + r);
      ctx.lineTo(x + bw, y + barH - r);
      ctx.quadraticCurveTo(x + bw, y + barH, x + bw - r, y + barH);
      ctx.lineTo(x + r, y + barH);
      ctx.quadraticCurveTo(x, y + barH, x, y + barH - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // Value label
      ctx.fillStyle = '#1a3a42';
      ctx.font = `bold ${isHov ? 13 : 12}px Oswald,sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(val, x + bw + 6, y + barH / 2 + 4);

      // Name label inside bar
      if (bw > 40) {
        ctx.fillStyle = '#fff';
        ctx.font = `${isHov ? 12 : 11}px Oswald,sans-serif`;
        ctx.textAlign = 'left';
        const short = name.length > 18 ? name.slice(0, 16) + '…' : name;
        ctx.fillText(short, x + 8, y + barH / 2 + 4);
      }
    });
  }

  drawHonor(-1);

  const tooltip = getOrCreateTooltip();
  canvas.style.cursor = 'default';

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let found = -1;
    barRects.forEach((b, i) => {
      if (b && mx >= b.x && mx <= b.x + b.w + 20 && my >= b.y && my <= b.y + b.h) found = i;
    });
    if (found >= 0) {
      const b = barRects[found];
      tooltip.innerHTML = `
        <div style="font-weight:700;font-size:13px;color:${b.color};margin-bottom:4px">${b.name}</div>
        <div style="font-size:22px;font-weight:800;color:#1a3a42">${b.val} <span style="font-size:12px;color:#68b2a0">sáng kiến</span></div>`;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top  = (e.clientY - 10) + 'px';
      canvas.style.cursor = 'pointer';
      drawHonor(found);
    } else {
      tooltip.style.display = 'none';
      canvas.style.cursor = 'default';
      drawHonor(-1);
    }
  };
  canvas.onmouseleave = () => {
    tooltip.style.display = 'none';
    drawHonor(-1);
  };
}
function goSplash() {
  closeVideoModal();
  closeHoSoModal();
  show('screen-splash');
}

// ── Khởi động khi trang load ──
// ── Tooltip toàn cục cho biểu đồ ──
function getOrCreateTooltip() {
  let tip = document.getElementById('chart-tooltip-global');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'chart-tooltip-global';
    tip.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'display:none',
      'background:rgba(255,255,255,0.97)',
      'border:1.5px solid rgba(44,105,117,0.25)',
      'border-radius:10px',
      'box-shadow:0 6px 24px rgba(44,105,117,0.18)',
      'padding:10px 16px',
      'z-index:9999',
      'font-family:Oswald,sans-serif',
      'min-width:140px',
      'backdrop-filter:blur(6px)',
      'transition:opacity 0.15s'
    ].join(';');
    document.body.appendChild(tip);
  }
  return tip;
}

window.addEventListener('DOMContentLoaded', init);