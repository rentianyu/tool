/**
 * 行级 diff（LCS 动态规划 + 公共前后缀裁剪）
 * 保护：保留行数乘积超过 MAX_CELLS 时拒绝并提示分段对比
 */

const MAX_CELLS = 4000000; // 约 2000 × 2000 行

export function splitLines(text) {
  const src = String(text == null ? "" : text).replace(/\r\n?/g, "\n");
  if (src === "") return [];
  const lines = src.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function diffLines(aText, bText) {
  const a = splitLines(aText);
  const b = splitLines(bText);

  // 公共前缀 / 后缀裁剪
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const rows = [];

  for (let i = 0; i < start; i += 1) {
    rows.push({ type: "same", text: a[i], aLine: i + 1, bLine: i + 1 });
  }

  if (midA.length * midB.length > MAX_CELLS) {
    return {
      ok: false,
      error: `差异区域过大（${midA.length} × ${midB.length} 行），请拆成更小的片段再对比`,
    };
  }

  const n = midA.length;
  const m = midB.length;
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] =
        midA[i] === midB[j] ? dp[(i + 1) * width + j + 1] + 1 : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      rows.push({ type: "same", text: midA[i], aLine: start + i + 1, bLine: start + j + 1 });
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      rows.push({ type: "del", text: midA[i], aLine: start + i + 1, bLine: null });
      i += 1;
    } else {
      rows.push({ type: "add", text: midB[j], aLine: null, bLine: start + j + 1 });
      j += 1;
    }
  }
  while (i < n) {
    rows.push({ type: "del", text: midA[i], aLine: start + i + 1, bLine: null });
    i += 1;
  }
  while (j < m) {
    rows.push({ type: "add", text: midB[j], aLine: null, bLine: start + j + 1 });
    j += 1;
  }

  for (let k = 0; k < a.length - endA; k += 1) {
    rows.push({ type: "same", text: a[endA + k], aLine: endA + k + 1, bLine: endB + k + 1 });
  }

  const stats = {
    add: rows.filter((r) => r.type === "add").length,
    del: rows.filter((r) => r.type === "del").length,
    same: rows.filter((r) => r.type === "same").length,
    aLines: a.length,
    bLines: b.length,
  };
  return { ok: true, rows, stats };
}

/** 生成统一 diff 文本（可复制到邮件/工单） */
export function toUnified(rows) {
  return rows
    .map((r) => `${r.type === "add" ? "+" : r.type === "del" ? "-" : " "}${r.text}`)
    .join("\n");
}
