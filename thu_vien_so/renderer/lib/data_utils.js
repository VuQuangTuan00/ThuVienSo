// ═══════════════════════════════════════════════════════════
//  data_utils.js — Tiện ích xử lý dữ liệu thuần túy (Pure)
//  Không phụ thuộc DOM / IPC / state toàn cục
//  Dùng chung cho renderer.js và admin.js
// ═══════════════════════════════════════════════════════════

// ──────────────────────────────────────────
//  §1  SEARCH & FILTER
// ──────────────────────────────────────────

/**
 * Trích xuất năm từ chuỗi ngay_ap_dung.
 * Hỗ trợ: "2025", "4/2025", "8/2025", "12/2024"
 * @param {string} ngay
 * @returns {number|null}
 */
function extractYear(ngay) {
  if (!ngay) return null;
  const s = String(ngay).trim();
  // Dạng M/YYYY hoặc MM/YYYY
  const mY = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (mY) return Number(mY[2]);
  // Dạng YYYY thuần
  const y = s.match(/^(\d{4})$/);
  if (y) return Number(y[1]);
  return null;
}

/**
 * Lọc danh sách sáng kiến theo nhiều điều kiện.
 * Tất cả điều kiện là AND. Điều kiện rỗng/null thì bỏ qua.
 *
 * @param {Object[]} items   — mảng sáng kiến
 * @param {Object}   filters
 * @param {string}   [filters.query]    — tìm theo tên / đơn vị / tác giả
 * @param {number}   [filters.year]     — lọc theo năm (từ ngay_ap_dung)
 * @param {string}   [filters.linhVuc]  — 'thammu' | 'chinhri' | 'hckt'
 * @param {string}   [filters.loai]     — loại hình (uppercase)
 * @returns {Object[]}
 */
