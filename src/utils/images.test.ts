import test from 'node:test';
import assert from 'node:assert/strict';
import type { Note } from '../types/neuron';
import {
  buildGalleryEntries,
  extractImageReferences,
  formatBytes,
  formatImageMarkdown,
  insertImageMarkdownAtCaret,
  removeImageReferenceFromContent,
  type StoredImage,
} from './images';

test('formatImageMarkdown sanitizes brackets and newlines', () => {
  assert.equal(
    formatImageMarkdown('sketch [v1]\nfinal.png', 'img-1'),
    '![sketch v1 final.png](neuron-img://img-1)',
  );
});

test('extractImageReferences locates all embedded neuron-img tokens', () => {
  const text = 'hello\n![sun.png](neuron-img://abc-1)\nand ![moon.jpg](neuron-img://xyz_2)';
  const refs = extractImageReferences(text);
  assert.equal(refs.length, 2);
  assert.equal(refs[0].id, 'abc-1');
  assert.equal(refs[0].alt, 'sun.png');
  assert.equal(refs[1].id, 'xyz_2');
});

test('insertImageMarkdownAtCaret puts image markdown on its own line and moves caret to the next line', () => {
  const emptyRes = insertImageMarkdownAtCaret('', 0, 'pic.png', 'img-1');
  assert.equal(emptyRes.text, '![pic.png](neuron-img://img-1)\n');
  assert.equal(emptyRes.caret, emptyRes.text.length);

  const endRes = insertImageMarkdownAtCaret('hello', 5, 'pic.png', 'img-1');
  assert.equal(endRes.text, 'hello\n![pic.png](neuron-img://img-1)\n');
  assert.equal(endRes.caret, endRes.text.length);

  const midRes = insertImageMarkdownAtCaret('hello world', 5, 'pic.png', 'img-1');
  assert.equal(midRes.text, 'hello\n![pic.png](neuron-img://img-1)\n world');
  assert.equal(midRes.caret, 'hello\n![pic.png](neuron-img://img-1)\n'.length);

  const nextLineRes = insertImageMarkdownAtCaret('hello\nworld', 5, 'pic.png', 'img-1');
  assert.equal(nextLineRes.text, 'hello\n![pic.png](neuron-img://img-1)\nworld');
  assert.equal(nextLineRes.caret, 'hello\n![pic.png](neuron-img://img-1)\n'.length);
});

test('removeImageReferenceFromContent removes matching image markdown cleanly', () => {
  const text = 'first line\n![pic.png](neuron-img://img-1)\nsecond line';
  assert.equal(
    removeImageReferenceFromContent(text, 'img-1'),
    'first line\nsecond line',
  );
});

test('buildGalleryEntries tracks active and trashed note usages per image', () => {
  const images: StoredImage[] = [
    {
      id: 'img-1',
      name: 'diagram.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AAA',
      width: 400,
      height: 300,
      sizeBytes: 2048,
      createdAt: 200,
    },
    {
      id: 'img-2',
      name: 'unused.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,BBB',
      width: 100,
      height: 100,
      sizeBytes: 512,
      createdAt: 100,
    },
  ];
  const notes: Note[] = [
    {
      id: 'n1',
      content: 'Architecture\n![diagram.png](neuron-img://img-1)',
      createdAt: 10,
      updatedAt: 20,
    },
    {
      id: 'n2',
      content: 'Old draft\n![diagram.png](neuron-img://img-1)\n![diagram.png](neuron-img://img-1)',
      createdAt: 10,
      updatedAt: 15,
      deletedAt: 50,
    },
  ];

  const entries = buildGalleryEntries(images, notes);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].image.id, 'img-1');
  assert.equal(entries[0].totalCount, 3);
  assert.equal(entries[0].usages.length, 2);
  assert.equal(entries[0].usages[0].noteId, 'n1');
  assert.equal(entries[0].usages[0].trashed, false);
  assert.equal(entries[0].usages[1].noteId, 'n2');
  assert.equal(entries[0].usages[1].trashed, true);
  assert.equal(entries[0].usages[1].count, 2);

  assert.equal(entries[1].image.id, 'img-2');
  assert.equal(entries[1].totalCount, 0);
  assert.equal(entries[1].usages.length, 0);
});

test('formatBytes renders readable sizes', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(1.5 * 1024 * 1024), '1.5 MB');
});
