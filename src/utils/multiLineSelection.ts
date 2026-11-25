import {
  applyHeadingToRawLine,
  toggleRawLinePrefix,
  type ParsedLine,
} from './obsidianMarkdown';
import {
  applyRunColor,
  inlineMarkdownToRuns,
  runsToInlineMarkdown,
  runsToPlainText,
  splitRunsAt,
  toggleRunFormat,
  type InlineToggleProp,
} from './wysiwygMarkdown';

export interface MultiLineSelection {
  anchorLine: number;
  anchorOffset: number;
  focusLine: number;
  focusOffset: number;
}

export interface NormalizedMultiLineSelection {
  startLine: number;
  startOffset: number;
  endLine: number;
  endOffset: number;
}

export function normalizeMultiLineSelection(
  sel: MultiLineSelection,
): NormalizedMultiLineSelection {
  if (sel.anchorLine < sel.focusLine) {
    return {
      startLine: sel.anchorLine,
      startOffset: Math.max(0, sel.anchorOffset),
      endLine: sel.focusLine,
      endOffset: Math.max(0, sel.focusOffset),
    };
  }
  if (sel.anchorLine > sel.focusLine) {
    return {
      startLine: sel.focusLine,
      startOffset: Math.max(0, sel.focusOffset),
      endLine: sel.anchorLine,
      endOffset: Math.max(0, sel.anchorOffset),
    };
  }
  return {
    startLine: sel.anchorLine,
    startOffset: Math.max(0, Math.min(sel.anchorOffset, sel.focusOffset)),
    endLine: sel.focusLine,
    endOffset: Math.max(0, Math.max(sel.anchorOffset, sel.focusOffset)),
  };
}

export function isCrossLineSelection(sel: MultiLineSelection | null): boolean {
  return Boolean(sel && sel.anchorLine !== sel.focusLine);
}

