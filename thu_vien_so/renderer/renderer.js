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
    // ── Tab "Tất cả" → Biểu đồ tổng quan ──
    container.innerHTML = `
      <div class="charts-wrap">
        <!-- Biểu đồ cột: tổng sáng kiến từng lĩnh vực -->
        <div class="chart-card">
          <div class="chart-title">
            <i class="fas fa-chart-bar" style="color:var(--gold)"></i>
            Tổng sáng kiến theo lĩnh vực
          </div>  
          <canvas id="chart-bar" height="200"></canvas>
        </div>
        <!-- Biểu đồ tròn: phân loại theo loại hình -->
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
      </div>
      `;

    // Vẽ biểu đồ sau khi DOM sẵn sàng
    requestAnimationFrame(() => buildCharts());

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
  thammu:  { top:'#2c6975', bot:'rgba(44,105,117,0.6)',  label:'#2c6975' },
  chinhri: { top:'#68b2a0', bot:'rgba(104,178,160,0.55)', label:'#4b8f8d' },
  hckt:    { top:'#4b8f8d', bot:'rgba(75,143,141,0.55)', label:'#1e5460' },
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