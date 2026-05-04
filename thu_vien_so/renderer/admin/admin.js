// ═══════════════════════════════════════════
//  admin.js — Logic Admin Panel
//  Kết nối IPC (Electron) — không dùng mock
// ═══════════════════════════════════════════

let ipc = null;
try { ipc = require('electron').ipcRenderer; } catch (_) { }

async function call(channel, ...args) {
  // Electron thật → IPC → SQLite
  if (ipc) return await ipc.invoke(channel, ...args);

  // Browser / test → MOCK_DATA
  return adminMockCall(channel, ...args);
}

// ── Mock cho Admin (browser/test) ──
// Dùng window.MOCK_DATA từ mock_data.js
// Chú ý: thêm/sửa/xóa chỉ ảnh hưởng trong RAM, không lưu thật
let _mockDb = null; // lazy copy để tránh mutate MOCK_DATA gốc
let _mockNext = 100;  // ID bắt đầu từ 100 để phân biệt với mock gốc

function getMockDb() {
  if (!_mockDb) _mockDb = JSON.parse(JSON.stringify(window.MOCK_DATA || []));
  return _mockDb;
}

function adminMockCall(channel, ...args) {
  const admin = "admin279";
  const db = getMockDb();
  switch (channel) {
    case 'admin:login':
      // Mật khẩu mặc định khi test browser
      return { ok: args[0] === admin };

    case 'admin:changePassword':
      return {
        ok: args[0].oldPw === admin ? true : false,
        error: 'Mật khẩu cũ không đúng'
      };

    case 'stats:get':
      return {
        ok: true, data: {
          total: db.length,
          thammu: db.filter(d => d.linh_vuc === 'thammu').length,
          chinhri: db.filter(d => d.linh_vuc === 'chinhri').length,
          hckt: db.filter(d => d.linh_vuc === 'hckt').length,
        }
      };

    case 'sangkien:getAll':
      return {
        ok: true, data: args[0]
          ? db.filter(d => d.linh_vuc === args[0])
          : [...db].reverse()
      };

    case 'sangkien:add': {
      const newItem = {
        ...args[0], id: _mockNext++,
        authors: args[0].authors || []
      };
      db.push(newItem);
      return { ok: true, id: newItem.id };
    }

    case 'sangkien:update': {
      const { id, data } = args[0];
      const i = db.findIndex(d => d.id === id);
      if (i >= 0) db[i] = { ...db[i], ...data, id };
      return { ok: true };
    }

    case 'sangkien:delete': {
      const idx = db.findIndex(d => d.id === args[0]);
      if (idx >= 0) db.splice(idx, 1);
      return { ok: true };
    }

    case 'sangkien:fuzzyCheck': {
      const newData = args[0];
      const res = [];
      for (const item of db) {
        if (item.ten.toLowerCase() === newData.ten.toLowerCase()) {
          res.push({ id: item.id, ten: item.ten, score: 95 });
        }
      }
      return { ok: true, data: { shouldWarn: res.length > 0, matches: res } };
    }

    case 'file:checkDuplicate':
      return { ok: true, data: { hasWarning: false, results: [] } };

    case 'admin:pick-file':
      return { ok: false, error: 'Cần chạy Electron để chọn file' };

    case 'admin:copy-file':
      return { ok: false, error: 'Cần chạy Electron để copy file' };

    case 'giaithuong:getAll':
      return { ok: true, data: _mockGiaiThuongDb };

    case 'giaithuong:add': {
      const item = { ...args[0], id: _mockNext++, sang_kien_ten: _getSangKienTen(db, args[0].sang_kien_id) };
      _mockGiaiThuongDb.push(item);
      return { ok: true, id: item.id };
    }

    case 'giaithuong:update': {
      const { id: uid, data: ud } = args[0];
      const idx = _mockGiaiThuongDb.findIndex(r => r.id === uid);
      if (idx >= 0) _mockGiaiThuongDb[idx] = { ..._mockGiaiThuongDb[idx], ...ud, id: uid, sang_kien_ten: _getSangKienTen(db, ud.sang_kien_id) };
      return { ok: true };
    }

    case 'giaithuong:delete': {
      const di = _mockGiaiThuongDb.findIndex(r => r.id === args[0]);
      if (di >= 0) _mockGiaiThuongDb.splice(di, 1);
      return { ok: true };
    }

    default:
      return { ok: false, error: 'Mock không hỗ trợ: ' + channel };
  }
}

let _mockGiaiThuongDb = [];
function _getSangKienTen(db, id) {
  const r = db.find(d => d.id === Number(id));
  return r ? r.ten : '';
}

// ── State ──
let editingId       = null;
let allData         = [];
let filteredData    = [];
let currentPage     = 1;
const PAGE_SIZE     = 8;
let pendingSaveData = null;

// Map: field → tên file cũ khi Edit (để loại trừ khi check trùng)
let _oldFilesSnapshot = {};

const INPUT_TO_FIELD = {
  'form-file-thuyet-minh': 'file_thuyet_minh',
  'form-file-quyet-dinh':  'file_quyet_dinh',
  'form-file-anh':         'file_anh',
  'form-file-ban-ve':      'file_ban_ve',
  'form-file-hieu-qua':    'file_hieu_qua',
};