export function getLineVisibleSliceBounds(
  lineIndex: number,
  linePlainLength: number,
  norm: NormalizedMultiLineSelection,
): { start: number; end: number } | null {
  if (lineIndex < norm.startLine || lineIndex > norm.endLine) return null;
  const start = lineIndex === norm.startLine ? Math.min(norm.startOffset, linePlainLength) : 0;
  const end = lineIndex === norm.endLine ? Math.min(norm.endOffset, linePlainLength) : linePlainLength;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

export function extractMultiLinePlainText(
  parsedLines: ParsedLine[],
  sel: MultiLineSelection,
): string {
  const norm = normalizeMultiLineSelection(sel);
  const parts: string[] = [];
  for (let i = norm.startLine; i <= norm.endLine; i++) {
    const parsed = parsedLines[i];
    if (!parsed) continue;
    const bodyMd = parsed.raw.slice(parsed.bodyStart - parsed.start);
    const plain = runsToPlainText(inlineMarkdownToRuns(bodyMd));
    const bounds = getLineVisibleSliceBounds(i, plain.length, norm);
    if (bounds) {
      parts.push(plain.slice(bounds.start, bounds.end));
    }
  }
  return parts.join('\n');
}

export function replaceMultiLineRange(
  content: string,
  parsedLines: ParsedLine[],
  sel: MultiLineSelection,
  replacementText: string,
): { nextContent: string; nextLineIndex: number; nextCaretOffset: number } {
  const norm = normalizeMultiLineSelection(sel);
  const rawLines = content.split('\n');
  const startParsed = parsedLines[norm.startLine];
  const endParsed = parsedLines[norm.endLine];
  if (!startParsed || !endParsed) {
    return { nextContent: content, nextLineIndex: norm.startLine, nextCaretOffset: norm.startOffset };
  }

  const startPrefix = startParsed.raw.slice(0, startParsed.bodyStart - startParsed.start);
  const startRuns = inlineMarkdownToRuns(
    startParsed.raw.slice(startParsed.bodyStart - startParsed.start),
  );
  const startPlainLen = runsToPlainText(startRuns).length;
  const clampedStart = Math.min(norm.startOffset, startPlainLen);
  const headSplit = splitRunsAt(startRuns, clampedStart);
  const headRuns = headSplit.out.slice(0, headSplit.index);

  const endRuns = inlineMarkdownToRuns(
    endParsed.raw.slice(endParsed.bodyStart - endParsed.start),
  );
  const endPlainLen = runsToPlainText(endRuns).length;
  const clampedEnd = Math.min(norm.endOffset, endPlainLen);
  const tailSplit = splitRunsAt(endRuns, clampedEnd);
  const tailRuns = tailSplit.out.slice(tailSplit.index);

  const normalizedInsert = replacementText.replace(/\r\n?/g, '\n');
  const insertParts = normalizedInsert.split('\n');

  if (insertParts.length === 1) {
    const midRun = insertParts[0] ? [{ text: insertParts[0] }] : [];
    const mergedMd = runsToInlineMarkdown([...headRuns, ...midRun, ...tailRuns]);
    rawLines.splice(
      norm.startLine,
      norm.endLine - norm.startLine + 1,
      startPrefix + mergedMd,
    );
    return {
      nextContent: rawLines.join('\n'),
      nextLineIndex: norm.startLine,
      nextCaretOffset: clampedStart + insertParts[0].length,
    };
  }

  const firstRaw =
    startPrefix + runsToInlineMarkdown([...headRuns, ...(insertParts[0] ? [{ text: insertParts[0] }] : [])]);
  const middleRaws = insertParts.slice(1, -1);
  const lastText = insertParts[insertParts.length - 1];
  const lastRaw = runsToInlineMarkdown([...(lastText ? [{ text: lastText }] : []), ...tailRuns]);

  rawLines.splice(
    norm.startLine,
    norm.endLine - norm.startLine + 1,
    firstRaw,
    ...middleRaws,
    lastRaw,
  );
  return {
    nextContent: rawLines.join('\n'),
    nextLineIndex: norm.startLine + insertParts.length - 1,
    nextCaretOffset: lastText.length,
  };
}

export function applyMultiLineInlineToggle(
  content: string,
  parsedLines: ParsedLine[],
  sel: MultiLineSelection,
  prop: InlineToggleProp,
): string {
  const norm = normalizeMultiLineSelection(sel);
  const rawLines = content.split('\n');
  for (let i = norm.startLine; i <= norm.endLine; i++) {
    const parsed = parsedLines[i];
    if (!parsed || parsed.kind === 'divider' || parsed.kind === 'codeblock') continue;
    const prefix = parsed.raw.slice(0, parsed.bodyStart - parsed.start);
    const bodyMd = parsed.raw.slice(parsed.bodyStart - parsed.start);
    const runs = inlineMarkdownToRuns(bodyMd);
    const plainLen = runsToPlainText(runs).length;
    const bounds = getLineVisibleSliceBounds(i, plainLen, norm);
    if (!bounds || bounds.start === bounds.end) continue;
    rawLines[i] =
      prefix + runsToInlineMarkdown(toggleRunFormat(runs, bounds.start, bounds.end, prop));
  }
  return rawLines.join('\n');
}

export function applyMultiLineColor(
  content: string,
  parsedLines: ParsedLine[],
  sel: MultiLineSelection,
  hex: string | null,
): string {
  const norm = normalizeMultiLineSelection(sel);
  const rawLines = content.split('\n');
  for (let i = norm.startLine; i <= norm.endLine; i++) {
    const parsed = parsedLines[i];
    if (!parsed || parsed.kind === 'divider' || parsed.kind === 'codeblock') continue;
    const prefix = parsed.raw.slice(0, parsed.bodyStart - parsed.start);
    const bodyMd = parsed.raw.slice(parsed.bodyStart - parsed.start);
    const runs = inlineMarkdownToRuns(bodyMd);
    const plainLen = runsToPlainText(runs).length;
    const bounds = getLineVisibleSliceBounds(i, plainLen, norm);
    if (!bounds || bounds.start === bounds.end) continue;
    rawLines[i] =
      prefix + runsToInlineMarkdown(applyRunColor(runs, bounds.start, bounds.end, hex));
  }
  return rawLines.join('\n');
}

export function applyMultiLineHeading(
  content: string,
  parsedLines: ParsedLine[],
  sel: MultiLineSelection,
  level: 1 | 2 | 3,
): string {
  const norm = normalizeMultiLineSelection(sel);
  const rawLines = content.split('\n');
  for (let i = norm.startLine; i <= norm.endLine; i++) {
    const parsed = parsedLines[i];
    if (!parsed || parsed.kind === 'divider' || parsed.kind === 'codeblock') continue;
    rawLines[i] = applyHeadingToRawLine(parsed.raw, level);
  }
  return rawLines.join('\n');
}

export function applyMultiLinePrefix(
  content: string,
  parsedLines: ParsedLine[],
  sel: MultiLineSelection,
  kind: 'bullet' | 'ordered' | 'task' | 'quote',
): string {
  const norm = normalizeMultiLineSelection(sel);
  const rawLines = content.split('\n');
  for (let i = norm.startLine; i <= norm.endLine; i++) {
    const parsed = parsedLines[i];
    if (!parsed || parsed.kind === 'divider' || parsed.kind === 'codeblock') continue;
    rawLines[i] = toggleRawLinePrefix(parsed.raw, kind);
  }
  return rawLines.join('\n');
}
