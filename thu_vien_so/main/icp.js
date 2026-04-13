// File: src/main/ipc.js
// Định nghĩa tất cả IPC channels — UI gửi lệnh, Main Process xử lý

const { ipcMain } = require('electron');
const db = require('../services/database');

function registerIPC() {

  // ══════════════════════════════════════
  //  SÁNG KIẾN
  // ══════════════════════════════════════

  // Lấy tất cả (có thể lọc theo linh_vuc)
  ipcMain.handle('sangkien:getAll', (_, linhVuc) => {
    try {
      return { ok: true, data: db.getAllSangKien(linhVuc) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Lấy 1 theo ID
  ipcMain.handle('sangkien:getById', (_, id) => {
    try {
      return { ok: true, data: db.getSangKienById(id) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Thêm mới
  ipcMain.handle('sangkien:add', (_, data) => {
    try {
      const id = db.addSangKien(data);
      return { ok: true, id };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Cập nhật
  ipcMain.handle('sangkien:update', (_, { id, data }) => {
    try {
      db.updateSangKien(id, data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Xóa
  ipcMain.handle('sangkien:delete', (_, id) => {
    try {
      db.deleteSangKien(id);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ══════════════════════════════════════
  //  ADMIN AUTH
  // ══════════════════════════════════════

  ipcMain.handle('admin:login', (_, password) => {
    const ok = db.checkAdminPassword(password);
    return { ok };
  });

  ipcMain.handle('admin:changePassword', (_, { oldPw, newPw }) => {
    if (!db.checkAdminPassword(oldPw)) {
      return { ok: false, error: 'Mật khẩu cũ không đúng' };
    }
    db.changeAdminPassword(newPw);
    return { ok: true };
  });

  // ══════════════════════════════════════
  //  THỐNG KÊ
  // ══════════════════════════════════════

  ipcMain.handle('stats:get', () => {
    try {
      return { ok: true, data: db.getStats() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
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