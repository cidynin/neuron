import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRunColor,
  domToInlineMarkdown,
  expandPlainRunsInlineShortcuts,
  findEmojiShortcodeMatch,
  inlineMarkdownToHtml,
  inlineMarkdownToRuns,
  replaceVisibleRangeInRuns,
  runsEqual,
  runsToHtml,
  runsToInlineMarkdown,
  runsToPlainText,
  stepVisibleOffsetByGrapheme,
  toggleRunFormat,
  type DomNodeLike,
} from './wysiwygMarkdown';

function makeElement(
  nodeName: string,
  attrs: Record<string, string>,
  children: DomNodeLike[],
  colorStyle?: string,
): DomNodeLike {
  return {
    nodeType: 1,
    nodeName: nodeName.toUpperCase(),
    textContent: children.map((c) => c.textContent ?? '').join(''),
    childNodes: children,
    getAttribute: (k: string) => attrs[k] ?? null,
    style: colorStyle ? { color: colorStyle } : undefined,
  };
}

function makeText(text: string): DomNodeLike {
  return {
    nodeType: 3,
    nodeName: '#text',
    textContent: text,
    childNodes: [],
  };
}

test('inlineMarkdownToRuns and runsToInlineMarkdown round-trip clean WYSIWYG runs with zero visible delimiters', () => {
  const md = 'hello **bold** *italic* __under__ ==mark== [[link]] {color:#f44b7a}pink{/color}';
  const runs = inlineMarkdownToRuns(md);
  assert.equal(
    runsToPlainText(runs),
    'hello bold italic under mark link pink',
  );
  assert.equal(runsToInlineMarkdown(runs), md);

  const html = inlineMarkdownToHtml(md);
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(html.includes('<em>italic</em>'));
  assert.ok(html.includes('<u class="neuron-underline">under</u>'));
  assert.ok(html.includes('<mark class="neuron-highlight">mark</mark>'));
  assert.ok(html.includes('data-neuron-color="#f44b7a"'));
  assert.ok(!html.includes('**'));
  assert.ok(!html.includes('{color:'));
});

test('applyRunColor replaces existing color instead of stacking spans', () => {
  const runs1 = inlineMarkdownToRuns('hello {color:#f44b7a}world{/color}');
  assert.equal(runsToPlainText(runs1), 'hello world');

  // Replace entire colored word with new color
  const runs2 = applyRunColor(runs1, 6, 11, '#8a8a8e');
  assert.equal(runsToInlineMarkdown(runs2), 'hello {color:#8a8a8e}world{/color}');

  // Recoloring a slice splits cleanly without nested color tags
  const runs3 = applyRunColor(runs2, 6, 8, '#ffffff');
  assert.equal(
    runsToInlineMarkdown(runs3),
    'hello {color:#ffffff}wo{/color}{color:#8a8a8e}rld{/color}',
  );

  // Clear color returns plain text
  const runs4 = applyRunColor(runs3, 6, 11, null);
  assert.equal(runsToInlineMarkdown(runs4), 'hello world');
});

test('toggleRunFormat composes bold, italic, underline cleanly and unwraps on repeat toggle', () => {
  const base = inlineMarkdownToRuns('alpha beta');
  const bolded = toggleRunFormat(base, 6, 10, 'bold');
  assert.equal(runsToInlineMarkdown(bolded), 'alpha **beta**');

  const boldItalic = toggleRunFormat(bolded, 6, 10, 'italic');
  assert.equal(runsToPlainText(boldItalic), 'alpha beta');
  assert.ok(boldItalic[1].bold && boldItalic[1].italic);

  const unbolded = toggleRunFormat(boldItalic, 6, 10, 'bold');
  assert.equal(runsToInlineMarkdown(unbolded), 'alpha *beta*');
});

