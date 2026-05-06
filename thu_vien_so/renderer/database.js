// File: src/services/database.js
// Kết nối SQLite và khởi tạo bảng

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
const { app }  = require('electron');
const { MOCK_DATA } = require('./mock_data');

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
// Dùng `let` để reopenDb() có thể gán lại sau khi Restore
let db = new Database(DB_PATH, {
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

    -- ==========================================
    --  SCHEMA CHỐNG TRÙNG LẶP (PLAGIARISM)
    -- ==========================================
    
    -- Bảng files (File-level)
    CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sang_kien_id INTEGER NOT NULL REFERENCES sang_kien(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        file_type TEXT,
        sha256_hash TEXT NOT NULL,
        simhash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256_hash);
    CREATE INDEX IF NOT EXISTS idx_files_simhash ON files(simhash);

    -- Bảng chunks (Chunk-level)
    CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        start_char INTEGER,
        end_char INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_file_id ON chunks(file_id);

    -- Bảng embeddings (Vector-level)
    CREATE TABLE IF NOT EXISTS embeddings (
        chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
        vector BLOB NOT NULL
    ) WITHOUT ROWID;

    -- Bảng giải thưởng & huy chương
    CREATE TABLE IF NOT EXISTS giai_thuong (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sang_kien_id  INTEGER NOT NULL REFERENCES sang_kien(id) ON DELETE CASCADE,
      ten_giai      TEXT    NOT NULL,
      loai_giai     TEXT    NOT NULL DEFAULT '',
      nam           INTEGER,
      mo_ta         TEXT    DEFAULT '',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_giai_thuong_sk ON giai_thuong(sang_kien_id);

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

function seedMockDataIfEmpty() {
  const seedVersion = 'mock-data-v1';
  const seeded = db.prepare(
    "SELECT value FROM config WHERE key = 'mock_seed_version'"
  ).get();
  if (seeded && seeded.value === seedVersion) {
    return;
  }

  const insertSample = db.transaction((items) => {
    items.forEach((item) => {
      addSangKien({
        ten: item.ten || '',
        loai: item.loai || '',
        linh_vuc: item.linh_vuc || 'thammu',
        don_vi: item.don_vi || '',
        ngay_ap_dung: item.ngay_ap_dung || '',
        danh_gia: item.danh_gia || 5,
        mo_ta: item.mo_ta || '',
        link_video: item.link_video || '',
        qr_noi_dung: item.qr_noi_dung || '',
        file_thuyet_minh: item.file_thuyet_minh || '',
        file_quyet_dinh: item.file_quyet_dinh || '',
        file_anh: item.file_anh || '',
        file_ban_ve: item.file_ban_ve || '',
        file_hieu_qua: item.file_hieu_qua || '',
        authors: Array.isArray(item.authors) ? item.authors : []
      });
    });

    db.prepare(
      "INSERT INTO config (key, value) VALUES ('mock_seed_version', ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(seedVersion);
  });

  insertSample(MOCK_DATA || []);
  console.log(`[DB] Đã nạp ${(MOCK_DATA || []).length} dữ liệu mẫu vào SQLite`);
}

// ══════════════════════════════════════
//  CRUD SÁNG KIẾN
// ══════════════════════════════════════

// Lấy tất cả sáng kiến (kèm danh sách tác giả)
function getAllSangKien(linhVuc = null) {
  let items;
  if (linhVuc) {
    items = db.prepare(
      'SELECT * FROM sang_kien WHERE linh_vuc = ? ORDER BY created_at DESC, id DESC'
    ).all(linhVuc);
  } else {
    items = db.prepare(
      'SELECT * FROM sang_kien ORDER BY created_at DESC, id DESC'
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
//  GIẢI THƯỞNG & HUY CHƯƠNG
// ══════════════════════════════════════

function getAllGiaiThuong() {
  const rows = db.prepare(`
    SELECT g.*, s.ten AS sang_kien_ten
    FROM giai_thuong g
    LEFT JOIN sang_kien s ON s.id = g.sang_kien_id
    ORDER BY g.nam DESC, g.created_at DESC
  `).all();
  return rows;
}

function addGiaiThuong(data) {
  const result = db.prepare(`
    INSERT INTO giai_thuong (sang_kien_id, ten_giai, loai_giai, nam, mo_ta)
    VALUES (@sang_kien_id, @ten_giai, @loai_giai, @nam, @mo_ta)
  `).run(data);
  return result.lastInsertRowid;
}

function updateGiaiThuong(id, data) {
  db.prepare(`
    UPDATE giai_thuong
    SET sang_kien_id = @sang_kien_id, ten_giai = @ten_giai,
        loai_giai = @loai_giai, nam = @nam, mo_ta = @mo_ta
    WHERE id = @id
  `).run({ ...data, id });
}

function deleteGiaiThuong(id) {
  db.prepare('DELETE FROM giai_thuong WHERE id = ?').run(id);
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
//  CONFIG CHUNG
// ══════════════════════════════════════

function getConfigValue(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setConfigValue(key, value) {
  db.prepare(
    'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
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

// ══════════════════════════════════════
//  REOPEN DB (dùng sau khi Restore)
// ══════════════════════════════════════

function reopenDb() {
  try { db.close(); } catch (_) {}
  db = new Database(DB_PATH);   // cập nhật biến module-level
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  module.exports.db = db;       // cập nhật luôn export để caller thấy instance mới
  initTables();
}

// ── Khởi tạo khi load module ──
initTables();
seedMockDataIfEmpty();

module.exports = {
  getAllSangKien,
  getSangKienById,
  addSangKien,
  updateSangKien,
  deleteSangKien,
  getAllGiaiThuong,
  addGiaiThuong,
  updateGiaiThuong,
  deleteGiaiThuong,
  checkAdminPassword,
  changeAdminPassword,
  getConfigValue,
  setConfigValue,
  getStats,
  reopenDb,
  db,
};
