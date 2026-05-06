// File: src/main/ipc.js
const { ipcMain, BrowserWindow, app, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const db   = require('../renderer/database');
const { fuzzyCheckNewSangKien } = require('./fuzzy');
const { checkAllFiles }         = require('./file_check');
const { createBackup, restoreBackup, readBackupManifest, formatTimestamp } =
  require('./backup_service');

function registerIPC() {

  // ══════════════════════════════════════
  //  SÁNG KIẾN
  // ══════════════════════════════════════

  ipcMain.handle('sangkien:getAll', (_, linhVuc) => {
    try { return { ok:true, data: db.getAllSangKien(linhVuc) }; }
    catch(e) { return { ok:false, error: e.message }; }
  });

  ipcMain.handle('sangkien:getById', (_, id) => {
    try { return { ok:true, data: db.getSangKienById(id) }; }
    catch(e) { return { ok:false, error: e.message }; }
  });

  ipcMain.handle('sangkien:add', (_, data) => {
    try { 
      const id = db.addSangKien(data);
      // Gọi Anti-Plagiarism Engine để index files
      const { indexFilesToDb } = require('./file_check');
      const FILE_DIR = path.join(app.getPath('userData'), 'files');
      indexFilesToDb(id, data, FILE_DIR);
      return { ok:true, id }; 
    } catch(e) { 
      console.error('[sangkien:add] Lỗi:', e);
      return { ok:false, error: e.message }; 
    }
  });

  ipcMain.handle('sangkien:update', (_, { id, data }) => {
    try { 
      db.updateSangKien(id, data); 
      // Gọi Anti-Plagiarism Engine để re-index files
      const { indexFilesToDb } = require('./file_check');
      const FILE_DIR = path.join(app.getPath('userData'), 'files');
      indexFilesToDb(id, data, FILE_DIR);
      return { ok:true }; 
    } catch(e) { 
      console.error('[sangkien:update] Lỗi:', e);
      return { ok:false, error: e.message }; 
    }
  });

  ipcMain.handle('sangkien:delete', (_, id) => {
    try { db.deleteSangKien(id); return { ok:true }; }
    catch(e) { return { ok:false, error: e.message }; }
  });

  ipcMain.handle('sangkien:fuzzyCheck', (_, data) => {
    try {
      const allSangKien = db.getAllSangKien();
      const result = fuzzyCheckNewSangKien(data, allSangKien);
      return { ok: true, data: result };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  });

  // ══════════════════════════════════════
  //  KIỂM TRA TRÙNG FILE ĐÍNH KÈM
  // ══════════════════════════════════════

  /**
   * file:checkDuplicate
   * Renderer gửi:
   *   newFileMap  — { file_thuyet_minh: 'C:/abs/path/file.pdf', ... }
   *   oldFileMap  — { file_thuyet_minh: 'old_name.pdf', ... } hoặc null
   *   excludeId   — ID sáng kiến đang sửa (null khi Add)
   *
   * Main Process trả về:
   *   { ok, data: { hasWarning, results: [...] } }
   */
  ipcMain.handle('file:checkDuplicate', (_, { newFileMap, oldFileMap, excludeId, skipSimhashWarning }) => {
    try {
      const FILE_DIR    = path.join(app.getPath('userData'), 'files');
      const allSangKien = db.getAllSangKien();
      const result      = checkAllFiles(
        newFileMap,
        oldFileMap  || null,
        FILE_DIR,
        allSangKien,
        excludeId   || null,
        skipSimhashWarning || false
      );
      return { ok: true, data: result };
    } catch (e) {
      console.error('[IPC] file:checkDuplicate error:', e);
      return { ok: false, error: e.message };
    }
  });

  // ══════════════════════════════════════
  //  GIẢI THƯỞNG & HUY CHƯƠNG
  // ══════════════════════════════════════

  ipcMain.handle('giaithuong:getAll', () => {
    try { return { ok: true, data: db.getAllGiaiThuong() }; }
    catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('giaithuong:add', (_, data) => {
    try { const id = db.addGiaiThuong(data); return { ok: true, id }; }
    catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('giaithuong:update', (_, { id, data }) => {
    try { db.updateGiaiThuong(id, data); return { ok: true }; }
    catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('giaithuong:delete', (_, id) => {
    try { db.deleteGiaiThuong(id); return { ok: true }; }
    catch(e) { return { ok: false, error: e.message }; }
  });

  // ══════════════════════════════════════
  //  ADMIN AUTH
  // ══════════════════════════════════════

  ipcMain.handle('admin:login', (_, password) => {
    return { ok: db.checkAdminPassword(password) };
  });

  ipcMain.handle('admin:changePassword', (_, { oldPw, newPw }) => {
    if (!db.checkAdminPassword(oldPw))
      return { ok:false, error: 'Mật khẩu cũ không đúng' };
    db.changeAdminPassword(newPw);
    return { ok:true };
  });

  // ══════════════════════════════════════
  //  CONFIG CHUNG (key-value)
  // ══════════════════════════════════════

  ipcMain.handle('config:get', (_, key) => {
    try { return { ok: true, value: db.getConfigValue(key) }; }
    catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('config:set', (_, { key, value }) => {
    try { db.setConfigValue(key, value); return { ok: true }; }
    catch(e) { return { ok: false, error: e.message }; }
  });

  // ══════════════════════════════════════
  //  THỐNG KÊ
  // ══════════════════════════════════════

  ipcMain.handle('stats:get', () => {
    try { return { ok:true, data: db.getStats() }; }
    catch(e) { return { ok:false, error: e.message }; }
  });

  // ══════════════════════════════════════
  //  MỞ CỬA SỔ ADMIN
  // ══════════════════════════════════════

  ipcMain.on('open-admin', () => {
    const adminWin = new BrowserWindow({
      width:  1200,
      height: 800,
      title:  'Admin – Thư Viện Số',
      webPreferences: {
        nodeIntegration:  true,
        contextIsolation: false,
        sandbox:          false,
        webSecurity:      false,
      },
      autoHideMenuBar: true,
    });
    adminWin.loadFile(
      path.join(__dirname, '../renderer/admin/sign_up_admin.html')
    );
  });

  // ══════════════════════════════════════
  //  BACKUP / RESTORE
  // ══════════════════════════════════════

  // Xem trước manifest — dùng trước khi hỏi confirm restore
  ipcMain.handle('backup:preview', async () => {
    const result = await dialog.showOpenDialog({
      title:       'Chọn file backup',
      filters:     [{ name: 'Backup ZIP', extensions: ['zip'] }],
      properties:  ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    const zipPath = result.filePaths[0];
    const res = readBackupManifest(zipPath);
    return { ...res, zipPath };
  });

  // Tạo backup
  ipcMain.handle('backup:create', async (event) => {
    const result = await dialog.showSaveDialog({
      title:       'Lưu file backup',
      defaultPath: `backup-${formatTimestamp()}.zip`,
      filters:     [{ name: 'Backup ZIP', extensions: ['zip'] }],
    });
    if (result.canceled) return { ok: false, canceled: true };

    return createBackup(result.filePath, db.db, (pct, msg) => {
      event.sender.send('backup:progress', { pct, msg });
    });
  });

  // Restore (zipPath đã được chọn qua backup:preview)
  ipcMain.handle('backup:restore', async (event, zipPath) => {
    return restoreBackup(zipPath, db, (pct, msg) => {
      event.sender.send('backup:progress', { pct, msg });
    });
  });

  // ══════════════════════════════════════
  //  HỆ THỐNG
  // ══════════════════════════════════════

  ipcMain.on('app:quit', () => {
    require('electron').app.quit();
  });


  console.log('[IPC] Đã đăng ký tất cả IPC handlers');
}

module.exports = { registerIPC };