// Context khi đang chờ user xác nhận cảnh báo trùng tại lúc chọn file
let _immediateCheckContext = null; // { inputId, sourcePath }
// Hiển thị indicator trạng thái kiểm tra bên cạnh nút Chọn
function _showFileCheckIndicator(inputId, status) {
  const container = document.getElementById(inputId)?.closest('.file-field-row')
                  || document.getElementById(inputId)?.parentElement;
  if (!container) return;
  container.querySelectorAll('.fcheck-indicator').forEach(el => el.remove());

  const cfg = {
    checking: { icon:'fa-spinner fa-spin', color:'#68b2a0', text:'Đang kiểm tra…' },
    ok:       { icon:'fa-check-circle',   color:'#27ae60', text:''               },
    warning:  { icon:'fa-exclamation-triangle', color:'#e67e22', text:'Cảnh báo' },
    block:    { icon:'fa-times-circle',   color:'#e74c3c', text:'Trùng!'         },
  }[status];
  if (!cfg) return;

  const span = document.createElement('span');
  span.className = 'fcheck-indicator';
  span.style.cssText = `margin-left:6px;font-size:12px;font-weight:700;
    color:${cfg.color};display:inline-flex;align-items:center;gap:4px;`;
  span.innerHTML = `<i class="fas ${cfg.icon}"></i>${cfg.text ? `<span>${cfg.text}</span>` : ''}`;

  const browseBtn = container.querySelector('.btn-browse, .btn-input-action');
  if (browseBtn) browseBtn.insertAdjacentElement('afterend', span);
  else document.getElementById(inputId)?.insertAdjacentElement('afterend', span);
}



// ══════════════════════════════════════
//  AUTH
// ══════════════════════════════════════

async function doLogin() {
  const pw = document.getElementById('inp-pw').value;
  const res = await call('admin:login', pw);
  if (res.ok) {
    show('screen-admin');
    loadDashboard();
    loadSangKien();
  } else {
    const err = document.getElementById('login-err');
    err.textContent = res.error || 'Mật khẩu không đúng';
    err.style.display = 'block';
    document.getElementById('inp-pw').value = '';
  }
}

function doLogout() {
  if (!confirm('Đăng xuất và quay lại thư viện?')) return;
  window.location.href = '../index.html';
}

// ══════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

const PAGE_TITLES = { dashboard: 'Tổng quan', sangkien: 'Quản lý sáng kiến', giaithuong: 'Giải thưởng & Huy chương', settings: 'Cài đặt', backup: 'Backup / Restore' };

function showPage(page, el) {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  el.classList.add('active');
  document.getElementById('page-title').textContent = PAGE_TITLES[page];
}

function openLibrary() {
   window.location.href = '../index.html'; 
  }

// ══════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════

async function handleSelectFile(inputId) {
  const res = await call('admin:pick-file');
  if (!res.ok) {
    if (res.error) showToast('Lỗi chọn file: ' + res.error, 'error');
    return;
  }

  const { sourcePath } = res;
  const fieldName = INPUT_TO_FIELD[inputId];

  // Kiểm tra trùng TRƯỚC khi copy (chỉ khi chạy Electron)
  if (ipc && fieldName) {
    showToast('Đang kiểm tra trùng nội dung file…', '');
    const oldFileMap = editingId
      ? { [fieldName]: _oldFilesSnapshot[inputId] || '' }
      : null;
    const dupRes = await call('file:checkDuplicate', {
      newFileMap:         { [fieldName]: sourcePath },
      oldFileMap,
      excludeId:          editingId,
      skipSimhashWarning: false,
    });

    if (dupRes.ok && dupRes.data.hasWarning) {
      _immediateCheckContext = { inputId, sourcePath };
      showFileDuplicateModal(dupRes.data.results);
      return; // chờ user xác nhận trong modal
    } else if (!dupRes.ok) {
      showToast('Không kiểm tra được file: ' + (dupRes.error || ''), 'warn');
    }
  }

  // Không trùng → copy ngay
  await _doCopyFile(inputId, sourcePath);
}

// Copy file vào userData/files/ và cập nhật input
async function _doCopyFile(inputId, sourcePath) {
  const copyRes = await call('admin:copy-file', sourcePath);
  if (!copyRes.ok) {
    showToast('Lỗi copy file: ' + (copyRes.error || ''), 'error');
    return;
  }
  document.getElementById(inputId).value = copyRes.fileName;
  showToast(`Đã chọn: ${copyRes.fileName}`, 'success');
}

async function loadDashboard() {
  const sRes = await call('stats:get');
  if (sRes.ok) {
    const s = sRes.data;
    document.getElementById('stat-total').textContent = s.total;
    document.getElementById('stat-tm').textContent = s.thammu;
    document.getElementById('stat-ct').textContent = s.chinhri;
    document.getElementById('stat-hk').textContent = s.hckt;
  }

  const dRes = await call('sangkien:getAll');
  if (!dRes.ok) {
    document.getElementById('recent-tbody').innerHTML =
      `<tr class="table-empty"><td colspan="4">Không tải được dữ liệu</td></tr>`;
    return;
  }
  const recent = dRes.data.slice(0, 8);
  const LABEL = { thammu: 'Tham mưu', chinhri: 'Chính trị', hckt: 'Hậu cần - Kỹ thuật' };
  const BADGE = { thammu: 'badge-tm', chinhri: 'badge-ct', hckt: 'badge-hk' };

  document.getElementById('recent-tbody').innerHTML = recent.length
    ? recent.map(r => `
        <tr>
          <td>${r.ten}</td>
          <td><span class="badge badge-tm">${r.loai}</span></td>
          <td><span class="badge ${BADGE[r.linh_vuc]}">${LABEL[r.linh_vuc]}</span></td>
          <td>${r.ngay_ap_dung}</td>
        </tr>`).join('')
    : `<tr class="table-empty"><td colspan="4">Chưa có dữ liệu</td></tr>`;

}

