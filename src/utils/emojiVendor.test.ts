import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMOJI_VENDORS,
  emojiToUnifiedCodepoints,
  getEmojiImageUrls,
  getEmojipediaSlug,
  parseEmojiVendorInput,
  searchEmojis,
  splitTextWithEmojis,
} from './emojiVendor';

test('emojiToUnifiedCodepoints converts standard and variation-selector emojis', () => {
  assert.equal(emojiToUnifiedCodepoints('😀'), '1f600');
  assert.equal(emojiToUnifiedCodepoints('❤️'), '2764-fe0f');
  assert.equal(
    emojiToUnifiedCodepoints('❤️', { stripFe0f: true, uppercase: true }),
    '2764',
  );
});

test('getEmojipediaSlug resolves unicode-emoji-json slugs cleanly', () => {
  assert.equal(getEmojipediaSlug('😀'), 'grinning-face');
  assert.equal(getEmojipediaSlug('🧠'), 'brain');
  assert.equal(getEmojipediaSlug('❤️'), 'red-heart');
});

test('getEmojiImageUrls builds valid vendor CDN URLs and omits native', () => {
  const nativeVendor = EMOJI_VENDORS.find((v) => v.id === 'native')!;
  assert.deepEqual(getEmojiImageUrls('😀', nativeVendor), []);

  const appleVendor = EMOJI_VENDORS.find((v) => v.id === 'apple')!;
  const appleUrls = getEmojiImageUrls('😀', appleVendor);
  assert.equal(
    appleUrls[0],
    'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/1f600.png',
  );

  const samsungVendor = EMOJI_VENDORS.find((v) => v.id === 'samsung')!;
  const samsungUrls = getEmojiImageUrls('🧠', samsungVendor);
  assert.equal(
    samsungUrls[0],
    'https://em-content.zobj.net/source/samsung/405/brain_1f9e0.png',
  );
});

test('splitTextWithEmojis preserves UTF-16 offsets across compound emojis', () => {
  const input = 'hi 🧠❤️!';
  const parts = splitTextWithEmojis(input);
  assert.equal(parts.length, 4);
  assert.deepEqual(parts[0], { type: 'text', value: 'hi ', start: 0, end: 3 });
  assert.deepEqual(parts[1], { type: 'emoji', value: '🧠', start: 3, end: 5 });
  assert.deepEqual(parts[2], { type: 'emoji', value: '❤️', start: 5, end: 7 });
  assert.deepEqual(parts[3], { type: 'text', value: '!', start: 7, end: 8 });
});

test('parseEmojiVendorInput parses Emojipedia vendor pages, zobj links, and custom templates', () => {
  const toss = parseEmojiVendorInput('https://emojipedia.org/toss-face');
  assert.equal(toss.emojipediaVendor, 'toss-face');
  assert.equal(
    getEmojiImageUrls('😀', toss)[0],
    'https://em-content.zobj.net/source/toss-face/381/grinning-face_1f600.png',
  );

  const zobj = parseEmojiVendorInput(
    'https://em-content.zobj.net/source/lg/307/grinning-face_1f600.png',
  );
  assert.equal(zobj.emojipediaVendor, 'lg');
  assert.equal(zobj.emojipediaRev, '307');

  const noto = parseEmojiVendorInput('https://emojipedia.org/noto-emoji');
  assert.equal(noto.id, 'noto-emoji');
  assert.equal(noto.fontFamily, "'Noto Emoji', sans-serif");

  const customTpl = parseEmojiVendorInput(
    'https://cdn.example.com/emoji/{code}.svg',
  );
  assert.equal(
    getEmojiImageUrls('🚀', customTpl)[0],
    'https://cdn.example.com/emoji/1f680.svg',
  );
});

test('searchEmojis matches shortcodes for autocomplete', () => {
  const results = searchEmojis('rocket', 5);
  assert.ok(results.some((r) => r.emoji === '🚀'));
});
