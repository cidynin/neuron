import type { ColorPalette } from '../types/neuron';

export type LineKind =
  | 'heading'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'quote'
  | 'divider'
  | 'codeblock'
  | 'paragraph';

export interface ParsedLine {
  lineIndex: number;
  start: number;
  end: number;
  raw: string;
  kind: LineKind;
  headingLevel?: number;
  indent: string;
  marker: string;
  markerStart: number;
  markerEnd: number;
  checked?: boolean;
  bodyStart: number;
}

export type InlineTokenKind =
  | 'text'
  | 'syntax'
  | 'bold'
  | 'italic'
  | 'bold-italic'
  | 'underline'
  | 'strike'
  | 'highlight'
  | 'color'
  | 'code'
  | 'wikilink'
  | 'image';

export interface InlineToken {
  kind: InlineTokenKind;
  text: string;
  start: number;
  end: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  highlight?: boolean;
}

export interface ThemeColorSwatch {
  hex: string;
  label: string;
}

export function parseMarkdownLines(text: string): ParsedLine[] {
  const lines = text.split('\n');
  const result: ParsedLine[] = [];
  let offset = 0;
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const start = offset;
    const end = start + raw.length;
    offset = end + 1;

    if (/^\s*```/.test(raw)) {
      inCodeFence = !inCodeFence;
      result.push({
        lineIndex: i,
        start,
        end,
        raw,
        kind: 'codeblock',
        indent: '',
        marker: raw,
        markerStart: start,
        markerEnd: end,
        bodyStart: end,
      });
      continue;
    }

    if (inCodeFence) {
      result.push({
        lineIndex: i,
        start,
        end,
        raw,
        kind: 'codeblock',
        indent: '',
        marker: '',
        markerStart: start,
        markerEnd: start,
        bodyStart: start,
      });
      continue;
    }

    // Horizontal divider: --- or *** or ___ or standalone --
    if (/^\s*(?:---|--|\*\*\*|___)\s*$/.test(raw)) {
      result.push({
        lineIndex: i,
        start,
        end,
        raw,
        kind: 'divider',
        indent: '',
        marker: raw,
        markerStart: start,
        markerEnd: end,
        bodyStart: end,
      });
      continue;
    }

    // Headings: # through ######
    const headingMatch = raw.match(/^(#{1,6})(\s+)(.*)$/);
    if (headingMatch) {
      const marker = headingMatch[1] + headingMatch[2];
      result.push({
        lineIndex: i,
        start,
        end,
        raw,
        kind: 'heading',
        headingLevel: headingMatch[1].length,
        indent: '',
        marker,
        markerStart: start,
        markerEnd: start + marker.length,
        bodyStart: start + marker.length,
      });
      continue;
    }

    // Obsidian & Neuron Task list: [] , [ ] , [x] , - [ ] , * [x]
    const taskMatch = raw.match(/^(\s*)((?:[-*+]\s+)?\[([ xX]?)\]\s+)(.*)$/);
    if (taskMatch) {
      const indent = taskMatch[1];
      const marker = taskMatch[2];
      const checked = taskMatch[3].toLowerCase() === 'x';
      const markerStart = start + indent.length;
      const markerEnd = markerStart + marker.length;
      result.push({
        lineIndex: i,
        start,
        end,
        raw,
        kind: 'task',
        indent,
        marker,
        markerStart,
        markerEnd,
        checked,
        bodyStart: markerEnd,
      });
      continue;
    }

    // Bulleted list: * , - , +
    const bulletMatch = raw.match(/^(\s*)([*-+]\s+)(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1];
      const marker = bulletMatch[2];
      const markerStart = start + indent.length;
      const markerEnd = markerStart + marker.length;
      result.push({
        lineIndex: i,
        start,
        end,
        raw,
        kind: 'bullet',
        indent,
        marker,
        markerStart,
        markerEnd,
        bodyStart: markerEnd,
      });
      continue;
    }

    // Ordered list: 1. , 2. , etc.
    const orderedMatch = raw.match(/^(\s*)(\d+\.\s+)(.*)$/);
    if (orderedMatch) {
      const indent = orderedMatch[1];
      const marker = orderedMatch[2];
      const markerStart = start + indent.length;
      const markerEnd = markerStart + marker.length;
      result.push({
        lineIndex: i,
        start,
        end,
        raw,
        kind: 'ordered',
        indent,
        marker,
        markerStart,
        markerEnd,
        bodyStart: markerEnd,
      });
      continue;
    }

    // Blockquote: > quote
    const quoteMatch = raw.match(/^(\s*)(>\s?)(.*)$/);
    if (quoteMatch) {
      const indent = quoteMatch[1];
      const marker = quoteMatch[2];
      const markerStart = start + indent.length;
      const markerEnd = markerStart + marker.length;
      result.push({
        lineIndex: i,
        start,
        end,
        raw,
        kind: 'quote',
        indent,
        marker,
        markerStart,
        markerEnd,
        bodyStart: markerEnd,
      });
      continue;
    }

    result.push({
      lineIndex: i,
      start,
      end,
      raw,
      kind: 'paragraph',
      indent: '',
      marker: '',
      markerStart: start,
      markerEnd: start,
      bodyStart: start,
    });
  }

  return result;
}

const INLINE_PATTERN =
  '(!\\[[^\\]\\n]*\\]\\(neuron-img://[a-zA-Z0-9_-]+\\)|\\{color:#[0-9a-fA-F]{3,8}\\}[\\s\\S]*?\\{/color\\}|<u>[^<\\n]+?</u>|`[^`\\n]+`|\\*\\*\\*[^*\\n]+?\\*\\*\\*|___[^_\\n]+?___|\\*\\*[^*\\n]+?\\*\\*|__[^_\\n]+?__|\\+\\+[^+\\n]+?\\+\\+|\\*[^*\\s][^*\\n]*?\\*|\\*[^*\\s]\\*|_[^_\\s][^_\\n]*?_|~~[^~\\n]+?~~|==[^=\\n]+?==|\\[\\[[^\\]\\n]+?\\]\\])';

export function parseInlineMarkdown(
  segment: string,
  baseOffset = 0,
): InlineToken[] {
  if (!segment) return [];
  const tokens: InlineToken[] = [];
  const inlineRegex = new RegExp(INLINE_PATTERN, 'g');

  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(segment)) !== null) {
    let raw = match[0];
    let matchStart = match.index;

    if (matchStart > cursor) {
      tokens.push({
        kind: 'text',
        text: segment.slice(cursor, matchStart),
        start: baseOffset + cursor,
        end: baseOffset + matchStart,
      });
    }

    const absStart = baseOffset + matchStart;
    const absEnd = absStart + raw.length;

    const pushDelimitedBounds = (
      openLen: number,
      closeLen: number,
      kind: InlineTokenKind,
      color?: string,
    ) => {
      const innerStart = absStart + openLen;
      const innerEnd = absEnd - closeLen;
      const innerText = raw.slice(openLen, raw.length - closeLen);

      tokens.push({
        kind: 'syntax',
        text: raw.slice(0, openLen),
        start: absStart,
        end: innerStart,
      });

      const supportsNesting =
        kind === 'color' ||
        kind === 'bold' ||
        kind === 'italic' ||
        kind === 'bold-italic' ||
        kind === 'underline' ||
        kind === 'strike' ||
        kind === 'highlight';

      const innerTokens = supportsNesting
        ? parseInlineMarkdown(innerText, innerStart)
        : [];

      const hasNestedFormatting =
        supportsNesting &&
        innerTokens.some((tok) => tok.kind !== 'text');

      if (hasNestedFormatting) {
        for (const innerTok of innerTokens) {
          if (innerTok.kind === 'syntax') {
            tokens.push(innerTok);
            continue;
          }
          const inherited: InlineToken = {
            ...innerTok,
            kind:
              innerTok.kind === 'text' && kind !== 'color'
                ? kind
                : innerTok.kind,
          };
          if (kind === 'color' && color && !inherited.color) {
            inherited.color = color;
          } else if (kind === 'bold') {
            inherited.bold = true;
          } else if (kind === 'italic') {
            inherited.italic = true;
          } else if (kind === 'bold-italic') {
            inherited.bold = true;
            inherited.italic = true;
          } else if (kind === 'underline') {
            inherited.underline = true;
          } else if (kind === 'strike') {
            inherited.strike = true;
          } else if (kind === 'highlight') {
            inherited.highlight = true;
          }
          tokens.push(inherited);
        }
      } else {
        tokens.push({
          kind,
          text: innerText,
          start: innerStart,
          end: innerEnd,
          ...(color ? { color } : {}),
        });
      }

      tokens.push({
        kind: 'syntax',
        text: raw.slice(raw.length - closeLen),
        start: innerEnd,
        end: absEnd,
      });
    };

    if (raw.startsWith('![')) {
      const splitIdx = raw.indexOf('](');
      if (splitIdx !== -1) {
        tokens.push({
          kind: 'syntax',
          text: raw.slice(0, 2),
          start: absStart,
          end: absStart + 2,
        });
        tokens.push({
          kind: 'image',
          text: raw.slice(2, splitIdx),
          start: absStart + 2,
          end: absStart + splitIdx,
        });
        tokens.push({
          kind: 'syntax',
          text: raw.slice(splitIdx),
          start: absStart + splitIdx,
          end: absEnd,
        });
      }
    } else if (raw.startsWith('{color:')) {
      const closeBrace = raw.indexOf('}');
      const colorHex = raw.slice('{color:'.length, closeBrace);
      const openLen = closeBrace + 1;
      const closeLen = '{/color}'.length;
      pushDelimitedBounds(openLen, closeLen, 'color', colorHex);
    } else if (raw.startsWith('<u>') && raw.endsWith('</u>')) {
      pushDelimitedBounds(3, 4, 'underline');
    } else if (raw.startsWith('`')) {
      pushDelimitedBounds(1, 1, 'code');
    } else if (raw.startsWith('***') || raw.startsWith('___')) {
      pushDelimitedBounds(3, 3, 'bold-italic');
    } else if (raw.startsWith('**')) {
      pushDelimitedBounds(2, 2, 'bold');
    } else if (raw.startsWith('__') || raw.startsWith('++')) {
      pushDelimitedBounds(2, 2, 'underline');
    } else if (raw.startsWith('*') || raw.startsWith('_')) {
      pushDelimitedBounds(1, 1, 'italic');
    } else if (raw.startsWith('~~')) {
      pushDelimitedBounds(2, 2, 'strike');
    } else if (raw.startsWith('==')) {
      pushDelimitedBounds(2, 2, 'highlight');
    } else if (raw.startsWith('[[')) {
      pushDelimitedBounds(2, 2, 'wikilink');
    }

    cursor = matchStart + raw.length;
  }

  if (cursor < segment.length) {
    tokens.push({
      kind: 'text',
      text: segment.slice(cursor),
      start: baseOffset + cursor,
      end: baseOffset + segment.length,
    });
  }

  return tokens;
}