// ══════════════════════════════════════
//  DANH SÁCH SÁNG KIẾN
// ══════════════════════════════════════

async function loadSangKien() {
  const res = await call('sangkien:getAll');
  if (!res.ok) { showToast('Lỗi tải dữ liệu', 'error'); return; }
  allData = res.data;
  filteredData = [...allData];
  currentPage = 1;
  renderTable();
}

const BADGE_CLASS = { thammu: 'badge-tm', chinhri: 'badge-ct', hckt: 'badge-hk' };
const BADGE_LABEL = { thammu: 'Tham mưu', chinhri: 'Chính trị', hckt: 'Hậu cần - Kỹ thuật' };

function renderTable() {
  const total = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const items = filteredData.slice(start, start + PAGE_SIZE);

  document.getElementById('sk-tbody').innerHTML = items.length
    ? items.map((r, i) => `
        <tr>
          <td style="color:var(--dim);font-family:var(--mono);font-size:11px">${start + i + 1}</td>
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
              <button class="tbl-btn del" onclick="deleteSangKien(${r.id})">
                <i class="fas fa-trash"></i> Xóa
              </button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr class="table-empty"><td colspan="7">Không có sáng kiến phù hợp</td></tr>`;

  renderPager(total, totalPages);
}

function renderPager(total, totalPages) {
  const from = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, total);
  document.getElementById('sk-pager').innerHTML = `
    <span class="pager-info">Hiển thị ${from}-${to} / ${total}</span>
    <button class="pager-btn" onclick="gotoPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>Trước</button>
    <span class="pager-info">Trang ${currentPage}/${totalPages}</span>
    <button class="pager-btn" onclick="gotoPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Sau</button>`;
}

function gotoPage(page) {
  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderTable();
}

function filterTable() {
  const q = document.getElementById('search-inp').value.toLowerCase().trim();
  const lv = document.getElementById('filter-linh-vuc').value;

  // Dùng DataUtils nếu có (load từ lib/data_utils.js)
  if (window.DataUtils) {
    filteredData = window.DataUtils.filterData(allData, { query: q, linhVuc: lv });
  } else {
    // Fallback
    filteredData = allData.filter(r =>
      (!lv || r.linh_vuc === lv) &&
      (!q || r.ten.toLowerCase().includes(q) || r.don_vi.toLowerCase().includes(q))
    );
  }
  currentPage = 1;
  renderTable();
}

// ══════════════════════════════════════
//  FORM THÊM / SỬA
// ══════════════════════════════════════

function openForm(id = null) {
  editingId = id != null ? Number(id) : null;
  document.getElementById('modal-title').textContent =
    editingId != null ? 'Chỉnh sửa sáng kiến' : 'Thêm sáng kiến mới';
  clearForm();

  if (editingId != null) {
    const item = allData.find(r => Number(r.id) === editingId);
    if (!item) return;
    document.getElementById('form-id').value = item.id;
    document.getElementById('form-ten').value = item.ten;
    document.getElementById('form-loai').value = item.loai;
    document.getElementById('form-linh-vuc').value = item.linh_vuc;
    document.getElementById('form-don-vi').value = item.don_vi;
    document.getElementById('form-ngay').value = item.ngay_ap_dung;
    document.getElementById('form-mo-ta').value = item.mo_ta || '';
    document.getElementById('form-link-video').value = item.link_video || '';
    document.getElementById('form-qr').value = item.qr_noi_dung || '';

    // ── 5 file hồ sơ ──
    document.getElementById('form-file-thuyet-minh').value = item.file_thuyet_minh || '';
    document.getElementById('form-file-quyet-dinh').value  = item.file_quyet_dinh  || '';
    document.getElementById('form-file-anh').value         = item.file_anh          || '';
    document.getElementById('form-file-ban-ve').value      = item.file_ban_ve       || '';
    document.getElementById('form-file-hieu-qua').value    = item.file_hieu_qua     || '';

    // Snapshot file cũ để loại trừ khi kiểm tra trùng (Edit mode)
    _oldFilesSnapshot = {
      'form-file-thuyet-minh': item.file_thuyet_minh || '',
      'form-file-quyet-dinh':  item.file_quyet_dinh  || '',
      'form-file-anh':         item.file_anh          || '',
      'form-file-ban-ve':      item.file_ban_ve       || '',
      'form-file-hieu-qua':    item.file_hieu_qua     || '',
    };

    (item.authors || []).forEach(a => addAuthorRow(a));
  } else {
    addAuthorRow();
  }

  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('form-ten').focus();
}

