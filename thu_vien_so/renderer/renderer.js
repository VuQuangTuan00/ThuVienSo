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
    case 'file:get-url':
      return { ok:false, error:'Chay Electron de xem truoc file cuc bo' };
    case 'open-link-external':
      window.open(args[0], '_blank', 'noopener,noreferrer');
      return { ok:true };
    case 'giaithuong:getAll':
      return { ok:true, data: Array.isArray(window.MOCK_AWARDS) ? window.MOCK_AWARDS : [] };
    default:
      return { ok:false, error:'Mock không hỗ trợ: ' + channel };
  }
}

// ── State ──
let allData    = [];
let currentTab = 'all';
let currentItem = null;
let huongDanTemplateHtml = '';

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

  // FIX: Đảm bảo không dùng null/undefined trong for...of hay destructuring
  try {
    const res = await call('sangkien:getAll');
    // res.data có thể null nếu DB lỗi → luôn fallback về array
    const rawData = (res && res.ok && Array.isArray(res.data)) ? res.data : null;
    if (rawData && rawData.length > 0) {
      allData = rawData;
      console.log(`[Thu Vien] Tải ${allData.length} sáng kiến từ SQLite`);
    } else {
      allData = Array.isArray(window.MOCK_DATA) ? window.MOCK_DATA : [];
      console.warn('[Thu Vien] Dùng dữ liệu mẫu:', (res && res.error) || 'DB rỗng hoặc null');
    }
  } catch (e) {
    // FIX: catch mọi lỗi kể cả "null is not iterable"
    allData = Array.isArray(window.MOCK_DATA) ? window.MOCK_DATA : [];
    console.warn('[Thu Vien] Exception, dùng mock:', e.message);
  }

  updateStats();
  show('screen-splash');
}

// ══════════════════════════════════════
//  STATS
// ══════════════════════════════════════

function updateStats() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const current = allData.filter(d => !d.nam || d.nam >= 2025);
  const data    = current.length ? current : allData;
  const tm = data.filter(d => d.linh_vuc === 'thammu').length;
  const ct = data.filter(d => d.linh_vuc === 'chinhri').length;
  const hk = data.filter(d => d.linh_vuc === 'hckt').length;
  set('stat-total', data.length); set('stat-thammu', tm);
  set('stat-ct', ct); set('stat-hk', hk);
  // Sidebar counts
  set('sb-cnt-thammu', tm); set('sb-cnt-chinhri', ct); set('sb-cnt-hckt', hk);
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
  clearSearch();
  show('screen-home');
  document.querySelectorAll('.sb-item, .nav-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === currentTab);
  });
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = (TAB_TITLES || {})[currentTab] || currentTab;
  renderItems(currentTab);
}

function goAdmin() {
  // FIX: Bỏ window.close() — đóng cửa sổ trước khi IPC gửi xong gây crash sandbox
  // FIX: Bỏ require('electron').remote — remote bị xóa từ Electron 14+
  window.close(); 
  if (ipc) {
    ipc.send('open-admin'); // main process mở cửa sổ admin mới
  } else {
    window.location.href = './admin/sign_up_admin.html';
  }
}

const TAB_TITLES = {
  all:'Tổng quan', thammu:'Tham mưu', chinhri:'Chính trị',
  hckt:'Hậu cần – Kỹ thuật', compare:'So sánh theo năm',
  honor:'Vinh danh', donvi:'Thống kê đơn vị',
};

