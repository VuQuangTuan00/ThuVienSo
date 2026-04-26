// ═══════════════════════════════════════════════════════════════
//  file_check.js — Hệ Thống Kiểm Tra Trùng Nội Dung File
//
//  Pipeline:
//    Upload file
//    → Extract text (PDF / DOCX / TXT / ...)
//    → Normalize text
//    → SHA-256 hash  →  Trùng 100% → BLOCK
//    → SimHash       →  >= 80%     → CANH BAO (dung, hoi user)
//    → Chunk (200-400 tu, overlap 10-20%)
//    → Embedding -> Cosine Similarity
//    → Rule Engine:
//         Chunk >= 0.90         → BLOCK
//         >= 2 chunk >= 0.80    → WARNING
//         Tat ca < 0.65         → ACCEPT
// ═══════════════════════════════════════════════════════════════

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const db     = require('../renderer/database').db;

// ── Loai file ho tro doc text ──
const TEXT_EXTS = new Set(['.txt', '.md', '.csv', '.html', '.htm', '.xml', '.json']);
const PDF_EXT   = '.pdf';
const DOCX_EXT  = '.docx';

// ── Config pipeline (de dieu chinh tai mot cho) ──
const CHUNK_SIZE        = 300;   // tu / chunk  (trong range 200-400)
const CHUNK_OVERLAP     = 0.15;  // 15% overlap (trong range 10-20%)
const SIMHASH_WARN_THR  = 0.80;  // SimHash >= 80% → canh bao
const CHUNK_BLOCK_THR   = 0.90;  // Cosine >= 0.90 → BLOCK
const CHUNK_WARN_THR    = 0.80;  // Cosine >= 0.80 → dem warning
const CHUNK_ACCEPT_THR  = 0.65;  // Cosine < 0.65  → bo qua hoan toan
const SIMHASH_CAND_THR  = 0.40;  // SimHash > 0.40 → candidate chunk

// ══════════════════════════════════════
//  1. TEXT EXTRACTION & NORMALIZATION
// ══════════════════════════════════════

function extractTextContent(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (TEXT_EXTS.has(ext)) {
      return fs.readFileSync(filePath, 'utf-8').slice(0, 100000);
    }
    if (ext === PDF_EXT) {
      const buf     = fs.readFileSync(filePath);
      const content = buf.toString('latin1');
      const matches = [];
      const re      = /\(([^)]{3,200})\)/g;
      let m, count  = 0;
      while ((m = re.exec(content)) !== null && count < 2000) {
        const text = m[1].replace(/\\[nrt\\()]/g, ' ').trim();
        if (text.length >= 3 && /[a-zA-Z\u00C0-\u024F\u1EA0-\u1EF9]/.test(text)) {
          matches.push(text);
          count++;
        }
      }
      return matches.join(' ').slice(0, 100000) || null;
    }
    if (ext === DOCX_EXT) {
      return _extractDocxText(filePath);
    }
    return null;
  } catch (e) {
    console.warn('[file_check] extractTextContent error:', e.message);
    return null;
  }
}

function _extractDocxText(filePath) {
  try {
    let AdmZip;
    try { AdmZip = require('adm-zip'); } catch (_) { AdmZip = null; }

    if (AdmZip) {
      const zip   = new AdmZip(filePath);
      const entry = zip.getEntry('word/document.xml');
      if (!entry) return null;
      const xml   = entry.getData().toString('utf-8');
      const texts = [];
      const re    = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let m;
      while ((m = re.exec(xml)) !== null) {
        if (m[1].trim()) texts.push(m[1]);
      }
      return texts.join(' ').slice(0, 100000) || null;
    }

    // Fallback: doc XML parsing khong can thu vien
    const buf = fs.readFileSync(filePath);
    const str = buf.toString('utf-8', 0, Math.min(buf.length, 500000));
    const texts = [];
    const re    = /<w:t[^>]*>([^<]{2,})<\/w:t>/g;
    let m;
    while ((m = re.exec(str)) !== null) {
      if (m[1].trim()) texts.push(m[1]);
    }
    return texts.join(' ').slice(0, 100000) || null;
  } catch (e) {
    console.warn('[file_check] _extractDocxText error:', e.message);
    return null;
  }
}

function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ══════════════════════════════════════
//  2. HASHING  (SHA-256 & SimHash)
// ══════════════════════════════════════

function hashFile(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch { return null; }
}

function hashString32(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return hash >>> 0;
}

function generateSimHash(normText) {
  const words = normText.split(' ');
  const v     = new Int32Array(32);
  for (const word of words) {
    if (word.length < 2) continue;
    const h = hashString32(word);
    for (let i = 0; i < 32; i++) {
      v[i] += ((h >> i) & 1) === 1 ? 1 : -1;
    }
  }
  let simhash = 0;
  for (let i = 0; i < 32; i++) {
    if (v[i] > 0) simhash |= (1 << i);
  }
  return simhash >>> 0;
}

