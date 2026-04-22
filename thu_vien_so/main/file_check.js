// ═══════════════════════════════════════════════════════════════
//  file_check.js — Kiểm tra trùng file đính kèm
//  Chạy ở: Main Process (Node.js)
//  Không dùng cloud, offline 100%
// ═══════════════════════════════════════════════════════════════

'use strict';

const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

// ── Các loại file hỗ trợ đọc text content ──
const TEXT_EXTS  = new Set(['.txt', '.md', '.csv', '.html', '.htm', '.xml', '.json']);
const WORD_EXTS  = new Set(['.doc', '.docx']);
const EXCEL_EXTS = new Set(['.xls', '.xlsx']);
const PDF_EXT    = '.pdf';
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff']);
const VIDEO_EXTS = new Set(['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv']);

// ══════════════════════════════════════
//  HASH FILE (SHA-256)
//  Dùng cho mọi loại file — nhanh, chính xác
// ══════════════════════════════════════

/**
 * Tính SHA-256 hash của file
 * @param {string} filePath — đường dẫn tuyệt đối
 * @returns {string} hex hash | null nếu lỗi
 */
function hashFile(filePath) {
  try {
    const buf  = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch (e) {
    console.error('[file_check] hashFile error:', e.message);
    return null;
  }
}

// ══════════════════════════════════════
//  ĐỌC TEXT CONTENT (Fuzzy)
//  Chỉ với file text/PDF/Word
// ══════════════════════════════════════

/**
 * Trích text thô từ file — phục vụ so sánh fuzzy content
 * Trả về null nếu không đọc được (image, video, binary...)
 */
function extractTextContent(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  try {
    // Text files — đọc thẳng
    if (TEXT_EXTS.has(ext)) {
      return fs.readFileSync(filePath, 'utf-8').slice(0, 50000); // giới hạn 50KB
    }

    // PDF — đọc raw bytes tìm text streams
    if (ext === PDF_EXT) {
      return extractPdfTextSimple(filePath);
    }

    // Word/Excel/Image/Video — chỉ hash, không đọc content
    return null;

  } catch (e) {
    console.warn('[file_check] extractTextContent error:', e.message);
    return null;
  }
}

/**
 * Trích text đơn giản từ PDF (không dùng thư viện nặng)
 * Tìm các chuỗi text giữa BT...ET trong PDF stream
 */
function extractPdfTextSimple(filePath) {
  try {
    const buf     = fs.readFileSync(filePath);
    const content = buf.toString('latin1'); // đọc raw bytes

    // Tìm text trong PDF streams (heuristic)
    const matches = [];
    const re = /\(([^)]{3,200})\)/g;
    let m;
    let count = 0;

    while ((m = re.exec(content)) !== null && count < 500) {
      const text = m[1].replace(/\\[nrt\\()]/g, ' ').trim();
      if (text.length >= 3 && /[a-zA-Z\u00C0-\u024F\u1EA0-\u1EF9]/.test(text)) {
        matches.push(text);
        count++;
      }
    }

    return matches.join(' ').slice(0, 50000) || null;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════
//  SO SÁNH TEXT FUZZY
//  Dựa trên Jaccard similarity của trigrams
// ══════════════════════════════════════

/**
 * Tạo tập trigrams từ chuỗi
 * VD: "hello" → {"hel","ell","llo"}
 */
function getTrigrams(str) {
  const s   = str.toLowerCase().replace(/\s+/g, ' ').trim();
  const set = new Set();
  for (let i = 0; i + 2 < s.length; i++) {
    set.add(s.slice(i, i + 3));
  }
  return set;
}

/**
 * Jaccard similarity giữa 2 tập trigrams
 * Trả về 0.0 – 1.0
 */
function jaccardSimilarity(set1, set2) {
  if (set1.size === 0 && set2.size === 0) return 1.0;
  if (set1.size === 0 || set2.size === 0) return 0.0;

  let intersection = 0;
  for (const t of set1) {
    if (set2.has(t)) intersection++;
  }
  const union = set1.size + set2.size - intersection;
  return intersection / union;
}

/**
 * So sánh nội dung text 2 file
 * @returns {number} 0.0 – 1.0
 */
function compareTextContent(text1, text2) {
  if (!text1 || !text2) return 0;

  // Nếu text ngắn (<100 chars) → so sánh trực tiếp
  if (text1.length < 100 || text2.length < 100) {
    return text1.toLowerCase().includes(text2.toLowerCase().slice(0, 50)) ? 0.8 : 0;
  }

  // Dùng sample đầu + giữa + cuối để tăng tốc (tránh file rất dài)
  const sample1 = sampleText(text1, 5000);
  const sample2 = sampleText(text2, 5000);

  const tri1 = getTrigrams(sample1);
  const tri2 = getTrigrams(sample2);

  return jaccardSimilarity(tri1, tri2);
}

/** Lấy sample từ đầu + giữa + cuối text */
function sampleText(text, maxLen) {
  if (text.length <= maxLen) return text;
  const third = Math.floor(maxLen / 3);
  const mid   = Math.floor(text.length / 2);
  return text.slice(0, third)
    + text.slice(mid - Math.floor(third / 2), mid + Math.floor(third / 2))
    + text.slice(text.length - third);
}

// ══════════════════════════════════════
//  KIỂM TRA TRÙNG — HÀM CHÍNH
// ══════════════════════════════════════

/**
 * Kết quả trùng của 1 file
 * @typedef {Object} FileDuplicateResult
 * @property {string}  newFile       — tên file mới
 * @property {string}  level         — 'exact' | 'high' | 'name_only' | 'none'
 * @property {number}  score         — 0-100
 * @property {Array}   matches       — danh sách file trùng
 */

/**
 * Kiểm tra 1 file mới có trùng với file nào trong DB không
 *
 * @param {string}  newFilePath     — đường dẫn file mới (chưa copy vào FILE_DIR)
 * @param {string}  FILE_DIR        — thư mục files của hệ thống
 * @param {Array}   allSangKien     — toàn bộ sáng kiến từ DB
 * @param {number|null} excludeId   — ID sáng kiến đang sửa (null khi Add)
 * @returns {FileDuplicateResult}
 */
function checkOneFile(newFilePath, FILE_DIR, allSangKien, excludeId = null) {
  const result = {
    newFile: path.basename(newFilePath),
    level:   'none',
    score:   0,
    matches: [],
  };

  // ── Bước 1: Hash file mới ──
  const newHash = hashFile(newFilePath);
  if (!newHash) return result; // file không đọc được → bỏ qua

  const newExt   = path.extname(newFilePath).toLowerCase();
  const newName  = path.basename(newFilePath).toLowerCase();

  // ── Bước 2: Đọc text content (nếu có thể) ──
  const newText = extractTextContent(newFilePath);
  const newTri  = newText ? getTrigrams(newText) : null;

  // ── Bước 3: Tập hợp tất cả file đã có trong DB ──
  const FILE_FIELDS = [
    'file_thuyet_minh', 'file_quyet_dinh',
    'file_anh', 'file_ban_ve', 'file_hieu_qua'
  ];

  const checked = new Set(); // tránh kiểm tra file trùng tên 2 lần

  for (const sk of allSangKien) {
    // Bỏ qua sáng kiến đang sửa (Edit mode)
    if (excludeId != null && Number(sk.id) === Number(excludeId)) continue;

    for (const field of FILE_FIELDS) {
      const existingName = sk[field];
      if (!existingName || checked.has(existingName)) continue;
      checked.add(existingName);

      const existingPath = path.join(FILE_DIR, existingName);
      if (!fs.existsSync(existingPath)) continue;

      const existingExt  = path.extname(existingName).toLowerCase();
      const existingName_l = existingName.toLowerCase();

      // ── Level 1: Hash giống → Trùng 100% ──
      const existingHash = hashFile(existingPath);
      if (existingHash && existingHash === newHash) {
        result.matches.push({
          fileName:   existingName,
          sangKienId: sk.id,
          sangKienTen: sk.ten,
          level:      'exact',
          score:      100,
          detail:     'Nội dung file giống hệt nhau (hash SHA-256 trùng)',
        });
        continue;
      }

      // ── Level 2: Fuzzy content (chỉ với file text/PDF) ──
      if (newTri && newExt === existingExt && !IMAGE_EXTS.has(newExt) && !VIDEO_EXTS.has(newExt)) {
        const existingText = extractTextContent(existingPath);
        if (existingText) {
          const existingTri = getTrigrams(existingText);
          const similarity  = jaccardSimilarity(newTri, existingTri);
          if (similarity >= 0.80) {
            result.matches.push({
              fileName:    existingName,
              sangKienId:  sk.id,
              sangKienTen: sk.ten,
              level:       'high',
              score:       Math.round(similarity * 100),
              detail:      `Nội dung tương đồng ${Math.round(similarity * 100)}% (Jaccard trigram)`,
            });
            continue;
          }
        }
      }

      // ── Level 3: Trùng tên nhưng khác nội dung ──
      if (newName === existingName_l) {
        result.matches.push({
          fileName:    existingName,
          sangKienId:  sk.id,
          sangKienTen: sk.ten,
          level:       'name_only',
          score:       30,
          detail:      'Tên file giống nhau nhưng nội dung khác',
        });
      }
    }
  }

  // ── Xác định mức độ tổng thể ──
  if (result.matches.length > 0) {
    const maxScore = Math.max(...result.matches.map(m => m.score));
    if      (maxScore === 100) result.level = 'exact';
    else if (maxScore >= 80)   result.level = 'high';
    else                       result.level = 'name_only';
    result.score = maxScore;
  }

  return result;
}

/**
 * Kiểm tra TẤT CẢ 5 file của 1 sáng kiến (Add hoặc Edit)
 *
 * @param {Object}      newFileMap   — { file_thuyet_minh: 'path', ... } — chỉ các file MỚI chọn
 * @param {Object|null} oldFileMap   — file cũ của sáng kiến (khi Edit) — để loại trừ
 * @param {string}      FILE_DIR
 * @param {Array}       allSangKien
 * @param {number|null} excludeId
 * @returns {{ hasWarning: boolean, results: FileDuplicateResult[] }}
 */
function checkAllFiles(newFileMap, oldFileMap, FILE_DIR, allSangKien, excludeId = null) {
  const results = [];

  const FILE_FIELDS = [
    'file_thuyet_minh', 'file_quyet_dinh',
    'file_anh', 'file_ban_ve', 'file_hieu_qua'
  ];

  for (const field of FILE_FIELDS) {
    const newPath = newFileMap[field];
    if (!newPath || !newPath.trim()) continue;

    // Edit mode: bỏ qua nếu người dùng KHÔNG đổi file này
    if (excludeId != null && oldFileMap) {
      const oldName = oldFileMap[field] || '';
      const newName = path.basename(newPath);
      if (oldName && oldName === newName) {
        // Không đổi file → bỏ qua kiểm tra
        continue;
      }
    }

    // File phải tồn tại (là đường dẫn tuyệt đối chưa copy)
    if (!fs.existsSync(newPath)) continue;

    const res = checkOneFile(newPath, FILE_DIR, allSangKien, excludeId);
    if (res.level !== 'none') {
      res.fieldName = field; // trường nào bị trùng
      results.push(res);
    }
  }

  return {
    hasWarning: results.length > 0,
    results,
  };
}

// ══════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════

module.exports = {
  checkOneFile,
  checkAllFiles,
  hashFile,
  extractTextContent,
  compareTextContent,
};