function switchTab(tab, el) {
  clearSearch();
  currentTab = tab;
  document.querySelectorAll('.sb-item, .nav-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = TAB_TITLES[tab] || tab;
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
    renderHonorView(); // async — non-blocking

  } else if (tab === 'donvi') {
    renderUnitView();

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

  const labels = ['Tham mưu', 'Chính trị', 'Hậu cần - Kỹ thuật'];
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
  const bxct = "Bấm Xem Chi Tiết"
  if (!el) return;

  // Chỉ lưu TÊN FILE (đã lưu trong DB)
  const files = [
    { ten: bxct, file: item.file_thuyet_minh },
    { ten: bxct,  file: item.file_quyet_dinh },
    { ten: bxct,    file: item.file_anh },
    { ten: bxct,      file: item.file_ban_ve },
    { ten: bxct,    file: item.file_hieu_qua }
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
        <div class="fi-name">${f.file}</div>
        <div class="fi-sub">${f.ten}</div>
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
  return openFilePreviewModal(fileName);
}

function getFileKind(value) {
  const clean = String(value || '').split('?')[0].toLowerCase();
  const ext = clean.includes('.') ? clean.split('.').pop() : '';
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) return 'video';
  return 'other';
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

async function getPreviewSource(fileName) {
  const value = String(fileName || '').trim();
  if (!value) return { ok: false, error: 'Ten file trong' };
  if (isHttpUrl(value)) {
    return {
      ok: true,
      url: value,
      fileName: value.split('/').pop() || value,
      ext: value.split('?')[0].split('.').pop().toLowerCase()
    };
  }
  return await call('file:get-url', value);
}

async function openFilePreviewModal(fileName, label = 'Ho so') {
  if (!fileName) return;

  const overlay = document.getElementById('modal-hoso');
  const body = document.getElementById('modal-hoso-body');
  const title = document.getElementById('modal-hoso-title');
  if (!overlay || !body || !title) return;

  title.textContent = label + ' - ' + fileName;
  body.innerHTML = `
    <div class="file-preview-loading">
      <i class="fas fa-spinner fa-spin"></i>
      <span>Dang tai xem truoc...</span>
    </div>`;
  overlay.classList.add('open');

  const res = await getPreviewSource(fileName);
  if (!res.ok) {
    body.innerHTML = `
      <div class="file-preview-empty">
        <i class="fas fa-exclamation-triangle"></i>
        <p>${escapeHtml(res.error || 'Khong the tai file')}</p>
      </div>`;
    return;
  }

  const url = res.url;
  const name = res.fileName || fileName;
  const kind = getFileKind(name || url);
  let previewHtml = '';

  if (kind === 'pdf') {
    previewHtml = `<iframe class="file-preview-frame" src="${escapeHtml(url)}" title="${escapeHtml(name)}"></iframe>`;
  } else if (kind === 'image') {
    previewHtml = `<div class="file-preview-image-wrap"><img src="${escapeHtml(url)}" alt="${escapeHtml(name)}"></div>`;
  } else if (kind === 'video') {
    previewHtml = `<div class="file-preview-video-wrap"><video src="${escapeHtml(url)}" controls playsinline></video></div>`;
  } else {
    previewHtml = `
      <div class="file-preview-empty">
        <i class="fas fa-file-alt"></i>
        <p>Dinh dang nay chua ho tro xem truoc trong ung dung.</p>
      </div>`;
  }

  body.innerHTML = `
    <div class="file-preview-shell">
      <div class="file-preview-toolbar">
        <div>
          <div class="file-preview-name">${escapeHtml(name)}</div>
          <div class="file-preview-kind">${escapeHtml((res.ext || kind || 'file').toUpperCase())}</div>
        </div>
        <button type="button" class="action-btn secondary file-preview-open" id="file-preview-open-external">
          <i class="fas fa-external-link-alt"></i> Mo ngoai
        </button>
      </div>
      ${previewHtml}
    </div>`;

  const openBtn = document.getElementById('file-preview-open-external');
  if (openBtn) {
    openBtn.onclick = async () => {
      if (isHttpUrl(fileName)) window.open(fileName, '_blank', 'noopener,noreferrer');
      else await call('open-file', fileName);
    };
  }
}

window.openHoSoFile = function (index) {
  const hs = currentItem && currentItem.hoSo;
  if (!hs || !hs[index]) return;
  openHoSoPath(hs[index].duong_dan);
};

window.openHoSoPath = openHoSoPath;

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
  } else if (getFileKind(url) === 'video') {
    body.innerHTML = '<div class="file-preview-loading"><i class="fas fa-spinner fa-spin"></i><span>Dang tai video...</span></div>';
    getPreviewSource(url).then(res => {
      if (res.ok) {
        body.innerHTML = `<div class="lib-video-wrap"><video src="${escapeHtml(res.url)}" controls playsinline></video></div>`;
      } else {
        body.innerHTML = `<p class="lib-video-fallback">${escapeHtml(res.error || 'Khong the tai video')}</p>`;
      }
    });
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
  const bxct = "Bấm Xem Chi Tiết";
  if (!item || !overlay || !body) return;

  title.textContent = 'Hồ sơ — ' + item.ten;

  // 1. Thu thập các tệp tin từ các trường dữ liệu mới
  const files = [
    { ten: bxct, path: item.file_thuyet_minh },
    { ten: bxct, path: item.file_quyet_dinh },
    { ten: bxct, path: item.file_anh },
    { ten: bxct, path: item.file_ban_ve },
    { ten: bxct, path: item.file_hieu_qua }
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
            <div class="fi-name">${escapeHtml(f.path)}</div>
            <div class="fi-sub">${f.ten}</div>
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
      openFilePreviewModal(p, files[idx].ten);
    });
  });

  // Xử lý sự kiện mở video ngoài
  const hv = document.getElementById('modal-hoso-open-video');
  if (hv && v) hv.onclick = () => openVideoModal();

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
  // FIX: guard đầy đủ — tránh "null is not iterable"
  if (authors == null) return [];
  if (Array.isArray(authors)) return authors.filter(Boolean);
  if (typeof authors === 'string' && authors.trim()) {
    try {
      const parsed = JSON.parse(authors);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch { return []; }
  }
  return [];
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
            <option value="hckt">Hậu cần - Kỹ thuật</option>
          </select>
        </div>
      </div>
      <div id="compare-kpi-strip" class="compare-kpi-strip"></div>
      <div class="compare-chart-card">
        <canvas id="chart-compare" height="300"></canvas>
      </div>
      <div id="cmp-insight" class="cmp-insight-strip"></div>
      <div id="compare-year-summary" class="compare-year-summary"></div>
    </div>`;
  requestAnimationFrame(() => rebuildCompareChart());
}

function rebuildCompareChart() {
  const lv = (document.getElementById('cmp-field-filter') || {}).value || '';
  // FIX: guard null cho DataUtils
  const utils = window.DataUtils;
  if (!utils) {
    setTimeout(() => {
      if (window.DataUtils && currentTab === 'compare') rebuildCompareChart();
    }, 500);
    return;
  }

  const source  = lv ? allData.filter(d => d.linh_vuc === lv) : allData;
  const grouped = utils.groupByYearAndField(source);
  const chart   = utils.toYearCompareChartData(grouped);
  buildKpiStrip(grouped, chart);
  buildCompareChart(chart);
  buildInsightStrip(grouped, chart);
  buildYearSummary(grouped);
}

function buildCompareChart({ labels, series, totals }) {
  const canvas = document.getElementById('chart-compare');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.offsetWidth || 620;
  const H   = 300;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const STACK_COLORS = {
    thammu:  { fill: '#c05050', light: 'rgba(192,80,80,0.72)' },
    chinhri: { fill: '#c8a020', light: 'rgba(200,160,32,0.72)' },
    hckt:    { fill: '#3ca050', light: 'rgba(60,160,80,0.72)' },
  };
  const GROWTH_COLOR = '#e67e22';

  const padL = 44, padR = 54, padT = 42, padB = 58;
  const chartW   = W - padL - padR;
  const chartH   = H - padT - padB;
  const nYears   = labels.length || 1;
  const barW     = Math.max(28, Math.floor(chartW / nYears * 0.54));
  const maxTotal = Math.max(...totals, 1);

  // Tỉ lệ tăng trưởng: null cho năm đầu, % cho các năm sau
  const growthRates = totals.map((t, i) =>
    (i === 0 || totals[i - 1] === 0) ? null : ((t - totals[i - 1]) / totals[i - 1]) * 100
  );
  const validGrowths = growthRates.filter(g => g !== null);
  const showGrowth   = validGrowths.length > 0;

  let growthTop = 100, growthBot = -100;
  if (showGrowth) {
    const gMax = Math.max(...validGrowths, 0);
    const gMin = Math.min(...validGrowths, 0);
    const gPad = Math.max((gMax - gMin) * 0.22, 12);
    growthTop = gMax + gPad;
    growthBot = gMin - gPad;
  }
  function growthToY(g) {
    return padT + chartH - ((g - growthBot) / (growthTop - growthBot)) * chartH;
  }

  // Xây dựng dữ liệu stacked bar
  const barRects = labels.map((yr, yi) => {
    const cx = padL + (yi + 0.5) * (chartW / nYears);
    const x  = cx - barW / 2;
    let stackBottom = padT + chartH;
    const segments = series.map(s => {
      const val  = s.values[yi] || 0;
      const segH = val === 0 ? 0 : Math.max(4, (val / maxTotal) * chartH);
      const y    = stackBottom - segH;
      if (val > 0) stackBottom = y;
      return { val, h: segH, y, key: s.key, label: s.label };
    });
    return { x, cx, segments, total: totals[yi], yr };
  });

  // Điểm trên đường tăng trưởng
  const linePoints = labels.map((yr, yi) => {
    const g = growthRates[yi];
    if (g === null) return null;
    return { cx: padL + (yi + 0.5) * (chartW / nYears), y: growthToY(g), val: g, yr };
  });

  const tooltip = getOrCreateTooltip();

  function draw(hoverYi) {
    ctx.clearRect(0, 0, W, H);

    // === Lưới trục trái ===
    const steps = Math.min(maxTotal, 5);
    for (let i = 0; i <= steps; i++) {
      const val = Math.round(maxTotal / steps * i);
      const y   = padT + chartH - (chartH / steps * i);
      ctx.strokeStyle = 'rgba(44,105,117,0.1)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + chartW, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle  = '#2c6975';
      ctx.font       = 'bold 10px Oswald,sans-serif';
      ctx.textAlign  = 'right';
      ctx.fillText(val, padL - 6, y + 4);
    }

    // === Đường 0% và nhãn trục phải (tăng trưởng) ===
    if (showGrowth) {
      const zeroY = growthToY(0);
      ctx.strokeStyle = 'rgba(230,126,34,0.22)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(padL + chartW, zeroY); ctx.stroke();
      ctx.setLineDash([]);
      [Math.round(growthTop * 0.7), 0, Math.round(growthBot * 0.7)].forEach(g => {
        const y = growthToY(g);
        ctx.fillStyle  = GROWTH_COLOR;
        ctx.font       = 'bold 10px Oswald,sans-serif';
        ctx.textAlign  = 'left';
        ctx.fillText((g > 0 ? '+' : '') + g + '%', padL + chartW + 6, y + 4);
      });
    }

    // === Stacked bars ===
    barRects.forEach((b, yi) => {
      const isHov = yi === hoverYi;
      b.segments.forEach((seg, si) => {
        if (seg.h === 0) return;
        const isTopSeg = b.segments.slice(si + 1).every(s => s.h === 0);
        const col = STACK_COLORS[seg.key];
        ctx.fillStyle   = isHov ? col.fill : col.light;
        ctx.shadowColor = isHov ? col.fill : 'transparent';
        ctx.shadowBlur  = isHov ? 10 : 0;

        if (isTopSeg) {
          const r = Math.min(5, barW / 2);
          ctx.beginPath();
          ctx.moveTo(b.x + r, seg.y);
          ctx.lineTo(b.x + barW - r, seg.y);
          ctx.quadraticCurveTo(b.x + barW, seg.y, b.x + barW, seg.y + r);
          ctx.lineTo(b.x + barW, seg.y + seg.h);
          ctx.lineTo(b.x, seg.y + seg.h);
          ctx.lineTo(b.x, seg.y + r);
          ctx.quadraticCurveTo(b.x, seg.y, b.x + r, seg.y);
          ctx.closePath();
        } else {
          ctx.beginPath();
          ctx.rect(b.x, seg.y, barW, seg.h);
        }
        ctx.fill();
        ctx.shadowBlur = 0;

        if (seg.h >= 18 && seg.val > 0) {
          ctx.fillStyle  = '#fff';
          ctx.font       = 'bold 10px Oswald,sans-serif';
          ctx.textAlign  = 'center';
          ctx.fillText(seg.val, b.cx, seg.y + seg.h / 2 + 4);
        }
      });

      // Tổng trên đầu bar
      const topY = b.segments.reduce((mn, s) => s.h > 0 ? Math.min(mn, s.y) : mn, padT + chartH);
      if (b.total > 0 && topY < padT + chartH) {
        ctx.fillStyle  = '#1a3a42';
        ctx.font       = 'bold 12px Oswald,sans-serif';
        ctx.textAlign  = 'center';
        ctx.fillText(b.total, b.cx, topY - 6);
      }

      // Nhãn năm
      ctx.fillStyle = isHov ? '#2c6975' : '#1a3a42';
      ctx.font      = `bold ${isHov ? 14 : 12}px Oswald,sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(b.yr, b.cx, H - padB + 18);
    });

    // === Đường tăng trưởng ===
    if (showGrowth) {
      const pts = linePoints.filter(Boolean);
      if (pts.length >= 2) {
        ctx.strokeStyle = GROWTH_COLOR;
        ctx.lineWidth   = 2.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.cx, p.y); else ctx.lineTo(p.cx, p.y); });
        ctx.stroke();
      }
      pts.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.cx, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = GROWTH_COLOR; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        const sign = p.val >= 0 ? '+' : '';
        ctx.fillStyle  = p.val >= 0 ? '#2c6975' : '#c05050';
        ctx.font       = 'bold 10px Oswald,sans-serif';
        ctx.textAlign  = 'center';
        ctx.fillText(sign + p.val.toFixed(1) + '%', p.cx, p.y - 10);
      });
    }

    // === Trục ===
    ctx.strokeStyle = 'rgba(44,105,117,0.3)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + chartH); ctx.lineTo(padL + chartW, padT + chartH);
    ctx.stroke();
    if (showGrowth) {
      ctx.strokeStyle = 'rgba(230,126,34,0.25)';
      ctx.beginPath();
      ctx.moveTo(padL + chartW, padT); ctx.lineTo(padL + chartW, padT + chartH);
      ctx.stroke();
    }

    // === Legend ===
    const legendItems = [
      { label: 'Tham mưu',  color: STACK_COLORS.thammu.fill,  isLine: false },
      { label: 'Chính trị', color: STACK_COLORS.chinhri.fill, isLine: false },
      { label: 'Hậu cần - Kỹ thuật',     color: STACK_COLORS.hckt.fill,    isLine: false },
      ...(showGrowth ? [{ label: 'Tăng trưởng', color: GROWTH_COLOR, isLine: true }] : []),
    ];
    let lx = padL;
    const ly = padT - 26;
    legendItems.forEach(leg => {
      if (leg.isLine) {
        ctx.strokeStyle = leg.color; ctx.lineWidth = 2.5; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(lx, ly + 6); ctx.lineTo(lx + 16, ly + 6); ctx.stroke();
        ctx.beginPath(); ctx.arc(lx + 8, ly + 6, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = leg.color; ctx.fill();
      } else {
        ctx.fillStyle = leg.color;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(lx, ly, 14, 10, 2); else ctx.rect(lx, ly, 14, 10);
        ctx.fill();
      }
      ctx.fillStyle = '#1a3a42';
      ctx.font      = 'bold 11px Oswald,sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(leg.label, lx + 18, ly + 9);
      lx += ctx.measureText(leg.label).width + 34;
    });
  }

  draw(-1);

  canvas.style.cursor = 'default';
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let found = -1;
    barRects.forEach((b, yi) => {
      const topY = b.segments.reduce((mn, s) => s.h > 0 ? Math.min(mn, s.y) : mn, padT + chartH);
      if (mx >= b.x && mx <= b.x + barW && my >= topY - 4 && my <= padT + chartH + 4) found = yi;
    });
    if (found >= 0) {
      const b = barRects[found];
      const g = growthRates[found];
      const gHtml = g !== null
        ? `<div style="margin-top:4px;font-size:11px;color:${g >= 0 ? '#2c6975' : '#c05050'}">
            ${g >= 0 ? '▲' : '▼'} ${Math.abs(g).toFixed(1)}% so với năm trước
           </div>` : '';
      tooltip.innerHTML = `
        <div style="font-weight:800;font-size:14px;color:#2c6975;margin-bottom:6px">
          <i class="fas fa-calendar-alt" style="margin-right:4px"></i>Năm ${b.yr}
        </div>
        ${b.segments.filter(s => s.val > 0).map(s => `
          <div style="display:flex;align-items:center;gap:8px;margin:2px 0">
            <span style="width:10px;height:10px;border-radius:2px;background:${STACK_COLORS[s.key].fill};display:inline-block;flex-shrink:0"></span>
            <span style="font-size:12px;color:#555;flex:1">${s.label}</span>
            <span style="font-weight:700;color:#1a3a42">${s.val}</span>
          </div>`).join('')}
        <div style="border-top:1px solid rgba(44,105,117,0.15);margin-top:6px;padding-top:4px;font-weight:700;font-size:13px;color:#1a3a42">
          Tổng: ${b.total}
        </div>${gHtml}`;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top  = (e.clientY - 10) + 'px';
      canvas.style.cursor = 'pointer';
      draw(found);
    } else {
      tooltip.style.display = 'none';
      canvas.style.cursor   = 'default';
      draw(-1);
    }
  };
  canvas.onmouseleave = () => { tooltip.style.display = 'none'; draw(-1); };
}

