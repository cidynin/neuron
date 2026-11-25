import {
  parsePixelCanvasLines,
  type PixelCanvasData,
} from './pixelCanvas';

export const MAX_BOX_ROWS = 10;

export type DocumentBlock =
  | {
      type: 'line';
      id: string;
      lineIndex: number;
      raw: string;
      start: number;
      end: number;
    }
  | {
      type: 'image';
      id: string;
      lineIndex: number;
      imageId: string;
      alt: string;
      raw: string;
      start: number;
      end: number;
    }
  | {
      type: 'box';
      id: string;
      startLineIndex: number;
      endLineIndex: number;
      start: number;
      end: number;
      rows: string[][];
    }
  | {
      type: 'pixel';
      id: string;
      startLineIndex: number;
      endLineIndex: number;
      start: number;
      end: number;
      pixelData: PixelCanvasData;
    };

const IMAGE_LINE_REGEX = /^!\[([^\]\n]*)\]\(neuron-img:\/\/([a-zA-Z0-9_-]+)\)$/;

function splitPipeRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|') || trimmed.length < 2) {
    return null;
  }
  const inner = trimmed.slice(1, -1);
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\' && inner[i + 1] === '|') {
      current += '|';
      i += 1;
      continue;
    }
    if (ch === '|') {
      cells.push(decodeCell(current));
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(decodeCell(current));
  return cells;
}

function isSeparatorPipeRow(line: string): boolean {
  const cells = splitPipeRow(line);
  if (!cells || cells.length === 0) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c.trim()));
}

