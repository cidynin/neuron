import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMisspellings,
  getAutocorrectReplacement,
  getSpellingSuggestions,
  isWordCorrect,
} from './spellcheck';

test('isWordCorrect validates dictionary words, contractions, proper nouns, and custom words', () => {
  assert.equal(isWordCorrect('quick'), true);
  assert.equal(isWordCorrect("don't"), true);
  assert.equal(isWordCorrect('im'), true);
  assert.equal(isWordCorrect('itll'), true);
  assert.equal(isWordCorrect('itd'), true);
  assert.equal(isWordCorrect('thats'), true);
  assert.equal(isWordCorrect('thatll'), true);
  assert.equal(isWordCorrect('wouldve'), true);
  assert.equal(isWordCorrect('dont'), true);
  assert.equal(isWordCorrect('cant'), true);
  assert.equal(isWordCorrect('github'), true);
  assert.equal(isWordCorrect('microsoft'), true);
  assert.equal(isWordCorrect('linux'), true);
  assert.equal(isWordCorrect('windows'), true);
  assert.equal(isWordCorrect('vercel'), true);
  assert.equal(isWordCorrect('HTML'), true);
  assert.equal(isWordCorrect('tset'), false);
  assert.equal(isWordCorrect('mycustomword'), false);
  assert.equal(isWordCorrect('mycustomword', new Set(['mycustomword'])), true);
  assert.equal(
    findMisspellings('its gonna be open source so itll be on github and microsoft ').length,
    0,
  );
});

test('findMisspellings flags misspelled words with exact indices and skips code/urls', () => {
  const text = 'the quik `tset` https://example.com/wrng speling';
  const issues = findMisspellings(text);
  assert.deepEqual(
    issues.map((i) => i.word),
    ['quik', 'speling'],
  );
  assert.equal(text.slice(issues[0].start, issues[0].end), 'quik');
  assert.equal(text.slice(issues[1].start, issues[1].end), 'speling');

  // While user is still typing 'quik' (caret at index 4), it is deferred
  const whileTyping = findMisspellings('the quik', new Set(), new Set(), 8);
  assert.equal(whileTyping.length, 0);

  // Once user types a space (caret at index 9), 'quik' is flagged
  const afterSpace = findMisspellings('the quik ', new Set(), new Set(), 9);
  assert.deepEqual(
    afterSpace.map((i) => i.word),
    ['quik'],
  );
});

test('getSpellingSuggestions ranks common words highly and preserves capitalization', () => {
  const s1 = getSpellingSuggestions('speling');
  assert.ok(s1.includes('spelling'));

  const s2 = getSpellingSuggestions('Tset');
  assert.ok(s2.includes('Test') || s2.includes('Text'));

  const s3 = getSpellingSuggestions('recieve');
  assert.equal(s3[0], 'receive');
});

test('modern office/software words and everyday casual words pass local offline spellcheck cleanly', () => {
  assert.equal(isWordCorrect('powerpoint'), true);
  assert.equal(isWordCorrect('excel'), true);
  assert.equal(isWordCorrect('photoshop'), true);
  assert.equal(isWordCorrect('onedrive'), true);
  assert.equal(isWordCorrect('lowkey'), true);
  assert.equal(isWordCorrect('comfy'), true);
  assert.equal(
    findMisspellings('opening powerpoint and excel in onedrive btw ').length,
    0,
  );
  assert.deepEqual(
    findMisspellings('xzqwkjhg ').map((i) => i.word),
    ['xzqwkjhg'],
  );
});

test('getAutocorrectReplacement fixes obvious typos cleanly while respecting casing, custom words, and acronyms', () => {
  assert.equal(getAutocorrectReplacement('teh'), 'the');
  assert.equal(getAutocorrectReplacement('Teh'), 'The');
  assert.equal(getAutocorrectReplacement('recieve'), 'receive');
  assert.equal(getAutocorrectReplacement('becuase'), 'because');
  // Valid words & custom dictionary words are untouched
  assert.equal(getAutocorrectReplacement('quick'), null);
  assert.equal(getAutocorrectReplacement('teh', new Set(['teh'])), null);
  // Acronyms & camelCase untouched
  assert.equal(getAutocorrectReplacement('NASA'), null);
  assert.equal(getAutocorrectReplacement('myVarName'), null);
});

