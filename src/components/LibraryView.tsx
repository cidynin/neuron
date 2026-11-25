import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Download,
  FileText,
  Image as ImageIcon,
  Lock,
  LockOpen,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { ColorPalette, EmojiVendorOption, Note } from '../types/neuron';
import {
  buildGalleryEntries,
  formatBytes,
  type StoredImage,
} from '../utils/images';
import { isNoteLocked } from '../utils/noteLock';
import {
  extractCanvasEntriesFromNotes,
  type LibraryCanvasEntry,
  type PixelCanvasData,
} from '../utils/pixelCanvas';
import {
  countWords,
  formatRelativeTime,
  formatTrashDaysRemaining,
  getActiveNotes,
  getNoteSnippet,
  getNoteTitle,
  getTrashedNotes,
  isNoteTrashed,
  searchNotesUniversal,
  sortNotes,
} from '../utils/notes';
import { EmojiText, UiEmoji } from './EmojiGlyph';
import { ImageLightbox } from './ImageLightbox';
import { NoteLockModal } from './NoteLockModal';

interface LibraryViewProps {
  notes: Note[];
  images: StoredImage[];
  activeNoteId: string;
  activeTab: 'notes' | 'gallery' | 'trash';
  palette: ColorPalette;
  emojiVendor: EmojiVendorOption;
  uiEmojisEnabled: boolean;
  unlockedNoteIds: Set<string>;
  onChangeTab: (tab: 'notes' | 'gallery' | 'trash') => void;
  onSelectNote: (noteId: string, lineNumber?: number) => void;
  onNewNote: () => void;
  onRenameNote: (noteId: string, nextTitle: string) => void;
  onTogglePin: (noteId: string) => void;
  onDeleteNote: (noteId: string) => void;
  onClearAllNotes: () => void;
  onRestoreNote: (noteId: string) => void;
  onPermanentDeleteNote: (noteId: string) => void;
  onEmptyTrash: () => void;
  onExportNote: (note: Note) => void;
  onInsertImageToActiveNote: (image: StoredImage) => void;
  onUpdateImage?: (updated: StoredImage) => void;
  onDeleteImage: (imageId: string) => void;
  onLockNote: (noteId: string, password: string) => Promise<void>;
  onUnlockNote: (noteId: string, password: string) => Promise<boolean>;
  onRemoveNoteLock: (noteId: string, currentPassword: string) => Promise<boolean>;
  onRelockNote: (noteId: string) => void;
  onBack: () => void;
}