function buildKpiStrip(grouped, { labels, totals }) {
  const el = document.getElementById('compare-kpi-strip');
  if (!el) return;
  if (!labels.length) { el.innerHTML = ''; return; }

  const totalAll    = totals.reduce((s, t) => s + t, 0);
  const maxTotal    = Math.max(...totals, 0);
  const bestYearIdx = totals.indexOf(maxTotal);
  const bestYear    = labels[bestYearIdx] || '—';

  let growthHtml = '<span style="color:var(--dim)">—</span>';
  let growthSub  = '';
  if (totals.length >= 2) {
    const last = totals[totals.length - 1];
    const prev = totals[totals.length - 2];
    if (prev > 0) {
      const g  = ((last - prev) / prev * 100).toFixed(1);
      const up = Number(g) >= 0;
      growthHtml = `<span style="color:${up ? '#2c6975' : '#c05050'};font-size:22px;font-weight:900">${up ? '▲' : '▼'} ${Math.abs(g)}%</span>`;
      growthSub  = `${labels[labels.length - 2]} → ${labels[labels.length - 1]}`;
    }
  }

  el.innerHTML = `
    <div class="cmp-kpi-card">
      <div class="cmp-kpi-icon"><i class="fas fa-layer-group"></i></div>
      <div>
        <div class="cmp-kpi-val">${totalAll}</div>
        <div class="cmp-kpi-lbl">Tổng sáng kiến</div>
      </div>
    </div>
    <div class="cmp-kpi-card">
      <div class="cmp-kpi-icon"><i class="fas fa-trophy"></i></div>
      <div>
        <div class="cmp-kpi-val">${bestYear}</div>
        <div class="cmp-kpi-lbl">Năm đỉnh cao</div>
        <div class="cmp-kpi-sub">${maxTotal} sáng kiến</div>
      </div>
    </div>
    <div class="cmp-kpi-card">
      <div class="cmp-kpi-icon" style="color:#e67e22;background:rgba(230,126,34,0.1)"><i class="fas fa-chart-line"></i></div>
      <div>
        <div class="cmp-kpi-val" style="line-height:1.3">${growthHtml}</div>
        <div class="cmp-kpi-lbl">Tăng trưởng gần nhất</div>
        ${growthSub ? `<div class="cmp-kpi-sub">${growthSub}</div>` : ''}
      </div>
    </div>
    <div class="cmp-kpi-card">
      <div class="cmp-kpi-icon"><i class="fas fa-calendar-alt"></i></div>
      <div>
        <div class="cmp-kpi-val">${labels.length}</div>
        <div class="cmp-kpi-lbl">Năm thống kê</div>
        <div class="cmp-kpi-sub">${labels[0]}${labels.length > 1 ? ' – ' + labels[labels.length - 1] : ''}</div>
      </div>
    </div>
  `;
}

