// File: src/main/ipc.js
const { ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const db   = require('../renderer/database');
const { fuzzyCheckNewSangKien } = require('./fuzzy');

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
    try { return { ok:true, id: db.addSangKien(data) }; }
    catch(e) { return { ok:false, error: e.message }; }
  });

  ipcMain.handle('sangkien:update', (_, { id, data }) => {
    try { db.updateSangKien(id, data); return { ok:true }; }
    catch(e) { return { ok:false, error: e.message }; }
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
        webSecurity:      false,
      },
      autoHideMenuBar: true,
    });
    adminWin.loadFile(
      path.join(__dirname, '../renderer/admin/sign_up_admin.html')
    );
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