test('domToInlineMarkdown serializes formatted DOM nodes and custom emojis faithfully', () => {
  const root = makeElement('div', {}, [
    makeText('hello\u00A0'),
    makeElement(
      'span',
      { 'data-neuron-color': '#f44b7a' },
      [makeElement('em', {}, [makeText('pink')])],
      '#f44b7a',
    ),
    makeText(' '),
    makeElement('img', { 'data-emoji': '🚀', alt: '🚀' }, []),
  ]);

  assert.equal(domToInlineMarkdown(root), 'hello {color:#f44b7a}*pink*{/color} 🚀');
});

test('expandPlainRunsInlineShortcuts strips asterisks cleanly when inline markdown closes', () => {
  const r = expandPlainRunsInlineShortcuts([{ text: 'hello *world*' }], 13);
  assert.equal(r.changed, true);
  assert.equal(runsToInlineMarkdown(r.runs), 'hello *world*');
  assert.equal(runsToPlainText(r.runs), 'hello world');
  assert.equal(r.visibleCaretOffset, 11);

  const noMatch = expandPlainRunsInlineShortcuts([{ text: '2 * 3' }], 5);
  assert.equal(noMatch.changed, false);
});

test('replaceVisibleRangeInRuns preserves bold/color styling when replacing a misspelled word', () => {
  const runs = inlineMarkdownToRuns('fix {color:#f44b7a}**teh**{/color} bug');
  const next = replaceVisibleRangeInRuns(runs, 4, 7, 'the');
  assert.equal(runsToInlineMarkdown(next), 'fix {color:#f44b7a}**the**{/color} bug');
});

test('domToInlineMarkdown supports DocumentFragment root containers (nodeType 11)', () => {
  const frag: DomNodeLike = {
    nodeType: 11,
    nodeName: '#document-fragment',
    textContent: 'hello world',
    childNodes: [
      makeText('hello '),
      makeElement('strong', {}, [makeText('world')]),
    ],
  };
  assert.equal(domToInlineMarkdown(frag), 'hello **world**');

  const multi = expandPlainRunsInlineShortcuts(
    [{ text: '*a*' }, { text: ' and ' }, { text: '**b**' }],
    13,
  );
  assert.equal(multi.changed, true);
  assert.equal(multi.visibleCaretOffset, 7);
});

test('unclosed double-asterisk bold does not prematurely italicize on first closing star', () => {
  const midTyping = expandPlainRunsInlineShortcuts([{ text: '**bold*' }], 7);
  assert.equal(midTyping.changed, false);
  assert.equal(midTyping.runs.length, 1);
  assert.equal(midTyping.runs[0].italic, undefined);

  const completed = expandPlainRunsInlineShortcuts([{ text: '**bold**' }], 8);
  assert.equal(completed.changed, true);
  assert.equal(completed.runs[0].bold, true);
  assert.equal(completed.runs[0].text, 'bold');
  assert.equal(completed.visibleCaretOffset, 4);

  assert.equal(
    runsEqual([{ text: '*italic*' }], inlineMarkdownToRuns('*italic*')),
    false,
  );
  assert.equal(
    runsEqual([{ text: 'italic', italic: true }], inlineMarkdownToRuns('*italic*')),
    true,
  );
});

test('wikilinks combine cleanly with bold and color in markdown and HTML round-trip', () => {
  const runs = inlineMarkdownToRuns('{color:#ea7b7b}**[[idea]]**{/color}');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].text, 'idea');
  assert.equal(runs[0].wikilink, true);
  assert.equal(runs[0].bold, true);
  assert.equal(runs[0].color, '#ea7b7b');
  assert.equal(runsToInlineMarkdown(runs), '{color:#ea7b7b}**[[idea]]**{/color}');
  const html = runsToHtml(runs);
  assert.ok(html.includes('data-wikilink="1"'));
  assert.ok(html.includes('data-neuron-color="#ea7b7b"'));
  assert.ok(html.includes('<strong>'));
});

