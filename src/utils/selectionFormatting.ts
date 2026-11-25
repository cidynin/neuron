import {
  getLineVisibleSliceBounds,
  isCrossLineSelection,
  normalizeMultiLineSelection,
  type MultiLineSelection,
} from './multiLineSelection';
import type { ParsedLine } from './obsidianMarkdown';
import type { DocumentBlock } from './tableBox';
import {
  inlineMarkdownToRuns,
  runsToPlainText,
  splitRunsAt,
  type StyledRun,
} from './wysiwygMarkdown';

export interface SelectionFormattingState {
  headingLevel?: 1 | 2 | 3;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  highlight: boolean;
  wikilink: boolean;
  quote: boolean;
  activeColor?: string;
}

export type SelectionScopeInput =
  | {
      mode: 'all';
      blocks: DocumentBlock[];
      hiddenIndices?: Set<number>;
    }
  | {
      mode: 'multi';
      multiSelection: MultiLineSelection;
    }
  | {
      mode: 'single';
      lineIndex: number;
      start: number;
      end: number;
    };

function extractSlicedRuns(
  runs: StyledRun[],
  start: number,
  end: number,
): StyledRun[] {
  const s = Math.max(0, Math.min(start, end));
  const e = Math.max(s, Math.max(start, end));
  if (s === e) return [];
  const first = splitRunsAt(runs, s);
  const second = splitRunsAt(first.out, e);
  return second.out
    .slice(first.index, second.index)
    .filter((run) => run.text.length > 0);
}

function summarizeLinesAndRuns(
  participatingLines: ParsedLine[],
  targetRuns: StyledRun[],
): SelectionFormattingState {
  let headingLevel: 1 | 2 | 3 | undefined;
  if (
    participatingLines.length > 0 &&
    participatingLines.every(
      (line) =>
        line.kind === 'heading' &&
        (line.headingLevel === 1 ||
          line.headingLevel === 2 ||
          line.headingLevel === 3),
    )
  ) {
    const firstLevel = participatingLines[0].headingLevel as 1 | 2 | 3;
    if (participatingLines.every((line) => line.headingLevel === firstLevel)) {
      headingLevel = firstLevel;
    }
  }

  const quote =
    participatingLines.length > 0 &&
    participatingLines.every((line) => line.kind === 'quote');

  if (targetRuns.length === 0) {
    return {
      headingLevel,
      bold: false,
      italic: false,
      underline: false,
      highlight: false,
      wikilink: false,
      quote,
      activeColor: undefined,
    };
  }

  const firstColor = targetRuns[0].color;
  const activeColor =
    firstColor &&
    targetRuns.every(
      (run) =>
        Boolean(run.color) &&
        run.color!.toLowerCase() === firstColor.toLowerCase(),
    )
      ? firstColor
      : undefined;

  return {
    headingLevel,
    bold: targetRuns.every((run) => Boolean(run.bold)),
    italic: targetRuns.every((run) => Boolean(run.italic)),
    underline: targetRuns.every((run) => Boolean(run.underline)),
    highlight: targetRuns.every((run) => Boolean(run.highlight)),
    wikilink: targetRuns.every((run) => Boolean(run.wikilink)),
    quote,
    activeColor,
  };
}

export function getSelectionFormattingState(
  parsedLines: ParsedLine[],
  scope: SelectionScopeInput,
): SelectionFormattingState {
  const participatingLines: ParsedLine[] = [];
  const targetRuns: StyledRun[] = [];

  if (scope.mode === 'all') {
    for (const block of scope.blocks) {
      if (block.type !== 'line') continue;
      if (scope.hiddenIndices?.has(block.lineIndex)) continue;
      const parsed = parsedLines[block.lineIndex];
      if (!parsed || parsed.kind === 'divider' || parsed.kind === 'codeblock') {
        continue;
      }
      participatingLines.push(parsed);
      const bodyMd = parsed.raw.slice(parsed.bodyStart - parsed.start);
      const runs = inlineMarkdownToRuns(bodyMd);
      const plainLen = runsToPlainText(runs).length;
      if (plainLen > 0) {
        targetRuns.push(...extractSlicedRuns(runs, 0, plainLen));
      }
    }
    return summarizeLinesAndRuns(participatingLines, targetRuns);
  }

  if (scope.mode === 'multi' && isCrossLineSelection(scope.multiSelection)) {
    const norm = normalizeMultiLineSelection(scope.multiSelection);
    for (let i = norm.startLine; i <= norm.endLine; i++) {
      const parsed = parsedLines[i];
      if (!parsed || parsed.kind === 'divider' || parsed.kind === 'codeblock') {
        continue;
      }
      const bodyMd = parsed.raw.slice(parsed.bodyStart - parsed.start);
      const runs = inlineMarkdownToRuns(bodyMd);
      const plainLen = runsToPlainText(runs).length;
      const bounds = getLineVisibleSliceBounds(i, plainLen, norm);
      // Skip trailing zero-width line boundary if drag ended at offset 0 of last line
      if (
        i === norm.endLine &&
        norm.endLine > norm.startLine &&
        bounds &&
        bounds.start === 0 &&
        bounds.end === 0 &&
        plainLen > 0
      ) {
        continue;
      }
      participatingLines.push(parsed);
      if (bounds && bounds.start < bounds.end) {
        targetRuns.push(...extractSlicedRuns(runs, bounds.start, bounds.end));
      }
    }
    return summarizeLinesAndRuns(participatingLines, targetRuns);
  }

  const singleLineIdx =
    scope.mode === 'single' ? scope.lineIndex : scope.multiSelection.anchorLine;
  const singleStart =
    scope.mode === 'single' ? scope.start : scope.multiSelection.anchorOffset;
  const singleEnd =
    scope.mode === 'single' ? scope.end : scope.multiSelection.focusOffset;

  const parsed = parsedLines[singleLineIdx];
  if (!parsed || parsed.kind === 'divider' || parsed.kind === 'codeblock') {
    return summarizeLinesAndRuns([], []);
  }
  participatingLines.push(parsed);
  const bodyMd = parsed.raw.slice(parsed.bodyStart - parsed.start);
  const runs = inlineMarkdownToRuns(bodyMd);
  targetRuns.push(...extractSlicedRuns(runs, singleStart, singleEnd));

  return summarizeLinesAndRuns(participatingLines, targetRuns);
}

/**
 * Returns true when a hex pigment color is bright enough to require a dark indicator dot.
 */
export function isLightHexColor(hex: string): boolean {
  const clean = hex.trim().replace(/^#/, '');
  let r = 0;
  let g = 0;
  let b = 0;
  if (clean.length === 3 || clean.length === 4) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else if (clean.length === 6 || clean.length === 8) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  } else {
    return false;
  }
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return false;
  }
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62;
}
