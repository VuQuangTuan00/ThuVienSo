// File: src/main/main.js
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { registerIPC } = require('./icp');

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
  // Handler mở file cục bộ
  ipcMain.handle('open-file', async (event, filePath) => {
    console.log("== [Main Process] Nhận lệnh mở file ==");
    console.log("Đường dẫn nhận được:", filePath);
  
    try {
      if (!fs.existsSync(filePath)) {
        console.error("LỖI: File không tồn tại tại vị trí này!");
        return { ok: false, error: "File không tồn tại trên máy tính. Kiểm tra lại đường dẫn." };
      }
  
      // 2. Thử mở file bằng ứng dụng mặc định
      // shell.openPath trả về chuỗi trống "" nếu thành công
      const errMsg = await shell.openPath(filePath);
  
      if (errMsg) {
        console.error("Lỗi từ hệ thống Windows:", errMsg);
        return { ok: false, error: errMsg };
      }
  
      console.log("Mở file thành công!");
      return { ok: true };
  
    } catch (err) {
      console.error("Lỗi crash khi mở file:", err.message);
      return { ok: false, error: err.message };
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

