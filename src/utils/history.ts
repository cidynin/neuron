import { extractImageReferences } from './images';

export interface HistorySnapshot {
  content: string;
  timestamp: number;
  coalesceKey?: string;
}

export interface NoteHistoryStack {
  past: HistorySnapshot[];
  future: HistorySnapshot[];
}

export type NoteHistoryMap = Record<string, NoteHistoryStack>;

export const MAX_HISTORY_ENTRIES = 120;
export const HISTORY_COALESCE_WINDOW_MS = 450;

export function getEmptyHistoryStack(): NoteHistoryStack {
  return { past: [], future: [] };
}

export function pushNoteHistory(
  stack: NoteHistoryStack | undefined,
  prevContent: string,
  nextContent: string,
  options: { now?: number; discrete?: boolean; coalesceKey?: string } = {},
): NoteHistoryStack {
  const current = stack ?? getEmptyHistoryStack();
  if (prevContent === nextContent) return current;

  const now = options.now ?? Date.now();
  const discrete = Boolean(options.discrete);
  const last = current.past[current.past.length - 1];

  // Coalesce continuous single-key typing bursts into crisp word/burst undo steps,
  // unless it's a discrete edit (color change, format toggle, paste, image, enter, etc.)
  if (
    !discrete &&
    last &&
    last.coalesceKey &&
    options.coalesceKey &&
    last.coalesceKey === options.coalesceKey &&
    now - last.timestamp <= HISTORY_COALESCE_WINDOW_MS
  ) {
    const updatedPast = [
      ...current.past.slice(0, -1),
      { ...last, timestamp: now },
    ];
    return {
      past: updatedPast,
      future: [],
    };
  }

  const nextPast = [
    ...current.past,
    {
      content: prevContent,
      timestamp: now,
      coalesceKey: discrete ? undefined : options.coalesceKey,
    },
  ];
  const trimmedPast =
    nextPast.length > MAX_HISTORY_ENTRIES
      ? nextPast.slice(nextPast.length - MAX_HISTORY_ENTRIES)
      : nextPast;

  return {
    past: trimmedPast,
    future: [],
  };
}

export function undoNoteHistory(
  stack: NoteHistoryStack | undefined,
  currentContent: string,
  now = Date.now(),
): {
  nextContent: string;
  nextStack: NoteHistoryStack;
  didUndo: boolean;
} {
  const current = stack ?? getEmptyHistoryStack();
  if (current.past.length === 0) {
    return { nextContent: currentContent, nextStack: current, didUndo: false };
  }

  const target = current.past[current.past.length - 1];
  const nextPast = current.past.slice(0, -1);
  const nextFuture = [
    ...current.future,
    { content: currentContent, timestamp: now },
  ];

  return {
    nextContent: target.content,
    nextStack: {
      past: nextPast,
      future: nextFuture.slice(-MAX_HISTORY_ENTRIES),
    },
    didUndo: true,
  };
}

export function redoNoteHistory(
  stack: NoteHistoryStack | undefined,
  currentContent: string,
  now = Date.now(),
): {
  nextContent: string;
  nextStack: NoteHistoryStack;
  didRedo: boolean;
} {
  const current = stack ?? getEmptyHistoryStack();
  if (current.future.length === 0) {
    return { nextContent: currentContent, nextStack: current, didRedo: false };
  }

  const target = current.future[current.future.length - 1];
  const nextFuture = current.future.slice(0, -1);
  const nextPast = [
    ...current.past,
    { content: currentContent, timestamp: now },
  ].slice(-MAX_HISTORY_ENTRIES);

  return {
    nextContent: target.content,
    nextStack: {
      past: nextPast,
      future: nextFuture,
    },
    didRedo: true,
  };
}

export function extractHistoryImageIds(historyMap: NoteHistoryMap): Set<string> {
  const ids = new Set<string>();
  for (const stack of Object.values(historyMap)) {
    for (const entry of stack.past) {
      for (const ref of extractImageReferences(entry.content)) {
        ids.add(ref.id);
      }
    }
    for (const entry of stack.future) {
      for (const ref of extractImageReferences(entry.content)) {
        ids.add(ref.id);
      }
    }
  }
  return ids;
}
