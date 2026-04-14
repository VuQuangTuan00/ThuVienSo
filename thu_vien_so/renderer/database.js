// File: src/services/database.js
// Kết nối SQLite và khởi tạo bảng

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
const { app }  = require('electron');

// ── Đường dẫn file database ──
// Lưu trong userData để không bị xóa khi update app
const DB_DIR  = app.getPath('userData');
const DB_PATH = path.join(DB_DIR, 'sangkien.db');

// Đảm bảo thư mục tồn tại
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

console.log('[DB] Database path:', DB_PATH);

// ── Kết nối ──
const db = new Database(DB_PATH, {
  verbose: process.env.NODE_ENV === 'development'
    ? (msg) => console.log('[SQL]', msg)
    : null
});

// Bật WAL mode — nhanh hơn cho đọc/ghi đồng thời
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ══════════════════════════════════════
//  KHỞI TẠO BẢNG
// ══════════════════════════════════════
function initTables() {
  db.exec(`
    -- Bảng sáng kiến
    CREATE TABLE IF NOT EXISTS sang_kien (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ten           TEXT    NOT NULL,
      loai          TEXT    NOT NULL DEFAULT '',
      linh_vuc      TEXT    NOT NULL DEFAULT 'thammu',
      don_vi        TEXT    NOT NULL DEFAULT '',
      ngay_ap_dung  TEXT    NOT NULL DEFAULT '',
      danh_gia      INTEGER NOT NULL DEFAULT 5,
      mo_ta            TEXT    DEFAULT '',
      link_video       TEXT    DEFAULT '',
      qr_noi_dung      TEXT    DEFAULT '',
      file_thuyet_minh TEXT    DEFAULT '',
      file_quyet_dinh  TEXT    DEFAULT '',
      file_anh         TEXT    DEFAULT '',
      file_ban_ve      TEXT    DEFAULT '',
      file_hieu_qua    TEXT    DEFAULT '',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Bảng tác giả (quan hệ 1-nhiều với sang_kien)
    CREATE TABLE IF NOT EXISTS tac_gia (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sang_kien_id  INTEGER NOT NULL REFERENCES sang_kien(id) ON DELETE CASCADE,
      cap_bac       TEXT    DEFAULT '',
      ho_ten        TEXT    NOT NULL,
      chuc_vu       TEXT    DEFAULT '',
      thu_tu        INTEGER DEFAULT 0
    );

    -- Bảng hồ sơ đính kèm
    CREATE TABLE IF NOT EXISTS ho_so (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sang_kien_id  INTEGER NOT NULL REFERENCES sang_kien(id) ON DELETE CASCADE,
      ten_file      TEXT    NOT NULL,
      loai_file     TEXT    DEFAULT 'pdf',
      duong_dan     TEXT    DEFAULT '',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Bảng cấu hình admin
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Tạo mật khẩu admin mặc định nếu chưa có
  const adminPw = db.prepare(
    "SELECT value FROM config WHERE key = 'admin_password'"
  ).get();

  if (!adminPw) {
    db.prepare(
      "INSERT INTO config (key, value) VALUES ('admin_password', ?)"
    ).run('admin279');
    console.log('[DB] Mật khẩu admin mặc định: admin279');
  }

  console.log('[DB] Khởi tạo bảng thành công');
}

// ══════════════════════════════════════
//  CRUD SÁNG KIẾN
// ══════════════════════════════════════

// Lấy tất cả sáng kiến (kèm danh sách tác giả)
function getAllSangKien(linhVuc = null) {
  let items;
  if (linhVuc) {
    items = db.prepare(
      'SELECT * FROM sang_kien WHERE linh_vuc = ? ORDER BY created_at DESC'
    ).all(linhVuc);
  } else {
    items = db.prepare(
      'SELECT * FROM sang_kien ORDER BY linh_vuc, created_at DESC'
    ).all();
  }

  // Gắn tác giả vào từng sáng kiến
  const getAuthors = db.prepare(
    'SELECT * FROM tac_gia WHERE sang_kien_id = ? ORDER BY thu_tu'
  );

  return items.map(item => ({
    ...item,
    authors: getAuthors.all(item.id)
  }));
}

// Lấy 1 sáng kiến theo ID
function getSangKienById(id) {
  const item = db.prepare('SELECT * FROM sang_kien WHERE id = ?').get(id);
  if (!item) return null;

  item.authors = db.prepare(
    'SELECT * FROM tac_gia WHERE sang_kien_id = ? ORDER BY thu_tu'
  ).all(id);

  item.hoSo = db.prepare(
    'SELECT * FROM ho_so WHERE sang_kien_id = ? ORDER BY created_at'
  ).all(id);

  return item;
}

// Thêm sáng kiến mới
function addSangKien(data) {
  const insert = db.transaction((d) => {
    // Insert sáng kiến
    const result = db.prepare(`
      INSERT INTO sang_kien (
        ten, loai, linh_vuc, don_vi, ngay_ap_dung, danh_gia, mo_ta,
        link_video, qr_noi_dung,
        file_thuyet_minh, file_quyet_dinh, file_anh, file_ban_ve, file_hieu_qua
      ) VALUES (
        @ten, @loai, @linh_vuc, @don_vi, @ngay_ap_dung, @danh_gia, @mo_ta,
        @link_video, @qr_noi_dung,
        @file_thuyet_minh, @file_quyet_dinh, @file_anh, @file_ban_ve, @file_hieu_qua
      )
    `).run(d);

    const id = result.lastInsertRowid;

    // Insert tác giả
    if (d.authors && d.authors.length > 0) {
      const insertAuthor = db.prepare(`
        INSERT INTO tac_gia (sang_kien_id, cap_bac, ho_ten, chuc_vu, thu_tu)
        VALUES (?, ?, ?, ?, ?)
      `);
      d.authors.forEach((a, i) => {
        insertAuthor.run(id, a.cap_bac || '', a.ho_ten, a.chuc_vu || '', i);
      });
    }

    return id;
  });

  return insert(data);
}

// Cập nhật sáng kiến
function updateSangKien(id, data) {
  const update = db.transaction((d) => {
    // Update sáng kiến
    db.prepare(`
      UPDATE sang_kien
      SET ten = @ten, loai = @loai, linh_vuc = @linh_vuc,
          don_vi = @don_vi, ngay_ap_dung = @ngay_ap_dung,
          danh_gia = @danh_gia, mo_ta = @mo_ta,
          link_video = @link_video, qr_noi_dung = @qr_noi_dung,
          file_thuyet_minh = @file_thuyet_minh, file_quyet_dinh = @file_quyet_dinh,
          file_anh = @file_anh, file_ban_ve = @file_ban_ve, file_hieu_qua = @file_hieu_qua,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...d, id });

    // Xóa tác giả cũ và insert lại
    db.prepare('DELETE FROM tac_gia WHERE sang_kien_id = ?').run(id);

    if (d.authors && d.authors.length > 0) {
      const insertAuthor = db.prepare(`
        INSERT INTO tac_gia (sang_kien_id, cap_bac, ho_ten, chuc_vu, thu_tu)
        VALUES (?, ?, ?, ?, ?)
      `);
      d.authors.forEach((a, i) => {
        insertAuthor.run(id, a.cap_bac || '', a.ho_ten, a.chuc_vu || '', i);
      });
    }
  });

  update(data);
}