function calculateSimhashSimilarity(hash1, hash2) {
  let xor = hash1 ^ hash2;
  let distance = 0;
  while (xor > 0) { distance += xor & 1; xor >>>= 1; }
  return 1 - distance / 32;
}

// ══════════════════════════════════════
//  3. CHUNKING & EMBEDDING
// ══════════════════════════════════════

/**
 * Chia van ban thanh chunks co overlap.
 * @param {string} normText
 * @param {number} chunkSize     — so tu / chunk (200-400)
 * @param {number} overlapRatio  — ti le overlap (0.10-0.20)
 * @returns {Array<{ text: string, startWord: number, endWord: number }>}
 */
function chunkText(normText, chunkSize = CHUNK_SIZE, overlapRatio = CHUNK_OVERLAP) {
  const words   = normText.split(' ');
  const overlap = Math.floor(chunkSize * overlapRatio);
  const step    = chunkSize - overlap;
  const chunks  = [];

  for (let i = 0; i < words.length; i += step) {
    const slice = words.slice(i, i + chunkSize);
    chunks.push({
      text:      slice.join(' '),
      startWord: i,
      endWord:   i + slice.length - 1,
    });
    if (i + chunkSize >= words.length) break;
  }
  return chunks;
}

/**
 * Mock embedding 384 chieu (deterministic).
 * TODO: thay bang ONNX / Transformers.js.
 */
function getMockEmbedding(text) {
  const vector = new Float32Array(384);
  const words  = text.split(' ');
  for (const word of words) {
    const wHash = hashString32(word);
    vector[wHash % 384]        += 0.1;
    vector[(wHash >> 4) % 384] -= 0.05;
  }
  let sumSq = 0;
  for (let i = 0; i < 384; i++) sumSq += vector[i] * vector[i];
  const mag = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < 384; i++) vector[i] /= mag;
  return vector;
}