function closeForm() {
  document.getElementById('modal-overlay').classList.remove('open');
  editingId = null;
  // Reset context nếu user đóng form giữa chừng (file chưa copy)
  _immediateCheckContext = null;
  // Xóa indicator kiểm tra trên tất cả input file
  document.querySelectorAll('.fcheck-indicator').forEach(el => el.remove());
}

function clearForm() {
  ['form-id', 'form-ten', 'form-don-vi', 'form-ngay', 'form-mo-ta',
    'form-link-video', 'form-qr',
    'form-file-thuyet-minh', 'form-file-quyet-dinh',
    'form-file-anh', 'form-file-ban-ve', 'form-file-hieu-qua']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('form-loai').value     = 'MÔ PHỎNG 3D';
  document.getElementById('form-linh-vuc').value = 'thammu';
  document.getElementById('authors-list').innerHTML = '';

  // Reset file check state
  _oldFilesSnapshot      = {};
  _immediateCheckContext = null;
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
  return Array.from(document.querySelectorAll('#authors-list .author-row'))
    .map(row => {
      const inp = row.querySelectorAll('input');
      return { cap_bac: inp[0].value.trim(), ho_ten: inp[1].value.trim(), chuc_vu: inp[2].value.trim() };
    }).filter(a => a.ho_ten);
}

// ── Chọn file từ máy ──
function browseFile(targetId, accept) {
  if (ipc) {
    handleSelectFile(targetId);
    return;
  }

  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = accept || '*/*';
  inp.onchange = e => {
    if (e.target.files[0]) {
      document.getElementById(targetId).value = e.target.files[0].path || e.target.files[0].name;
    }
  };
  inp.click();
}

async function saveSangKien() {
  const ten = document.getElementById('form-ten').value.trim();
  if (!ten) { showToast('Vui lòng nhập tên sáng kiến', 'error'); return; }

  const data = {
    ten,
    loai:             document.getElementById('form-loai').value,
    linh_vuc:         document.getElementById('form-linh-vuc').value,
    don_vi:           document.getElementById('form-don-vi').value.trim(),
    ngay_ap_dung:     document.getElementById('form-ngay').value.trim(),
    danh_gia:         5,
    mo_ta:            document.getElementById('form-mo-ta').value.trim(),
    link_video:       document.getElementById('form-link-video').value.trim(),
    qr_noi_dung:      document.getElementById('form-qr').value.trim(),
    file_thuyet_minh: document.getElementById('form-file-thuyet-minh').value.trim(),
    file_quyet_dinh:  document.getElementById('form-file-quyet-dinh').value.trim(),
    file_anh:         document.getElementById('form-file-anh').value.trim(),
    file_ban_ve:      document.getElementById('form-file-ban-ve').value.trim(),
    file_hieu_qua:    document.getElementById('form-file-hieu-qua').value.trim(),
    authors: getAuthors()
  };

  const wasEdit = editingId != null;

  // ══════════════════════════════════════════════════════
  //  Kiểm tra trùng TÊN (fuzzy — chỉ khi Add)
  //  File đã được kiểm tra trùng tại lúc chọn
  // ══════════════════════════════════════════════════════
  if (!wasEdit) {
    const fuzzyRes = await call('sangkien:fuzzyCheck', data);
    if (fuzzyRes.ok && fuzzyRes.data.shouldWarn) {
      pendingSaveData = data;
      showFuzzyWarningModal(fuzzyRes.data.matches);
      return;
    }
  }

  await executeSave(data, wasEdit);
}

// Confirm từ File Duplicate Modal — user chấp nhận rủi ro, tiếp tục copy file
async function confirmSaveWithDuplicateFiles() {
  if (!_immediateCheckContext) return;
  const { inputId, sourcePath } = _immediateCheckContext;
  _immediateCheckContext = null;
  closeFileDuplicateModal();
  await _doCopyFile(inputId, sourcePath);
}

// Chọn file khác — đóng modal, user tự chọn lại (không có file nào cần xóa)
function chooseOtherFile() {
  closeFileDuplicateModal();
  showToast('Vui lòng chọn file khác', 'warn');
}

async function executeSave(data, wasEdit) {
  // Hiện trạng thái loading trên nút lưu
  const btnSave = document.querySelector('.btn-save[onclick="saveSangKien()"]');
  const origHtml = btnSave ? btnSave.innerHTML : null;
  if (btnSave) {
    btnSave.disabled  = true;
    btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu…';
  }

  const res = wasEdit
    ? await call('sangkien:update', { id: editingId, data })
    : await call('sangkien:add', data);

  if (btnSave) {
    btnSave.disabled  = false;
    btnSave.innerHTML = origHtml;
  }

  if (res.ok) {
    closeForm();
    closeFuzzyWarningModal();
    pendingSaveData = null;
    await loadSangKien();
    await loadDashboard();
    showToast(wasEdit ? 'Đã cập nhật sáng kiến' : 'Đã thêm sáng kiến mới', 'success');
  } else {
    showToast('Lỗi: ' + res.error, 'error');
  }
}

function confirmSaveSangKien() {
  if (pendingSaveData) {
    executeSave(pendingSaveData, false);
  }
}

