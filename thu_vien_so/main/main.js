// File: src/main/main.js
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');                          // FIX: thêm fs
const { registerIPC } = require('./icp');

// Thư mục lưu file đính kèm — tạo nếu chưa có
const FILE_DIR = path.join(app.getPath('userData'), 'files');
if (!fs.existsSync(FILE_DIR)) fs.mkdirSync(FILE_DIR, { recursive: true });
// ── Cấu hình hệ thống ──
app.commandLine.appendSwitch('allow-file-access-from-files');
app.commandLine.appendSwitch('disable-web-security');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Thư Viện Số Sáng Kiến – Lữ Đoàn 279",
    // Sửa lại đường dẫn icon nếu cần (đảm bảo file tồn tại)
    icon: path.join(__dirname, "../../logo-binh-chung-cong-binh.png"), 
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // Cho phép truy cập file cục bộ
    },
    autoHideMenuBar: true
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.webContents.openDevTools();
}

// ── Đăng ký các trình xử lý IPC ──
function setupHandlers() {
  ipcMain.handle('open-file', async (_, filePath) => {
    try {
      if (!filePath) return { ok:false, error:'Đường dẫn trống' };

      let fullPath;

      if (path.isAbsolute(filePath)) {
        // Đường dẫn tuyệt đối: C:/Users/.../file.pdf hoặc /home/.../file.pdf
        fullPath = filePath;
      } else {
        // Chỉ có tên file → tìm trong FILE_DIR
        fullPath = path.join(FILE_DIR, path.basename(filePath));
      }

      // Chuẩn hóa path cho từng OS
      fullPath = path.normalize(fullPath);

      if (!fs.existsSync(fullPath)) {
        return { ok:false, error:'Không tìm thấy file: ' + fullPath };
      }

      const result = await shell.openPath(fullPath);
      // shell.openPath trả về '' nếu thành công, chuỗi lỗi nếu thất bại
      if (result) return { ok:false, error: result };
      return { ok:true };

    } catch (err) {
      console.error('[open-file] Lỗi:', err);
      return { ok:false, error: err.message };
    }
  });

  // Handler mở link web (video) bằng trình duyệt ngoài
  ipcMain.handle('open-link-external', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Gọi hàm đăng ký IPC từ file icp.js của bạn
  registerIPC();
}

app.whenReady().then(() => {
  setupHandlers(); // Thiết lập tất cả handler trước
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});