import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdownLines } from './obsidianMarkdown';
import {
  applyMultiLineColor,
  applyMultiLineInlineToggle,
  extractMultiLinePlainText,
  normalizeMultiLineSelection,
  replaceMultiLineRange,
} from './multiLineSelection';

test('upward mouse drag from line 2 to line 0 normalizes, extracts, formats, colors, and replaces cleanly', () => {
  const content = 'alpha one\nbeta two\ngamma three';
  const parsed = parseMarkdownLines(content);

  // User starts mouse drag on line 2 offset 5 ("gamma") and drags UP to line 0 offset 6 ("one")
  const sel = {
    anchorLine: 2,
    anchorOffset: 5,
    focusLine: 0,
    focusOffset: 6,
  };

  const norm = normalizeMultiLineSelection(sel);
  assert.deepEqual(norm, {
    startLine: 0,
    startOffset: 6,
    endLine: 2,
    endOffset: 5,
  });

  assert.equal(extractMultiLinePlainText(parsed, sel), 'one\nbeta two\ngamma');

  // Toggle bold across the multi-line upward selection
  const bolded = applyMultiLineInlineToggle(content, parsed, sel, 'bold');
  assert.equal(bolded, 'alpha **one**\n**beta two**\n**gamma** three');

  // Apply color across the multi-line upward selection
  const colored = applyMultiLineColor(content, parsed, sel, '#f44b7a');
  assert.equal(
    colored,
    'alpha {color:#f44b7a}one{/color}\n{color:#f44b7a}beta two{/color}\n{color:#f44b7a}gamma{/color} three',
  );

  // Backspace / delete over multi-line upward selection merges tail cleanly
  const deleted = replaceMultiLineRange(content, parsed, sel, '');
  assert.equal(deleted.nextContent, 'alpha  three');
  assert.equal(deleted.nextLineIndex, 0);
  assert.equal(deleted.nextCaretOffset, 6);
});