test('runsToHtml renders font-based emojis (e.g. Noto Emoji) and round-trips through domToInlineMarkdown', () => {
  const runs = inlineMarkdownToRuns('launch 🚀 brain 🧠');
  const html = runsToHtml(runs, (emoji) => ({
    fontFamily: "'Noto Emoji', sans-serif",
    vendorId: 'noto-emoji',
    alt: emoji,
  }));
  assert.ok(html.includes('contenteditable="false"'));
  assert.ok(html.includes('data-emoji="🚀"'));
  assert.ok(html.includes('data-emoji-vendor="noto-emoji"'));
  assert.ok(html.includes('Noto Emoji'));

  const root = makeElement('div', {}, [
    makeText('launch '),
    makeElement('span', { 'data-emoji': '🚀', 'data-emoji-vendor': 'noto-emoji' }, [makeText('🚀')]),
  ]);
  assert.equal(domToInlineMarkdown(root), 'launch 🚀');
});

test('stepVisibleOffsetByGrapheme steps atomically across standard, skin-tone, and ZWJ emojis', () => {
  const sample = 'a😀👍🏽👨‍👩‍👧b';
  // Walk right from 0 -> 1 ('a') -> 3 ('😀') -> 7 ('👍🏽') -> 15 ('👨‍👩‍👧') -> 16 ('b')
  const s1 = stepVisibleOffsetByGrapheme(sample, 0, 1);
  assert.deepEqual(s1, { nextOffset: 1, crossedEmoji: false, grapheme: 'a' });

  const s2 = stepVisibleOffsetByGrapheme(sample, s1.nextOffset, 1);
  assert.deepEqual(s2, { nextOffset: 3, crossedEmoji: true, grapheme: '😀' });

  const s3 = stepVisibleOffsetByGrapheme(sample, s2.nextOffset, 1);
  assert.deepEqual(s3, { nextOffset: 7, crossedEmoji: true, grapheme: '👍🏽' });

  const s4 = stepVisibleOffsetByGrapheme(sample, s3.nextOffset, 1);
  assert.deepEqual(s4, { nextOffset: 15, crossedEmoji: true, grapheme: '👨‍👩‍👧' });

  const s5 = stepVisibleOffsetByGrapheme(sample, s4.nextOffset, 1);
  assert.deepEqual(s5, { nextOffset: 16, crossedEmoji: false, grapheme: 'b' });

  // Walk backwards symmetrically
  const b1 = stepVisibleOffsetByGrapheme(sample, 16, -1);
  assert.deepEqual(b1, { nextOffset: 15, crossedEmoji: false, grapheme: 'b' });
  const b2 = stepVisibleOffsetByGrapheme(sample, 15, -1);
  assert.deepEqual(b2, { nextOffset: 7, crossedEmoji: true, grapheme: '👨‍👩‍👧' });
  const b3 = stepVisibleOffsetByGrapheme(sample, 7, -1);
  assert.deepEqual(b3, { nextOffset: 3, crossedEmoji: true, grapheme: '👍🏽' });
  const b4 = stepVisibleOffsetByGrapheme(sample, 3, -1);
  assert.deepEqual(b4, { nextOffset: 1, crossedEmoji: true, grapheme: '😀' });
});

test('findEmojiShortcodeMatch triggers at start, after space/(, after emojis, and with closing colon', () => {
  assert.deepEqual(findEmojiShortcodeMatch(':rocket'), { colonStart: 0, query: 'rocket' });
  assert.deepEqual(findEmojiShortcodeMatch('hello :smile:'), { colonStart: 6, query: 'smile' });
  assert.deepEqual(findEmojiShortcodeMatch('😀:fire'), { colonStart: 2, query: 'fire' });
  assert.deepEqual(findEmojiShortcodeMatch('🚀\u200B:brain'), { colonStart: 3, query: 'brain' });
  assert.equal(findEmojiShortcodeMatch('https://example.com'), null);
  assert.equal(findEmojiShortcodeMatch('foo:bar'), null);
});