function buildInsightStrip(grouped, { labels, totals }) {
  const el = document.getElementById('cmp-insight');
  if (!el) return;
  if (!labels.length) { el.style.display = 'none'; return; }
  el.style.display = 'flex';

  const maxTotal    = Math.max(...totals, 0);
  const bestYearIdx = totals.indexOf(maxTotal);
  const bestYear    = labels[bestYearIdx];
  const insights    = [];

  if (bestYear) {
    const d   = grouped[bestYear];
    const top = ['thammu', 'chinhri', 'hckt']
      .map(k => ({ k, v: d[k] }))
      .sort((a, b) => b.v - a.v)[0];
    const lbl = { thammu: 'Tham mưu', chinhri: 'Chính trị', hckt: 'Hậu cần - Kỹ thuật' }[top.k];
    insights.push(`Năm <strong>${bestYear}</strong> đạt đỉnh với <strong>${maxTotal}</strong> sáng kiến — dẫn đầu bởi ngành ${lbl}`);
  }
  if (labels.length >= 2) {
    const last = totals[totals.length - 1];
    const prev = totals[totals.length - 2];
    if (prev > 0) {
      const g   = ((last - prev) / prev * 100).toFixed(1);
      const dir = Number(g) >= 0 ? 'tăng' : 'giảm';
      insights.push(`${labels[labels.length - 1]}: ${dir} <strong>${Math.abs(g)}%</strong> so với ${labels[labels.length - 2]}`);
    }
  }

  el.innerHTML = `<i class="fas fa-lightbulb"></i><span>${insights.join(' &nbsp;·&nbsp; ')}</span>`;
}