// Xóa sáng kiến (cascade xóa tác giả và hồ sơ)
function deleteSangKien(id) {
  db.prepare('DELETE FROM sang_kien WHERE id = ?').run(id);
}

// ══════════════════════════════════════
//  ADMIN AUTH
// ══════════════════════════════════════

function checkAdminPassword(password) {
  const row = db.prepare(
    "SELECT value FROM config WHERE key = 'admin_password'"
  ).get();
  return row && row.value === password;
}

function changeAdminPassword(newPassword) {
  db.prepare(
    "UPDATE config SET value = ? WHERE key = 'admin_password'"
  ).run(newPassword);
}

// ══════════════════════════════════════
//  THỐNG KÊ
// ══════════════════════════════════════

function getStats() {
  return {
    total:    db.prepare('SELECT COUNT(*) as n FROM sang_kien').get().n,
    thammu:   db.prepare("SELECT COUNT(*) as n FROM sang_kien WHERE linh_vuc='thammu'").get().n,
    chinhri:  db.prepare("SELECT COUNT(*) as n FROM sang_kien WHERE linh_vuc='chinhri'").get().n,
    hckt:     db.prepare("SELECT COUNT(*) as n FROM sang_kien WHERE linh_vuc='hckt'").get().n,
  };
}

// ── Khởi tạo khi load module ──
initTables();

module.exports = {
  getAllSangKien,
  getSangKienById,
  addSangKien,
  updateSangKien,
  deleteSangKien,
  checkAdminPassword,
  changeAdminPassword,
  getStats,
  db, // export raw db nếu cần query thủ công
};