'use strict';

// ═══════════════════════════════════════════════════════════════
//  backup_service.js — Backup & Restore toàn bộ dữ liệu
//
//  Backup bao gồm:
//    • sangkien.db   (SQLite: sang_kien, tac_gia, ho_so, config,
//                            files/sha256/simhash, chunks, embeddings,
//                            giai_thuong)
//    • userData/files/  (PDF, ảnh, video đã upload)
//
//  Cấu trúc ZIP:
//    backup-YYYY-MM-DD_HHmmss.zip
//    ├── manifest.json
//    ├── database/sangkien.db
//    └── files/<tên file gốc>
// ═══════════════════════════════════════════════════════════════

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const BACKUP_VERSION = '1';
const SCHEMA_VERSION = 3;
const APP_VERSION    = '1.0.0';

// Lazy — gọi bên trong hàm để tránh race condition với app.whenReady()
function getPaths() {
  const { app } = require('electron');
  const USER_DATA = app.getPath('userData');
  return {
    DB_PATH:  path.join(USER_DATA, 'sangkien.db'),
    FILE_DIR: path.join(USER_DATA, 'files'),
  };
}

// ──────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    if (fs.statSync(s).isFile()) fs.copyFileSync(s, path.join(dest, name));
  }
}

function formatTimestamp(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
       + `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ──────────────────────────────────────────
//  ĐỌC MANIFEST (không giải nén toàn bộ)
// ──────────────────────────────────────────

function readBackupManifest(zipPath) {
  try {
    const zip   = new AdmZip(zipPath);
    const entry = zip.getEntry('manifest.json');
    if (!entry) return { ok: false, error: 'Không tìm thấy manifest.json trong gói backup.' };
    const manifest = JSON.parse(entry.getData().toString('utf-8'));
    return { ok: true, manifest };
  } catch (err) {
    return { ok: false, error: 'File backup bị hỏng hoặc không hợp lệ: ' + err.message };
  }
}

// ──────────────────────────────────────────
//  BACKUP
// ──────────────────────────────────────────

/**
 * Tạo gói backup ZIP.
 * @param {string}   destZipPath  — đường dẫn file .zip sẽ ghi
 * @param {Database} db           — better-sqlite3 instance đang mở
 * @param {Function} onProgress   — (percent: number, message: string) => void
 * @returns {{ ok: boolean, path?: string, manifest?: object, error?: string }}
 */
async function createBackup(destZipPath, db, onProgress) {
  const { DB_PATH, FILE_DIR } = getPaths();
  const tempDir    = path.join(os.tmpdir(), `tvs-backup-${Date.now()}`);
  const tempDbDir  = path.join(tempDir, 'database');
  const tempDbPath = path.join(tempDbDir, 'sangkien.db');
  const tempFiles  = path.join(tempDir, 'files');

  try {
    fs.mkdirSync(tempDbDir,  { recursive: true });
    fs.mkdirSync(tempFiles,  { recursive: true });

    // 1. Flush WAL → đảm bảo DB nhất quán trước khi copy
    onProgress(5, 'Đang chuẩn bị cơ sở dữ liệu...');
    db.pragma('wal_checkpoint(TRUNCATE)');

    // 2. Copy DB
    onProgress(10, 'Đang sao lưu cơ sở dữ liệu...');
    fs.copyFileSync(DB_PATH, tempDbPath);
    const dbChecksum = sha256File(tempDbPath);

    // 3. Copy files
    const fileNames = fs.existsSync(FILE_DIR)
      ? fs.readdirSync(FILE_DIR).filter(n => fs.statSync(path.join(FILE_DIR, n)).isFile())
      : [];

    const fileChecksums = {};
    let totalBytes = fs.statSync(tempDbPath).size;

    for (let i = 0; i < fileNames.length; i++) {
      const name = fileNames[i];
      const src  = path.join(FILE_DIR, name);
      const dest = path.join(tempFiles, name);
      fs.copyFileSync(src, dest);
      fileChecksums[name] = sha256File(dest);
      totalBytes += fs.statSync(dest).size;
      onProgress(
        10 + Math.floor(55 * (i + 1) / Math.max(fileNames.length, 1)),
        `Đang sao lưu file (${i + 1}/${fileNames.length})...`
      );
    }

    // 4. Thống kê từ DB
    const skCount = db.prepare('SELECT COUNT(*) AS n FROM sang_kien').get().n;

    // 5. Ghi manifest.json
    onProgress(68, 'Đang tạo manifest...');
    const manifest = {
      backup_version: BACKUP_VERSION,
      schema_version: SCHEMA_VERSION,
      app_version:    APP_VERSION,
      created_at:     new Date().toISOString(),
      platform:       process.platform,
      stats: {
        sang_kien_count:  skCount,
        file_count:       fileNames.length,
        total_size_bytes: totalBytes,
      },
      checksums: {
        database: dbChecksum,
        files:    fileChecksums,
      },
    };

    fs.writeFileSync(
      path.join(tempDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );

    // 6. Đóng gói ZIP
    onProgress(72, 'Đang nén gói backup...');
    const zip = new AdmZip();
    zip.addLocalFile(path.join(tempDir, 'manifest.json'));
    zip.addLocalFolder(tempDbDir,  'database');
    zip.addLocalFolder(tempFiles,  'files');
    zip.writeZip(destZipPath);

    onProgress(100, 'Hoàn thành!');
    return { ok: true, path: destZipPath, manifest };

  } catch (err) {
    console.error('[backup] createBackup error:', err);
    return { ok: false, error: err.message };
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ──────────────────────────────────────────
//  RESTORE
// ──────────────────────────────────────────

/**
 * Phục hồi từ gói backup ZIP.
 * @param {string}   zipPath   — đường dẫn file .zip nguồn
 * @param {object}   dbModule  — require('../renderer/database') — cần db + reopenDb()
 * @param {Function} onProgress
 * @returns {{ ok: boolean, manifest?: object, error?: string }}
 */
async function restoreBackup(zipPath, dbModule, onProgress) {
  const { DB_PATH, FILE_DIR } = getPaths();
  const tempDir       = path.join(os.tmpdir(), `tvs-restore-${Date.now()}`);
  const rollbackDb    = DB_PATH  + '.rollback';
  const rollbackFiles = FILE_DIR + '_rollback';
  let   rolledBack    = false;

  const doRollback = () => {
    if (rolledBack) return;
    rolledBack = true;
    try {
      if (fs.existsSync(rollbackDb))    fs.renameSync(rollbackDb,    DB_PATH);
      if (fs.existsSync(rollbackFiles)) fs.renameSync(rollbackFiles, FILE_DIR);
    } catch (e) {
      console.error('[backup] rollback error:', e);
    }
  };

  try {
    // 1. Đọc và validate manifest
    onProgress(3, 'Đang kiểm tra gói backup...');
    const { ok, manifest, error } = readBackupManifest(zipPath);
    if (!ok) return { ok: false, error };

    if (parseInt(manifest.backup_version) > parseInt(BACKUP_VERSION)) {
      return {
        ok: false,
        error: `Phiên bản backup (${manifest.backup_version}) mới hơn app hỗ trợ. Hãy cập nhật ứng dụng.`,
      };
    }

    // 2. Giải nén toàn bộ vào temp
    onProgress(10, 'Đang giải nén...');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempDir, /* overwrite */ true);

    const restoredDb    = path.join(tempDir, 'database', 'sangkien.db');
    const restoredFiles = path.join(tempDir, 'files');

    // 3. Verify checksum DB
    onProgress(25, 'Đang kiểm tra tính toàn vẹn...');
    if (!fs.existsSync(restoredDb)) {
      return { ok: false, error: 'Gói backup thiếu file database.' };
    }
    if (sha256File(restoredDb) !== manifest.checksums.database) {
      return { ok: false, error: 'Database trong gói backup bị hỏng (checksum không khớp).' };
    }

    // 4. Đóng kết nối DB — BẮT BUỘC trước khi thay file
    onProgress(30, 'Đang đóng kết nối database...');
    try { dbModule.db.close(); } catch (_) {}

    // 5. Đổi tên dữ liệu hiện tại sang rollback (atomic)
    onProgress(35, 'Đang lưu bản dự phòng...');
    if (fs.existsSync(DB_PATH))  fs.renameSync(DB_PATH,  rollbackDb);
    if (fs.existsSync(FILE_DIR)) fs.renameSync(FILE_DIR, rollbackFiles);

    // 6. Restore DB
    onProgress(50, 'Đang phục hồi cơ sở dữ liệu...');
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.copyFileSync(restoredDb, DB_PATH);

    // 7. Restore files
    onProgress(65, 'Đang phục hồi file đính kèm...');
    if (fs.existsSync(restoredFiles)) {
      copyDir(restoredFiles, FILE_DIR);
    } else {
      fs.mkdirSync(FILE_DIR, { recursive: true });
    }

    // 8. Mở lại DB
    onProgress(85, 'Đang khởi động lại database...');
    dbModule.reopenDb();

    // 9. Kiểm tra nhanh — đếm sáng kiến so với manifest
    const actualCount = dbModule.db
      .prepare('SELECT COUNT(*) AS n FROM sang_kien').get().n;

    if (actualCount !== manifest.stats.sang_kien_count) {
      doRollback();
      try { dbModule.reopenDb(); } catch (_) {}
      return {
        ok: false,
        error: `Dữ liệu sau restore không khớp (kỳ vọng ${manifest.stats.sang_kien_count}, thực tế ${actualCount}).`,
      };
    }

    // 10. Dọn dẹp rollback + temp
    try { fs.rmSync(rollbackDb,    { force: true }); } catch (_) {}
    try { fs.rmSync(rollbackFiles, { recursive: true, force: true }); } catch (_) {}

    onProgress(100, 'Phục hồi hoàn thành!');
    return { ok: true, manifest };

  } catch (err) {
    console.error('[backup] restoreBackup error:', err);
    doRollback();
    try { dbModule.reopenDb(); } catch (_) {}
    return { ok: false, error: 'Phục hồi thất bại: ' + err.message };
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ──────────────────────────────────────────
//  Export
// ──────────────────────────────────────────

module.exports = {
  createBackup,
  restoreBackup,
  readBackupManifest,
  formatTimestamp,
};