export interface FoldComputation {
  hiddenIndices: Set<number>;
  hiddenCounts: Map<number, number>;
}

/**
 * Obsidian-style section folding: collapsing a heading hides all subsequent lines
 * until a heading of equal or higher level (smaller/equal headingLevel) is reached.
 */
export function computeHiddenLineIndices(
  lines: ParsedLine[],
  collapsedHeaderIndices: Set<number>,
): FoldComputation {
  const hiddenIndices = new Set<number>();
  const hiddenCounts = new Map<number, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.kind !== 'heading' || !collapsedHeaderIndices.has(i)) continue;
    const baseLevel = Math.min(3, line.headingLevel ?? 1);
    let count = 0;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (
        next.kind === 'heading' &&
        (next.headingLevel ?? 1) <= baseLevel
      ) {
        break;
      }
      hiddenIndices.add(j);
      count += 1;
    }
    hiddenCounts.set(i, count);
  }

  return { hiddenIndices, hiddenCounts };
}

export function getPaletteThemeColors(palette: ColorPalette): ThemeColorSwatch[] {
  const seen = new Set<string>();
  const result: ThemeColorSwatch[] = [];

  const pushColor = (hex: string | undefined, label: string) => {
    if (!hex) return;
    const trimmed = hex.trim();
    if (!trimmed.startsWith('#')) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ hex: trimmed, label });
  };

  pushColor(palette.accent, 'accent');
  pushColor(palette.text, 'text');
  pushColor(palette.jewel, 'jewel');
  pushColor(palette.star, 'star');
  pushColor(palette.muted, 'muted');
  palette.swatches.forEach((hex, idx) => {
    pushColor(hex, `swatch ${idx + 1}`);
  });

  return result;
}

