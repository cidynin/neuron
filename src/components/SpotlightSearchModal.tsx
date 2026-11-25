import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Lock, Search, X } from 'lucide-react';
import type { EmojiVendorOption, Note } from '../types/neuron';
import { isNoteLocked } from '../utils/noteLock';
import {
  formatRelativeTime,
  getActiveNotes,
  getNoteTitle,
  searchNotesUniversal,
  sortNotes,
} from '../utils/notes';
import { EmojiText } from './EmojiGlyph';

interface SpotlightSearchModalProps {
  isOpen: boolean;
  notes: Note[];
  activeNoteId: string;
  unlockedNoteIds: Set<string>;
  emojiVendor: EmojiVendorOption;
  onSelectNote: (noteId: string, lineNumber?: number) => void;
  onClose: () => void;
}

function highlightMatch(
  text: string,
  query: string,
  vendor: EmojiVendorOption,
) {
  const q = query.trim();
  if (!q) return <EmojiText text={text} vendor={vendor} />;
  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let idx = lower.indexOf(qLower);
  let k = 0;

  while (idx !== -1) {
    if (idx > cursor) {
      parts.push(
        <Fragment key={`s-${k++}`}>
          <EmojiText text={text.slice(cursor, idx)} vendor={vendor} />
        </Fragment>,
      );
    }
    parts.push(
      <mark
        key={`m-${k++}`}
        className="rounded-[2px] px-0.5 font-medium"
        style={{
          backgroundColor: 'var(--neuron-selection)',
          color: 'var(--neuron-text)',
        }}
      >
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    cursor = idx + q.length;
    idx = lower.indexOf(qLower, cursor);
  }
  if (cursor < text.length) {
    parts.push(
      <Fragment key={`t-${k}`}>
        <EmojiText text={text.slice(cursor)} vendor={vendor} />
      </Fragment>,
    );
  }
  return <>{parts}</>;
}

export function SpotlightSearchModal({
  isOpen,
  notes,
  activeNoteId,
  unlockedNoteIds,
  emojiVendor,
  onSelectNote,
  onClose,
}: SpotlightSearchModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelectedIdx(0);
      return;
    }
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);

  const items = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      return sortNotes(getActiveNotes(notes))
        .slice(0, 10)
        .map((note) => ({
          note,
          matchCount: 0,
          matchLines: [] as { lineNumber: number; text: string }[],
        }));
    }
    return searchNotesUniversal(notes, trimmed, false, unlockedNoteIds);
  }, [notes, query, unlockedNoteIds]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query, items.length]);

  const handleSelectItem = (idx: number) => {
    const hit = items[idx];
    if (!hit) return;
    onSelectNote(hit.note.id, hit.matchLines[0]?.lineNumber);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Search across notes"
          data-testid="spotlight-search-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[14vh] backdrop-blur-xs"
        >
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-xl flex-col overflow-hidden rounded-xl border shadow-2xl"
            style={{
              backgroundColor: 'var(--neuron-surface)',
              borderColor: 'var(--neuron-border)',
              color: 'var(--neuron-text)',
            }}
          >
            {/* Search input row */}
            <div
              className="flex items-center gap-3 border-b px-4 py-3"
              style={{ borderColor: 'var(--neuron-border)' }}
            >
              <Search
                className="h-4 w-4 shrink-0"
                style={{ color: 'var(--neuron-accent)' }}
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="text"
                data-testid="spotlight-search-input"
                aria-label="Search words across all notes"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIdx((i) =>
                      items.length > 0 ? (i + 1) % items.length : 0,
                    );
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIdx((i) =>
                      items.length > 0 ? (i - 1 + items.length) % items.length : 0,
                    );
                  } else if (e.key === 'Enter' && items.length > 0) {
                    e.preventDefault();
                    handleSelectItem(selectedIdx);
                  }
                }}
                placeholder="search notes & jump..."
                className="min-w-0 flex-1 bg-transparent text-base text-[var(--neuron-text)] placeholder:opacity-50 focus:outline-none"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  aria-label="Clear spotlight search"
                  onClick={() => setQuery('')}
                  className="cursor-pointer rounded p-1 hover:text-[var(--neuron-text)]"
                  style={{ color: 'var(--neuron-muted)' }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                aria-label="Close spotlight search"
                onClick={onClose}
                className="cursor-pointer rounded border px-1.5 py-0.5 text-[11px]"
                style={{
                  borderColor: 'var(--neuron-border)',
                  color: 'var(--neuron-muted)',
                }}
              >
                esc
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[54vh] overflow-y-auto py-1.5">
              {items.length === 0 ? (
                <div
                  className="px-4 py-8 text-center text-sm"
                  style={{ color: 'var(--neuron-muted)' }}
                >
                  no matching unlocked notes found.
                </div>
              ) : (
                <ul role="listbox" aria-label="Matching notes">
                  {items.map((item, idx) => {
                    const { note, matchCount, matchLines } = item;
                    const locked = isNoteLocked(note) && !unlockedNoteIds.has(note.id);
                    const title = getNoteTitle(note.content, note.title);
                    const selected = idx === selectedIdx;
                    const isCurrent = note.id === activeNoteId;

                    return (
                      <li key={note.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          data-testid={`spotlight-result-${note.id}`}
                          onMouseEnter={() => setSelectedIdx(idx)}
                          onClick={() => handleSelectItem(idx)}
                          className="flex w-full cursor-pointer flex-col items-start gap-1 px-4 py-2.5 text-left transition-colors"
                          style={{
                            backgroundColor: selected
                              ? 'color-mix(in srgb, var(--neuron-accent) 12%, transparent)'
                              : 'transparent',
                          }}
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--neuron-text)]">
                              {locked && (
                                <Lock
                                  className="h-3.5 w-3.5 shrink-0"
                                  style={{ color: 'var(--neuron-accent)' }}
                                  aria-hidden="true"
                                />
                              )}
                              <span className="truncate">
                                {highlightMatch(title, query, emojiVendor)}
                              </span>
                              {isCurrent && (
                                <span
                                  className="text-[11px] font-normal"
                                  style={{ color: 'var(--neuron-accent)' }}
                                >
                                  open
                                </span>
                              )}
                            </span>
                            <span
                              className="shrink-0 text-[11px] tabular-nums"
                              style={{ color: 'var(--neuron-muted)' }}
                            >
                              {query.trim() && matchCount > 0
                                ? `${matchCount} ${matchCount === 1 ? 'hit' : 'hits'} · `
                                : ''}
                              {formatRelativeTime(note.updatedAt)}
                            </span>
                          </div>

                          {!locked && matchLines.length > 0 && (
                            <div className="flex w-full flex-col gap-0.5">
                              {matchLines.slice(0, 2).map((ml) => (
                                <span
                                  key={`${note.id}-L${ml.lineNumber}`}
                                  className="line-clamp-1 text-xs"
                                  style={{ color: 'var(--neuron-muted)' }}
                                >
                                  <span
                                    className="mr-1.5 tabular-nums opacity-75"
                                    style={{ color: 'var(--neuron-accent)' }}
                                  >
                                    L{ml.lineNumber}
                                  </span>
                                  {highlightMatch(ml.text, query, emojiVendor)}
                                </span>
                              ))}
                            </div>
                          )}

                          {locked && (
                            <span
                              className="text-xs italic"
                              style={{ color: 'var(--neuron-muted)' }}
                            >
                              locked note · contents hidden until unlocked
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
