// ── DATA (load from SQLite via IPC) ──
const isElectron = typeof require !== 'undefined';
const ipc = isElectron ? require('electron').ipcRenderer : null;
let DATA = [];

document.addEventListener("DOMContentLoaded", () => {
  const year = new Date().getFullYear();

  document.querySelectorAll(".current-year").forEach(el => {
    el.textContent = year;
  });
});

const TAB_LABELS = {thammu:'Ngành Tham mưu', chinhri:'Ngành Chính trị', hckt:'Ngành HC-KT'};
let currentTab = 'all';

function mapDbItemToView(item) {
  return {
    id: item.id,
    tab: item.linh_vuc || 'thammu',
    type: item.loai || '',
    name: item.ten || '',
    authors: (item.authors || []).map(author => ({
      rank: author.cap_bac || '',
      name: author.ho_ten || '',
      role: author.chuc_vu || ''
    })),
    unit: item.don_vi || '',
    date: item.ngay_ap_dung || '',
    field: TAB_LABELS[item.linh_vuc] || 'Đang cập nhật'
  };
}

async function loadDataFromSQLite() {
  if (!ipc) return;
  try {
    const result = await ipc.invoke('sangkien:getAll');
    if (result && result.ok && Array.isArray(result.data)) {
      DATA = result.data.map(mapDbItemToView);
    } else {
      console.error('[Renderer] Không lấy được dữ liệu sáng kiến:', result?.error);
      DATA = [];
    }
  } catch (error) {
    console.error('[Renderer] Lỗi IPC sangkien:getAll:', error);
    DATA = [];
  }
}

function emptyStateHTML(message = 'Chưa có dữ liệu') {
  return `<div class="empty-state">
    <i class="fas fa-database"></i>
    <h3>${message}</h3>
    <p>Vui lòng thêm dữ liệu sáng kiến trong trang quản trị.</p>
    <button class="empty-cta" onclick="openAdminPage()">
      <i class="fas fa-user-cog"></i> Mở trang quản trị
    </button>
  </div>`;
}

function openAdminPage() {
  window.location.href = './admin/sign_up_admin.html';
}

function goHome() {
  show('screen-home');
  renderItems(currentTab);
}

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function switchTab(tab, el) {
  currentTab = tab;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderItems(tab);
}

function renderItems(tab) {
  const items = tab === 'all' ? DATA : DATA.filter(d => d.tab === tab);
  const container = document.getElementById('home-content');

  if(tab === 'all') {
    if (!DATA.length) {
      container.innerHTML = emptyStateHTML('Chưa có dữ liệu sáng kiến');
      return;
    }

    // Group by tab
    let html = '';
    ['thammu','chinhri','hckt'].forEach(t => {
      const group = DATA.filter(d => d.tab === t);
      if (!group.length) return;
      html += `<div class="section-header"><h2><i class="fas fa-chevron-right" style="color:var(--gold);margin-right:6px"></i>${TAB_LABELS[t]}</h2></div>`;
      html += `<div class="items-grid" style="margin-bottom:28px">`;
      group.forEach(item => { html += cardHTML(item); });
      html += `</div>`;
    });
    container.innerHTML = html;
  } else {
    if (!items.length) {
      container.innerHTML = emptyStateHTML(`Chưa có dữ liệu cho ${TAB_LABELS[tab] || 'mục này'}`);
      return;
    }

    container.innerHTML = `
      <div class="section-header"><h2><i class="fas fa-chevron-right" style="color:var(--gold);margin-right:6px"></i>${TAB_LABELS[tab]}</h2></div>
      <div class="items-grid">${items.map(cardHTML).join('')}</div>`;
  }
}

function cardHTML(item) {
  return `<div class="item-card" onclick="openDetail(${item.id})">
    <div class="ic-type">${item.type}</div>
    <div class="ic-name">${item.name}</div>
    <div class="ic-meta">
      <span><i class="fas fa-calendar" style="color:var(--gold-dim)"></i> ${item.date}</span>
      <span><i class="fas fa-building" style="color:var(--gold-dim)"></i> ${item.unit.split('/')[0]}</span>
    </div>
    <div class="ic-stars">★★★★★</div>
    <i class="fas fa-arrow-right ic-arrow"></i>
  </div>`;
}

function openDetail(id) {
  const item = DATA.find(d => d.id === id);
  if(!item) return;

  document.getElementById('d-category').textContent = item.type;
  document.getElementById('d-title').textContent = item.name;
  document.getElementById('d-unit').textContent = item.unit;
  document.getElementById('d-date').textContent = item.date;
  document.getElementById('d-field').textContent = item.field;
  document.getElementById('detail-topbar-title').textContent = item.name;

  const backLabel = TAB_LABELS[item.tab] || 'Quay lại';
  document.getElementById('detail-back-label').textContent = backLabel;
  document.getElementById('detail-back-btn').onclick = () => {
    show('screen-home');
    const tabMap = {thammu:1, chinhri:2, hckt:3};
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(t => t.classList.remove('active'));
    if(tabMap[item.tab]) tabs[tabMap[item.tab]].classList.add('active');
    renderItems(item.tab);
    currentTab = item.tab;
  };

  // Authors
  let authHTML = '';
  item.authors.forEach(a => {
    authHTML += `<div class="info-row">
      <span class="lbl">${a.rank}</span>
      <span class="val">${a.name} – ${a.role}</span>
    </div>`;
  });
  if(!item.authors.length) authHTML = `<div class="info-row"><span class="val" style="color:var(--text-dim)">Đang cập nhật</span></div>`;
  document.getElementById('d-authors').innerHTML = authHTML;

  show('screen-detail');
}

// Init
(async function init() {
  await loadDataFromSQLite();
  renderItems('all');
})();