export interface TextEditResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

export function applyEnterContinuation(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): TextEditResult | null {
  if (selectionStart !== selectionEnd) return null;

  const lineStart = text.lastIndexOf('\n', selectionStart - 1) + 1;
  const nextNewline = text.indexOf('\n', selectionStart);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  const currentLine = text.slice(lineStart, lineEnd);
  const beforeCursorOnLine = text.slice(lineStart, selectionStart);

  // 1. Task list continuation: [] , [ ] , - [ ] , * [x]
  const taskMatch = currentLine.match(/^(\s*)((?:[-*+]\s+)?\[[ xX]?\])\s(.*)$/);
  if (taskMatch) {
    const [, indent, prefix, body] = taskMatch;
    if (body.trim() === '' && beforeCursorOnLine === currentLine) {
      const nextText = text.slice(0, lineStart) + text.slice(lineEnd);
      return { text: nextText, selectionStart: lineStart, selectionEnd: lineStart };
    }
    const nextPrefix = prefix.replace(/\[[ xX]?\]/, (box) =>
      box === '[]' ? '[]' : '[ ]',
    );
    const insertion = `\n${indent}${nextPrefix} `;
    const nextText =
      text.slice(0, selectionStart) + insertion + text.slice(selectionStart);
    const pos = selectionStart + insertion.length;
    return { text: nextText, selectionStart: pos, selectionEnd: pos };
  }

  // 2. Bulleted list continuation: * , - , +
  const bulletMatch = currentLine.match(/^(\s*)([*-+])\s(.*)$/);
  if (bulletMatch) {
    const [, indent, bullet, body] = bulletMatch;
    if (body.trim() === '' && beforeCursorOnLine === currentLine) {
      const nextText = text.slice(0, lineStart) + text.slice(lineEnd);
      return { text: nextText, selectionStart: lineStart, selectionEnd: lineStart };
    }
    const insertion = `\n${indent}${bullet} `;
    const nextText =
      text.slice(0, selectionStart) + insertion + text.slice(selectionStart);
    const pos = selectionStart + insertion.length;
    return { text: nextText, selectionStart: pos, selectionEnd: pos };
  }

  // 3. Ordered list continuation: 1. , 2. , etc.
  const orderedMatch = currentLine.match(/^(\s*)(\d+)\.\s(.*)$/);
  if (orderedMatch) {
    const [, indent, numStr, body] = orderedMatch;
    if (body.trim() === '' && beforeCursorOnLine === currentLine) {
      const nextText = text.slice(0, lineStart) + text.slice(lineEnd);
      return { text: nextText, selectionStart: lineStart, selectionEnd: lineStart };
    }
    const nextNum = parseInt(numStr, 10) + 1;
    const insertion = `\n${indent}${nextNum}. `;
    const nextText =
      text.slice(0, selectionStart) + insertion + text.slice(selectionStart);
    const pos = selectionStart + insertion.length;
    return { text: nextText, selectionStart: pos, selectionEnd: pos };
  }

  // 4. Blockquote continuation: >
  const quoteMatch = currentLine.match(/^(\s*)>\s?(.*)$/);
  if (quoteMatch) {
    const [, indent, body] = quoteMatch;
    if (body.trim() === '' && beforeCursorOnLine === currentLine) {
      const nextText = text.slice(0, lineStart) + text.slice(lineEnd);
      return { text: nextText, selectionStart: lineStart, selectionEnd: lineStart };
    }
    const insertion = `\n${indent}> `;
    const nextText =
      text.slice(0, selectionStart) + insertion + text.slice(selectionStart);
    const pos = selectionStart + insertion.length;
    return { text: nextText, selectionStart: pos, selectionEnd: pos };
  }

  return null;
}

