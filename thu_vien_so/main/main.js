// File: src/main/main.js
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { registerIPC } = require('./icp');

// ══════════════════════════════════════
//  THƯ MỤC LƯU FILE ĐÍNH KÈM
// ══════════════════════════════════════

const FILE_DIR = path.join(app.getPath('userData'), 'files');

if (!fs.existsSync(FILE_DIR)) {
  fs.mkdirSync(FILE_DIR, { recursive: true });
}

// ══════════════════════════════════════
//  CẤU HÌNH CHUNG
// ══════════════════════════════════════

app.commandLine.appendSwitch('allow-file-access-from-files');
app.commandLine.appendSwitch('disable-web-security');

// ══════════════════════════════════════
//  HÀM TẠO TÊN FILE KHÔNG TRÙNG (GIỐNG WINDOWS)
// ══════════════════════════════════════

// Tạo đường dẫn đích không trùng tên — giống Windows
// VD: bao-cao.pdf → bao-cao (1).pdf → bao-cao (2).pdf
function getUniqueFilePath(originalName) {
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);
  let destPath = path.join(FILE_DIR, originalName);
  let counter = 1;

  while (fs.existsSync(destPath)) {
    // Kiểm tra nếu cùng 1 file thì không cần đổi tên
    destPath = path.join(FILE_DIR, `${baseName} (${counter})${ext}`);
    counter++;
  }
  return destPath;
}

// Handler chọn và copy file

// ══════════════════════════════════════
//  TẠO CỬA SỔ CHÍNH
// ══════════════════════════════════════

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Thư Viện Số Sáng Kiến – Lữ Đoàn 279',
    icon: path.join(__dirname, '../../logo-binh-chung-cong-binh.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
      devTools: true
    },
    autoHideMenuBar: true
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Bật khi debug
  win.webContents.openDevTools();
}

// ══════════════════════════════════════
//  IPC HANDLERS
// ══════════════════════════════════════

function setupHandlers() {

  // ── Chọn file (chưa copy) — trả về sourcePath để renderer check trùng trước ──
  ipcMain.handle('admin:pick-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        // { name: 'Tat ca tep ho tro', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'ogg', 'mov', 'doc', 'docx', 'dwg', 'xlsx', 'xls', 'csv'] },
        { name: 'PDF', extensions: ['pdf'] },
        // { name: 'Anh', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
        // { name: 'Video', extensions: ['mp4', 'webm', 'ogg', 'mov'] },
        // { name: 'Office / CAD', extensions: ['doc', 'docx', 'dwg', 'xlsx', 'xls', 'csv'] },
     
        // { name: 'Tất cả tài liệu', extensions: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'gif', 'dwg', 'xlsx', 'xls', 'csv', 'mp4', 'avi', 'mkv'] },
        // { name: 'PDF', extensions: ['pdf'] },
        // { name: 'Ảnh', extensions: ['jpg', 'jpeg', 'png', 'gif'] },
        // { name: 'Excel', extensions: ['xlsx', 'xls', 'csv'] },
        // { name: 'Video', extensions: ['mp4', 'avi', 'mkv', 'mov'] },
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false };
    }

    return { ok: true, sourcePath: result.filePaths[0] };
  });

  // ── Copy file vào userData/files/ sau khi user xác nhận không trùng (hoặc chấp nhận) ──
  ipcMain.handle('admin:copy-file', async (_, sourcePath) => {
    const destPath = getUniqueFilePath(path.basename(sourcePath));
    const fileName = path.basename(destPath);
    try {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`[copy-file] ${path.basename(sourcePath)} → ${fileName}`);
      return { ok: true, fileName, filePath: destPath };
    } catch (err) {
      console.error('[copy-file] Lỗi:', err);
      return { ok: false, error: err.message };
    }
  });

  // ── Mở file đính kèm ──

  function resolveStoredFile(fileName) {
    if (!fileName) return null;
    return path.normalize(
      path.isAbsolute(fileName)
        ? fileName
        : path.join(FILE_DIR, path.basename(fileName))
    );
  }

  ipcMain.handle('file:get-url', async (_, fileName) => {
    try {
      const fullPath = resolveStoredFile(fileName);
      if (!fullPath) {
        return { ok: false, error: 'Ten file trong' };
      }
      if (!fs.existsSync(fullPath)) {
        return { ok: false, error: 'Khong tim thay file: ' + fullPath };
      }

      return {
        ok: true,
        fileName: path.basename(fullPath),
        filePath: fullPath,
        url: pathToFileURL(fullPath).href,
        ext: path.extname(fullPath).replace('.', '').toLowerCase()
      };
    } catch (err) {
      console.error('[file:get-url] Loi:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('open-file', async (_, fileName) => {
    try {
      if (!fileName) {
        return { ok: false, error: 'Tên file trống' };
      }
      const fullPath = resolveStoredFile(fileName);

      if (!fs.existsSync(fullPath)) {
        return { ok: false, error: 'Không tìm thấy file: ' + fullPath };
      }

      const result = await shell.openPath(fullPath);
      if (result) {
        return { ok: false, error: result };
      }

      return { ok: true };

    } catch (err) {
      console.error('[open-file] Lỗi:', err);
      return { ok: false, error: err.message };
    }
  });

  // ── Mở link ngoài (video, web) ──
  ipcMain.handle('open-link-external', async (_, url) => {
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ── IPC khác (SQLite, Auth, Admin...) ──
  registerIPC();
}

// ══════════════════════════════════════
//  APP LIFECYCLE
// ══════════════════════════════════════

app.whenReady().then(() => {
  setupHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