function filterData(items, filters = {}) {
  const { query, year, linhVuc, loai } = filters;

  const q = query ? query.trim().toLowerCase() : '';

  return items.filter(item => {
    // ── Lĩnh vực ──
    if (linhVuc && item.linh_vuc !== linhVuc) return false;

    // ── Loại hình ──
    if (loai && (item.loai || '').toUpperCase() !== loai.toUpperCase()) return false;

    // ── Năm ──
    if (year) {
      const itemYear = extractYear(item.ngay_ap_dung);
      if (itemYear !== Number(year)) return false;
    }

    // ── Full-text query ──
    if (q) {
      const authors = _parseAuthors(item.authors);
      const authorNames = authors.map(a => (a.ho_ten || '').toLowerCase()).join(' ');
      const haystack = [
        item.ten,
        item.don_vi,
        item.loai,
        item.mo_ta,
        authorNames,
      ].map(v => (v || '').toLowerCase()).join(' ');
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

// ──────────────────────────────────────────
//  §2  ANALYTICS — SO SÁNH THEO NĂM
// ──────────────────────────────────────────

const LINH_VUC_LIST = ['thammu', 'chinhri', 'hckt'];
const LINH_VUC_LABEL = {
  thammu:  'Tham mưu',
  chinhri: 'Chính trị',
  hckt:    'HC-KT',
};
const LINH_VUC_COLOR = {
  thammu:  { fill: '#2c6975', light: 'rgba(44,105,117,0.75)' },
  chinhri: { fill: '#68b2a0', light: 'rgba(104,178,160,0.75)' },
  hckt:    { fill: '#4b8f8d', light: 'rgba(75,143,141,0.75)' },
};

/**
 * Nhóm sáng kiến theo năm và lĩnh vực.
 * @param {Object[]} items
 * @returns {{ [year: string]: { thammu: number, chinhri: number, hckt: number } }}
 *
 * Ví dụ: { '2025': { thammu: 6, chinhri: 4, hckt: 12 } }
 */
function groupByYearAndField(items) {
  const result = {};
  items.forEach(item => {
    const yr = extractYear(item.ngay_ap_dung);
    const key = yr ? String(yr) : 'Khác';
    if (!result[key]) result[key] = { thammu: 0, chinhri: 0, hckt: 0, total: 0 };
    const lv = item.linh_vuc;
    if (lv in result[key]) result[key][lv]++;
    result[key].total++;
  });
  return result;
}

/**
 * Chuyển kết quả groupByYearAndField sang cấu trúc dùng để vẽ chart.
 * Design: dễ swap sang Chart.js / ECharts vì chỉ là plain data.
 *
 * @param {{ [year: string]: Object }} grouped — từ groupByYearAndField
 * @returns {{
 *   labels: string[],
 *   series: Array<{ key: string, label: string, color: string, values: number[] }>,
 *   totals: number[]
 * }}
 */
function toYearCompareChartData(grouped) {
  const years = Object.keys(grouped).sort();
  const series = LINH_VUC_LIST.map(key => ({
    key,
    label:  LINH_VUC_LABEL[key],
    color:  LINH_VUC_COLOR[key].fill,
    light:  LINH_VUC_COLOR[key].light,
    values: years.map(yr => grouped[yr][key] || 0),
  }));
  const totals = years.map(yr => grouped[yr].total || 0);
  return { labels: years, series, totals };
}

// ──────────────────────────────────────────
//  §3  AUTHOR RANKING
// ──────────────────────────────────────────

/**
 * Gom tất cả tác giả từ danh sách sáng kiến, đếm số lần xuất hiện.
 * Key gom nhóm: ho_ten (normalized lowercase, trimmed).
 *
 * @param {Object[]} items
 * @returns {Array<{
 *   ho_ten: string,
 *   cap_bac: string,
 *   chuc_vu: string,
 *   count: number,
 *   items: Object[]
 * }>}
 */
function aggregateAuthors(items) {
  const map = new Map(); // key: normalized name

  items.forEach(item => {
    const authors = _parseAuthors(item.authors);
    authors.forEach(a => {
      if (!a.ho_ten || !a.ho_ten.trim()) return;
      const key = a.ho_ten.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          ho_ten:  a.ho_ten.trim(),
          cap_bac: a.cap_bac || '',
          chuc_vu: a.chuc_vu || '',
          count:   0,
          items:   [],
        });
      }
      const entry = map.get(key);
      entry.count++;
      entry.items.push(item);
      // Cập nhật cap_bac / chuc_vu nếu entry cũ bị thiếu
      if (!entry.cap_bac && a.cap_bac) entry.cap_bac = a.cap_bac;
      if (!entry.chuc_vu && a.chuc_vu) entry.chuc_vu = a.chuc_vu;
    });
  });

  return Array.from(map.values());
}

/**
 * Xếp hạng tác giả giảm dần theo số sáng kiến.
 * @param {Object[]} items  — mảng sáng kiến gốc
 * @param {number}   [topN] — giới hạn top N (mặc định tất cả)
 * @returns {Array<{ rank: number, ho_ten, cap_bac, chuc_vu, count, items }>}
 */
function rankAuthors(items, topN = Infinity) {
  const aggregated = aggregateAuthors(items);
  aggregated.sort((a, b) => b.count - a.count || a.ho_ten.localeCompare(b.ho_ten));
  return aggregated
    .slice(0, topN === Infinity ? undefined : topN)
    .map((entry, i) => ({ rank: i + 1, ...entry }));
}

/**
 * Chuyển kết quả rankAuthors → cấu trúc chart-ready.
 * @param {Object[]} ranks — từ rankAuthors
 * @returns {{ labels: string[], values: number[], colors: string[] }}
 */
function toAuthorChartData(ranks) {
  const PALETTE = [
    '#c8a020','#2c6975','#68b2a0','#4b8f8d',
    '#3ca050','#4a8adc','#c05050','#9060c0',
    '#40b0b0','#e08030',
  ];
  return {
    labels: ranks.map(r => r.ho_ten),
    values: ranks.map(r => r.count),
    colors: ranks.map((_, i) => PALETTE[i % PALETTE.length]),
  };
}

// ──────────────────────────────────────────
//  Internal helpers
// ──────────────────────────────────────────

function _parseAuthors(authors) {
  if (!authors) return [];
  if (Array.isArray(authors)) return authors;
  try { return JSON.parse(authors); } catch { return []; }
}

// ──────────────────────────────────────────
//  Export (browser globals + CommonJS)
// ──────────────────────────────────────────

const DataUtils = {
  extractYear,
  filterData,
  groupByYearAndField,
  toYearCompareChartData,
  aggregateAuthors,
  rankAuthors,
  toAuthorChartData,
  LINH_VUC_LABEL,
  LINH_VUC_COLOR,
  LINH_VUC_LIST,
};

if (typeof window !== 'undefined') window.DataUtils = DataUtils;
if (typeof module !== 'undefined' && module.exports) module.exports = DataUtils;
