  const STOP_WORDS = new Set([
  'he', 'thong', 'phan', 'mem', 'mo', 'hinh', 'thiet', 'bi', 'ung', 'dung', 'giai', 'phap',
  'sang', 'kien', 'cai', 'tien', 'ky', 'thuat', 'xay', 'dung'
]);

function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ") // replace special chars with space
    .replace(/\s+/g, " ") // normalize spaces
    .trim();
}

function keywordSimilarity(str1, str2) {
  const words1 = str1.split(' ').filter(w => w && !STOP_WORDS.has(w));
  const words2 = str2.split(' ').filter(w => w && !STOP_WORDS.has(w));

  if (words1.length === 0 && words2.length === 0) return 1;
  if (words1.length === 0 || words2.length === 0) return 0;

  const set2 = new Set(words2);
  let matches = 0;
  for (const w of words1) {
    if (set2.has(w)) {
      matches++;
    }
  }

  const maxLen = Math.max(words1.length, words2.length);
  return matches / maxLen;
}

function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) == a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
      }
    }
  }
  return matrix[b.length][a.length];
}

function levenshteinSimilarity(str1, str2) {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(str1, str2);
  return 1 - (dist / maxLen);
}

function calculateScore(newTitle, existingTitle) {
  const norm1 = normalizeText(newTitle);
  const norm2 = normalizeText(existingTitle);

  const kScore = keywordSimilarity(norm1, norm2);
  const lScore = levenshteinSimilarity(norm1, norm2);

  return (kScore * 0.6) + (lScore * 0.4);
}

function extractYear(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/\b(20\d{2})\b/);
  return m ? m[1] : null;
}

function fuzzyCheckNewSangKien(newData, existingList) {
  const results = [];
  const newYear = extractYear(newData.ngay_ap_dung || newData.nam);

  for (const item of existingList) {
    // Check same unit or same year
    const itemYear = extractYear(item.ngay_ap_dung);
    const sameYear = newYear && itemYear && newYear === itemYear;
    const sameUnit = newData.don_vi && item.don_vi && newData.don_vi.trim().toLowerCase() === item.don_vi.trim().toLowerCase();

    if (sameYear || sameUnit) {
      const score = calculateScore(newData.ten, item.ten);
      if (score >= 0.6) {
        results.push({
          id: item.id,
          ten: item.ten,
          score: Math.round(score * 100)
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);

  return {
    shouldWarn: results.length > 0,
    matches: results
  };
}

module.exports = {
  fuzzyCheckNewSangKien,
  calculateScore
};
