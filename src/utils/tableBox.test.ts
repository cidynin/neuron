import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BOX_ROWS,
  addBoxColumn,
  addBoxRow,
  createDefaultBoxRows,
  moveBoxColumn,
  moveBoxRow,
  parseDocumentBlocks,
  removeBoxColumn,
  removeBoxRow,
  serializeBoxRows,
} from './tableBox';

test('serializeBoxRows and parseDocumentBlocks round-trip 2x2 and custom boxes cleanly', () => {
  const initial = createDefaultBoxRows(2, 2);
  initial[0][0] = 'sd';
  initial[1][1] = 'hello | world';

  const md = `intro line\n${serializeBoxRows(initial)}\noutro line`;
  const blocks = parseDocumentBlocks(md);

  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].type, 'line');
  assert.equal(blocks[1].type, 'box');
  if (blocks[1].type === 'box') {
    assert.equal(blocks[1].rows.length, 2);
    assert.equal(blocks[1].rows[0].length, 2);
    assert.equal(blocks[1].rows[0][0], 'sd');
    assert.equal(blocks[1].rows[1][1], 'hello | world');
  }
  assert.equal(blocks[2].type, 'line');
});

test('table box cells preserve leading, trailing, multiple, and single-space strings', () => {
  const rows = [
    ['hello world ', '  leading'],
    [' ', '  two   spaces  '],
  ];
  const md = serializeBoxRows(rows);
  const blocks = parseDocumentBlocks(md);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'box');
  if (blocks[0].type === 'box') {
    assert.deepEqual(blocks[0].rows, rows);
  }

  const empty = createDefaultBoxRows(2, 2);
  const emptyBlocks = parseDocumentBlocks(serializeBoxRows(empty));
  assert.equal(emptyBlocks[0].type, 'box');
  if (emptyBlocks[0].type === 'box') {
    assert.deepEqual(emptyBlocks[0].rows, empty);
  }
});

test('addBoxRow caps at MAX_BOX_ROWS (10) while addBoxColumn expands unboundedly', () => {
  let rows = createDefaultBoxRows(2, 2);
  for (let i = 0; i < 15; i++) {
    rows = addBoxRow(rows);
  }
  assert.equal(rows.length, MAX_BOX_ROWS);

  for (let i = 0; i < 12; i++) {
    rows = addBoxColumn(rows);
  }
  assert.equal(rows[0].length, 14);
});

test('moveBoxColumn, moveBoxRow, removeBoxRow, and removeBoxColumn preserve structure', () => {
  const rows = [
    ['sd', 'b1', 'c1'],
    ['a2', 'b2', 'c2'],
  ];
  const movedCol = moveBoxColumn(rows, 0, 1);
  assert.deepEqual(movedCol, [
    ['b1', 'sd', 'c1'],
    ['b2', 'a2', 'c2'],
  ]);

  const movedRow = moveBoxRow(movedCol, 0, 1);
  assert.deepEqual(movedRow, [
    ['b2', 'a2', 'c2'],
    ['b1', 'sd', 'c1'],
  ]);

  const removedCol = removeBoxColumn(movedRow, 1);
  assert.deepEqual(removedCol, [
    ['b2', 'c2'],
    ['b1', 'c1'],
  ]);

  const removedRow = removeBoxRow(removedCol, 0);
  assert.deepEqual(removedRow, [['b1', 'c1']]);
  // Never removes below 1x1
  assert.deepEqual(removeBoxRow(removedRow, 0), [['b1', 'c1']]);
  assert.deepEqual(removeBoxColumn(removedRow, 0), [['c1']]);
});

test('parseDocumentBlocks detects standalone inline image blocks between paragraphs', () => {
  const content = 'above paragraph\n![my pic](neuron-img://abc123)\nbelow paragraph';
  const blocks = parseDocumentBlocks(content);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].type, 'line');
  assert.equal(blocks[1].type, 'image');
  if (blocks[1].type === 'image') {
    assert.equal(blocks[1].alt, 'my pic');
    assert.equal(blocks[1].imageId, 'abc123');
  }
  assert.equal(blocks[2].type, 'line');
});

test('parseDocumentBlocks detects pixel canvas blocks between paragraphs', () => {
  const content = [
    'sketch above',
    ':::pixel 32',
    'p:#ff0000',
    'd:10.;0;1013.',
    ':::',
    'notes below',
  ].join('\n');
  const blocks = parseDocumentBlocks(content);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].type, 'line');
  assert.equal(blocks[1].type, 'pixel');
  if (blocks[1].type === 'pixel') {
    assert.equal(blocks[1].pixelData.size, 32);
    assert.equal(blocks[1].pixelData.pixels[10], '#ff0000');
  }
  assert.equal(blocks[2].type, 'line');
});