function showFuzzyWarningModal(matches) {
  const overlay = document.getElementById('fuzzy-warning-modal');
  if (!overlay) return;
  const tbody = document.getElementById('fuzzy-matches-tbody');
  tbody.innerHTML = matches.map(m => `
    <tr>
      <td>${m.ten}</td>
      <td><span style="color: ${m.score >= 75 ? 'var(--red)' : 'var(--gold)'}; font-weight: bold">${m.score}%</span></td>
    </tr>
  `).join('');
  overlay.classList.add('open');
}

function closeFuzzyWarningModal() {
  const overlay = document.getElementById('fuzzy-warning-modal');
  if (overlay) overlay.classList.remove('open');
  pendingSaveData = null;
}

// ══════════════════════════════════════
//  FILE DUPLICATE MODAL
// ══════════════════════════════════════

const FIELD_LABELS = {
  file_thuyet_minh: 'Thuyết minh',
  file_quyet_dinh:  'Quyết định',
  file_anh:         'Hình ảnh',
  file_ban_ve:      'Bản vẽ',
  file_hieu_qua:    'Hiệu quả',
};

// Key phải khớp với trường `level` mà file_check.js trả về
const LEVEL_CONFIG = {
  exact_block:      { label: 'TRÙNG 100%',          color: '#e74c3c', icon: 'fa-times-circle',         isBlock: true  },
  simhash_warning:  { label: 'NGHI NGỜ COPY (≥80%)', color: '#e67e22', icon: 'fa-exclamation-triangle', isBlock: false },
  chunk_block:      { label: 'ĐẠO VĂN NGHIÊM TRỌNG', color: '#c0392b', icon: 'fa-ban',                  isBlock: true  },
  chunk_warning:    { label: 'NGHI NGỜ VAY MƯỢN',    color: '#e67e22', icon: 'fa-exclamation-triangle', isBlock: false },
  // fallback
  name_only:        { label: 'TRÙNG TÊN',             color: '#f39c12', icon: 'fa-info-circle',          isBlock: false },
};

function showFileDuplicateModal(results) {
  if (!document.getElementById('file-duplicate-modal')) {
    _createFileDuplicateModal();
  }

  const body = document.getElementById('file-dup-body');
  if (!body) return;

  // hasBlockLevel = true khi có ít nhất 1 kết quả không thể bỏ qua (BLOCK)
  let hasBlockLevel = false;

  body.innerHTML = results.map(res => {
    const lvl    = LEVEL_CONFIG[res.level] || LEVEL_CONFIG.name_only;
    const fLabel = FIELD_LABELS[res.fieldName] || res.fieldName;

    if (lvl.isBlock) hasBlockLevel = true;

    const matchRows = res.matches.map(m => {
      let highlightHtml = '';
      if (m.newHighlightText && m.oldHighlightText) {
        highlightHtml = `
          <div class="fdup-split-view" style="display:flex; gap:10px; margin-top:8px; font-size:12px; background:#f8f9fa; padding:8px; border-radius:4px; border:1px solid #ddd;">
            <div style="flex:1;">
              <strong style="color:var(--primary); display:block; margin-bottom:4px">Đoạn text file mới:</strong>
              <div style="background:#fff3cd; padding:4px;">${m.newHighlightText}</div>
            </div>
            <div style="flex:1;">
              <strong style="color:var(--primary); display:block; margin-bottom:4px">Đoạn text file cũ:</strong>
              <div style="background:#fff3cd; padding:4px;">${m.oldHighlightText}</div>
            </div>
          </div>
        `;
      }

      return `
      <div class="fdup-match-row">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="fdup-match-name">
            <i class="fas fa-file-alt"></i>
            <span>${m.fileName}</span>
          </div>
          <div class="fdup-match-score" style="color:${lvl.color}">
            <strong>${m.score}%</strong>
          </div>
        </div>
        <div class="fdup-match-sk">
          <i class="fas fa-folder"></i>
          <span>${m.sangKienTen || '—'}</span>
        </div>
        <div class="fdup-match-detail" style="margin-top:4px;">${m.detail || ''}</div>
        ${highlightHtml}
      </div>`;
    }).join('');

    return `
      <div class="fdup-section">
        <div class="fdup-section-header" style="border-left-color:${lvl.color}">
          <i class="fas ${lvl.icon}" style="color:${lvl.color}"></i>
          <span class="fdup-field-label">${fLabel}</span>
          <span class="fdup-level-badge" style="background:${lvl.color}">${lvl.label}</span>
          <span class="fdup-new-file">${res.newFile}</span>
        </div>
        <div class="fdup-matches">${matchRows}</div>
      </div>`;
  }).join('');

  // Xử lý Rule Engine UI: BLOCK vs WARNING
  const btnContinue = document.getElementById('btn-continue-save');
  const checkboxConfirmContainer = document.getElementById('fdup-confirm-container');
  const noticeText = document.getElementById('fdup-notice-text');
  if (hasBlockLevel) {
    // ❌ BLOCK — không thể lưu
    btnContinue.style.display        = 'none';
    checkboxConfirmContainer.style.display = 'none';
    noticeText.innerHTML = '<i class="fas fa-times-circle" style="color:#e74c3c"></i> Phát hiện trùng lặp nghiêm trọng. KHÔNG THỂ LƯU FILE NÀY.';
    noticeText.style.color = '#e74c3c';
  } else {
    // ⚠️ WARNING — cho phép xác nhận và tiếp tục
    btnContinue.style.display        = 'block';
    btnContinue.disabled             = true; // bật sau khi check checkbox
    checkboxConfirmContainer.style.display = 'block';
    document.getElementById('fdup-confirm-check').checked = false;
    noticeText.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:#e67e22"></i> Phát hiện nội dung có nguy cơ trùng nội dung. Cần xác nhận để tiếp tục lưu.';
    noticeText.style.color = '#f19c50';
    btnContinue.innerHTML = '<i class="fas fa-check"></i> Xác nhận chọn file này';
  }

  document.getElementById('file-duplicate-modal').classList.add('open');
}