function cosineSimilarity(vec1, vec2) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vec1.length; i++) {
    dot   += vec1[i] * vec2[i];
    normA += vec1[i] * vec1[i];
    normB += vec2[i] * vec2[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ══════════════════════════════════════
//  4. PIPELINE CHINH  (checkOneFile)
// ══════════════════════════════════════

/**
 * Kiem tra trung lap noi dung cua MOT file.
 *
 * @param {string}      newFilePath        — duong dan tuyet doi file moi
 * @param {string}      FILE_DIR           — userData/files
 * @param {number|null} excludeId          — sang_kien_id loai tru khi Edit
 * @param {boolean}     skipSimhashWarning — true sau khi user xac nhan SimHash
 */
function checkOneFile(newFilePath, FILE_DIR, excludeId = null, skipSimhashWarning = false) {
  const result = {
    newFile: path.basename(newFilePath),
    level:   'none',   // 'exact_block'|'simhash_warning'|'chunk_block'|'chunk_warning'|'none'
    score:   0,
    matches: [],
  };

  // ── Buoc 1: Extract & Normalize (su dung lai cho ca 3 tang) ──
  const rawText  = extractTextContent(newFilePath);
  const normText = rawText ? normalizeText(rawText) : '';

  // ════════════════════════════════════
  //  TANG 1 — SHA-256 (so sanh binary)
  // ════════════════════════════════════
  const newHash = hashFile(newFilePath);
  if (!newHash) return result;

  let queryHash  = `
    SELECT f.id, f.file_name, s.id AS sk_id, s.ten AS sk_ten
    FROM   files f
    JOIN   sang_kien s ON f.sang_kien_id = s.id
    WHERE  f.sha256_hash = ?
  `;
  const hashParams = [newHash];
  if (excludeId != null) {
    queryHash += ' AND f.sang_kien_id != ?';
    hashParams.push(excludeId);
  }

  const exactMatch = db.prepare(queryHash).get(...hashParams);
  if (exactMatch) {
    result.level = 'exact_block';
    result.score = 100;
    result.matches.push({
      fileName:    exactMatch.file_name,
      sangKienId:  exactMatch.sk_id,
      sangKienTen: exactMatch.sk_ten,
      level:       'exact_block',
      score:       100,
      detail:      'Trung 100% file goc (cung ma SHA-256 nhi phan).',
    });
    return result; // BLOCK — dung ngay
  }

  // File khong co text de phan tich → ACCEPT
  if (normText.length < 50) return result;

  // ════════════════════════════════════
  //  TANG 2 — SimHash (so sanh ngu nghia toan file)
  // ════════════════════════════════════
  const newSimHash = generateSimHash(normText);

  let candQuery  = `
    SELECT f.id AS file_id, f.file_name, f.simhash,
           s.id AS sk_id, s.ten AS sk_ten
    FROM   files f
    JOIN   sang_kien s ON f.sang_kien_id = s.id
  `;
  const candParams = [];
  if (excludeId != null) {
    candQuery += ' WHERE f.sang_kien_id != ?';
    candParams.push(excludeId);
  }
  const allFilesDb = db.prepare(candQuery).all(...candParams);

  const simhashWarnings    = [];
  const candidatesForChunk = [];

  for (const f of allFilesDb) {
    const sim = calculateSimhashSimilarity(newSimHash, parseInt(f.simhash, 10) >>> 0);

    if (sim >= SIMHASH_WARN_THR) {
      simhashWarnings.push({
        fileName:    f.file_name,
        sangKienId:  f.sk_id,
        sangKienTen: f.sk_ten,
        level:       'simhash_warning',
        score:       Math.round(sim * 100),
        detail:      `Nghi ngo copy hoac chinh sua nhe (SimHash ${Math.round(sim * 100)}% >= ${Math.round(SIMHASH_WARN_THR * 100)}%)`,
      });
    }

    if (sim > SIMHASH_CAND_THR) {
      candidatesForChunk.push(f);
    }
  }

  // SimHash >= 80% va chua bi skip → CANH BAO, dung hoi user
  if (simhashWarnings.length > 0 && !skipSimhashWarning) {
    result.level   = 'simhash_warning';
    result.score   = Math.max(...simhashWarnings.map(m => m.score));
    result.matches = simhashWarnings;
    return result;
  }

  // ════════════════════════════════════
  //  TANG 3 — Embedding + Chunking (cosine similarity)
  // ════════════════════════════════════
  if (candidatesForChunk.length === 0) return result;

  const newChunks     = chunkText(normText, CHUNK_SIZE, CHUNK_OVERLAP);
  const newEmbeddings = newChunks.map(c => getMockEmbedding(c.text));

  const candIds    = candidatesForChunk.map(c => c.file_id);
  const dbChunks   = db.prepare(`
    SELECT c.id, c.chunk_index, c.content, e.vector, c.file_id
    FROM   chunks c
    JOIN   embeddings e ON c.id = e.chunk_id
    WHERE  c.file_id IN (${candIds.join(',')})
  `).all();

  // Dem theo nguong
  let chunksAbove90 = 0;  // >= 0.90 → BLOCK
  let chunksAbove80 = 0;  // [0.80, 0.90) → WARNING
  // [0.65, 0.80): ghi nhan nhung khong kich hoat rule
  // < 0.65: ACCEPT hoan toan

  const suspectSources = new Map(); // file_id → { fileInfo, maxSim, matchDetails[] }

  for (let i = 0; i < newEmbeddings.length; i++) {
    const nVec = newEmbeddings[i];

    for (const dbChunk of dbChunks) {
      const dVec   = new Float32Array(
        dbChunk.vector.buffer,
        dbChunk.vector.byteOffset,
        dbChunk.vector.byteLength / 4,
      );
      const cosSim = cosineSimilarity(nVec, dVec);

      if (cosSim < CHUNK_ACCEPT_THR) continue; // < 0.65 → bo qua

      // Cap nhat suspectSources
      if (!suspectSources.has(dbChunk.file_id)) {
        const info = candidatesForChunk.find(c => c.file_id === dbChunk.file_id);
        suspectSources.set(dbChunk.file_id, { fileInfo: info, maxSim: cosSim, matchDetails: [] });
      }
      const src = suspectSources.get(dbChunk.file_id);
      if (cosSim > src.maxSim) src.maxSim = cosSim;
      src.matchDetails.push({ newChunkText: newChunks[i].text, oldChunkText: dbChunk.content, sim: cosSim });

      if      (cosSim >= CHUNK_BLOCK_THR) chunksAbove90++;
      else if (cosSim >= CHUNK_WARN_THR)  chunksAbove80++;
    }
  }

  // ── Rule Engine ──
  // Bat ky chunk nao >= 0.90         → BLOCK
  // >= 2 chunk trong [0.80, 0.90)    → WARNING
  // Tat ca < 0.65                    → ACCEPT (level giu nguyen 'none')

  if (chunksAbove90 >= 1 || chunksAbove80 >= 2) {
    result.level = chunksAbove90 >= 1 ? 'chunk_block' : 'chunk_warning';

    suspectSources.forEach((src) => {
      src.matchDetails.sort((a, b) => b.sim - a.sim);
      const top      = src.matchDetails[0];
      const scoreRaw = Math.round(src.maxSim * 100);
      result.score   = Math.max(result.score, scoreRaw);

      const detailMsg = chunksAbove90 >= 1
        ? `Dao van nghiem trong: phat hien doan van trung ${scoreRaw}% (>= ${Math.round(CHUNK_BLOCK_THR * 100)}%)`
        : `Nghi ngo vay muon: ${src.matchDetails.length} doan co do giong >= ${Math.round(CHUNK_WARN_THR * 100)}%`;

      result.matches.push({
        fileName:         src.fileInfo.file_name,
        sangKienId:       src.fileInfo.sk_id,
        sangKienTen:      src.fileInfo.sk_ten,
        level:            result.level,
        score:            scoreRaw,
        detail:           detailMsg,
        newHighlightText: top.newChunkText,
        oldHighlightText: top.oldChunkText,
      });
    });
  }

  return result; // level 'none' → ACCEPT
}

// ══════════════════════════════════════
//  5. checkAllFiles
// ══════════════════════════════════════

function checkAllFiles(
  newFileMap,
  oldFileMap,
  FILE_DIR,
  _unused,
  excludeId          = null,
  skipSimhashWarning = false,
) {
  const FILE_FIELDS = ['file_thuyet_minh', 'file_quyet_dinh', 'file_anh', 'file_ban_ve', 'file_hieu_qua'];
  const results     = [];

  for (const field of FILE_FIELDS) {
    const newPath = newFileMap[field];
    if (!newPath || !newPath.trim()) continue;

    // Bo qua file khong thay doi (Edit)
    if (excludeId != null && oldFileMap) {
      const oldName = oldFileMap[field] || '';
      const newName = path.basename(newPath);
      if (oldName && oldName === newName) continue;
    }

    if (!fs.existsSync(newPath)) continue;

    const res = checkOneFile(newPath, FILE_DIR, excludeId, skipSimhashWarning);
    if (res.level !== 'none') {
      res.fieldName = field;
      results.push(res);
    }
  }

  return { hasWarning: results.length > 0, results };
}

// ══════════════════════════════════════
//  6. indexFilesToDb
// ══════════════════════════════════════

function indexFilesToDb(sangKienId, fileMap, FILE_DIR) {
  const FILE_FIELDS = ['file_thuyet_minh', 'file_quyet_dinh', 'file_anh', 'file_ban_ve', 'file_hieu_qua'];

  const stmtFile   = db.prepare(`
    INSERT INTO files (sang_kien_id, file_name, file_type, sha256_hash, simhash)
    VALUES (?, ?, ?, ?, ?)
  `);
  const stmtChunk  = db.prepare(`
    INSERT INTO chunks (file_id, chunk_index, content, start_char, end_char)
    VALUES (?, ?, ?, ?, ?)
  `);
  const stmtVector = db.prepare(`INSERT INTO embeddings (chunk_id, vector) VALUES (?, ?)`);

  const doIndex = db.transaction(() => {
    db.prepare('DELETE FROM files WHERE sang_kien_id = ?').run(sangKienId);

    for (const field of FILE_FIELDS) {
      const fileName = fileMap[field];
      if (!fileName) continue;

      const filePath = path.join(FILE_DIR, fileName);
      if (!fs.existsSync(filePath)) continue;

      const sha256 = hashFile(filePath);
      if (!sha256) continue;

      const rawText  = extractTextContent(filePath);
      const normText = rawText ? normalizeText(rawText) : '';
      const simhash  = normText.length >= 50 ? generateSimHash(normText) : 0;
      const ext      = path.extname(fileName).toLowerCase();

      const { lastInsertRowid: fileId } = stmtFile.run(
        sangKienId, fileName, ext, sha256, simhash.toString(),
      );

      if (normText.length >= 50) {
        const chunks     = chunkText(normText, CHUNK_SIZE, CHUNK_OVERLAP);
        const embeddings = chunks.map(c => getMockEmbedding(c.text));

        for (let i = 0; i < chunks.length; i++) {
          const { lastInsertRowid: chunkId } = stmtChunk.run(
            fileId, i, chunks[i].text, chunks[i].startWord, chunks[i].endWord,
          );
          stmtVector.run(chunkId, Buffer.from(embeddings[i].buffer));
        }
      }
    }
  });

  doIndex();
}

// ══════════════════════════════════════
//  Export
// ══════════════════════════════════════

module.exports = {
  checkAllFiles,
  indexFilesToDb,
  // Extra exports cho unit-test
  extractTextContent,
  normalizeText,
  hashFile,
  generateSimHash,
  calculateSimhashSimilarity,
  chunkText,
  getMockEmbedding,
  cosineSimilarity,
};