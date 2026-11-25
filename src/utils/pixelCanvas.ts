import type { Note, PixelCanvasSize } from '../types/neuron';
import { isNoteLocked } from './noteLock';
import { getNoteTitle, isNoteTrashed } from './notes';

export interface PixelCanvasData {
  size: PixelCanvasSize;
  pixels: string[];
}

export interface LibraryCanvasEntry {
  id: string;
  noteId: string;
  noteTitle: string;
  lineIndex: number;
  updatedAt: number;
  data: PixelCanvasData;
  filledPixels: number;
}

export function createEmptyPixelGrid(size: PixelCanvasSize = 32): string[] {
  return new Array<string>(size * size).fill('');
}

export function createEmptyPixelCanvas(size: PixelCanvasSize = 32): PixelCanvasData {
  return {
    size,
    pixels: createEmptyPixelGrid(size),
  };
}

function encodeSym(idx: number): string {
  // '.' is reserved for transparent; 'p0'..'pz' or base36 index tags
  if (idx < 0) return '.';
  return idx.toString(36);
}

export function serializePixelCanvas(data: PixelCanvasData): string {
  const size: PixelCanvasSize = data.size === 16 ? 16 : data.size === 64 ? 64 : 32;
  const total = size * size;
  const palette: string[] = [];
  const paletteIndex = new Map<string, number>();

  const indices: number[] = new Array(total);
  for (let i = 0; i < total; i++) {
    const raw = (data.pixels[i] ?? '').trim().toLowerCase();
    if (!raw || !/^#[0-9a-f]{3,8}$/i.test(raw)) {
      indices[i] = -1;
      continue;
    }
    let idx = paletteIndex.get(raw);
    if (idx === undefined) {
      idx = palette.length;
      palette.push(raw);
      paletteIndex.set(raw, idx);
    }
    indices[i] = idx;
  }

  // Run-length encode indices: each run is `[count]token` separated by `,`
  const runs: string[] = [];
  let i = 0;
  while (i < total) {
    const val = indices[i];
    let runLen = 1;
    while (i + runLen < total && indices[i + runLen] === val) {
      runLen += 1;
    }
    const sym = encodeSym(val);
    runs.push(runLen > 1 ? `${runLen}${sym}` : sym);
    i += runLen;
  }

  const lines = [`:::pixel ${size}`];
  if (palette.length > 0) {
    lines.push(`p:${palette.join(',')}`);
  }
  lines.push(`d:${runs.join(';')}`);
  lines.push(':::');
  return lines.join('\n');
}

export function parsePixelCanvasLines(
  rawLines: string[],
  startIdx: number,
): { data: PixelCanvasData; endLineIndex: number } | null {
  const openMatch = (rawLines[startIdx] ?? '').trim().match(/^:::pixel\s+(16|32|64)$/);
  if (!openMatch) return null;

  const size: PixelCanvasSize =
    openMatch[1] === '16' ? 16 : openMatch[1] === '64' ? 64 : 32;
  const total = size * size;
  let palette: string[] = [];
  let dataLine = '';
  let endIdx = -1;

  for (let i = startIdx + 1; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (trimmed === ':::') {
      endIdx = i;
      break;
    }
    if (trimmed.startsWith('p:')) {
      palette = trimmed
        .slice(2)
        .split(',')
        .map((c) => c.trim())
        .filter((c) => /^#[0-9a-fA-F]{3,8}$/.test(c));
    } else if (trimmed.startsWith('d:')) {
      dataLine = trimmed.slice(2).trim();
    }
  }

  if (endIdx === -1) return null;

  const pixels = createEmptyPixelGrid(size);
  if (dataLine) {
    const tokens = dataLine.split(';');
    let cursor = 0;
    for (const tok of tokens) {
      if (!tok || cursor >= total) break;
      const m = tok.match(/^(\d*)(\.|[0-9a-z]+)$/i);
      if (!m) continue;
      const count = m[1] ? Math.max(1, parseInt(m[1], 10)) : 1;
      const sym = m[2];
      let color = '';
      if (sym !== '.') {
        const pIdx = parseInt(sym, 36);
        if (Number.isFinite(pIdx) && pIdx >= 0 && pIdx < palette.length) {
          color = palette[pIdx];
        }
      }
      const limit = Math.min(total, cursor + count);
      for (let k = cursor; k < limit; k++) {
        pixels[k] = color;
      }
      cursor = limit;
    }
  }

  return {
    data: { size, pixels },
    endLineIndex: endIdx,
  };
}

export function floodFillPixelGrid(
  pixels: string[],
  size: number,
  startX: number,
  startY: number,
  fillColor: string,
): string[] {
  if (startX < 0 || startX >= size || startY < 0 || startY >= size) {
    return pixels;
  }
  const normalizedFill = fillColor.trim().toLowerCase();
  const startIdx = startY * size + startX;
  const targetColor = (pixels[startIdx] ?? '').trim().toLowerCase();
  if (targetColor === normalizedFill) {
    return pixels;
  }

  const next = [...pixels];
  const stack: number[] = [startIdx];
  const visited = new Uint8Array(size * size);
  visited[startIdx] = 1;

  while (stack.length > 0) {
    const idx = stack.pop()!;
    next[idx] = normalizedFill;
    const x = idx % size;
    const y = Math.floor(idx / size);

    const neighbors: number[] = [];
    if (x > 0) neighbors.push(idx - 1);
    if (x + 1 < size) neighbors.push(idx + 1);
    if (y > 0) neighbors.push(idx - size);
    if (y + 1 < size) neighbors.push(idx + size);

    for (const nIdx of neighbors) {
      if (visited[nIdx]) continue;
      if ((next[nIdx] ?? '').trim().toLowerCase() === targetColor) {
        visited[nIdx] = 1;
        stack.push(nIdx);
      }
    }
  }

  return next;
}

export function extractCanvasEntriesFromNotes(
  notes: Note[],
  unlockedNoteIds?: Set<string>,
): LibraryCanvasEntry[] {
  const entries: LibraryCanvasEntry[] = [];
  const sortedNotes = [...notes]
    .filter((note) => !isNoteTrashed(note))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  for (const note of sortedNotes) {
    if (isNoteLocked(note) && !unlockedNoteIds?.has(note.id)) {
      continue;
    }
    const rawLines = note.content.split(/\r?\n/);
    const noteTitle = getNoteTitle(note.content, note.title);
    for (let i = 0; i < rawLines.length; i++) {
      const parsed = parsePixelCanvasLines(rawLines, i);
      if (!parsed) continue;
      let filledPixels = 0;
      for (const px of parsed.data.pixels) {
        if (px) filledPixels += 1;
      }
      entries.push({
        id: `${note.id}:${i}`,
        noteId: note.id,
        noteTitle,
        lineIndex: i,
        updatedAt: note.updatedAt,
        data: parsed.data,
        filledPixels,
      });
      i = parsed.endLineIndex;
    }
  }

  return entries;
}
