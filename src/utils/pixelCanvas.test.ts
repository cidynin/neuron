import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyPixelCanvas,
  extractCanvasEntriesFromNotes,
  floodFillPixelGrid,
  parsePixelCanvasLines,
  serializePixelCanvas,
} from './pixelCanvas';
import type { Note } from '../types/neuron';

test('pixel canvas serializes and round-trips 16x16, 32x32, and 64x64 grids cleanly', () => {
  const canvas16 = createEmptyPixelCanvas(16);
  canvas16.pixels[0] = '#f44b7a';
  canvas16.pixels[16 * 15 + 15] = '#ffffff';
  const parsed16 = parsePixelCanvasLines(serializePixelCanvas(canvas16).split('\n'), 0);
  assert.ok(parsed16);
  assert.equal(parsed16.data.size, 16);
  assert.equal(parsed16.data.pixels.length, 16 * 16);
  assert.equal(parsed16.data.pixels[0], '#f44b7a');
  assert.equal(parsed16.data.pixels[16 * 15 + 15], '#ffffff');

  const canvas32 = createEmptyPixelCanvas(32);
  canvas32.pixels[0] = '#f44b7a';
  canvas32.pixels[10] = '#ffffff';
  canvas32.pixels[32 * 31 + 31] = '#f44b7a';

  const serialized32 = serializePixelCanvas(canvas32);
  const parsed32 = parsePixelCanvasLines(serialized32.split('\n'), 0);
  assert.ok(parsed32);
  assert.equal(parsed32.data.size, 32);
  assert.equal(parsed32.data.pixels.length, 32 * 32);
  assert.equal(parsed32.data.pixels[0], '#f44b7a');
  assert.equal(parsed32.data.pixels[10], '#ffffff');
  assert.equal(parsed32.data.pixels[32 * 31 + 31], '#f44b7a');

  const canvas64 = createEmptyPixelCanvas(64);
  canvas64.pixels[64 * 63 + 5] = '#55ff99';
  const parsed64 = parsePixelCanvasLines(serializePixelCanvas(canvas64).split('\n'), 0);
  assert.ok(parsed64);
  assert.equal(parsed64.data.size, 64);
  assert.equal(parsed64.data.pixels.length, 64 * 64);
  assert.equal(parsed64.data.pixels[64 * 63 + 5], '#55ff99');
});

test('floodFillPixelGrid fills contiguous region bounded by another color', () => {
  // 4x4 grid with vertical wall at x=2
  const size = 4;
  const grid = new Array<string>(size * size).fill('');
  for (let y = 0; y < size; y++) {
    grid[y * size + 2] = '#000000';
  }

  const filled = floodFillPixelGrid(grid, size, 0, 0, '#ff0055');
  assert.equal(filled[0], '#ff0055');
  assert.equal(filled[1], '#ff0055');
  assert.equal(filled[4], '#ff0055');
  // Wall and right side remain untouched
  assert.equal(filled[2], '#000000');
  assert.equal(filled[3], '');
  assert.equal(filled[15], '');
});

test('extractCanvasEntriesFromNotes gathers active canvases and excludes trashed or locked closed notes', () => {
  const c1 = createEmptyPixelCanvas(32);
  c1.pixels[0] = '#f44b7a';
  c1.pixels[1] = '#ffffff';
  const c2 = createEmptyPixelCanvas(64);
  c2.pixels[10] = '#00ffaa';

  const notes: Note[] = [
    {
      id: 'n1',
      title: 'sketchbook',
      content: `hello\n${serializePixelCanvas(c1)}\nbye`,
      createdAt: 100,
      updatedAt: 200,
    },
    {
      id: 'n-locked',
      title: 'secret',
      content: serializePixelCanvas(c2),
      createdAt: 100,
      updatedAt: 300,
      passwordHash: 'abc',
      passwordSalt: 'xyz',
    },
    {
      id: 'n-trashed',
      title: 'old',
      content: serializePixelCanvas(c1),
      createdAt: 100,
      updatedAt: 400,
      deletedAt: 500,
    },
  ];

  const closedList = extractCanvasEntriesFromNotes(notes, new Set());
  assert.equal(closedList.length, 1);
  assert.equal(closedList[0].noteId, 'n1');
  assert.equal(closedList[0].filledPixels, 2);
  assert.equal(closedList[0].data.size, 32);

  const unlockedList = extractCanvasEntriesFromNotes(notes, new Set(['n-locked']));
  assert.equal(unlockedList.length, 2);
  assert.equal(unlockedList[0].noteId, 'n-locked');
  assert.equal(unlockedList[0].data.size, 64);
});
