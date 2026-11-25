import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomFontOption, parseGoogleFontInput } from './fontLink';

test('parseGoogleFontInput parses Google Fonts specimen URLs', () => {
  const parsed = parseGoogleFontInput(
    'https://fonts.google.com/specimen/Press+Start+2P?query=pixel',
  );
  assert.ok(parsed);
  assert.equal(parsed.familyName, 'Press Start 2P');
  assert.equal(
    parsed.css2PlainUrl,
    'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap',
  );
});

test('parseGoogleFontInput parses Google Fonts css2 URLs and <link> snippets', () => {
  const css2 = parseGoogleFontInput(
    'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap',
  );
  assert.equal(css2?.familyName, 'Space Mono');

  const tag = parseGoogleFontInput(
    '<link href="https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap" rel="stylesheet">',
  );
  assert.equal(tag?.familyName, 'Silkscreen');
});

test('parseGoogleFontInput parses plain font names and rejects invalid URLs', () => {
  const name = parseGoogleFontInput('Playfair Display');
  assert.equal(name?.familyName, 'Playfair Display');
  assert.equal(parseGoogleFontInput('https://example.com/unknown/path'), null);
});

test('buildCustomFontOption constructs safe CSS family and custom flag', () => {
  const opt = buildCustomFontOption(
    'Space Mono',
    'https://fonts.googleapis.com/css2?family=Space+Mono&display=swap',
  );
  assert.equal(opt.id, 'gfont-space-mono');
  assert.equal(opt.familyLabel, 'Space Mono');
  assert.equal(opt.cssFamily, "'Space Mono', system-ui, sans-serif");
  assert.equal(opt.isCustom, true);
});
