import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES } from '../data/palettes';
import {
  applyColorToRange,
  applyEnterContinuation,
  applyHeadingToRawLine,
  computeHiddenLineIndices,
  getPaletteThemeColors,
  parseInlineMarkdown,
  parseMarkdownLines,
  renumberOrderedLists,
  toggleTaskCheckboxAtLine,
  wrapSelectionWithMarkdown,
} from './obsidianMarkdown';

test('renumberOrderedLists repairs contiguous numbering cleanly across gaps and nested lists', () => {
  const doc = [
    '1. alpha',
    '3. gamma',
    '7. delta',
    '  4. sub one',
    '  9. sub two',
    '8. back to outer',
    '',
    '5. new list start',
    '8. new list second',
    '```',
    '9. inside code block untouched',
    '```',
  ].join('\n');

  const expected = [
    '1. alpha',
    '2. gamma',
    '3. delta',
    '  1. sub one',
    '  2. sub two',
    '4. back to outer',
    '',
    '1. new list start',
    '2. new list second',
    '```',
    '9. inside code block untouched',
    '```',
  ].join('\n');

  assert.equal(renumberOrderedLists(doc), expected);
  assert.equal(renumberOrderedLists(expected), expected);
});

test('parseMarkdownLines detects headings, bullets, ordered lists, tasks, quotes, and dividers', () => {
  const sample = [
    '# Header One',
    '* first bullet',
    '1. first item',
    '- [ ] todo item',
    '> wise quote',
    '--',
    'plain text',
  ].join('\n');

  const lines = parseMarkdownLines(sample);
  assert.equal(lines[0].kind, 'heading');
  assert.equal(lines[0].headingLevel, 1);
  assert.equal(lines[1].kind, 'bullet');
  assert.equal(lines[2].kind, 'ordered');
  assert.equal(lines[3].kind, 'task');
  assert.equal(lines[3].checked, false);
  assert.equal(lines[4].kind, 'quote');
  assert.equal(lines[5].kind, 'divider');
  assert.equal(lines[6].kind, 'paragraph');
});

test('parseInlineMarkdown parses bold, italic, underline, color, highlight, strike, code, wikilinks and ignores #tags', () => {
  const tokens = parseInlineMarkdown(
    'hello **bold** *italic* __under__ ++plus++ <u>html</u> {color:#f44b7a}pink{/color} ==mark== ~~old~~ `fn()` [[note]] #idea',
  );
  const meaningful = tokens.filter((t) => t.kind !== 'text' && t.kind !== 'syntax');
  assert.deepEqual(
    meaningful.map((t) => t.kind),
    [
      'bold',
      'italic',
      'underline',
      'underline',
      'underline',
      'color',
      'highlight',
      'strike',
      'code',
      'wikilink',
    ],
  );
  assert.ok(tokens.some((t) => t.kind === 'text' && t.text.includes('#idea')));
  const colorTok = meaningful.find((t) => t.kind === 'color');
  assert.equal(colorTok?.color, '#f44b7a');
  assert.equal(colorTok?.text, 'pink');
});

test('applyColorToRange replaces existing color instead of stacking and works with palette swatches', () => {
  const colored = applyColorToRange('hello world', 6, 11, '#f44b7a');
  assert.equal(colored.text, 'hello {color:#f44b7a}world{/color}');

  // Replacing existing color directly on the colored span swaps the hex cleanly
  const replaced = applyColorToRange(
    colored.text,
    colored.selectionStart,
    colored.selectionEnd,
    '#8a8a8e',
  );
  assert.equal(replaced.text, 'hello {color:#8a8a8e}world{/color}');

  // Recoloring a sub-slice inside an existing colored span splits cleanly without stacking
  const sub = applyColorToRange('hello {color:#f44b7a}abcdef{/color}', 23, 25, '#ffffff');
  assert.equal(
    sub.text,
    'hello {color:#f44b7a}ab{/color}{color:#ffffff}cd{/color}{color:#f44b7a}ef{/color}',
  );

  const cleared = applyColorToRange(
    replaced.text,
    replaced.selectionStart,
    replaced.selectionEnd,
    null,
  );
  assert.equal(cleared.text, 'hello world');

  const swatches = getPaletteThemeColors(PALETTES[0]);
  assert.ok(swatches.some((s) => s.hex.toLowerCase() === '#f44b7a'));
  assert.ok(swatches.some((s) => s.hex.toLowerCase() === '#ffffff'));
});