export function wrapSelectionWithMarkdown(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  openMarker: string,
  closeMarker = openMarker,
): TextEditResult {
  const selected = text.slice(selectionStart, selectionEnd);

  // Unwrap if selection itself or immediately surrounding chars already match markers
  if (
    selected.startsWith(openMarker) &&
    selected.endsWith(closeMarker) &&
    selected.length >= openMarker.length + closeMarker.length
  ) {
    const inner = selected.slice(
      openMarker.length,
      selected.length - closeMarker.length,
    );
    const nextText =
      text.slice(0, selectionStart) + inner + text.slice(selectionEnd);
    return {
      text: nextText,
      selectionStart,
      selectionEnd: selectionStart + inner.length,
    };
  }

  const before = text.slice(
    Math.max(0, selectionStart - openMarker.length),
    selectionStart,
  );
  const after = text.slice(
    selectionEnd,
    selectionEnd + closeMarker.length,
  );
  if (before === openMarker && after === closeMarker) {
    const nextText =
      text.slice(0, selectionStart - openMarker.length) +
      selected +
      text.slice(selectionEnd + closeMarker.length);
    return {
      text: nextText,
      selectionStart: selectionStart - openMarker.length,
      selectionEnd: selectionEnd - openMarker.length,
    };
  }

  const nextText =
    text.slice(0, selectionStart) +
    openMarker +
    selected +
    closeMarker +
    text.slice(selectionEnd);
  if (selectionStart === selectionEnd) {
    const pos = selectionStart + openMarker.length;
    return { text: nextText, selectionStart: pos, selectionEnd: pos };
  }
  return {
    text: nextText,
    selectionStart: selectionStart + openMarker.length,
    selectionEnd: selectionEnd + openMarker.length,
  };
}