function encodeCell(val: string): string {
  return val.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function decodeCell(raw: string): string {
  // Strip at most one padding space on each side added by serializeBoxRows (` ${encoded} `),
  // preserving all user-typed spaces (leading, trailing, multiple, and space-only).
  let s = raw;
  if (s.startsWith(' ')) s = s.slice(1);
  if (s.endsWith(' ')) s = s.slice(0, -1);
  return s.replace(/<br\s*\/?>/gi, '\n');
}

export function createDefaultBoxRows(rows = 2, cols = 2): string[][] {
  const safeRows = Math.max(1, Math.min(MAX_BOX_ROWS, rows));
  const safeCols = Math.max(1, cols);
  return Array.from({ length: safeRows }, () =>
    Array.from({ length: safeCols }, () => ''),
  );
}

export function serializeBoxRows(rows: string[][]): string {
  const safeRows = rows.slice(0, MAX_BOX_ROWS);
  const colCount = Math.max(
    1,
    ...safeRows.map((r) => r.length),
  );
  const normalizeRow = (row: string[]) =>
    Array.from({ length: colCount }, (_, cIdx) => {
      const encoded = encodeCell(row[cIdx] ?? '');
      return ` ${encoded} `;
    });

  const first = normalizeRow(safeRows[0] ?? []);
  const lines: string[] = [`|${first.join('|')}|`];
  const sep = Array.from({ length: colCount }, () => ' --- ');
  lines.push(`|${sep.join('|')}|`);

  for (let r = 1; r < safeRows.length; r++) {
    const cells = normalizeRow(safeRows[r]);
    lines.push(`|${cells.join('|')}|`);
  }
  return lines.join('\n');
}

export function parseDocumentBlocks(content: string): DocumentBlock[] {
  const lines = content.split('\n');
  const blocks: DocumentBlock[] = [];
  let offset = 0;

  // Precompute character start/end of every raw line
  const lineRanges: { raw: string; start: number; end: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const start = offset;
    const end = start + raw.length;
    lineRanges.push({ raw, start, end });
    offset = end + 1;
  }

  let i = 0;
  while (i < lineRanges.length) {
    const cur = lineRanges[i];

    // Check GFM Table / Box: row0 + separator + optional rows...
    if (
      i + 1 < lineRanges.length &&
      splitPipeRow(cur.raw) !== null &&
      isSeparatorPipeRow(lineRanges[i + 1].raw)
    ) {
      const headerRow = splitPipeRow(cur.raw)!;
      const rows: string[][] = [headerRow];
      let j = i + 2;
      while (
        j < lineRanges.length &&
        rows.length < MAX_BOX_ROWS &&
        splitPipeRow(lineRanges[j].raw) !== null &&
        !isSeparatorPipeRow(lineRanges[j].raw)
      ) {
        rows.push(splitPipeRow(lineRanges[j].raw)!);
        j += 1;
      }

      const colCount = Math.max(1, ...rows.map((r) => r.length));
      const normalized = rows.map((r) =>
        Array.from({ length: colCount }, (_, c) => r[c] ?? ''),
      );

      blocks.push({
        type: 'box',
        id: `box-${i}`,
        startLineIndex: i,
        endLineIndex: j - 1,
        start: cur.start,
        end: lineRanges[j - 1].end,
        rows: normalized,
      });
      i = j;
      continue;
    }

    // Check Pixel Canvas Block: :::pixel 32 ... :::
    const pixelParsed = parsePixelCanvasLines(lines, i);
    if (pixelParsed) {
      blocks.push({
        type: 'pixel',
        id: `pixel-${i}`,
        startLineIndex: i,
        endLineIndex: pixelParsed.endLineIndex,
        start: cur.start,
        end: lineRanges[pixelParsed.endLineIndex].end,
        pixelData: pixelParsed.data,
      });
      i = pixelParsed.endLineIndex + 1;
      continue;
    }

    // Check Inline Image line
    const imgMatch = cur.raw.trim().match(IMAGE_LINE_REGEX);
    if (imgMatch) {
      blocks.push({
        type: 'image',
        id: `imgblock-${i}-${imgMatch[2]}`,
        lineIndex: i,
        alt: imgMatch[1] || 'image',
        imageId: imgMatch[2],
        raw: cur.raw,
        start: cur.start,
        end: cur.end,
      });
      i += 1;
      continue;
    }

    blocks.push({
      type: 'line',
      id: `line-${i}`,
      lineIndex: i,
      raw: cur.raw,
      start: cur.start,
      end: cur.end,
    });
    i += 1;
  }

  return blocks;
}

export function addBoxRow(rows: string[][]): string[][] {
  if (rows.length >= MAX_BOX_ROWS) return rows;
  const cols = Math.max(1, rows[0]?.length ?? 2);
  return [...rows, Array.from({ length: cols }, () => '')];
}

export function addBoxColumn(rows: string[][]): string[][] {
  if (rows.length === 0) return createDefaultBoxRows(2, 2);
  return rows.map((row) => [...row, '']);
}

export function moveBoxRow(
  rows: string[][],
  fromIndex: number,
  toIndex: number,
): string[][] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= rows.length ||
    toIndex >= rows.length
  ) {
    return rows;
  }
  const next = rows.map((r) => [...r]);
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function moveBoxColumn(
  rows: string[][],
  fromCol: number,
  toCol: number,
): string[][] {
  if (rows.length === 0 || fromCol === toCol) return rows;
  const colCount = rows[0].length;
  if (fromCol < 0 || toCol < 0 || fromCol >= colCount || toCol >= colCount) {
    return rows;
  }
  return rows.map((row) => {
    const next = [...row];
    const [moved] = next.splice(fromCol, 1);
    next.splice(toCol, 0, moved);
    return next;
  });
}

export function removeBoxRow(rows: string[][], rowIndex: number): string[][] {
  if (rows.length <= 1) return rows;
  return rows.filter((_, idx) => idx !== rowIndex);
}

export function removeBoxColumn(rows: string[][], colIndex: number): string[][] {
  if (rows.length === 0 || rows[0].length <= 1) return rows;
  return rows.map((row) => row.filter((_, idx) => idx !== colIndex));
}