function buildYearSummary(grouped) {
  const el = document.getElementById('compare-year-summary');
  if (!el) return;
  const years = Object.keys(grouped).sort();
  el.innerHTML = years.map((yr, i) => {
    const d    = grouped[yr];
    const prev = i > 0 ? grouped[years[i - 1]].total : null;
    let growthHtml = '';
    if (prev !== null && prev > 0) {
      const g  = ((d.total - prev) / prev * 100).toFixed(1);
      const up = Number(g) >= 0;
      growthHtml = `<div class="cmp-year-growth ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(g)}%</div>`;
    }
    return `
      <div class="cmp-year-card">
        <div class="cmp-year-label">${yr}</div>
        <div class="cmp-year-total">${d.total}</div>
        ${growthHtml}
        <div class="cmp-year-breakdown">
          <span style="color:#c05050">TM: ${d.thammu}</span>
          <span style="color:#c8a020">CT: ${d.chinhri}</span>
          <span style="color:#3ca050">HK: ${d.hckt}</span>
        </div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════
//  TAB: VINH DANH
// ══════════════════════════════════════

// Bậc ưu tiên hiển thị — số nhỏ = cao hơn
const AWARD_PRIORITY = {
  'Huy chương Vàng': 1, 'Xuất sắc': 2, 'Giải nhất': 3,
  'Giải nhì': 4, 'Giải ba': 5, 'Huy chương Bạc': 6, 'Huy chương Đồng': 7,
};
const AWARD_STYLE = {
  'Huy chương Vàng': { icon:'fa-medal',  color:'#c8a020', glow:'rgba(200,160,32,.18)' },
  'Xuất sắc':        { icon:'fa-star',   color:'#c8a020', glow:'rgba(200,160,32,.18)' },
  'Giải nhất':       { icon:'fa-trophy', color:'#c8a020', glow:'rgba(200,160,32,.18)' },
  'Giải nhì':        { icon:'fa-trophy', color:'#8a8a8a', glow:'rgba(138,138,138,.15)' },
  'Giải ba':         { icon:'fa-trophy', color:'#b87333', glow:'rgba(184,115,51,.15)'  },
  'Huy chương Bạc':  { icon:'fa-medal',  color:'#8a8a8a', glow:'rgba(138,138,138,.15)' },
  'Huy chương Đồng': { icon:'fa-medal',  color:'#b87333', glow:'rgba(184,115,51,.15)'  },
};

async function renderHonorView() {
  const container = document.getElementById('home-content');
  // FIX: DataUtils có thể chưa load → guard null an toàn
  const utils = window.DataUtils;
  if (!utils) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Đang tải tiện ích dữ liệu, vui lòng thử lại...</p>
      </div>`;
    // Retry sau 500ms nếu DataUtils vừa load xong
    setTimeout(() => {
      if (window.DataUtils && currentTab === 'honor') renderHonorView();
    }, 500);
    return;
  }

  // ── Skeleton loading ──
  container.innerHTML = `
    <div class="honor-view">
      <div class="honor-loading">
        <i class="fas fa-circle-notch fa-spin"></i> Đang tải dữ liệu vinh danh…
      </div>
    </div>`;

  // ── Fetch awards FRESH mỗi lần vào tab (đồng bộ với Admin) ──
  const awRes = await call('giaithuong:getAll');
  const awards = awRes.ok ? (awRes.data || []) : [];

  // Sắp xếp: năm mới nhất → ưu tiên cao hơn → tên
  awards.sort((a, b) =>
    (b.nam || 0) - (a.nam || 0) ||
    (AWARD_PRIORITY[a.loai_giai] || 99) - (AWARD_PRIORITY[b.loai_giai] || 99)
  );

  // ── Author ranking (từ allData đã load) ──
  const ranks = utils.rankAuthors(allData, 10);
  const chart  = utils.toAuthorChartData(ranks);
  const MEDAL = ['🥇','🥈','🥉'];
  const MEDAL_COLORS = ['#c8a020','#9e9e9e','#cd7f32'];

  container.innerHTML = `
    <div class="honor-view">

      <!-- ═══ PHẦN 1: GIẢI THƯỞNG & HUY CHƯƠNG ═══ -->
      <div class="honor-section-hd">
        <div class="honor-section-hd-icon"><i class="fas fa-award"></i></div>
        <div>
          <div class="honor-section-hd-title">Giải Thưởng & Huy Chương</div>
          <div class="honor-section-hd-sub">Thành tích nổi bật của các sáng kiến · Lữ đoàn 279</div>
        </div>
      </div>

      ${_buildAwardGrid(awards)}

      <!-- ═══ PHẦN 2: VINH DANH TÁC GIẢ ═══ -->
      <div class="honor-section-hd" style="margin-top:36px">
        <div class="honor-section-hd-icon" style="background:linear-gradient(135deg,#2c6975,#68b2a0)">
          <i class="fas fa-users"></i>
        </div>
        <div>
          <div class="honor-section-hd-title">Bảng Vinh Danh Tác Giả</div>
          <div class="honor-section-hd-sub">Top ${ranks.length} tác giả tiêu biểu theo số lượng sáng kiến</div>
        </div>
      </div>

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
              ${r.count}<span class="honor-podium-count-lbl">sáng kiến</span>
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

// Mở, Đóng modal

async function openHuongDan() {
  const overlay = document.getElementById('modal-huongdan');
  const body = overlay ? overlay.querySelector('.lib-modal-body') : null;
  if (!overlay || !body) return;

  if (!huongDanTemplateHtml) huongDanTemplateHtml = body.innerHTML;

  overlay.style.display = 'flex';
  body.innerHTML = `
    <div class="file-preview-loading">
      <i class="fas fa-spinner fa-spin"></i>
      <span>Dang tai video huong dan...</span>
    </div>`;

  const res = await call('config:get', 'tutorial_video_url');
  const url = res && res.ok ? String(res.value || '').trim() : '';
  body.innerHTML = await buildHuongDanBodyHtml(url, res && !res.ok ? res.error : '');
}

async function buildHuongDanBodyHtml(url, errorMessage = '') {
  const guideHtml = huongDanTemplateHtml || '';
  const videoSection = await buildHuongDanVideoSection(url, errorMessage);
  return videoSection + guideHtml;
}

async function buildHuongDanVideoSection(url, errorMessage = '') {
  if (errorMessage) {
    return `
      <div class="huongdan-video-section">
        <div class="hoso-section-title">Video huong dan</div>
        <p class="lib-video-fallback">${escapeHtml(errorMessage)}</p>
      </div>`;
  }

  if (!url) {
    return '';
  }

  const embed = toYouTubeEmbed(url);
  if (embed) {
    return `
      <div class="huongdan-video-section">
        <div class="hoso-section-title">Video huong dan</div>
        <div class="lib-video-wrap">
          <iframe src="${embed}" title="Video huong dan" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>
      </div>`;
  }

  if (getFileKind(url) === 'video' || !isHttpUrl(url)) {
    const res = await getPreviewSource(url);
    if (res.ok) {
      return `
        <div class="huongdan-video-section">
          <div class="hoso-section-title">Video huong dan</div>
          <div class="lib-video-wrap">
            <video src="${escapeHtml(res.url)}" controls playsinline></video>
          </div>
        </div>`;
    }

    return `
      <div class="huongdan-video-section">
        <div class="hoso-section-title">Video huong dan</div>
        <p class="lib-video-fallback">${escapeHtml(res.error || 'Khong the tai video huong dan')}</p>
      </div>`;
  }

  return `
    <div class="huongdan-video-section">
      <div class="hoso-section-title">Video huong dan</div>
      <p class="lib-video-fallback">${escapeHtml(url)}</p>
      <button type="button" class="action-btn primary" id="huongdan-open-external" data-url="${escapeHtml(url)}" style="margin-top:12px">
        <i class="fas fa-external-link-alt"></i> Mo lien ket
      </button>
    </div>`;
}

function closeHuongDan() {
  const overlay = document.getElementById('modal-huongdan');
  const body = overlay ? overlay.querySelector('.lib-modal-body') : null;
  if (body && huongDanTemplateHtml) body.innerHTML = huongDanTemplateHtml;
  if (overlay) overlay.style.display = 'none';
}

document.addEventListener('click', e => {
  const btn = e.target.closest('#huongdan-open-external');
  if (!btn) return;
  const url = (btn.getAttribute('data-url') || '').trim();
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
});

// ── Render grid giải thưởng ──
function _buildAwardGrid(awards) {
  if (!awards.length) {
    return `
      <div class="award-empty">
        <i class="fas fa-trophy"></i>
        <p>Chưa có giải thưởng nào được ghi nhận</p>
      </div>`;
  }

  // Nhóm theo năm để render từng dải năm
  const byYear = {};
  awards.forEach(a => {
    const yr = a.nam ? String(Math.round(a.nam)) : 'Khác';
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(a);
  });
  const years = Object.keys(byYear).sort((a, b) => {
    if (a === 'Khác') return 1;
    if (b === 'Khác') return -1;
    return Number(b) - Number(a);
  });

  return years.map(yr => `
    <div class="award-year-group">
      <div class="award-year-label"><span>${yr}</span></div>
      <div class="award-grid">
        ${byYear[yr].map(a => _buildAwardCard(a)).join('')}
      </div>
    </div>`).join('');
}

function _buildAwardCard(a) {
  const s = AWARD_STYLE[a.loai_giai] || { icon:'fa-award', color:'#68b2a0', glow:'rgba(104,178,160,.15)' };
  const mo_ta = a.mo_ta ? `<div class="award-card-desc">${escapeHtml(a.mo_ta)}</div>` : '';
  return `
    <div class="award-card" style="--aw-color:${s.color};--aw-glow:${s.glow}">
      <div class="award-card-top">
        <div class="award-card-icon"><i class="fas ${s.icon}"></i></div>
        <div class="award-card-type">${escapeHtml(a.loai_giai)}</div>
      </div>
      <div class="award-card-name">${escapeHtml(a.ten_giai)}</div>
      <div class="award-card-sk">
        <i class="fas fa-lightbulb"></i> ${escapeHtml(a.sang_kien_ten || '—')}
      </div>
      ${mo_ta}
    </div>`;
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
// ══════════════════════════════════════
//  TAB: THỐNG KÊ ĐƠN VỊ
// ══════════════════════════════════════

function renderUnitView() {
  const container = document.getElementById('home-content');
  // FIX: DataUtils có thể chưa load → guard null an toàn
  const utils = window.DataUtils;
  if (!utils) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Đang tải tiện ích dữ liệu, vui lòng thử lại...</p>
      </div>`;
    // Retry sau 500ms nếu DataUtils vừa load xong
    setTimeout(() => {
      if (window.DataUtils && currentTab === 'honor') renderHonorView();
    }, 500);
    return;
  }

  const units    = utils.groupByUnit(allData);
  const chartDat = utils.toUnitChartData(units, 10);

  const topUnit  = units[0] || {};
  const avgStr   = units.length ? (allData.length / units.length).toFixed(1) : '0';

  const LV_COLOR = { thammu: '#c05050', chinhri: '#c8a020', hckt: '#3ca050' };
  const LV_LABEL = utils.LINH_VUC_LABEL;

  container.innerHTML = `
    <div class="unit-view">

      <!-- Header -->
      <div class="honor-section-hd">
        <div class="honor-section-hd-icon" style="background:linear-gradient(135deg,#2c6975,#4b8f8d)">
          <i class="fas fa-sitemap"></i>
        </div>
        <div>
          <div class="honor-section-hd-title">Thống Kê Theo Đơn Vị</div>
          <div class="honor-section-hd-sub">${units.length} đơn vị · ${allData.length} sáng kiến</div>
        </div>
      </div>

      <!-- KPI strip -->
      <div class="unit-kpi-strip">
        <div class="unit-kpi-card">
          <div class="unit-kpi-icon"><i class="fas fa-building"></i></div>
          <div class="unit-kpi-body">
            <div class="unit-kpi-val">${units.length}</div>
            <div class="unit-kpi-lbl">Đơn vị tham gia</div>
          </div>
        </div>
        <div class="unit-kpi-card">
          <div class="unit-kpi-icon" style="background:rgba(200,160,32,.1);color:#c8a020"><i class="fas fa-medal"></i></div>
          <div class="unit-kpi-body">
            <div class="unit-kpi-val" style="color:#c8a020">${escapeHtml(topUnit.don_vi || '—')}</div>
            <div class="unit-kpi-lbl">Đơn vị dẫn đầu · ${topUnit.total || 0} sáng kiến</div>
          </div>
        </div>
        <div class="unit-kpi-card">
          <div class="unit-kpi-icon" style="background:rgba(60,160,80,.1);color:#3ca050"><i class="fas fa-layer-group"></i></div>
          <div class="unit-kpi-body">
            <div class="unit-kpi-val" style="color:#3ca050">${allData.length}</div>
            <div class="unit-kpi-lbl">Tổng sáng kiến</div>
          </div>
        </div>
        <div class="unit-kpi-card">
          <div class="unit-kpi-icon" style="background:rgba(75,143,141,.1);color:#4b8f8d"><i class="fas fa-calculator"></i></div>
          <div class="unit-kpi-body">
            <div class="unit-kpi-val" style="color:#4b8f8d">${avgStr}</div>
            <div class="unit-kpi-lbl">Trung bình / đơn vị</div>
          </div>
        </div>
      </div>

      <!-- Body: chart + table -->
      <div class="unit-body">
        <div class="unit-chart-wrap">
          <div class="unit-chart-title">
            <i class="fas fa-chart-bar" style="color:var(--gold)"></i>
            Top ${Math.min(10, units.length)} đơn vị (theo số sáng kiến)
          </div>
          <div class="unit-chart-legend">
            ${Object.entries(LV_COLOR).map(([k,c]) => `
              <span class="unit-legend-dot" style="--c:${c}"></span>
              <span class="unit-legend-lbl">${LV_LABEL[k]}</span>`).join('')}
          </div>
          <canvas id="chart-unit" height="320"></canvas>
        </div>
        <div class="unit-table-wrap">
          <table class="unit-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Đơn vị</th>
                <th title="Tham mưu" style="color:#c05050">TM</th>
                <th title="Chính trị" style="color:#c8a020">CT</th>
                <th title="Hậu cần - Kỹ thuật" style="color:#3ca050">HK</th>
                <th>Tổng</th>
              </tr>
            </thead>
            <tbody>
              ${units.map((u, i) => `
                <tr class="unit-row${i < 3 ? ' unit-top' : ''}">
                  <td class="unit-rank">${i + 1}</td>
                  <td class="unit-name">${escapeHtml(u.don_vi)}</td>
                  <td class="unit-lv" style="color:#c05050">${u.thammu || 0}</td>
                  <td class="unit-lv" style="color:#c8a020">${u.chinhri || 0}</td>
                  <td class="unit-lv" style="color:#3ca050">${u.hckt || 0}</td>
                  <td>
                    <span class="unit-total">${u.total}</span>
                    <span class="unit-bar" style="width:${Math.round((u.total/(units[0]?.total||1))*72)}px"></span>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>`;

  requestAnimationFrame(() => buildUnitChart(chartDat));
}

function buildUnitChart({ labels, totals, thammu, chinhri, hckt }) {
  const canvas = document.getElementById('chart-unit');
  if (!canvas) return;

  const n = labels.length;
  if (!n) return;

  const ctx  = canvas.getContext('2d');
  const dpr  = window.devicePixelRatio || 1;
  // Đọc width THỰC từ parent để tránh offsetWidth = 0
  const W    = canvas.parentElement?.clientWidth || canvas.offsetWidth || 480;
  const BAR_H   = 26;
  const BAR_GAP = 10;
  const PAD_T   = 8;
  const PAD_B   = 8;
  const LBL_W   = 148;   // vùng nhãn bên trái
  const PAD_R   = 46;    // vùng số tổng bên phải
  const H       = PAD_T + n * (BAR_H + BAR_GAP) - BAR_GAP + PAD_B;

  canvas.width        = W * dpr;
  canvas.height       = H * dpr;
  canvas.style.width  = '100%';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const barAreaX = LBL_W;
  const barAreaW = W - LBL_W - PAD_R;
  const maxV     = Math.max(...totals, 1);
  const COLORS   = { thammu: '#c05050', chinhri: '#c8a020', hckt: '#3ca050' };

  const barRects = [];

  function roundRect(cx, cy, cw, ch, r) {
    if (cw <= 0) return;
    r = Math.min(r, cw / 2, ch / 2);
    ctx.beginPath();
    ctx.moveTo(cx + r, cy);
    ctx.lineTo(cx + cw - r, cy);
    ctx.arcTo(cx + cw, cy, cx + cw, cy + r, r);
    ctx.lineTo(cx + cw, cy + ch - r);
    ctx.arcTo(cx + cw, cy + ch, cx + cw - r, cy + ch, r);
    ctx.lineTo(cx + r, cy + ch);
    ctx.arcTo(cx, cy + ch, cx, cy + ch - r, r);
    ctx.lineTo(cx, cy + r);
    ctx.arcTo(cx, cy, cx + r, cy, r);
    ctx.closePath();
  }

  function draw(hoverIdx) {
    ctx.clearRect(0, 0, W, H);

    labels.forEach((name, i) => {
      const y      = PAD_T + i * (BAR_H + BAR_GAP);
      const total  = totals[i];
      const isHov  = (i === hoverIdx);
      const totalW = Math.max(4, (total / maxV) * barAreaW);

      barRects[i] = { y, h: BAR_H, total, tm: thammu[i], ct: chinhri[i], hk: hckt[i], name };

      // ── Tên đơn vị (bên trái) ──
      ctx.fillStyle = isHov ? '#1a3a42' : '#4a6a72';
      ctx.font      = `${isHov ? 600 : 400} 12px Inter,sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const short = name.length > 22 ? name.slice(0, 20) + '…' : name;
      ctx.fillText(short, barAreaX - 10, y + BAR_H / 2);

      // ── Track (nền xám nhạt) ──
      ctx.fillStyle = 'rgba(44,105,117,.07)';
      roundRect(barAreaX, y, barAreaW, BAR_H, 5);
      ctx.fill();

      // ── Stacked bar: TM → CT → HK ──
      const segs = [
        { val: thammu[i],  color: COLORS.thammu  },
        { val: chinhri[i], color: COLORS.chinhri },
        { val: hckt[i],    color: COLORS.hckt    },
      ];

      if (isHov) {
        ctx.shadowBlur  = 10;
        ctx.shadowColor = 'rgba(44,105,117,.3)';
      }

      let sx = barAreaX;
      segs.forEach((seg, si) => {
        if (!seg.val) return;
        const bw     = (seg.val / maxV) * barAreaW;
        const isFirst = sx === barAreaX;
        const isLast  = (si === segs.length - 1) ||
                        segs.slice(si + 1).every(s => !s.val);

        ctx.fillStyle = isHov ? seg.color : seg.color + 'd0';
        // Chỉ bo góc trái nếu là segment đầu, góc phải nếu là cuối
        ctx.beginPath();
        const r = 5;
        const x1 = sx, x2 = sx + bw, y1 = y, y2 = y + BAR_H;
        const tl = isFirst ? r : 0, tr = isLast ? r : 0;
        const bl = isFirst ? r : 0, br = isLast ? r : 0;
        ctx.moveTo(x1 + tl, y1);
        ctx.lineTo(x2 - tr, y1);
        ctx.arcTo(x2, y1, x2, y1 + tr, tr);
        ctx.lineTo(x2, y2 - br);
        ctx.arcTo(x2, y2, x2 - br, y2, br);
        ctx.lineTo(x1 + bl, y2);
        ctx.arcTo(x1, y2, x1, y2 - bl, bl);
        ctx.lineTo(x1, y1 + tl);
        ctx.arcTo(x1, y1, x1 + tl, y1, tl);
        ctx.closePath();
        ctx.fill();
        sx += bw;
      });

      ctx.shadowBlur = 0;

      // ── Số tổng bên phải ──
      ctx.fillStyle    = '#1a3a42';
      ctx.font         = `bold ${isHov ? 14 : 13}px Oswald,sans-serif`;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(total, barAreaX + totalW + 7, y + BAR_H / 2);
    });
  }

  draw(-1);

  const tooltip = getOrCreateTooltip();
  canvas.onmousemove = e => {
    const rect = canvas.getBoundingClientRect();
    const my   = e.clientY - rect.top;
    let found  = -1;
    barRects.forEach((b, i) => {
      if (b && my >= b.y - 2 && my <= b.y + b.h + 2) found = i;
    });
    if (found >= 0) {
      const b = barRects[found];
      tooltip.innerHTML = `
        <div style="font-weight:700;font-size:12px;color:#1a3a42;margin-bottom:6px;max-width:200px">${b.name}</div>
        <div style="display:flex;gap:12px;font-size:12px">
          <span style="color:#c05050">TM: <b>${b.tm}</b></span>
          <span style="color:#c8a020">CT: <b>${b.ct}</b></span>
          <span style="color:#3ca050">HK: <b>${b.hk}</b></span>
        </div>
        <div style="margin-top:5px;font-size:15px;font-weight:800;color:#2c6975">
          Tổng: ${b.total}
        </div>`;
      tooltip.style.display = 'block';
      tooltip.style.left    = (e.clientX + 14) + 'px';
      tooltip.style.top     = (e.clientY - 10) + 'px';
      canvas.style.cursor   = 'default';
      draw(found);
    } else {
      tooltip.style.display = 'none';
      canvas.style.cursor   = 'default';
      draw(-1);
    }
  };
  canvas.onmouseleave = () => { tooltip.style.display = 'none'; draw(-1); };
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
