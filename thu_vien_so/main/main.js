// File: src/main/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { registerIPC } = require('./icp');

app.commandLine.appendSwitch('allow-file-access-from-files');
app.commandLine.appendSwitch('disable-web-security');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Thư Viện Số Sáng Kiến – Lữ Đoàn 279",
    icon: path.join(__dirname, "../../logo-binh-chung-cong-binh.png"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
    autoHideMenuBar: true
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  // win.webContents.openDevTools(); // bỏ comment khi debug
}

app.whenReady().then(() => {
  // Đăng ký tất cả IPC handlers TRƯỚC khi tạo cửa sổ
  registerIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});