function CanvasThumbnail({ data }: { data: PixelCanvasData }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, data.size, data.size);
    for (let i = 0; i < data.pixels.length; i++) {
      const hex = data.pixels[i];
      if (!hex) continue;
      const x = i % data.size;
      const y = Math.floor(i / data.size);
      ctx.fillStyle = hex;
      ctx.fillRect(x, y, 1, 1);
    }
  }, [data]);

  return (
    <canvas
      ref={canvasRef}
      width={data.size}
      height={data.size}
      className="h-full w-full object-contain"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

function downloadCanvasEntryAsPng(entry: LibraryCanvasEntry) {
  const scale = entry.data.size === 64 ? 6 : entry.data.size === 16 ? 16 : 10;
  const out = document.createElement('canvas');
  out.width = entry.data.size * scale;
  out.height = entry.data.size * scale;
  const ctx = out.getContext('2d');
  if (!ctx) return;
  for (let i = 0; i < entry.data.pixels.length; i++) {
    const hex = entry.data.pixels[i];
    if (!hex) continue;
    const x = i % entry.data.size;
    const y = Math.floor(i / entry.data.size);
    ctx.fillStyle = hex;
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  const url = out.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `canvas-${entry.data.size}x${entry.data.size}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function renderHighlightedText(
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
  let keyIdx = 0;

  while (idx !== -1) {
    if (idx > cursor) {
      parts.push(
        <Fragment key={`seg-${keyIdx++}`}>
          <EmojiText text={text.slice(cursor, idx)} vendor={vendor} />
        </Fragment>,
      );
    }
    parts.push(
      <mark
        key={`mark-${keyIdx++}`}
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
      <Fragment key={`tail-${keyIdx}`}>
        <EmojiText text={text.slice(cursor)} vendor={vendor} />
      </Fragment>,
    );
  }

  return <>{parts}</>;
}

export function LibraryView({
  notes,
  images,
  activeNoteId,
  activeTab,
  palette,
  emojiVendor,
  uiEmojisEnabled,
  unlockedNoteIds,
  onChangeTab,
  onSelectNote,
  onNewNote,
  onRenameNote,
  onTogglePin,
  onDeleteNote,
  onClearAllNotes,
  onRestoreNote,
  onPermanentDeleteNote,
  onEmptyTrash,
  onExportNote,
  onInsertImageToActiveNote,
  onUpdateImage,
  onDeleteImage,
  onLockNote,
  onUnlockNote,
  onRemoveNoteLock,
  onRelockNote,
  onBack,
}: LibraryViewProps) {
  const [query, setQuery] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [lightboxEntry, setLightboxEntry] = useState<{
    image: StoredImage;
    summary: string;
  } | null>(null);
  const [lockModal, setLockModal] = useState<{
    noteId: string;
    title: string;
    isLocked: boolean;
  } | null>(null);

  const openLockDialog = (note: Note) => {
    const title = getNoteTitle(note.content, note.title);
    setLockModal({
      noteId: note.id,
      title,
      isLocked: isNoteLocked(note),
    });
  };

  const startEditingNote = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingTitle(note.title ?? getNoteTitle(note.content));
  };

  const commitNoteRename = (noteId: string) => {
    onRenameNote(noteId, editingTitle);
    setEditingNoteId(null);
    setEditingTitle('');
  };

  const cancelNoteRename = () => {
    setEditingNoteId(null);
    setEditingTitle('');
  };

  const activeNotes = sortNotes(getActiveNotes(notes));
  const trashedNotes = getTrashedNotes(notes);
  const galleryEntries = useMemo(
    () => buildGalleryEntries(images, notes).filter((e) => e.usages.length > 0),
    [images, notes],
  );
  const canvasEntries = useMemo(
    () => extractCanvasEntriesFromNotes(notes, unlockedNoteIds),
    [notes, unlockedNoteIds],
  );
  const totalGalleryCount = galleryEntries.length + canvasEntries.length;

  const isSearching = query.trim().length > 0;
  const searchResults = isSearching
    ? searchNotesUniversal(notes, query, true, unlockedNoteIds)
    : [];

  const tabListRef = useRef<HTMLDivElement | null>(null);
  const notesTabRef = useRef<HTMLButtonElement | null>(null);
  const galleryTabRef = useRef<HTMLButtonElement | null>(null);
  const trashTabRef = useRef<HTMLButtonElement | null>(null);
  const [tabIndicator, setTabIndicator] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);

  const measureActiveTabBar = useCallback(() => {
    const activeEl =
      activeTab === 'gallery'
        ? galleryTabRef.current
        : activeTab === 'trash'
          ? trashTabRef.current
          : notesTabRef.current;
    if (!activeEl) return;
    setTabIndicator({
      left: activeEl.offsetLeft,
      top: activeEl.offsetTop + activeEl.offsetHeight - 2,
      width: activeEl.offsetWidth,
    });
  }, [activeTab]);

  useLayoutEffect(() => {
    measureActiveTabBar();
  }, [
    measureActiveTabBar,
    activeNotes.length,
    totalGalleryCount,
    trashedNotes.length,
    uiEmojisEnabled,
    emojiVendor,
    isSearching,
  ]);

  useEffect(() => {
    const listEl = tabListRef.current;
    if (!listEl || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      measureActiveTabBar();
    });
    ro.observe(listEl);
    return () => ro.disconnect();
  }, [measureActiveTabBar]);

  return (
    <motion.section
      aria-label="Note library"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-1 flex-col pb-16"
    >
      {/* Library header row */}
      <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div
          ref={tabListRef}
          className="relative flex flex-wrap items-baseline gap-6"
          role="tablist"
          aria-label="Library sections"
        >
          <button
            ref={notesTabRef}
            type="button"
            role="tab"
            aria-selected={!isSearching && activeTab === 'notes'}
            onClick={() => {
              onChangeTab('notes');
              setConfirmEmptyTrash(false);
            }}
            className="relative inline-flex cursor-pointer items-baseline gap-2 pb-2 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--neuron-accent)]"
          >
            <span
              className={`inline-flex items-center gap-2 text-2xl font-bold tracking-[-0.025em] transition-colors ${
                activeTab === 'notes' || isSearching
                  ? 'text-[var(--neuron-text)]'
                  : 'opacity-45 text-[var(--neuron-text)] hover:opacity-75'
              }`}
            >
              <UiEmoji emoji="📚" enabled={uiEmojisEnabled} vendor={emojiVendor} className="text-[0.85em]" />
              <span>library</span>
            </span>
            <span
              className="text-xs font-medium tabular-nums"
              style={{
                color:
                  !isSearching && activeTab === 'notes'
                    ? 'var(--neuron-accent)'
                    : 'var(--neuron-muted)',
              }}
            >
              {activeNotes.length}
            </span>
          </button>

          <button
            ref={galleryTabRef}
            type="button"
            role="tab"
            aria-selected={!isSearching && activeTab === 'gallery'}
            onClick={() => {
              onChangeTab('gallery');
              setQuery('');
              setConfirmClear(false);
              setConfirmEmptyTrash(false);
            }}
            data-testid="gallery-tab-btn"
            className="relative inline-flex cursor-pointer items-baseline gap-2 pb-2 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--neuron-accent)]"
          >
            <span
              className={`inline-flex items-center gap-2 text-2xl font-bold tracking-[-0.025em] transition-colors ${
                !isSearching && activeTab === 'gallery'
                  ? 'text-[var(--neuron-text)]'
                  : 'opacity-45 text-[var(--neuron-text)] hover:opacity-75'
              }`}
            >
              <UiEmoji emoji="🖼️" enabled={uiEmojisEnabled} vendor={emojiVendor} className="text-[0.85em]" />
              <span>gallery</span>
            </span>
            <span
              className="text-xs font-medium tabular-nums"
              style={{
                color:
                  !isSearching && activeTab === 'gallery' && totalGalleryCount > 0
                    ? 'var(--neuron-accent)'
                    : totalGalleryCount > 0
                      ? 'var(--neuron-accent)'
                      : 'var(--neuron-muted)',
              }}
            >
              {totalGalleryCount}
            </span>
          </button>

          <button
            ref={trashTabRef}
            type="button"
            role="tab"
            aria-selected={!isSearching && activeTab === 'trash'}
            onClick={() => {
              onChangeTab('trash');
              setQuery('');
              setConfirmClear(false);
            }}
            data-testid="trash-tab-btn"
            className="relative inline-flex cursor-pointer items-baseline gap-2 pb-2 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--neuron-accent)]"
          >
            <span
              className={`inline-flex items-center gap-2 text-2xl font-bold tracking-[-0.025em] transition-colors ${
                !isSearching && activeTab === 'trash'
                  ? 'text-[var(--neuron-text)]'
                  : 'opacity-45 text-[var(--neuron-text)] hover:opacity-75'
              }`}
            >
              <UiEmoji emoji="🗑️" enabled={uiEmojisEnabled} vendor={emojiVendor} className="text-[0.85em]" />
              <span>trash</span>
            </span>
            <span
              className="text-xs font-medium tabular-nums"
              style={{ color: trashedNotes.length > 0 ? 'var(--neuron-accent)' : 'var(--neuron-muted)' }}
            >
              {trashedNotes.length}
            </span>
          </button>

          {!isSearching && tabIndicator && (
            <motion.span
              aria-hidden="true"
              data-testid="library-active-tab-bar"
              initial={false}
              animate={{
                x: tabIndicator.left,
                y: tabIndicator.top,
                width: tabIndicator.width,
              }}
              transition={{ type: 'spring', stiffness: 460, damping: 34 }}
              className="pointer-events-none absolute top-0 left-0 h-[2px] rounded-full"
              style={{ backgroundColor: 'var(--neuron-accent)' }}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={onNewNote}
            className="neuron-btn-pop inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-[var(--neuron-text)] transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
            style={{
              backgroundColor: 'var(--neuron-surface)',
              borderColor: 'var(--neuron-accent)',
            }}
          >
            <Plus className="h-3.5 w-3.5" style={{ color: 'var(--neuron-accent)' }} aria-hidden="true" />
            <span>new note</span>
          </motion.button>

          {activeTab === 'trash' && !isSearching ? (
            trashedNotes.length > 0 && (
              !confirmEmptyTrash ? (
                <button
                  type="button"
                  onClick={() => setConfirmEmptyTrash(true)}
                  className="cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--neuron-surface)] hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                  style={{ color: 'var(--neuron-muted)' }}
                >
                  empty trash
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs" style={{ borderColor: 'var(--neuron-border)', backgroundColor: 'var(--neuron-surface)' }}>
                  <button
                    type="button"
                    onClick={() => {
                      onEmptyTrash();
                      setConfirmEmptyTrash(false);
                    }}
                    className="cursor-pointer font-medium hover:underline underline-offset-4 whitespace-nowrap shrink-0"
                    style={{ color: 'var(--neuron-accent)' }}
                  >
                    confirm empty
                  </button>
                  <span style={{ color: 'var(--neuron-border)' }} aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => setConfirmEmptyTrash(false)}
                    className="cursor-pointer hover:text-[var(--neuron-text)] whitespace-nowrap shrink-0"
                    style={{ color: 'var(--neuron-muted)' }}
                  >
                    cancel
                  </button>
                </span>
              )
            )
          ) : (activeTab === 'notes' || isSearching) && activeNotes.length > 0 ? (
            !confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--neuron-surface)] hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                style={{ color: 'var(--neuron-muted)' }}
              >
                clear all
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs" style={{ borderColor: 'var(--neuron-border)', backgroundColor: 'var(--neuron-surface)' }}>
                <button
                  type="button"
                  onClick={() => {
                    onClearAllNotes();
                    setConfirmClear(false);
                  }}
                  className="cursor-pointer font-medium hover:underline underline-offset-4 whitespace-nowrap shrink-0"
                  style={{ color: 'var(--neuron-accent)' }}
                >
                  move all to trash
                </button>
                <span style={{ color: 'var(--neuron-border)' }} aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="cursor-pointer hover:text-[var(--neuron-text)] whitespace-nowrap shrink-0"
                  style={{ color: 'var(--neuron-muted)' }}
                >
                  cancel
                </button>
              </span>
            )
          ) : null}

          <button
            type="button"
            onClick={onBack}
            aria-label="Back to editor"
            title="Back to editor"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--neuron-surface)] hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
            style={{ color: 'var(--neuron-muted)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>back</span>
          </button>
        </div>
      </div>

      {/* Universal search bar */}
      <div
        className="mb-6 flex items-center gap-2.5 border-b border-[var(--neuron-border)] pb-3 transition-colors focus-within:border-[var(--neuron-accent)]"
      >
        {uiEmojisEnabled ? (
          <UiEmoji emoji="🔍" enabled={uiEmojisEnabled} vendor={emojiVendor} className="text-base" />
        ) : (
          <Search className="h-4 w-4 shrink-0" style={{ color: 'var(--neuron-muted)' }} aria-hidden="true" />
        )}
        <label htmlFor="library-search" className="sr-only">
          Universal search across all files
        </label>
        <input
          id="library-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search across all files (including trash)..."
          className="w-full bg-transparent text-sm sm:text-base text-[var(--neuron-text)] placeholder:opacity-50 focus:outline-none"
          style={{ color: 'var(--neuron-text)' }}
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery('')}
            data-testid="clear-search-btn"
            aria-label="Clear search"
            className="neuron-btn-pop cursor-pointer rounded p-1 hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
            style={{ color: 'var(--neuron-muted)' }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        {isSearching && (
          <span
            className="shrink-0 text-xs tabular-nums whitespace-nowrap"
            style={{ color: 'var(--neuron-muted)' }}
          >
            {searchResults.length} {searchResults.length === 1 ? 'file' : 'files'}
          </span>
        )}
      </div>

      {/* Universal Search Results Mode */}
      {isSearching ? (
        searchResults.length === 0 ? (
          <div
            className="flex flex-col items-start gap-3 rounded-xl border border-dashed px-6 py-10"
            style={{
              borderColor: 'var(--neuron-border)',
              backgroundColor: 'var(--neuron-surface)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--neuron-text)' }}>
              no files contain "{query}".
            </p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="cursor-pointer rounded-md border px-3 py-1 text-xs font-medium transition-colors hover:border-[var(--neuron-accent)]"
              style={{
                borderColor: 'var(--neuron-border)',
                color: 'var(--neuron-muted)',
              }}
            >
              clear search
            </button>
          </div>
        ) : (
          <ul
            data-testid="universal-search-results"
            className="divide-y divide-[var(--neuron-border)]"
          >
            {searchResults.map(({ note, matchCount, matchLines }, idx) => {
              const title = getNoteTitle(note.content, note.title);
              const trashed = isNoteTrashed(note);
              const isCurrent = note.id === activeNoteId && !trashed;
              const isEditing = editingNoteId === note.id;

              return (
                <motion.li
                  key={note.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.16,
                    delay: Math.min(idx * 0.015, 0.08),
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="group -mx-2.5 flex items-start justify-between gap-4 rounded-lg px-2.5 py-4 transition-colors hover:bg-[var(--neuron-surface)]/55"
                >
                  {isEditing ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        commitNoteRename(note.id);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2"
                    >
                      <input
                        type="text"
                        autoFocus
                        aria-label="Rename note title"
                        data-testid={`rename-input-${note.id}`}
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            cancelNoteRename();
                          }
                        }}
                        className="min-w-0 flex-1 rounded border bg-transparent px-2.5 py-1 text-base font-medium text-[var(--neuron-text)] focus:outline-none"
                        style={{
                          backgroundColor: 'var(--neuron-surface)',
                          borderColor: 'var(--neuron-accent)',
                        }}
                      />
                      <button
                        type="submit"
                        aria-label="Save note title"
                        data-testid={`rename-save-${note.id}`}
                        className="neuron-btn-pop cursor-pointer rounded p-1.5"
                        style={{ color: 'var(--neuron-accent)' }}
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel rename"
                        onClick={cancelNoteRename}
                        className="neuron-btn-pop cursor-pointer rounded p-1.5"
                        style={{ color: 'var(--neuron-muted)' }}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (trashed) {
                          onRestoreNote(note.id);
                        }
                        onSelectNote(note.id);
                      }}
                      className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--neuron-accent)]"
                    >
                      <span className="inline-flex max-w-full items-center gap-2 text-lg font-medium tracking-[-0.015em] text-[var(--neuron-text)] transition-opacity group-hover:opacity-75">
                        {isNoteLocked(note) && (
                          <Lock
                            className="h-3.5 w-3.5 shrink-0"
                            style={{ color: 'var(--neuron-accent)' }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate">
                          {renderHighlightedText(title, query, emojiVendor)}
                        </span>
                      </span>

                      <div className="flex w-full flex-col gap-1">
                        {isNoteLocked(note) && !unlockedNoteIds.has(note.id) ? (
                          <span className="text-xs italic" style={{ color: 'var(--neuron-muted)' }}>
                            locked note · contents hidden until unlocked
                          </span>
                        ) : (
                          matchLines.map((ml) => (
                          <span
                            key={`${note.id}-L${ml.lineNumber}`}
                            className="line-clamp-1 max-w-full text-sm"
                            style={{ color: 'var(--neuron-muted)' }}
                          >
                            <span
                              className="mr-2 text-xs tabular-nums opacity-70"
                              style={{ color: 'var(--neuron-accent)' }}
                            >
                              L{ml.lineNumber}
                            </span>
                            {renderHighlightedText(ml.text, query, emojiVendor)}
                          </span>
                        )))}
                      </div>

                      <span
                        className="mt-0.5 flex flex-wrap items-center gap-2 text-xs tabular-nums"
                        style={{ color: 'var(--neuron-muted)' }}
                      >
                        <span style={{ color: 'var(--neuron-accent)' }}>
                          {matchCount} {matchCount === 1 ? 'match' : 'matches'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatRelativeTime(note.updatedAt)}</span>
                        {trashed && typeof note.deletedAt === 'number' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span style={{ color: 'var(--neuron-accent)' }}>
                              in trash ({formatTrashDaysRemaining(note.deletedAt)})
                            </span>
                          </>
                        )}
                        {isCurrent && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[var(--neuron-text)]">open</span>
                          </>
                        )}
                      </span>
                    </button>
                  )}

                  <div className="flex shrink-0 items-center gap-1 pt-1">
                    {!trashed && !isEditing && (
                      <button
                        type="button"
                        data-testid={`rename-note-${note.id}`}
                        aria-label={`Rename '${title}'`}
                        title="Rename note"
                        onClick={() => startEditingNote(note)}
                        className="neuron-btn-pop cursor-pointer rounded p-2 hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                        style={{ color: 'var(--neuron-muted)' }}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    {trashed ? (
                      <button
                        type="button"
                        aria-label={`Restore '${title}'`}
                        onClick={() => onRestoreNote(note.id)}
                        className="neuron-btn-pop cursor-pointer rounded p-2 hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                        style={{ color: 'var(--neuron-accent)' }}
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Move '${title}' to trash`}
                        onClick={() => onDeleteNote(note.id)}
                        className="neuron-btn-pop cursor-pointer rounded p-2 hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                        style={{ color: 'var(--neuron-muted)' }}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )
      ) : activeTab === 'gallery' ? (
        /* App-Wide Gallery showing photos & (P) canvas drawings currently used in notes */
        <div className="flex flex-col gap-5" data-testid="gallery-view">
          {totalGalleryCount === 0 ? (
            <div
              className="flex flex-col items-start gap-2.5 rounded-xl border border-dashed px-6 py-10"
              style={{
                borderColor: 'var(--neuron-border)',
                backgroundColor: 'var(--neuron-surface)',
              }}
            >
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--neuron-text)]">
                {uiEmojisEnabled ? (
                  <UiEmoji emoji="🖼️" enabled={uiEmojisEnabled} vendor={emojiVendor} />
                ) : (
                  <ImageIcon className="h-4 w-4" style={{ color: 'var(--neuron-accent)' }} aria-hidden="true" />
                )}
                <span>no photos or canvases in notes yet.</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--neuron-muted)' }}>
                paste an image or type <code className="text-[var(--neuron-text)]">(P)</code> in any note — drawings and photos appear here automatically.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs" style={{ color: 'var(--neuron-muted)' }}>
                  photos and canvases across your active notes — click any card to inspect or jump to its note
                </p>
                <span className="text-[11px] tabular-nums" style={{ color: 'var(--neuron-muted)' }}>
                  {canvasEntries.length} {canvasEntries.length === 1 ? 'canvas' : 'canvases'} · {galleryEntries.length}{' '}
                  {galleryEntries.length === 1 ? 'photo' : 'photos'}
                </span>
              </div>
              <motion.div
                layout
                data-testid="gallery-grid"
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                <AnimatePresence>
                  {canvasEntries.map((entry, idx) => (
                    <motion.article
                      key={`canvas-${entry.id}`}
                      layout="position"
                      initial={{ opacity: 0, y: 10, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{
                        type: 'spring',
                        stiffness: 340,
                        damping: 28,
                        delay: Math.min(idx * 0.03, 0.15),
                      }}
                      data-testid={`gallery-canvas-card-${entry.noteId}-${entry.lineIndex}`}
                      className="group flex flex-col overflow-hidden rounded-lg border transition-colors hover:border-[var(--neuron-accent)]/55"
                      style={{
                        backgroundColor: 'var(--neuron-surface)',
                        borderColor: 'var(--neuron-border)',
                      }}
                    >
                      <button
                        type="button"
                        aria-label={`Open canvas in ${entry.noteTitle}`}
                        onClick={() => onSelectNote(entry.noteId, entry.lineIndex + 1)}
                        className="relative flex h-44 w-full cursor-pointer items-center justify-center overflow-hidden border-b p-3 focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                        style={{
                          borderColor: 'var(--neuron-border)',
                          backgroundColor: 'var(--neuron-bg)',
                          backgroundImage:
                            'linear-gradient(45deg, rgba(128,128,128,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(128,128,128,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(128,128,128,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(128,128,128,0.08) 75%)',
                          backgroundSize: '16px 16px',
                          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
                        }}
                      >
                        <div className="h-36 w-36 transition-transform duration-300 ease-out group-hover:scale-[1.04]">
                          <CanvasThumbnail data={entry.data} />
                        </div>
                        <span
                          className="absolute right-2.5 bottom-2 rounded border px-1.5 py-0.5 text-[10px] tabular-nums opacity-80"
                          style={{
                            backgroundColor: 'var(--neuron-surface)',
                            borderColor: 'var(--neuron-border)',
                            color: 'var(--neuron-muted)',
                          }}
                        >
                          {entry.data.size}×{entry.data.size}
                        </span>
                      </button>

                      <div className="flex flex-1 flex-col justify-between gap-3 p-3.5">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-[var(--neuron-text)]">
                                canvas
                              </p>
                              <p
                                className="text-xs tabular-nums"
                                style={{ color: 'var(--neuron-muted)' }}
                              >
                                {entry.data.size}×{entry.data.size} · {entry.filledPixels} px
                              </p>
                            </div>

                            <button
                              type="button"
                              aria-label="Download canvas as PNG"
                              title="Download PNG"
                              onClick={() => downloadCanvasEntryAsPng(entry)}
                              className="cursor-pointer rounded p-1 transition-colors hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                              style={{ color: 'var(--neuron-muted)' }}
                            >
                              <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>

                          <div className="flex flex-col gap-1">
                            <span
                              className="text-[11px] font-medium uppercase tracking-wider"
                              style={{ color: 'var(--neuron-muted)' }}
                            >
                              in note
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => onSelectNote(entry.noteId, entry.lineIndex + 1)}
                                title={`Open note: ${entry.noteTitle}`}
                                className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded border px-2 py-0.5 text-xs transition-colors hover:border-[var(--neuron-accent)] hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                                style={{
                                  borderColor: 'var(--neuron-accent)',
                                  color: 'var(--neuron-text)',
                                }}
                              >
                                <span className="max-w-[11rem] truncate">
                                  {entry.noteTitle}
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onSelectNote(entry.noteId, entry.lineIndex + 1)}
                          className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-[var(--neuron-accent)] hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                          style={{
                            borderColor: 'var(--neuron-border)',
                            color: 'var(--neuron-muted)',
                          }}
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" style={{ color: 'var(--neuron-accent)' }} aria-hidden="true" />
                          <span>open in note</span>
                        </button>
                      </div>
                    </motion.article>
                  ))}

                  {galleryEntries.map((entry, idx) => {
                  const { image, usages } = entry;
                  const summary =
                    usages.length === 0
                      ? 'not linked in any note'
                      : `used in ${usages.length} ${usages.length === 1 ? 'note' : 'notes'}`;

                  return (
                    <motion.article
                      key={image.id}
                      layout="position"
                      initial={{ opacity: 0, y: 10, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{
                        type: 'spring',
                        stiffness: 340,
                        damping: 28,
                        delay: Math.min(idx * 0.03, 0.15),
                      }}
                      data-testid={`gallery-card-${image.id}`}
                      className="group flex flex-col overflow-hidden rounded-lg border transition-colors hover:border-[var(--neuron-accent)]/55"
                      style={{
                        backgroundColor: 'var(--neuron-surface)',
                        borderColor: 'var(--neuron-border)',
                      }}
                    >
                      <button
                        type="button"
                        aria-label={`Inspect ${image.name}`}
                        onClick={() => setLightboxEntry({ image, summary })}
                        className="relative block h-44 w-full cursor-zoom-in overflow-hidden border-b focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                        style={{
                          borderColor: 'var(--neuron-border)',
                          backgroundColor: 'var(--neuron-bg)',
                        }}
                      >
                        <img
                          src={image.dataUrl}
                          alt={image.name}
                          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
                        />
                        <span
                          className="pointer-events-none absolute right-2.5 bottom-2 rounded border px-1.5 py-0.5 text-[10px] opacity-0 transition-opacity duration-150 group-hover:opacity-90"
                          style={{
                            backgroundColor: 'var(--neuron-surface)',
                            borderColor: 'var(--neuron-border)',
                            color: 'var(--neuron-text)',
                          }}
                        >
                          inspect & draw
                        </span>
                      </button>

                      <div className="flex flex-1 flex-col justify-between gap-3 p-3.5">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-[var(--neuron-text)]">
                                {image.name}
                              </p>
                              <p
                                className="text-xs tabular-nums"
                                style={{ color: 'var(--neuron-muted)' }}
                              >
                                {image.width > 0 && image.height > 0
                                  ? `${image.width}×${image.height} · `
                                  : ''}
                                {formatBytes(image.sizeBytes)}
                              </p>
                            </div>

                            <button
                              type="button"
                              aria-label={`Delete image ${image.name} everywhere`}
                              onClick={() => onDeleteImage(image.id)}
                              className="cursor-pointer rounded p-1 transition-colors hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                              style={{ color: 'var(--neuron-muted)' }}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>

                          {/* Exact list of notes using this image */}
                          <div className="flex flex-col gap-1">
                            <span
                              className="text-[11px] font-medium uppercase tracking-wider"
                              style={{ color: 'var(--neuron-muted)' }}
                            >
                              {usages.length > 0 ? 'used in' : 'location'}
                            </span>

                            {usages.length === 0 ? (
                              <span
                                className="text-xs italic"
                                style={{ color: 'var(--neuron-muted)' }}
                              >
                                not currently in any note
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {usages.map((usage) => (
                                  <button
                                    key={usage.noteId}
                                    type="button"
                                    onClick={() => {
                                      if (usage.trashed) {
                                        onChangeTab('trash');
                                      } else {
                                        onSelectNote(usage.noteId);
                                      }
                                    }}
                                    title={
                                      usage.trashed
                                        ? `In trash: ${usage.noteTitle}`
                                        : `Open note: ${usage.noteTitle}`
                                    }
                                    className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded border px-2 py-0.5 text-xs transition-colors hover:border-[var(--neuron-accent)] hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                                    style={{
                                      borderColor: usage.trashed
                                        ? 'var(--neuron-border)'
                                        : 'var(--neuron-accent)',
                                      color: usage.trashed
                                        ? 'var(--neuron-muted)'
                                        : 'var(--neuron-text)',
                                    }}
                                  >
                                    <span className="max-w-[11rem] truncate">
                                      {usage.trashed ? `trash · ${usage.noteTitle}` : usage.noteTitle}
                                    </span>
                                    {usage.count > 1 && (
                                      <span
                                        className="text-[10px] tabular-nums"
                                        style={{ color: 'var(--neuron-accent)' }}
                                      >
                                        ×{usage.count}
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onInsertImageToActiveNote(image)}
                          className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-[var(--neuron-accent)] hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                          style={{
                            borderColor: 'var(--neuron-border)',
                            color: 'var(--neuron-muted)',
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" style={{ color: 'var(--neuron-accent)' }} aria-hidden="true" />
                          <span>insert in active note</span>
                        </button>
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </motion.div>
            </>
          )}
        </div>
      ) : activeTab === 'trash' ? (
        /* 7-Day Trash Can View */
        trashedNotes.length === 0 ? (
          <div
            className="flex flex-col items-start gap-2.5 rounded-xl border border-dashed px-6 py-10"
            style={{
              borderColor: 'var(--neuron-border)',
              backgroundColor: 'var(--neuron-surface)',
            }}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--neuron-text)]">
              {uiEmojisEnabled ? (
                <UiEmoji emoji="🗑️" enabled={uiEmojisEnabled} vendor={emojiVendor} />
              ) : (
                <Trash2 className="h-4 w-4" style={{ color: 'var(--neuron-accent)' }} aria-hidden="true" />
              )}
              <span>trash is empty.</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--neuron-muted)' }}>
              deleted notes rest here for 7 days before permanent removal.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            <p
              className="mb-3 text-xs"
              style={{ color: 'var(--neuron-muted)' }}
            >
              deleted notes stay in trash for 7 days before disappearing forever.
            </p>
            <ul
              data-testid="trash-list"
              className="divide-y divide-[var(--neuron-border)]"
            >
              {trashedNotes.map((note, idx) => {
                const title = getNoteTitle(note.content, note.title);
                const snippet = getNoteSnippet(note.content);
                const words = countWords(note.content);
                const deletedAt = note.deletedAt ?? Date.now();

                return (
                  <motion.li
                    key={note.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.16,
                      delay: Math.min(idx * 0.015, 0.08),
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="group -mx-2.5 flex items-start justify-between gap-4 rounded-lg px-2.5 py-4 transition-colors hover:bg-[var(--neuron-surface)]/55"
                  >
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                      <span className="max-w-full truncate text-lg font-medium tracking-[-0.015em] text-[var(--neuron-text)] opacity-85">
                        <EmojiText text={title} vendor={emojiVendor} />
                      </span>
                      {snippet && (
                        <span
                          className="line-clamp-1 max-w-full text-sm"
                          style={{ color: 'var(--neuron-muted)' }}
                        >
                          <EmojiText text={snippet} vendor={emojiVendor} />
                        </span>
                      )}
                      <span
                        className="mt-1 flex flex-wrap items-center gap-2 text-xs tabular-nums"
                        style={{ color: 'var(--neuron-muted)' }}
                      >
                        <span style={{ color: 'var(--neuron-accent)' }}>
                          {formatTrashDaysRemaining(deletedAt)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>deleted {formatRelativeTime(deletedAt)}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {words} {words === 1 ? 'word' : 'words'}
                        </span>
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        aria-label={`Restore '${title}'`}
                        title="Restore note"
                        onClick={() => onRestoreNote(note.id)}
                        className="neuron-btn-pop inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:border-[var(--neuron-accent)] hover:bg-[var(--neuron-surface)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                        style={{
                          borderColor: 'var(--neuron-border)',
                          color: 'var(--neuron-accent)',
                        }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>restore</span>
                      </button>

                      <button
                        type="button"
                        aria-label={`Delete '${title}' forever`}
                        title="Delete forever"
                        onClick={() => onPermanentDeleteNote(note.id)}
                        className="neuron-btn-pop cursor-pointer rounded-md p-2 opacity-65 transition-all hover:bg-[var(--neuron-surface)] hover:text-[var(--neuron-accent)] hover:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                        style={{ color: 'var(--neuron-muted)' }}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        )
      ) : activeNotes.length === 0 ? (
        <div
          className="flex flex-col items-start gap-2.5 rounded-xl border border-dashed px-6 py-10"
          style={{
            borderColor: 'var(--neuron-border)',
            backgroundColor: 'var(--neuron-surface)',
          }}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--neuron-text)]">
            {uiEmojisEnabled ? (
              <UiEmoji emoji="📚" enabled={uiEmojisEnabled} vendor={emojiVendor} />
            ) : (
              <FileText className="h-4 w-4" style={{ color: 'var(--neuron-accent)' }} aria-hidden="true" />
            )}
            <span>no notes yet.</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--neuron-muted)' }}>
            create a new note to start writing.
          </p>
        </div>
      ) : (
        <ul
          data-testid="active-notes-list"
          className="divide-y divide-[var(--neuron-border)]"
        >
          {activeNotes.map((note, idx) => {
            const title = getNoteTitle(note.content, note.title);
            const hasLock = isNoteLocked(note);
            const isLockedClosed = hasLock && !unlockedNoteIds.has(note.id);
            const snippet = isLockedClosed ? '' : getNoteSnippet(note.content);
            const words = countWords(note.content);
            const isCurrent = note.id === activeNoteId;
            const isEditing = editingNoteId === note.id;

            return (
              <motion.li
                key={note.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.16,
                  delay: Math.min(idx * 0.015, 0.08),
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="group -mx-2.5 flex items-start justify-between gap-4 rounded-lg px-2.5 py-4 transition-colors hover:bg-[var(--neuron-surface)]/55"
              >
                {isEditing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      commitNoteRename(note.id);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2"
                  >
                    <input
                      type="text"
                      autoFocus
                      aria-label="Rename note title"
                      data-testid={`rename-input-${note.id}`}
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          cancelNoteRename();
                        }
                      }}
                      className="min-w-0 flex-1 rounded border bg-transparent px-2.5 py-1 text-base font-medium text-[var(--neuron-text)] focus:outline-none"
                      style={{
                        backgroundColor: 'var(--neuron-surface)',
                        borderColor: 'var(--neuron-accent)',
                      }}
                    />
                    <button
                      type="submit"
                      aria-label="Save note title"
                      data-testid={`rename-save-${note.id}`}
                      className="neuron-btn-pop cursor-pointer rounded p-1.5"
                      style={{ color: 'var(--neuron-accent)' }}
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Cancel rename"
                      onClick={cancelNoteRename}
                      className="neuron-btn-pop cursor-pointer rounded p-1.5"
                      style={{ color: 'var(--neuron-muted)' }}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectNote(note.id)}
                    className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-1 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--neuron-accent)]"
                  >
                    <span className="inline-flex max-w-full items-center gap-2 text-lg font-medium tracking-[-0.015em] text-[var(--neuron-text)] transition-opacity group-hover:opacity-80">
                      {isCurrent && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: 'var(--neuron-accent)' }}
                          aria-hidden="true"
                        />
                      )}
                      {hasLock && (
                        <Lock
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: 'var(--neuron-accent)' }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="truncate">
                        <EmojiText text={title} vendor={emojiVendor} />
                      </span>
                    </span>

                    {isLockedClosed ? (
                      <span
                        className="line-clamp-1 max-w-full text-sm italic"
                        style={{ color: 'var(--neuron-muted)' }}
                      >
                        locked note · enter password to view
                      </span>
                    ) : (
                      snippet && (
                        <span
                          className="line-clamp-1 max-w-full text-sm"
                          style={{ color: 'var(--neuron-muted)' }}
                        >
                          <EmojiText text={snippet} vendor={emojiVendor} />
                        </span>
                      )
                    )}

                    <span
                      className="mt-1 flex flex-wrap items-center gap-2 text-xs tabular-nums"
                      style={{ color: 'var(--neuron-muted)' }}
                    >
                      <span>{formatRelativeTime(note.updatedAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {words} {words === 1 ? 'word' : 'words'}
                      </span>
                      {note.pinned && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span style={{ color: 'var(--neuron-accent)' }}>pinned</span>
                        </>
                      )}
                      {hasLock && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span style={{ color: 'var(--neuron-accent)' }}>
                            {isLockedClosed ? 'locked' : 'unlocked'}
                          </span>
                        </>
                      )}
                      {isCurrent && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span style={{ color: 'var(--neuron-accent)' }}>open</span>
                        </>
                      )}
                    </span>
                  </button>
                )}

                {/* Row actions */}
                <div className="flex shrink-0 items-center gap-0.5 pt-1 opacity-65 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  {!isEditing && (
                    <button
                      type="button"
                      data-testid={`rename-note-${note.id}`}
                      aria-label={`Rename '${title}'`}
                      title="Rename note"
                      onClick={() => startEditingNote(note)}
                      className="neuron-btn-pop cursor-pointer rounded-md p-2 hover:bg-[var(--neuron-surface)] hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                      style={{ color: 'var(--neuron-muted)' }}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}

                  <button
                    type="button"
                    data-testid={`lock-note-${note.id}`}
                    aria-label={
                      isNoteLocked(note)
                        ? `Manage lock on '${title}'`
                        : `Lock '${title}' with password`
                    }
                    title={isNoteLocked(note) ? 'Manage password lock' : 'Lock with password'}
                    onClick={() => openLockDialog(note)}
                    className="neuron-btn-pop cursor-pointer rounded-md p-2 hover:bg-[var(--neuron-surface)] hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                    style={{
                      color: isNoteLocked(note)
                        ? 'var(--neuron-accent)'
                        : 'var(--neuron-muted)',
                    }}
                  >
                    {isNoteLocked(note) && unlockedNoteIds.has(note.id) ? (
                      <LockOpen className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Lock className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>

                  <button
                    type="button"
                    aria-label={note.pinned ? `Unpin '${title}'` : `Pin '${title}'`}
                    title={note.pinned ? 'Unpin note' : 'Pin note'}
                    aria-pressed={Boolean(note.pinned)}
                    onClick={() => onTogglePin(note.id)}
                    className="neuron-btn-pop cursor-pointer rounded-md p-2 hover:bg-[var(--neuron-surface)] hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                    style={{
                      color: note.pinned ? 'var(--neuron-accent)' : 'var(--neuron-muted)',
                    }}
                  >
                    <Pin className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    aria-label={`Export '${title}'`}
                    title="Export note"
                    onClick={() => onExportNote(note)}
                    className="neuron-btn-pop cursor-pointer rounded-md p-2 hover:bg-[var(--neuron-surface)] hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                    style={{ color: 'var(--neuron-muted)' }}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    aria-label={`Move '${title}' to trash`}
                    title="Move to trash"
                    onClick={() => onDeleteNote(note.id)}
                    className="neuron-btn-pop cursor-pointer rounded-md p-2 hover:bg-[var(--neuron-surface)] hover:text-[var(--neuron-accent)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                    style={{ color: 'var(--neuron-muted)' }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      {/* Password Lock / Manage Modal */}
      <NoteLockModal
        open={Boolean(lockModal)}
        noteTitle={lockModal?.title ?? 'untitled note'}
        isLocked={lockModal?.isLocked ?? false}
        isUnlocked={lockModal ? unlockedNoteIds.has(lockModal.noteId) : false}
        onClose={() => setLockModal(null)}
        onLock={async (password) => {
          if (lockModal) await onLockNote(lockModal.noteId, password);
        }}
        onUnlock={async (password) =>
          lockModal ? onUnlockNote(lockModal.noteId, password) : false
        }
        onRemoveLock={async (password) =>
          lockModal ? onRemoveNoteLock(lockModal.noteId, password) : false
        }
        onRelock={() => {
          if (lockModal) onRelockNote(lockModal.noteId);
        }}
        testIdPrefix="library-lock"
      />

      <ImageLightbox
        image={
          lightboxEntry
            ? (images.find((img) => img.id === lightboxEntry.image.id) ?? lightboxEntry.image)
            : null
        }
        palette={palette}
        usageSummary={lightboxEntry?.summary}
        onSaveImage={onUpdateImage}
        onClose={() => setLightboxEntry(null)}
      />
    </motion.section>
  );
}