function closeFileDuplicateModal() {
  const overlay = document.getElementById('file-duplicate-modal');
  if (overlay) overlay.classList.remove('open');

  // User đóng modal mà chưa xác nhận → reset input (file chưa bao giờ được copy)
  if (_immediateCheckContext) {
    document.getElementById(_immediateCheckContext.inputId).value = '';
    _immediateCheckContext = null;
  }
}

function toggleFdupConfirm() {
  const cb = document.getElementById('fdup-confirm-check');
  const btn = document.getElementById('btn-continue-save');
  if (btn) btn.disabled = !cb.checked;
}

/** Tạo modal động nếu chưa có trong HTML */
function _createFileDuplicateModal() {
  const div = document.createElement('div');
  div.id        = 'file-duplicate-modal';
  div.className = 'modal-overlay';
  div.innerHTML = `
    <div class="modal fdup-modal" style="width: 800px; max-height: 90vh; display: flex; flex-direction: column;">
      <div class="modal-header">
        <h2><i class="fas fa-shield-alt" style="color:#e67e22;margin-right:8px"></i>Hệ Thống Kiểm Tra Trùng Nội Dung</h2>
        <button class="modal-close" onclick="closeFileDuplicateModal()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body" id="file-dup-body" style="overflow-y:auto; flex:1; padding: 16px;"></div>
      <div class="fdup-footer modal-footer" style="display:flex; flex-direction:column; gap:12px; border-top:1px solid #ddd; padding-top:16px;">
        <div class="fdup-notice" id="fdup-notice-text" style="font-weight:bold;">
          <!-- JS sẽ điền thông báo -->
        </div>
        <div id="fdup-confirm-container" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="fdup-confirm-check" onchange="toggleFdupConfirm()" style="width:16px; height:16px; cursor:pointer;" />
          <label for="fdup-confirm-check" style="cursor:pointer; font-size:13px; color:#fff;">Tôi xác nhận các rủi ro trên và chịu trách nhiệm khi lưu file này.</label>
        </div>
        <div class="fdup-actions" style="display:flex; justify-content:flex-end; gap:10px;">
          <button class="btn-cancel" onclick="chooseOtherFile()" style="padding:8px 16px;">
            <i class="fas fa-redo"></i> Chọn file khác
          </button>
          <button id="btn-continue-save" class="btn-save fdup-btn-continue" onclick="confirmSaveWithDuplicateFiles()" style="padding:8px 16px;">
            <i class="fas fa-save"></i> Vẫn tiếp tục lưu
          </button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div);
}

async function deleteSangKien(id) {
  const nid = Number(id);
  const row = allData.find(r => Number(r.id) === nid);
  if (!confirm(`Xóa sáng kiến:\n"${row?.ten}"\n\nBạn có chắc không?`)) return;
  const res = await call('sangkien:delete', nid);
  if (res.ok) {
    await loadSangKien();
    await loadDashboard();
    showToast('Đã xóa sáng kiến', 'success');
  } else {
    showToast('Lỗi xóa: ' + res.error, 'error');
  }
}

// ══════════════════════════════════════
//  VIDEO PLAYER MODAL
// ══════════════════════════════════════

// FIX: Chuyển link YouTube thường → embed URL
function toEmbedUrl(url) {
  if (!url) return '';

  // youtube.com/watch?v=ID → embed
  let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}?autoplay=1`;

  // Đã là embed rồi
  if (url.includes('youtube.com/embed/')) return url;

  // File local hoặc URL khác → dùng thẻ <video>
  return url;
}

function isYoutube(url) {
  return url.includes('youtube.com') || url.includes('youtu.be');
}

function openVideoModal(url) {
  if (!url) { showToast('Chưa có liên kết video', 'error'); return; }

  const overlay = document.getElementById('video-modal-overlay');
  const container = document.getElementById('video-container');

  if (isYoutube(url)) {
    const embedUrl = toEmbedUrl(url);
    container.innerHTML = `
      <iframe
        src="${embedUrl}"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        style="width:100%;height:100%;border:none">
      </iframe>`;
  } else {
    // File video local
    container.innerHTML = `
      <video controls autoplay style="width:100%;height:100%;background:#000;">
        <source src="${url}">
        <p style="color:#fff;padding:20px">Không thể phát video. Định dạng không được hỗ trợ.</p>
      </video>`;
  }

  overlay.classList.add('open');
}

