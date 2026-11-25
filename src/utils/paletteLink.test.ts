import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPaletteFromColors,
  contrastRatio,
  normalizeHex,
  parsePaletteInput,
} from './paletteLink';

test('normalizeHex handles 3-digit, 6-digit, and invalid values', () => {
  assert.equal(normalizeHex('fff'), '#ffffff');
  assert.equal(normalizeHex('#0F0f1B'), '#0f0f1b');
  assert.equal(normalizeHex('xyz'), null);
});

test('parsePaletteInput extracts lospec slug and json endpoint', () => {
  const parsed = parsePaletteInput('https://lospec.com/palette-list/hollow');
  assert.deepEqual(parsed, {
    kind: 'lospec',
    slug: 'hollow',
    jsonUrl: 'https://lospec.com/palette-list/hollow.json',
    sourceUrl: 'https://lospec.com/palette-list/hollow',
  });
});

test('parsePaletteInput parses coolors, colorhunt, and raw hex strings', () => {
  const coolors = parsePaletteInput('https://coolors.co/051f39-4a2480-c53a9d-ff8e80');
  assert.equal(coolors?.kind, 'colors');
  if (coolors?.kind === 'colors') {
    assert.deepEqual(coolors.colors, ['#051f39', '#4a2480', '#c53a9d', '#ff8e80']);
  }

  const hunt = parsePaletteInput('https://colorhunt.co/palette/282328545c7ec56981a3a29a');
  assert.equal(hunt?.kind, 'colors');
  if (hunt?.kind === 'colors') {
    assert.deepEqual(hunt.colors, ['#282328', '#545c7e', '#c56981', '#a3a29a']);
  }

  const raw = parsePaletteInput('#0f0f1b, #565a75, #c6b7be, #fafbf6');
  assert.equal(raw?.kind, 'colors');
  if (raw?.kind === 'colors') {
    assert.deepEqual(raw.colors, ['#0f0f1b', '#565a75', '#c6b7be', '#fafbf6']);
  }
});

test('buildPaletteFromColors enforces >= 4.5 contrast and uses all 4 pigments', () => {
  const palette = buildPaletteFromColors('Hollow', ['0f0f1b', '565a75', 'c6b7be', 'fafbf6'], {
    id: 'custom-hollow',
  });
  assert.equal(palette.bg, '#0f0f1b');
  assert.equal(palette.border, '#565a75');
  assert.equal(palette.accent, '#c6b7be');
  assert.equal(palette.text, '#fafbf6');
  assert.ok(contrastRatio(palette.bg, palette.text) >= 4.5);
  assert.equal(palette.isCustom, true);
});