export function applyColorToRange(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  hexColor: string | null,
): TextEditResult {
  const s = Math.min(selectionStart, selectionEnd);
  const e = Math.max(selectionStart, selectionEnd);
  let beforeAll = text.slice(0, s);
  const selected = text.slice(s, e);
  let afterAll = text.slice(e);
  let effStart = s;

  // Strip any inner {color:#...}{/color} markers from the selection itself
  const unwrapped = selected.replace(/\{color:#[0-9a-fA-F]{3,8}\}|\{\/color\}/g, '');

  // Check if selection sits completely inside an enclosing {color:#old}...{/color} wrapper
  const lastOpenIdx = beforeAll.lastIndexOf('{color:');
  const lastCloseIdx = beforeAll.lastIndexOf('{/color}');
  if (lastOpenIdx !== -1 && lastOpenIdx > lastCloseIdx) {
    const openMatch = beforeAll.slice(lastOpenIdx).match(/^\{color:(#[0-9a-fA-F]{3,8})\}([\s\S]*)$/);
    const nextCloseIdx = afterAll.indexOf('{/color}');
    const nextOpenIdx = afterAll.indexOf('{color:');
    if (
      openMatch &&
      nextCloseIdx !== -1 &&
      (nextOpenIdx === -1 || nextCloseIdx < nextOpenIdx)
    ) {
      const oldColor = openMatch[1];
      const prefixBeforeTag = beforeAll.slice(0, lastOpenIdx);
      const innerBefore = openMatch[2];
      const innerAfter = afterAll.slice(0, nextCloseIdx);
      const suffixAfterTag = afterAll.slice(nextCloseIdx + '{/color}'.length);

      beforeAll =
        innerBefore.length > 0
          ? `${prefixBeforeTag}{color:${oldColor}}${innerBefore}{/color}`
          : prefixBeforeTag;
      afterAll =
        innerAfter.length > 0
          ? `{color:${oldColor}}${innerAfter}{/color}${suffixAfterTag}`
          : suffixAfterTag;
      effStart = beforeAll.length;
    }
  } else {
    // Also clean partial trailing/leading unmatched color boundaries
    beforeAll = beforeAll.replace(/\{color:#[0-9a-fA-F]{3,8}\}$/, (m) => {
      if (afterAll.startsWith('{/color}')) {
        afterAll = afterAll.slice('{/color}'.length);
        return '';
      }
      return m;
    });
    effStart = beforeAll.length;
  }

  if (!hexColor) {
    const nextText = beforeAll + unwrapped + afterAll;
    return {
      text: nextText,
      selectionStart: effStart,
      selectionEnd: effStart + unwrapped.length,
    };
  }

  const openTag = `{color:${hexColor}}`;
  const closeTag = `{/color}`;
  const nextText = beforeAll + openTag + unwrapped + closeTag + afterAll;
  return {
    text: nextText,
    selectionStart: effStart + openTag.length,
    selectionEnd: effStart + openTag.length + unwrapped.length,
  };
}

export function applyHeadingToRawLine(
  rawLine: string,
  level: 1 | 2 | 3,
): string {
  const headingMatch = rawLine.match(/^(#{1,6})\s+(.*)$/);
  const targetHashes = '#'.repeat(level);
  if (headingMatch) {
    if (headingMatch[1] === targetHashes) {
      // Toggle off same heading level back to body text
      return headingMatch[2];
    }
    return `${targetHashes} ${headingMatch[2]}`;
  }
  const strippedPrefix = rawLine.replace(
    /^(\s*)(?:(?:[-*+]\s+)?\[[ xX]?\]|[*-+]|\d+\.|>)\s+/,
    '',
  );
  return `${targetHashes} ${strippedPrefix}`;
}

export function toggleRawLinePrefix(
  rawLine: string,
  kind: 'bullet' | 'ordered' | 'task' | 'quote',
): string {
  const withoutPrefix = rawLine.replace(
    /^(?:#{1,6}\s+|(?:\s*(?:(?:[-*+]\s+)?\[[ xX]?\]\s+|[*-+]\s+|\d+\.\s+|>\s?)))/,
    '',
  );
  if (kind === 'bullet') {
    return /^\s*[*-+]\s+/.test(rawLine) && !/^\s*[*-+]\s+\[/.test(rawLine)
      ? withoutPrefix
      : `* ${withoutPrefix}`;
  }
  if (kind === 'ordered') {
    return /^\s*\d+\.\s+/.test(rawLine)
      ? withoutPrefix
      : `1. ${withoutPrefix}`;
  }
  if (kind === 'task') {
    return /^\s*(?:[-*+]\s+)?\[[ xX]?\]\s+/.test(rawLine)
      ? withoutPrefix
      : `[] ${withoutPrefix}`;
  }
  return /^\s*>\s?/.test(rawLine) ? withoutPrefix : `> ${withoutPrefix}`;
}

export function applyBackspaceListExit(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): TextEditResult | null {
  if (selectionStart !== selectionEnd) return null;
  const lineStart = text.lastIndexOf('\n', selectionStart - 1) + 1;
  const nextNewline = text.indexOf('\n', selectionStart);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  const currentLine = text.slice(lineStart, lineEnd);

  // Only fire if cursor is at the end of an empty list/task/quote prefix
  if (selectionStart !== lineEnd) return null;
  if (
    /^(\s*)(?:(?:[-*+]\s+)?\[[ xX]?\]|[*-+]|\d+\.|>)\s$/.test(currentLine)
  ) {
    const nextText = text.slice(0, lineStart) + text.slice(lineEnd);
    return {
      text: nextText,
      selectionStart: lineStart,
      selectionEnd: lineStart,
    };
  }
  return null;
}

export function toggleTaskCheckboxAtLine(
  text: string,
  lineStart: number,
  lineEnd: number,
): string | null {
  const line = text.slice(lineStart, lineEnd);
  const match = line.match(/^(\s*(?:[-*+]\s+)?\[)([ xX]?)(\]\s+.*)$/);
  if (!match) return null;
  const nextMark = match[2].toLowerCase() === 'x' ? ' ' : 'x';
  const updatedLine = match[1] + nextMark + match[3];
  return text.slice(0, lineStart) + updatedLine + text.slice(lineEnd);
}

/**
 * Automatically repairs contiguous ordered list numbering (1., 2., 3...)
 * per indentation level whenever items are inserted, deleted, merged, or unwrapped.
 */
export function renumberOrderedLists(content: string): string {
  if (!content) return content;
  const lines = content.split('\n');
  let changed = false;
  let inCodeFence = false;
  let inPixelBlock = false;
  // Stack of active indent lengths -> next expected item number
  const levelStack: Array<{ indentLen: number; nextNum: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (/^\s*```/.test(raw)) {
      inCodeFence = !inCodeFence;
      levelStack.length = 0;
      continue;
    }
    if (inCodeFence) continue;

    if (/^:::pixel\s+(?:32|64)$/.test(trimmed)) {
      inPixelBlock = true;
      levelStack.length = 0;
      continue;
    }
    if (inPixelBlock) {
      if (trimmed === ':::') inPixelBlock = false;
      continue;
    }

    const orderedMatch = raw.match(/^(\s*)(\d+)(\.\s+)(.*)$/);
    if (!orderedMatch) {
      // Blank lines, headings, dividers, tables, or sibling list items end active numbered runs
      levelStack.length = 0;
      continue;
    }

    const [, indent, currentNumStr, dotSpace, rest] = orderedMatch;
    const indentLen = indent.length;

    // Pop any deeper levels if we outdented
    while (
      levelStack.length > 0 &&
      levelStack[levelStack.length - 1].indentLen > indentLen
    ) {
      levelStack.pop();
    }

    let level =
      levelStack.length > 0 &&
      levelStack[levelStack.length - 1].indentLen === indentLen
        ? levelStack[levelStack.length - 1]
        : null;

    if (!level) {
      level = { indentLen, nextNum: 1 };
      levelStack.push(level);
    }

    const expectedNumStr = String(level.nextNum);
    if (currentNumStr !== expectedNumStr) {
      lines[i] = `${indent}${expectedNumStr}${dotSpace}${rest}`;
      changed = true;
    }
    level.nextNum += 1;
  }

  return changed ? lines.join('\n') : content;
}

