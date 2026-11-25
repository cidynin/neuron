import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdownLines } from './obsidianMarkdown';
import {
  getSelectionFormattingState,
  isLightHexColor,
} from './selectionFormatting';
import { parseDocumentBlocks } from './tableBox';

test('single-line selection detects heading, quote, inline marks, and active color', () => {
  const doc = [
    '### __**Hello**__ *world* ==glow== [[note]]',
    '> {color:#EA7B7B}**quoted color**{/color}',
    'plain text',
  ].join('\n');
  const parsed = parseMarkdownLines(doc);

  // "Hello" on line 0 (heading 3, bold + underline)
  const helloState = getSelectionFormattingState(parsed, {
    mode: 'single',
    lineIndex: 0,
    start: 0,
    end: 5,
  });
  assert.equal(helloState.headingLevel, 3);
  assert.equal(helloState.bold, true);
  assert.equal(helloState.underline, true);
  assert.equal(helloState.italic, false);
  assert.equal(helloState.highlight, false);
  assert.equal(helloState.wikilink, false);
  assert.equal(helloState.quote, false);
  assert.equal(helloState.activeColor, undefined);

  // "world" (italic)
  const worldState = getSelectionFormattingState(parsed, {
    mode: 'single',
    lineIndex: 0,
    start: 6,
    end: 11,
  });
  assert.equal(worldState.italic, true);
  assert.equal(worldState.bold, false);

  // "glow" (highlight)
  const glowState = getSelectionFormattingState(parsed, {
    mode: 'single',
    lineIndex: 0,
    start: 12,
    end: 16,
  });
  assert.equal(glowState.highlight, true);

  // "note" (wikilink)
  const linkState = getSelectionFormattingState(parsed, {
    mode: 'single',
    lineIndex: 0,
    start: 17,
    end: 21,
  });
  assert.equal(linkState.wikilink, true);

  // Mixed selection across "Hello world" -> bold is false because " world" is not bold
  const mixedState = getSelectionFormattingState(parsed, {
    mode: 'single',
    lineIndex: 0,
    start: 0,
    end: 11,
  });
  assert.equal(mixedState.bold, false);
  assert.equal(mixedState.italic, false);

  // Line 1: quote + bold + activeColor
  const quoteState = getSelectionFormattingState(parsed, {
    mode: 'single',
    lineIndex: 1,
    start: 0,
    end: 12,
  });
  assert.equal(quoteState.quote, true);
  assert.equal(quoteState.bold, true);
  assert.equal(quoteState.activeColor, '#EA7B7B');
});

test('multi-line and select-all selections aggregate active formatting & color cleanly', () => {
  const doc = [
    '> {color:#f3a87b}*alpha*{/color}',
    '> {color:#F3A87B}*beta*{/color}',
  ].join('\n');
  const parsed = parseMarkdownLines(doc);
  const blocks = parseDocumentBlocks(doc);

  const multiState = getSelectionFormattingState(parsed, {
    mode: 'multi',
    multiSelection: {
      anchorLine: 0,
      anchorOffset: 0,
      focusLine: 1,
      focusOffset: 4,
    },
  });
  assert.equal(multiState.quote, true);
  assert.equal(multiState.italic, true);
  assert.equal(multiState.bold, false);
  assert.equal(multiState.activeColor?.toLowerCase(), '#f3a87b');

  const allState = getSelectionFormattingState(parsed, {
    mode: 'all',
    blocks,
  });
  assert.equal(allState.quote, true);
  assert.equal(allState.italic, true);
  assert.equal(allState.activeColor?.toLowerCase(), '#f3a87b');
});

test('mixed colors across selection yield undefined activeColor', () => {
  const doc = '{color:#ea7b7b}one{/color} {color:#fef4d4}two{/color}';
  const parsed = parseMarkdownLines(doc);
  const state = getSelectionFormattingState(parsed, {
    mode: 'single',
    lineIndex: 0,
    start: 0,
    end: 7,
  });
  assert.equal(state.activeColor, undefined);
});

test('isLightHexColor distinguishes light cream pigments from dark or saturated pigments', () => {
  assert.equal(isLightHexColor('#fef4d4'), true);
  assert.equal(isLightHexColor('#ffffff'), true);
  assert.equal(isLightHexColor('#5d3647'), false);
  assert.equal(isLightHexColor('#ea7b7b'), false);
});