test('computeHiddenLineIndices collapses lines under h1/h2/h3 Obsidian-style', () => {
  const doc = [
    '# Top',
    'under top',
    '## Sub',
    'under sub',
    '### Nested',
    'under nested',
    '## Sibling Sub',
    'visible under sibling',
    '# Next Top',
  ].join('\n');
  const lines = parseMarkdownLines(doc);

  // Collapse ## Sub (line 2) -> hides lines 3, 4, 5 until ## Sibling Sub (line 6)
  const subFold = computeHiddenLineIndices(lines, new Set([2]));
  assert.deepEqual(Array.from(subFold.hiddenIndices), [3, 4, 5]);
  assert.equal(subFold.hiddenCounts.get(2), 3);

  // Collapse # Top (line 0) -> hides everything up to # Next Top (line 8)
  const topFold = computeHiddenLineIndices(lines, new Set([0]));
  assert.deepEqual(Array.from(topFold.hiddenIndices), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(topFold.hiddenCounts.get(0), 7);
});

test('applyHeadingToRawLine switches and toggles h1, h2, h3 prefixes', () => {
  assert.equal(applyHeadingToRawLine('hello', 1), '# hello');
  assert.equal(applyHeadingToRawLine('# hello', 3), '### hello');
  assert.equal(applyHeadingToRawLine('### hello', 3), 'hello');
});

test('applyEnterContinuation auto-inserts bullet and incremented ordered list markers', () => {
  const b1 = applyEnterContinuation('* buy milk', 10, 10);
  assert.ok(b1);
  assert.equal(b1.text, '* buy milk\n* ');

  // Empty bullet exits list
  const bExit = applyEnterContinuation('* buy milk\n* ', 13, 13);
  assert.ok(bExit);
  assert.equal(bExit.text, '* buy milk\n');

  // Ordered list increments number
  const o1 = applyEnterContinuation('1. step one', 11, 11);
  assert.ok(o1);
  assert.equal(o1.text, '1. step one\n2. ');
});

test('wrapSelectionWithMarkdown, [] tickable tasks, and underline work cleanly', () => {
  const wrapped = wrapSelectionWithMarkdown('hello world', 6, 11, '**');
  assert.equal(wrapped.text, 'hello **world**');

  const unwrapped = wrapSelectionWithMarkdown(
    wrapped.text,
    wrapped.selectionStart,
    wrapped.selectionEnd,
    '**',
  );
  assert.equal(unwrapped.text, 'hello world');

  const underlined = wrapSelectionWithMarkdown('hello world', 6, 11, '__');
  assert.equal(underlined.text, 'hello __world__');

  const toggled = toggleTaskCheckboxAtLine('- [ ] write tests', 0, 17);
  assert.equal(toggled, '- [x] write tests');

  const bareLines = parseMarkdownLines('[] buy oat milk\n[x] shipped');
  assert.equal(bareLines[0].kind, 'task');
  assert.equal(bareLines[0].checked, false);
  assert.equal(bareLines[1].kind, 'task');
  assert.equal(bareLines[1].checked, true);

  const bareEnter = applyEnterContinuation('[] buy oat milk', 15, 15);
  assert.ok(bareEnter);
  assert.equal(bareEnter.text, '[] buy oat milk\n[] ');

  const bareToggle = toggleTaskCheckboxAtLine('[] buy oat milk', 0, 15);
  assert.equal(bareToggle, '[x] buy oat milk');
  assert.equal(toggleTaskCheckboxAtLine('[x] buy oat milk', 0, 16), '[ ] buy oat milk');
});

test('parseInlineMarkdown composes nested formatting such as color + underline and underline + color', () => {
  const tokensA = parseInlineMarkdown('{color:#f44b7a}__colored__{/color}');
  const leafA = tokensA.find((t) => t.kind !== 'syntax' && t.text === 'colored');
  assert.ok(leafA);
  assert.equal(leafA.kind, 'underline');
  assert.equal(leafA.color, '#f44b7a');

  const tokensB = parseInlineMarkdown('__{color:#f44b7a}colored{/color}__');
  const leafB = tokensB.find((t) => t.kind !== 'syntax' && t.text === 'colored');
  assert.ok(leafB);
  assert.equal(leafB.color, '#f44b7a');
  assert.equal(leafB.underline, true);
});

