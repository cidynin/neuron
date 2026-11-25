import test from 'node:test';
import assert from 'node:assert/strict';
import { FONT_OPTIONS, PALETTES } from './palettes';
import {
  LINE_SPACING_OPTIONS,
  TEXT_SIZE_OPTIONS,
  TEXT_WIDTH_OPTIONS,
  UI_SIZE_OPTIONS,
  getLineSpacingById,
  getTextSizeById,
  getTextWidthById,
  getUiSizeById,
  isValidLineSpacing,
  isValidTextSize,
  isValidTextWidth,
  isValidUiSize,
} from './sizing';

test('UI size options cover small, medium, large with increasing scale', () => {
  assert.deepEqual(
    UI_SIZE_OPTIONS.map((o) => o.id),
    ['small', 'medium', 'large'],
  );
  const [small, medium, large] = UI_SIZE_OPTIONS;
  assert.ok(small.rootFontPx < medium.rootFontPx);
  assert.ok(medium.rootFontPx < large.rootFontPx);
  assert.ok(small.starSize < medium.starSize);
  assert.ok(medium.starSize < large.starSize);
  assert.equal(getUiSizeById('medium').label, 'default');
});

test('Text size options cover very-small through max using rem-independent px clamps', () => {
  assert.deepEqual(
    TEXT_SIZE_OPTIONS.map((o) => o.id),
    ['very-small', 'small', 'medium', 'large', 'max'],
  );
  for (const opt of TEXT_SIZE_OPTIONS) {
    assert.equal(opt.cssFontSize.includes('rem'), false);
    assert.equal(opt.dyslexicCssFontSize.includes('rem'), false);
  }
  assert.equal(getTextSizeById('very-small').label, 'tiny');
  assert.equal(getTextSizeById('medium').label, 'default');
  assert.equal(getTextSizeById('medium').cssFontSize, 'clamp(26px, 3.1vw, 42.4px)');
});

test('Line spacing and text width options cover 3 valid presets each', () => {
  assert.deepEqual(
    LINE_SPACING_OPTIONS.map((o) => o.id),
    ['compact', 'default', 'relaxed'],
  );
  assert.ok(LINE_SPACING_OPTIONS[0].lineHeight < LINE_SPACING_OPTIONS[1].lineHeight);
  assert.ok(LINE_SPACING_OPTIONS[1].lineHeight < LINE_SPACING_OPTIONS[2].lineHeight);
  assert.equal(isValidLineSpacing('compact'), true);
  assert.equal(isValidLineSpacing('huge'), false);
  assert.equal(getLineSpacingById('invalid' as never).id, 'default');

  assert.deepEqual(
    TEXT_WIDTH_OPTIONS.map((o) => o.id),
    ['narrow', 'default', 'wide'],
  );
  assert.equal(isValidTextWidth('wide'), true);
  assert.equal(isValidTextWidth('full'), false);
  assert.equal(getTextWidthById('invalid' as never).id, 'default');
});

test('Size validators and lookups reject invalid values and fall back cleanly', () => {
  assert.equal(isValidUiSize('small'), true);
  assert.equal(isValidUiSize('max'), false);
  assert.equal(isValidTextSize('very-small'), true);
  assert.equal(isValidTextSize('max'), true);
  assert.equal(isValidTextSize('huge'), false);

  assert.equal(getUiSizeById('large').id, 'large');
  assert.equal(getUiSizeById('invalid' as never).id, 'medium');
  assert.equal(getTextSizeById('max').id, 'max');
  assert.equal(getTextSizeById('invalid' as never).id, 'medium');
});

test('Removed palette (cerulean blossom) and font (JetBrains Mono) are excluded', () => {
  assert.equal(PALETTES.some((p) => p.id === 'cerulean-blossom'), false);
  assert.equal(FONT_OPTIONS.some((f) => f.id === 'code' || f.familyLabel.includes('JetBrains')), false);
});