function closeVideoModal() {
  const overlay = document.getElementById('video-modal-overlay');
  const container = document.getElementById('video-container');
  overlay.classList.remove('open');
  container.innerHTML = ''; // dừng video khi đóng
}

// ══════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════

async function changePassword() {
  const oldPw = document.getElementById('old-pw').value;
  const newPw = document.getElementById('new-pw').value;
  const confirmPw = document.getElementById('confirm-pw').value;
  if (!oldPw || !newPw) { showToast('Vui lòng nhập đầy đủ', 'error'); return; }
  if (newPw !== confirmPw) { showToast('Mật khẩu xác nhận không khớp', 'error'); return; }
  if (newPw.length < 4) { showToast('Mật khẩu tối thiểu 4 ký tự', 'error'); return; }
  const res = await call('admin:changePassword', { oldPw, newPw });
  if (res.ok) {
    showToast('Đã đổi mật khẩu thành công', 'success');
    ['old-pw', 'new-pw', 'confirm-pw'].forEach(id => { document.getElementById(id).value = ''; });
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
  t.className = 'toast ' + type;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, 3000);
}

// ══════════════════════════════════════
//  GIẢI THƯỞNG & HUY CHƯƠNG
// ══════════════════════════════════════

const LOAI_GIAI_LIST = [
  'Xuất sắc', 'Giải nhất', 'Giải nhì', 'Giải ba',
  'Huy chương Vàng', 'Huy chương Bạc', 'Huy chương Đồng',
];

const LOAI_GIAI_ICON = {
  'Xuất sắc':       { icon: 'fa-star',   color: '#c8a020' },
  'Giải nhất':      { icon: 'fa-trophy', color: '#c8a020' },
  'Giải nhì':       { icon: 'fa-trophy', color: '#909090' },
  'Giải ba':        { icon: 'fa-trophy', color: '#b87333' },
  'Huy chương Vàng':{ icon: 'fa-medal',  color: '#c8a020' },
  'Huy chương Bạc': { icon: 'fa-medal',  color: '#909090' },
  'Huy chương Đồng':{ icon: 'fa-medal',  color: '#b87333' },
};

let awardData        = [];
let editingAwardId   = null;

async function loadGiaiThuong() {
  const res = await call('giaithuong:getAll');
  if (!res.ok) { showToast('Lỗi tải giải thưởng', 'error'); return; }
  awardData = res.data || [];
  awardData.sort((a, b) => (b.nam || 0) - (a.nam || 0));
  renderAwardTable();
}

