// ═══════════════════════════════════════════
//  admin.js — Logic Admin Panel
//  Kết nối IPC (Electron) hoặc Mock (Browser)
// ═══════════════════════════════════════════

// ── IPC Bridge ──
const isElectron = typeof require !== 'undefined';
const ipc        = isElectron ? require('electron').ipcRenderer : null;

async function call(channel, ...args) {
  if (ipc) return await ipc.invoke(channel, ...args);
  return mockCall(channel, ...args); // test trên browser
}

// ── State ──
let allData   = [];
let editingId = null;

// ══════════════════════════════════════
//  AUTH
// ══════════════════════════════════════

async function doLogin() {
  const pw  = document.getElementById('inp-pw').value;
  const res = await call('admin:login', pw);

  if (res.ok) {
    show('screen-admin');
    loadDashboard();
    loadSangKien();
  } else {
    document.getElementById('login-err').style.display = 'block';
    document.getElementById('inp-pw').value = '';
  }
}

function doLogout() {
  show('screen-login');
  document.getElementById('inp-pw').value         = '';
  document.getElementById('login-err').style.display = 'none';
}

// ══════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════

function show(id) {
  document.querySelectorAll('.screen')
    .forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

const PAGE_TITLES = {
  dashboard: 'Tổng quan',
  sangkien:  'Quản lý sáng kiến',
  settings:  'Cài đặt'
};

function showPage(page, el) {
  document.querySelectorAll('.admin-page')
    .forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sb-item')
    .forEach(i => i.classList.remove('active'));

  document.getElementById('page-' + page).classList.add('active');
  el.classList.add('active');
  document.getElementById('page-title').textContent = PAGE_TITLES[page];
}

// ══════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════

async function loadDashboard() {
  // Thống kê số lượng
  const sRes = await call('stats:get');
  if (sRes.ok) {
    const s = sRes.data;
    document.getElementById('stat-total').textContent = s.total;
    document.getElementById('stat-tm').textContent    = s.thammu;
    document.getElementById('stat-ct').textContent    = s.chinhri;
    document.getElementById('stat-hk').textContent    = s.hckt;
  }

  // Danh sách sáng kiến mới nhất
  const dRes = await call('sangkien:getAll');
  if (!dRes.ok) return;

  const recent = dRes.data.slice(0, 8);
  const LABEL  = { thammu:'Tham mưu', chinhri:'Chính trị', hckt:'HC-KT' };
  const BADGE  = { thammu:'badge-tm', chinhri:'badge-ct',  hckt:'badge-hk' };

  document.getElementById('recent-tbody').innerHTML = recent.map(r => `
    <tr>
      <td>${r.ten}</td>
      <td><span class="badge badge-tm">${r.loai}</span></td>
      <td><span class="badge ${BADGE[r.linh_vuc]}">${LABEL[r.linh_vuc]}</span></td>
      <td>${r.ngay_ap_dung}</td>
    </tr>`).join('');
}

// ══════════════════════════════════════
//  DANH SÁCH SÁNG KIẾN
// ══════════════════════════════════════

async function loadSangKien() {
  const res = await call('sangkien:getAll');
  if (!res.ok) { showToast('Lỗi tải dữ liệu', 'error'); return; }
  allData = res.data;
  renderTable(allData);
}

const BADGE_CLASS = { thammu:'badge-tm', chinhri:'badge-ct', hckt:'badge-hk' };
const BADGE_LABEL = { thammu:'Tham mưu', chinhri:'Chính trị', hckt:'HC-KT' };

function renderTable(data) {
  document.getElementById('sk-tbody').innerHTML = data.map((r, i) => `
    <tr>
      <td style="color:var(--dim);font-family:var(--mono);font-size:11px">${i + 1}</td>
      <td>${r.ten}</td>
      <td><span class="badge badge-tm">${r.loai}</span></td>
      <td><span class="badge ${BADGE_CLASS[r.linh_vuc]}">${BADGE_LABEL[r.linh_vuc]}</span></td>
      <td style="color:var(--mid);font-size:12px">${r.don_vi}</td>
      <td style="color:var(--dim);font-size:12px">${r.ngay_ap_dung}</td>
      <td>
        <div class="tbl-actions">
          <button class="tbl-btn edit" onclick="openForm(${r.id})">
            <i class="fas fa-edit"></i> Sửa
          </button>
          <button class="tbl-btn del"
            onclick="deleteSangKien(${r.id}, '${r.ten.replace(/'/g, "\\'")}')">
            <i class="fas fa-trash"></i> Xóa
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function filterTable() {
  const q  = document.getElementById('search-inp').value.toLowerCase();
  const lv = document.getElementById('filter-linh-vuc').value;
  const filtered = allData.filter(r =>
    (!lv || r.linh_vuc === lv) &&
    (!q  || r.ten.toLowerCase().includes(q) ||
            r.don_vi.toLowerCase().includes(q))
  );
  renderTable(filtered);
}

// ══════════════════════════════════════
//  FORM THÊM / SỬA
// ══════════════════════════════════════

function openForm(id = null) {
  editingId = id;
  document.getElementById('modal-title').textContent =
    id ? 'Chỉnh sửa sáng kiến' : 'Thêm sáng kiến mới';
  clearForm();

  if (id) {
    const item = allData.find(r => r.id === id);
    if (!item) return;
    document.getElementById('form-id').value         = item.id;
    document.getElementById('form-ten').value        = item.ten;
    document.getElementById('form-loai').value       = item.loai;
    document.getElementById('form-linh-vuc').value   = item.linh_vuc;
    document.getElementById('form-don-vi').value     = item.don_vi;
    document.getElementById('form-ngay').value       = item.ngay_ap_dung;
    document.getElementById('form-mo-ta').value      = item.mo_ta || '';
    (item.authors || []).forEach(a => addAuthorRow(a));
  } else {
    addAuthorRow(); // 1 hàng trống mặc định
  }

  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('form-ten').focus();
}

function closeForm() {
  document.getElementById('modal-overlay').classList.remove('open');
  editingId = null;
}

function clearForm() {
  ['form-id','form-ten','form-don-vi','form-ngay','form-mo-ta']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('form-loai').value     = 'MÔ PHỎNG 3D';
  document.getElementById('form-linh-vuc').value = 'thammu';
  document.getElementById('authors-list').innerHTML = '';
}

function addAuthorRow(author = {}) {
  const div = document.createElement('div');
  div.className = 'author-row';
  div.innerHTML = `
    <input type="text" placeholder="4/" value="${author.cap_bac || ''}"/>
    <input type="text" placeholder="Họ và tên" value="${author.ho_ten || ''}"/>
    <input type="text" placeholder="Chức vụ"   value="${author.chuc_vu || ''}"/>
    <button class="btn-rm-author" onclick="this.parentElement.remove()">
      <i class="fas fa-times"></i>
    </button>`;
  document.getElementById('authors-list').appendChild(div);
}

function getAuthors() {
  return Array.from(
    document.querySelectorAll('#authors-list .author-row')
  ).map(row => {
    const inputs = row.querySelectorAll('input');
    return {
      cap_bac: inputs[0].value.trim(),
      ho_ten:  inputs[1].value.trim(),
      chuc_vu: inputs[2].value.trim()
    };
  }).filter(a => a.ho_ten); // bỏ hàng chưa nhập tên
}

async function saveSangKien() {
  const ten = document.getElementById('form-ten').value.trim();
  if (!ten) { showToast('Vui lòng nhập tên sáng kiến', 'error'); return; }

  const data = {
    ten,
    loai:         document.getElementById('form-loai').value,
    linh_vuc:     document.getElementById('form-linh-vuc').value,
    don_vi:       document.getElementById('form-don-vi').value.trim(),
    ngay_ap_dung: document.getElementById('form-ngay').value.trim(),
    danh_gia:     5,
    mo_ta:        document.getElementById('form-mo-ta').value.trim(),
    authors:      getAuthors()
  };

  const res = editingId
    ? await call('sangkien:update', { id: editingId, data })
    : await call('sangkien:add', data);

  if (res.ok) {
    closeForm();
    await loadSangKien();
    await loadDashboard();
    showToast(
      editingId ? 'Đã cập nhật sáng kiến' : 'Đã thêm sáng kiến mới',
      'success'
    );
  } else {
    showToast('Lỗi: ' + res.error, 'error');
  }
}

async function deleteSangKien(id, ten) {
  if (!confirm(`Xóa sáng kiến:\n"${ten}"\n\nBạn có chắc không?`)) return;
  const res = await call('sangkien:delete', id);
  if (res.ok) {
    await loadSangKien();
    await loadDashboard();
    showToast('Đã xóa sáng kiến', 'success');
  } else {
    showToast('Lỗi xóa: ' + res.error, 'error');
  }
}

// ══════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════

async function changePassword() {
  const oldPw     = document.getElementById('old-pw').value;
  const newPw     = document.getElementById('new-pw').value;
  const confirmPw = document.getElementById('confirm-pw').value;

  if (!oldPw || !newPw)  { showToast('Vui lòng nhập đầy đủ', 'error'); return; }
  if (newPw !== confirmPw) { showToast('Mật khẩu xác nhận không khớp', 'error'); return; }
  if (newPw.length < 4)   { showToast('Mật khẩu tối thiểu 4 ký tự', 'error'); return; }

  const res = await call('admin:changePassword', { oldPw, newPw });
  if (res.ok) {
    showToast('Đã đổi mật khẩu thành công', 'success');
    ['old-pw','new-pw','confirm-pw'].forEach(id => {
      document.getElementById(id).value = '';
    });
  } else {
    showToast(res.error || 'Lỗi đổi mật khẩu', 'error');
  }
}

// ══════════════════════════════════════
//  TOAST
// ══════════════════════════════════════

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast ' + type;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, 3000);
}

// ══════════════════════════════════════
//  MOCK DATA (test trên browser)
// ══════════════════════════════════════

let mockDB = [
  { id:1, ten:'Báo bia tự động', loai:'THIẾT BỊ', linh_vuc:'thammu',
    don_vi:'Lữ đoàn 279', ngay_ap_dung:'4/2025', danh_gia:5, mo_ta:'',
    authors:[{cap_bac:'4/',ho_ten:'Nguyễn Văn A',chuc_vu:'Trợ lý'}] },
  { id:2, ten:'Mô phỏng 3D mìn chống tăng', loai:'MÔ PHỎNG 3D', linh_vuc:'thammu',
    don_vi:'Lữ đoàn 279', ngay_ap_dung:'4/2025', danh_gia:5, mo_ta:'', authors:[] },
  { id:3, ten:'Phần mềm quản lý tư tưởng', loai:'PHẦN MỀM', linh_vuc:'chinhri',
    don_vi:'Lữ đoàn 279', ngay_ap_dung:'4/2025', danh_gia:5, mo_ta:'', authors:[] },
];
let mockNextId = 4;

function mockCall(channel, ...args) {
  switch (channel) {
    case 'admin:login':
      return { ok: args[0] === 'admin279' };

    case 'admin:changePassword': {
      const { oldPw, newPw } = args[0];
      if (oldPw !== 'admin279') return { ok:false, error:'Mật khẩu cũ không đúng' };
      return { ok: true };
    }

    case 'stats:get':
      return { ok:true, data: {
        total:   mockDB.length,
        thammu:  mockDB.filter(r => r.linh_vuc === 'thammu').length,
        chinhri: mockDB.filter(r => r.linh_vuc === 'chinhri').length,
        hckt:    mockDB.filter(r => r.linh_vuc === 'hckt').length,
      }};

    case 'sangkien:getAll':
      return { ok:true, data: [...mockDB].reverse() };

    case 'sangkien:add':
      mockDB.push({ ...args[0], id: mockNextId++ });
      return { ok:true, id: mockNextId - 1 };

    case 'sangkien:update': {
      const { id, data } = args[0];
      const i = mockDB.findIndex(r => r.id === id);
      if (i >= 0) mockDB[i] = { ...mockDB[i], ...data, id };
      return { ok: true };
    }

    case 'sangkien:delete':
      mockDB = mockDB.filter(r => r.id !== args[0]);
      return { ok: true };

    default:
      return { ok:false, error: 'Unknown channel: ' + channel };
  }
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeForm();
  if (e.key === 'Enter' && document.getElementById('screen-login').classList.contains('active')) {
    doLogin();
  }
});