import type { Note } from '../types/neuron';

export const TRASH_RETENTION_DAYS = 7;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function createNote(content = '', now = Date.now(), id?: string): Note {
  return {
    id: id ?? `note-${now}-${Math.random().toString(36).slice(2, 7)}`,
    content,
    createdAt: now,
    updatedAt: now,
    pinned: false,
  };
}

export function isNoteTrashed(note: Note): boolean {
  return typeof note.deletedAt === 'number' && !Number.isNaN(note.deletedAt);
}

export function getActiveNotes(notes: Note[]): Note[] {
  return notes.filter((n) => !isNoteTrashed(n));
}

export function getTrashedNotes(notes: Note[]): Note[] {
  return notes
    .filter((n) => isNoteTrashed(n))
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

export function purgeExpiredTrash(notes: Note[], now = Date.now()): Note[] {
  return notes.filter((note) => {
    if (!isNoteTrashed(note)) return true;
    return now - (note.deletedAt ?? 0) < TRASH_RETENTION_MS;
  });
}

export function formatTrashDaysRemaining(
  deletedAt: number,
  now = Date.now(),
): string {
  const remainingMs = Math.max(0, TRASH_RETENTION_MS - (now - deletedAt));
  const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  if (days <= 1) return '<1d left';
  return `${days}d left`;
}

export function stripInlineMarkdownForDisplay(input: string): string {
  if (!input) return '';
  let text = input
    // Embedded images -> readable name or photo
    .replace(/!\[([^\]\n]*)\]\(neuron-img:\/\/[a-zA-Z0-9_-]+\)/g, (_m, alt: string) => {
      const cleanAlt = alt.trim();
      return cleanAlt && cleanAlt.toLowerCase() !== 'image' ? cleanAlt : 'photo';
    })
    // Color markers
    .replace(/\{color:#[0-9a-fA-F]{3,8}\}|\{\/color\}/g, '')
    // Underline html tags
    .replace(/<\/?u>/gi, '')
    // Wikilinks [[note]] -> note
    .replace(/\[\[([^\]\n]+?)\]\]/g, '$1')
    // Backtick code
    .replace(/`([^`\n]+)`/g, '$1');

  // Unwrap balanced emphasis/highlight/strike markers iteratively
  for (let pass = 0; pass < 3; pass++) {
    const prev = text;
    text = text
      .replace(/\*\*\*([^*\n]+?)\*\*\*/g, '$1')
      .replace(/___([^_\n]+?)___/g, '$1')
      .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
      .replace(/__([^_\n]+?)__/g, '$1')
      .replace(/\+\+([^+\n]+?)\+\+/g, '$1')
      .replace(/==([^=\n]+?)==/g, '$1')
      .replace(/~~([^~\n]+?)~~/g, '$1')
      .replace(/\*([^*\n]+?)\*/g, '$1')
      .replace(/(^|[\s(])_([^_\n]+?)_(?=$|[\s).,!?:;])/g, '$1$2');
    if (text === prev) break;
  }

  // Strip any leftover dangling markdown delimiter tokens (e.g. "*word *", "____", "**")
  text = text
    .replace(/\*{2,}|_{2,}|==|~~/g, '')
    .replace(/(^|\s)\*+|\*+(?=\s|$)/g, '$1');

  return text.replace(/\s+/g, ' ').trim();
}

export function extractCleanDisplayLines(content: string): string[] {
  const rawLines = content.split(/\r?\n/);
  const result: string[] = [];
  let inPixelBlock = false;

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (/^:::pixel\s+(?:32|64)$/.test(trimmed)) {
      inPixelBlock = true;
      continue;
    }
    if (inPixelBlock) {
      if (trimmed === ':::') {
        inPixelBlock = false;
      }
      continue;
    }

    // Ignore horizontal rules / dividers
    if (/^(?:---|--|\*\*\*|___)$/.test(trimmed)) continue;

    // Handle markdown tables / boxes cleanly (ignore separator lines & empty rows)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (/^\|(?:\s*:?-{2,}:?\s*\|)+\s*$/.test(trimmed)) {
        continue;
      }
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => stripInlineMarkdownForDisplay(c))
        .filter(Boolean);
      if (cells.length > 0) {
        result.push(cells.join(' · '));
      }
      continue;
    }

    // Strip block prefixes (#, [], *, -, >, 1.)
    const withoutPrefix = trimmed
      .replace(/^#{1,6}\s+/, '')
      .replace(/^(?:[-*+]\s+)?\[[ xX]?\]\s+/, '')
      .replace(/^[*-+]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/^>\s?/, '');

    const cleanLine = stripInlineMarkdownForDisplay(withoutPrefix);
    if (cleanLine) {
      result.push(cleanLine);
    }
  }

  return result;
}

export function getDefaultInheritedTitle(content: string): string {
  const cleanLines = extractCleanDisplayLines(content);
  if (cleanLines.length === 0) return 'untitled note';
  const first = cleanLines[0];
  if (first.length <= 1) return first;
  const halfLen = Math.max(1, Math.floor(first.length * 0.5));
  const clipped = first.slice(0, halfLen).trimEnd() || first.slice(0, halfLen);
  return `${clipped}…`;
}

export function getNoteTitle(content: string, customTitle?: string): string {
  const manual = customTitle?.trim();
  if (manual) return manual;
  return getDefaultInheritedTitle(content);
}

export function getNoteSnippet(content: string): string {
  const cleanLines = extractCleanDisplayLines(content);
  if (cleanLines.length <= 1) return '';
  const rest = cleanLines.slice(1).join(' ');
  if (rest.length <= 1) return rest;
  const cutLen = Math.max(1, Math.floor(rest.length * 0.8));
  const clipped = rest.slice(0, cutLen).trimEnd() || rest.slice(0, cutLen);
  return `${clipped}…`;
}

export function countWords(content: string): number {
  const cleanLines = extractCleanDisplayLines(content);
  if (cleanLines.length === 0) return 0;
  const joined = cleanLines
    .join(' ')
    .replace(/·/g, ' ')
    .trim();
  if (!joined) return 0;
  return joined.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export interface DocumentInsights {
  wordCount: number;
  characterCount: number;
  readingCount: number;
  readingTimeLabel: string;
}

export function computeDocumentInsights(content: string): DocumentInsights {
  const cleanLines = extractCleanDisplayLines(content);
  const wordCount = countWords(content);
  const joined = cleanLines.join(' ').replace(/\s+/g, ' ').trim();
  const characterCount = joined.length;

  let readingCount = 0;
  for (const line of cleanLines) {
    const sentences = line
      .split(/[.!?]+(?=\s|$)/)
      .map((s) => s.trim())
      .filter((s) => /[\p{L}\p{N}]/u.test(s));
    readingCount += Math.max(1, sentences.length);
  }

  let readingTimeLabel = '0 min read';
  if (wordCount > 0 && wordCount < 100) {
    readingTimeLabel = '<1 min read';
  } else if (wordCount >= 100) {
    const mins = Math.max(1, Math.ceil(wordCount / 200));
    readingTimeLabel = `${mins} min read`;
  }

  return {
    wordCount,
    characterCount,
    readingCount,
    readingTimeLabel,
  };
}

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    const aPin = a.pinned ? 1 : 0;
    const bPin = b.pinned ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;
    return b.updatedAt - a.updatedAt;
  });
}

export function filterNotes(notes: Note[], query: string): Note[] {
  const q = query.trim().toLowerCase();
  const sorted = sortNotes(notes);
  if (!q) return sorted;
  return sorted.filter((note) => {
    const titleMatch = note.title?.toLowerCase().includes(q) ?? false;
    return (
      titleMatch ||
      extractCleanDisplayLines(note.content).join(' ').toLowerCase().includes(q)
    );
  });
}

export interface UniversalMatchLine {
  lineNumber: number;
  text: string;
}

export interface UniversalSearchResult {
  note: Note;
  matchCount: number;
  matchLines: UniversalMatchLine[];
}

export function searchNotesUniversal(
  notes: Note[],
  query: string,
  includeTrashed = true,
  unlockedNoteIds?: Set<string>,
): UniversalSearchResult[] {
  const q = query.trim().toLowerCase();
  const pool = includeTrashed ? notes : getActiveNotes(notes);
  if (!q) {
    return sortNotes(pool).map((note) => ({
      note,
      matchCount: 0,
      matchLines: [],
    }));
  }

  const results: UniversalSearchResult[] = [];
  for (const note of pool) {
    const isLocked =
      Boolean(note.passwordHash && note.passwordSalt) &&
      !(unlockedNoteIds?.has(note.id) ?? false);
    const matchLines: UniversalMatchLine[] = [];
    let matchCount = 0;

    if (note.title && note.title.toLowerCase().includes(q)) {
      matchCount += 1;
    }

    if (!isLocked) {
      const lines = note.content.split(/\r?\n/);
      let inPixelBlock = false;

      lines.forEach((line, idx) => {
        const trimmedLine = line.trim();
        if (/^:::pixel\s+(?:32|64)$/.test(trimmedLine)) {
          inPixelBlock = true;
          return;
        }
        if (inPixelBlock) {
          if (trimmedLine === ':::') inPixelBlock = false;
          return;
        }

        const displayLine = stripInlineMarkdownForDisplay(
          trimmedLine
            .replace(/^#{1,6}\s+/, '')
            .replace(/^(?:[-*+]\s+)?\[[ xX]?\]\s+/, '')
            .replace(/^>\s?/, ''),
        );
        if (!displayLine) return;
        const lower = displayLine.toLowerCase();
        let pos = lower.indexOf(q);
        if (pos !== -1) {
          matchLines.push({ lineNumber: idx + 1, text: displayLine });
          while (pos !== -1) {
            matchCount += 1;
            pos = lower.indexOf(q, pos + q.length);
          }
        }
      });
    }

    if (matchCount > 0) {
      results.push({
        note,
        matchCount,
        matchLines: matchLines.slice(0, 3),
      });
    }
  }

  return results.sort((a, b) => {
    const aTrash = isNoteTrashed(a.note) ? 1 : 0;
    const bTrash = isNoteTrashed(b.note) ? 1 : 0;
    if (aTrash !== bTrash) return aTrash - bTrash;
    const aPin = a.note.pinned ? 1 : 0;
    const bPin = b.note.pinned ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;
    if (a.matchCount !== b.matchCount) return b.matchCount - a.matchCount;
    return b.note.updatedAt - a.note.updatedAt;
  });
}

export function updateNoteContent(
  notes: Note[],
  noteId: string,
  content: string,
  now = Date.now(),
): Note[] {
  return notes.map((note) =>
    note.id === noteId
      ? {
          ...note,
          content,
          updatedAt: now,
        }
      : note,
  );
}

export function renameNoteInList(
  notes: Note[],
  noteId: string,
  nextTitle: string,
  now = Date.now(),
): Note[] {
  const cleaned = nextTitle.trim();
  return notes.map((note) =>
    note.id === noteId
      ? {
          ...note,
          title: cleaned || undefined,
          updatedAt: now,
        }
      : note,
  );
}

export function toggleNotePin(notes: Note[], noteId: string): Note[] {
  return notes.map((note) =>
    note.id === noteId ? { ...note, pinned: !note.pinned } : note,
  );
}

export function moveNoteToTrash(
  notes: Note[],
  noteId: string,
  activeNoteId: string,
  now = Date.now(),
): { notes: Note[]; activeNoteId: string } {
  const target = notes.find((n) => n.id === noteId);
  if (!target) return { notes, activeNoteId };

  // Empty untouched note can be dropped cleanly rather than cluttering trash
  let nextNotes: Note[];
  if (target.content.trim() === '') {
    nextNotes = notes.filter((n) => n.id !== noteId);
  } else {
    nextNotes = notes.map((n) =>
      n.id === noteId ? { ...n, deletedAt: now, pinned: false } : n,
    );
  }

  const activePool = getActiveNotes(nextNotes);
  if (activePool.length === 0) {
    const fresh = createNote('', now);
    return { notes: [fresh, ...nextNotes], activeNoteId: fresh.id };
  }

  if (activeNoteId === noteId) {
    const sorted = sortNotes(activePool);
    return { notes: nextNotes, activeNoteId: sorted[0].id };
  }

  return { notes: nextNotes, activeNoteId };
}

export function moveAllActiveToTrash(
  notes: Note[],
  now = Date.now(),
): { notes: Note[]; activeNoteId: string } {
  const trashedPool = notes
    .filter((n) => isNoteTrashed(n) || n.content.trim() !== '')
    .map((n) =>
      isNoteTrashed(n) ? n : { ...n, deletedAt: now, pinned: false },
    );
  const fresh = createNote('', now);
  return {
    notes: [fresh, ...trashedPool],
    activeNoteId: fresh.id,
  };
}

export function restoreNoteFromTrash(notes: Note[], noteId: string): Note[] {
  return notes.map((note) => {
    if (note.id !== noteId) return note;
    const { deletedAt: _removed, ...rest } = note;
    return rest;
  });
}

export function permanentlyDeleteNote(notes: Note[], noteId: string): Note[] {
  return notes.filter((n) => n.id !== noteId);
}

export function emptyTrash(notes: Note[]): Note[] {
  return notes.filter((n) => !isNoteTrashed(n));
}

export function deleteNoteById(
  notes: Note[],
  noteId: string,
  activeNoteId: string,
  now = Date.now(),
): { notes: Note[]; activeNoteId: string } {
  return moveNoteToTrash(notes, noteId, activeNoteId, now);
}

export function buildExportFilename(content: string, customTitle?: string): string {
  const cleanLines = extractCleanDisplayLines(content);
  const rawName = customTitle?.trim() || cleanLines[0] || 'untitled note';
  const slug = rawName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${slug || 'neuron-note'}.md`;
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 45) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