function renderAwardTable() {
  const tbody = document.getElementById('award-tbody');
  if (!tbody) return;
  if (!awardData.length) {
    tbody.innerHTML = `<tr class="table-empty"><td colspan="6">Chưa có giải thưởng nào</td></tr>`;
    return;
  }
  tbody.innerHTML = awardData.map((r, i) => {
    const cfg = LOAI_GIAI_ICON[r.loai_giai] || { icon: 'fa-award', color: '#68b2a0' };
    return `
      <tr>
        <td style="color:var(--dim);font-family:var(--mono);font-size:11px">${i + 1}</td>
        <td style="max-width:220px">${r.sang_kien_ten || '—'}</td>
        <td>${r.ten_giai}</td>
        <td>
          <span class="award-badge" style="--badge-color:${cfg.color}">
            <i class="fas ${cfg.icon}"></i> ${r.loai_giai}
          </span>
        </td>
        <td style="color:var(--dim);font-family:var(--mono)">${r.nam || '—'}</td>
        <td>
          <div class="tbl-actions">
            <button class="tbl-btn edit" onclick="openAwardForm(${r.id})">
              <i class="fas fa-edit"></i> Sửa
            </button>
            <button class="tbl-btn del" onclick="deleteAward(${r.id})">
              <i class="fas fa-trash"></i> Xóa
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

async function openAwardForm(id = null) {
  editingAwardId = id != null ? Number(id) : null;

  // Nạp danh sách sáng kiến vào select
  const skRes = await call('sangkien:getAll');
  const skList = skRes.ok ? skRes.data : allData;
  const skSelect = document.getElementById('award-form-sk');
  skSelect.innerHTML = skList.map(s =>
    `<option value="${s.id}">${s.ten}</option>`
  ).join('');

  const loaiSelect = document.getElementById('award-form-loai');
  loaiSelect.innerHTML = LOAI_GIAI_LIST.map(l =>
    `<option value="${l}">${l}</option>`
  ).join('');

  const title = document.getElementById('award-modal-title');
  title.textContent = editingAwardId != null ? 'Chỉnh sửa giải thưởng' : 'Thêm giải thưởng mới';

  if (editingAwardId != null) {
    const item = awardData.find(r => r.id === editingAwardId);
    if (!item) return;
    skSelect.value = item.sang_kien_id;
    loaiSelect.value = item.loai_giai;
    document.getElementById('award-form-nam').value   = item.nam   || '';
    document.getElementById('award-form-ten').value   = item.ten_giai;
    document.getElementById('award-form-mota').value  = item.mo_ta || '';
  } else {
    document.getElementById('award-form-nam').value  = new Date().getFullYear();
    document.getElementById('award-form-ten').value  = '';
    document.getElementById('award-form-mota').value = '';
  }

  document.getElementById('award-modal-overlay').classList.add('open');
  document.getElementById('award-form-ten').focus();
}

function closeAwardForm() {
  document.getElementById('award-modal-overlay').classList.remove('open');
  editingAwardId = null;
}

async function saveAward() {
  const ten   = document.getElementById('award-form-ten').value.trim();
  const skId  = document.getElementById('award-form-sk').value;
  const loai  = document.getElementById('award-form-loai').value;
  if (!ten)  { showToast('Vui lòng nhập tên giải thưởng', 'error'); return; }
  if (!skId) { showToast('Vui lòng chọn sáng kiến', 'error'); return; }

  const data = {
    sang_kien_id: Number(skId),
    ten_giai:     ten,
    loai_giai:    loai,
    nam:          Number(document.getElementById('award-form-nam').value) || null,
    mo_ta:        document.getElementById('award-form-mota').value.trim(),
  };

  const wasEdit = editingAwardId != null;
  const res = wasEdit
    ? await call('giaithuong:update', { id: editingAwardId, data })
    : await call('giaithuong:add', data);

  if (res.ok) {
    closeAwardForm();
    await loadGiaiThuong();
    showToast(wasEdit ? 'Đã cập nhật giải thưởng' : 'Đã thêm giải thưởng mới', 'success');
  } else {
    showToast('Lỗi: ' + res.error, 'error');
  }
}

async function deleteAward(id) {
  const item = awardData.find(r => r.id === id);
  if (!confirm(`Xóa giải thưởng:\n"${item?.ten_giai}"\n\nBạn có chắc không?`)) return;
  const res = await call('giaithuong:delete', id);
  if (res.ok) {
    await loadGiaiThuong();
    showToast('Đã xóa giải thưởng', 'success');
  } else {
    showToast('Lỗi xóa: ' + res.error, 'error');
  }
}

// ══════════════════════════════════════
//  BACKUP / RESTORE
// ══════════════════════════════════════

function _showProgress(title) {
  document.getElementById('backup-progress-title').textContent = title;
  document.getElementById('backup-progress-bar').style.width   = '0%';
  document.getElementById('backup-progress-pct').textContent   = '0%';
  document.getElementById('backup-progress-msg').textContent   = 'Đang chuẩn bị...';
  document.getElementById('backup-progress-overlay').classList.add('active');
}

function _updateProgress(pct, msg) {
  document.getElementById('backup-progress-bar').style.width = pct + '%';
  document.getElementById('backup-progress-pct').textContent = pct + '%';
  document.getElementById('backup-progress-msg').textContent = msg;
}

function _hideProgress() {
  document.getElementById('backup-progress-overlay').classList.remove('active');
}

async function doBackup() {
  if (!ipc) {
    showToast('Chức năng này chỉ hoạt động trong Electron App', 'error');
    return;
  }

  _showProgress('Đang tạo Backup...');
  ipc.on('backup:progress', (_, { pct, msg }) => _updateProgress(pct, msg));

  const res = await call('backup:create');

  ipc.removeAllListeners('backup:progress');
  _hideProgress();

  if (res.canceled) return;
  if (res.ok) {
    const m = res.manifest;
    showToast(
      `✅ Backup thành công! ${m.stats.sang_kien_count} sáng kiến · ${m.stats.file_count} files`,
      'success'
    );
  } else {
    showToast('❌ Backup thất bại: ' + res.error, 'error');
  }
}

async function doRestore() {
  if (!ipc) {
    showToast('Chức năng này chỉ hoạt động trong Electron App', 'error');
    return;
  }

  // Bước 1: Chọn file và xem trước manifest
  const preview = await call('backup:preview');
  if (!preview.ok) {
    if (!preview.canceled) showToast('❌ ' + preview.error, 'error');
    return;
  }

  const { manifest, zipPath } = preview;
  const createdAt = manifest.created_at
    ? new Date(manifest.created_at).toLocaleString('vi-VN')
    : '?';

  const confirmed = confirm(
    `🗂 Backup ngày: ${createdAt}\n` +
    `📊 ${manifest.stats.sang_kien_count} sáng kiến · ${manifest.stats.file_count} file\n\n` +
    `⚠️ Toàn bộ dữ liệu hiện tại sẽ bị THAY THẾ.\n` +
    `Hệ thống sẽ tự tạo bản dự phòng trước khi restore.\n\n` +
    `Tiếp tục phục hồi?`
  );
  if (!confirmed) return;

  // Bước 2: Restore
  _showProgress('Đang phục hồi dữ liệu...');
  ipc.on('backup:progress', (_, { pct, msg }) => _updateProgress(pct, msg));

  const res = await call('backup:restore', zipPath);

  ipc.removeAllListeners('backup:progress');
  _hideProgress();

  if (res.ok) {
    showToast('✅ Phục hồi thành công! Đang tải lại...', 'success');
    setTimeout(() => location.reload(), 1800);
  } else {
    showToast('❌ Phục hồi thất bại: ' + res.error, 'error');
  }
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeForm();
    closeVideoModal();
    closeFuzzyWarningModal();
    closeFileDuplicateModal();
    closeAwardForm();
  }
  if (e.key === 'Enter' &&
    document.getElementById('screen-login').classList.contains('active')) {
    doLogin();
  }
});