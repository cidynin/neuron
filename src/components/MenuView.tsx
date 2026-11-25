import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ChevronDown,
  Download,
  ExternalLink,
  HelpCircle,
  Link2,
  Lock,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { FONT_OPTIONS, PALETTES, SOUND_OPTIONS } from '../data/palettes';
import {
  LINE_SPACING_OPTIONS,
  PIXEL_CANVAS_SIZE_OPTIONS,
  SCROLLBAR_STYLE_OPTIONS,
  TEXT_SIZE_OPTIONS,
  TEXT_WIDTH_OPTIONS,
  UI_SIZE_OPTIONS,
} from '../data/sizing';
import type {
  ColorPalette,
  CustomSoundPack,
  DocumentInsightsPrefs,
  EmojiVendorId,
  EmojiVendorOption,
  FontId,
  FontOption,
  LineSpacing,
  NeuronPreferences,
  Note,
  PaletteId,
  PixelCanvasSize,
  ScrollbarStyle,
  SoundId,
  SoundVolume,
  TextSize,
  TextWidth,
  UiSize,
} from '../types/neuron';
import { EMOJI_VENDORS } from '../utils/emojiVendor';
import { resolveGoogleFontFromInput } from '../utils/fontLink';
import { isNoteLocked } from '../utils/noteLock';
import {
  countWords,
  formatRelativeTime,
  getActiveNotes,
  getNoteTitle,
  sortNotes,
} from '../utils/notes';
import { resolvePaletteFromInput } from '../utils/paletteLink';
import { readAudioFileAsCustomSound } from '../utils/soundDb';
import { SOUND_VOLUME_OPTIONS, playTypingSound } from '../utils/soundEngine';
import { EmojiGlyph, UiEmoji } from './EmojiGlyph';
import { SmoothCollapse } from './SmoothCollapse';

interface MenuViewProps {
  notes: Note[];
  activeNoteId: string;
  preferences: NeuronPreferences;
  customPalettes: ColorPalette[];
  customFonts: FontOption[];
  customSounds: CustomSoundPack[];
  activeEmojiVendor: EmojiVendorOption;
  onNewNote: () => void;
  onSelectNote: (noteId: string) => void;
  onOpenLibrary: () => void;
  onOpenSearch: () => void;
  onImportNote: (content: string) => void;
  onExportCurrent: () => void;
  onChangeFont: (font: FontId) => void;
  onAddCustomFont: (font: FontOption) => void;
  onRemoveCustomFont: (fontId: FontId) => void;
  onChangeSound: (sound: SoundId) => void;
  onAddCustomSound: (pack: CustomSoundPack) => void;
  onRemoveCustomSound: (soundId: SoundId) => void;
  onChangeSoundVolume: (volume: SoundVolume) => void;
  onChangePalette: (palette: PaletteId) => void;
  onAddCustomPalette: (palette: ColorPalette) => void;
  onRemoveCustomPalette: (paletteId: PaletteId) => void;
  onChangeUiSize: (uiSize: UiSize) => void;
  onChangeTextSize: (textSize: TextSize) => void;
  onChangeLineSpacing: (lineSpacing: LineSpacing) => void;
  onChangeTextWidth: (textWidth: TextWidth) => void;
  onChangeScrollbarStyle: (style: ScrollbarStyle) => void;
  onToggleShowBrandWord: () => void;
  onToggleShowSearchButton: () => void;
  onToggleShowLockButton: () => void;
  customDictionary: string[];
  onToggleDyslexicMode: () => void;
  onToggleSpellcheck: () => void;
  onToggleAutocorrect: () => void;
  onToggleBoxShortcut: () => void;
  onTogglePixelShortcut: () => void;
  onChangePixelCanvasSize: (size: PixelCanvasSize) => void;
  onToggleInsight: (key: keyof DocumentInsightsPrefs) => void;
  onToggleUiEmojis: () => void;
  onAddCustomWord: (word: string) => void;
  onRemoveCustomWord: (word: string) => void;
  onChangeEmojiVendor: (vendorId: EmojiVendorId) => void;
  onCloseMenu: () => void;
}

const INSIGHT_OPTIONS: { key: keyof DocumentInsightsPrefs; label: string }[] = [
  { key: 'wordCount', label: 'word count' },
  { key: 'characterCount', label: 'character count' },
  { key: 'readingCount', label: 'reading count' },
  { key: 'readingTime', label: 'reading time' },
];

const MAX_SOUND_FILE_BYTES = 15 * 1024 * 1024;

const itemTransition = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1] as const,
};

function SectionHeading({ children }: { children: string }) {
  return (
    <h2
      className="text-[11px] font-semibold tracking-[0.12em] uppercase"
      style={{ color: 'var(--neuron-accent)' }}
    >
      {children}
    </h2>
  );
}

export function MenuView({
  notes,
  activeNoteId,
  preferences,
  customPalettes,
  customFonts,
  customSounds,
  activeEmojiVendor,
  onNewNote,
  onSelectNote,
  onOpenLibrary,
  onOpenSearch,
  onImportNote,
  onExportCurrent,
  onChangeFont,
  onAddCustomFont,
  onRemoveCustomFont,
  onChangeSound,
  onAddCustomSound,
  onRemoveCustomSound,
  onChangeSoundVolume,
  onChangePalette,
  onAddCustomPalette,
  onRemoveCustomPalette,
  onChangeUiSize,
  onChangeTextSize,
  onChangeLineSpacing,
  onChangeTextWidth,
  onChangeScrollbarStyle,
  onToggleShowBrandWord,
  onToggleShowSearchButton,
  onToggleShowLockButton,
  customDictionary,
  onToggleDyslexicMode,
  onToggleSpellcheck,
  onToggleAutocorrect,
  onToggleBoxShortcut,
  onTogglePixelShortcut,
  onChangePixelCanvasSize,
  onToggleInsight,
  onToggleUiEmojis,
  onAddCustomWord,
  onRemoveCustomWord,
  onChangeEmojiVendor,
  onCloseMenu,
}: MenuViewProps) {
  const [openDrawer, setOpenDrawer] = useState(false);
  const [showBlocksHelp, setShowBlocksHelp] = useState(false);

  const [fontLinkInput, setFontLinkInput] = useState('');
  const [fontError, setFontError] = useState<string | null>(null);
  const [isImportingFont, setIsImportingFont] = useState(false);

  const [paletteLinkInput, setPaletteLinkInput] = useState('');
  const [paletteError, setPaletteError] = useState<string | null>(null);
  const [isImportingPalette, setIsImportingPalette] = useState(false);

  const [soundUploadError, setSoundUploadError] = useState<string | null>(null);
  const [isUploadingSound, setIsUploadingSound] = useState(false);
  const [showSoundLinkPopup, setShowSoundLinkPopup] = useState(false);

  const [dictWordInput, setDictWordInput] = useState('');
  const [aboutPanel, setAboutPanel] = useState<'support' | 'what' | null>(null);
  const [lastAboutPanel, setLastAboutPanel] = useState<'support' | 'what'>('support');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const soundFileInputRef = useRef<HTMLInputElement | null>(null);
  const activeNotes = sortNotes(getActiveNotes(notes));
  const uiEmojis = preferences.uiEmojisEnabled;

  const allFonts = [...FONT_OPTIONS, ...customFonts];
  const allPalettes = [...PALETTES, ...customPalettes];

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportNote(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSoundFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSoundUploadError(null);
    if (file.size > MAX_SOUND_FILE_BYTES) {
      setSoundUploadError('audio file must be under 15 MB');
      return;
    }
    setIsUploadingSound(true);
    try {
      const pack = await readAudioFileAsCustomSound(file);
      onAddCustomSound(pack);
      playTypingSound(pack.id, 'char', preferences.soundVolume);
    } catch (err) {
      setSoundUploadError(
        err instanceof Error ? err.message : 'could not load audio file',
      );
    } finally {
      setIsUploadingSound(false);
    }
  };

  const applyFontInput = async (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    setFontError(null);
    setIsImportingFont(true);
    try {
      const font = await resolveGoogleFontFromInput(trimmed);
      onAddCustomFont(font);
      setFontLinkInput('');
    } catch (err) {
      setFontError(
        err instanceof Error ? err.message : 'could not load google font',
      );
    } finally {
      setIsImportingFont(false);
    }
  };

  const handleFontLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void applyFontInput(fontLinkInput);
  };

  const applyPaletteInput = async (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    setPaletteError(null);
    setIsImportingPalette(true);
    try {
      const palette = await resolvePaletteFromInput(trimmed);
      onAddCustomPalette(palette);
      setPaletteLinkInput('');
    } catch (err) {
      setPaletteError(
        err instanceof Error ? err.message : 'could not parse palette link',
      );
    } finally {
      setIsImportingPalette(false);
    }
  };

  const handlePaletteLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void applyPaletteInput(paletteLinkInput);
  };

  return (
    <motion.nav
      aria-label="neuron menu"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={itemTransition}
      className="flex flex-1 flex-col justify-between pb-12"
    >
      {/* Primary Navigation: vertical new / open / library */}
      <div className="flex flex-col gap-5 pt-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex w-full max-w-md flex-col items-start gap-2.5">
            <motion.button
              type="button"
              onClick={onNewNote}
              data-testid="menu-new-btn"
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex cursor-pointer items-center gap-2.5 text-left text-[clamp(1.65rem,3vw,2.3rem)] font-bold leading-tight tracking-[-0.025em] text-[var(--neuron-text)] transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--neuron-accent)]"
            >
              <UiEmoji emoji="✨" enabled={uiEmojis} vendor={activeEmojiVendor} className="text-[0.8em]" />
              <span>new</span>
            </motion.button>

            <div className="flex w-full flex-col items-start">
              <motion.button
                type="button"
                onClick={() => setOpenDrawer((prev) => !prev)}
                aria-expanded={openDrawer}
                data-testid="menu-open-btn"
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex cursor-pointer items-center gap-2 text-left text-[clamp(1.65rem,3vw,2.3rem)] font-bold leading-tight tracking-[-0.025em] transition-colors hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--neuron-accent)]"
                style={{ color: openDrawer ? 'var(--neuron-accent)' : 'var(--neuron-text)' }}
              >
                <UiEmoji emoji="📂" enabled={uiEmojis} vendor={activeEmojiVendor} className="self-center text-[0.8em]" />
                <span>open</span>
                <ChevronDown
                  className={`h-4 w-4 self-center transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    openDrawer ? 'rotate-180' : ''
                  }`}
                  style={{ color: openDrawer ? 'var(--neuron-accent)' : 'var(--neuron-muted)' }}
                  aria-hidden="true"
                />
              </motion.button>

              <SmoothCollapse open={openDrawer} className="w-full">
                <div className="pt-2.5 pb-1">
                  <div
                    data-testid="open-notes-drawer"
                    className="rounded-lg border p-2"
                    style={{
                      backgroundColor: 'var(--neuron-surface)',
                      borderColor: 'var(--neuron-border)',
                    }}
                  >
                    {activeNotes.length === 0 ? (
                      <p className="px-2.5 py-2 text-xs" style={{ color: 'var(--neuron-muted)' }}>
                        no notes yet.
                      </p>
                    ) : (
                      <ul className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
                        {activeNotes.map((note) => {
                          const isCurrent = note.id === activeNoteId;
                          const locked = isNoteLocked(note);
                          const title = getNoteTitle(note.content, note.title);
                          const words = countWords(note.content);

                          return (
                            <li key={note.id}>
                              <button
                                type="button"
                                data-testid={`drawer-note-${note.id}`}
                                onClick={() => onSelectNote(note.id)}
                                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[var(--neuron-bg)]"
                                style={{
                                  backgroundColor: isCurrent ? 'var(--neuron-bg)' : undefined,
                                }}
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                                    style={{
                                      backgroundColor: isCurrent
                                        ? 'var(--neuron-accent)'
                                        : 'transparent',
                                    }}
                                    aria-hidden="true"
                                  />
                                  {locked && (
                                    <Lock
                                      className="h-3 w-3 shrink-0"
                                      style={{ color: 'var(--neuron-accent)' }}
                                      aria-label="Password protected"
                                    />
                                  )}
                                  <span
                                    className="truncate text-sm font-medium"
                                    style={{ color: 'var(--neuron-text)' }}
                                  >
                                    {title}
                                  </span>
                                </div>
                                <span
                                  className="shrink-0 text-[11px] tabular-nums"
                                  style={{ color: 'var(--neuron-muted)' }}
                                >
                                  {locked ? 'locked' : `${words}w`} · {formatRelativeTime(note.updatedAt)}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </SmoothCollapse>
            </div>

            <motion.button
              type="button"
              onClick={onOpenLibrary}
              data-testid="menu-library-btn"
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex cursor-pointer items-baseline gap-2.5 text-left text-[clamp(1.65rem,3vw,2.3rem)] font-bold leading-tight tracking-[-0.025em] text-[var(--neuron-text)] transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--neuron-accent)]"
            >
              <UiEmoji emoji="📚" enabled={uiEmojis} vendor={activeEmojiVendor} className="self-center text-[0.8em]" />
              <span>library</span>
              <span
                className="text-xs font-normal tracking-normal tabular-nums"
                style={{ color: 'var(--neuron-muted)' }}
              >
                {activeNotes.length}
              </span>
            </motion.button>
          </div>

          <button
            type="button"
            onClick={onCloseMenu}
            aria-label="Back to editor"
            data-testid="back-to-editor-btn"
            className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-sm transition-colors hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
            style={{ color: 'var(--neuron-muted)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>back to editor</span>
          </button>
        </div>

        {/* Quiet utility bar: Import, Export, Universal Search */}
        <div
          className="flex flex-wrap items-center gap-2.5"
          role="group"
          aria-label="Quick tools"
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="neuron-btn-pop inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
            style={{
              backgroundColor: 'var(--neuron-surface)',
              borderColor: 'var(--neuron-border)',
              color: 'var(--neuron-muted)',
            }}
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span>import .txt / .md</span>
          </button>

          <button
            type="button"
            onClick={onExportCurrent}
            className="neuron-btn-pop inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
            style={{
              backgroundColor: 'var(--neuron-surface)',
              borderColor: 'var(--neuron-border)',
              color: 'var(--neuron-muted)',
            }}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>export current</span>
          </button>

          <button
            type="button"
            onClick={onOpenSearch}
            data-testid="menu-open-search-btn"
            className="neuron-btn-pop inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
            style={{
              backgroundColor: 'var(--neuron-surface)',
              borderColor: 'var(--neuron-border)',
              color: 'var(--neuron-muted)',
            }}
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span>search notes</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown,text/plain,text/markdown"
            onChange={handleFileImport}
            className="hidden"
            aria-label="Import text or markdown file"
          />
        </div>
      </div>

      {/* Categorized Settings Sections */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...itemTransition, delay: 0.04 }}
        className="mt-10 flex flex-col gap-9"
      >
        {/* SECTION 1: APPEARANCE */}
        <section
          aria-label="Appearance settings"
          data-testid="settings-section-appearance"
          className="flex flex-col gap-6 border-t pt-6"
          style={{ borderColor: 'var(--neuron-border)' }}
        >
          <SectionHeading>appearance</SectionHeading>

          {/* Palette */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-8">
            <span
              className="inline-flex w-28 shrink-0 items-center gap-1.5 pt-1 text-xs font-medium tracking-wide"
              style={{ color: 'var(--neuron-muted)' }}
            >
              <UiEmoji emoji="🎨" enabled={uiEmojis} vendor={activeEmojiVendor} />
              <span>palette</span>
            </span>
            <div className="flex flex-1 flex-col gap-3">
              <div
                className="grid grid-cols-3 gap-2.5 sm:flex sm:flex-wrap sm:items-center sm:gap-3"
                role="group"
                aria-label="Color palette"
              >
                {allPalettes.map((palette) => {
                  const active = preferences.palette === palette.id;
                  return (
                    <div key={palette.id} className="relative">
                      <button
                        type="button"
                        aria-label={`Palette: ${palette.name}`}
                        aria-pressed={active}
                        title={palette.name}
                        onClick={() => onChangePalette(palette.id)}
                        className="neuron-btn-pop group flex w-full min-w-0 cursor-pointer flex-col items-start gap-1.5 rounded-md border p-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)]"
                        style={{
                          backgroundColor: active ? 'var(--neuron-surface)' : 'transparent',
                          borderColor: active ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                          boxShadow: active
                            ? 'inset 0 0 0 0.5px var(--neuron-accent)'
                            : undefined,
                        }}
                      >
                        <span
                          className="grid h-3.5 w-full min-w-[4rem] sm:w-16 overflow-hidden rounded-[2px] border"
                          style={{
                            borderColor: 'var(--neuron-border)',
                            gridTemplateColumns: `repeat(${palette.swatches.length}, minmax(0, 1fr))`,
                          }}
                        >
                          {palette.swatches.map((hex, idx) => (
                            <span key={idx} style={{ backgroundColor: hex }} />
                          ))}
                        </span>
                        <span
                          className="w-full truncate pr-3 text-[11px] leading-tight whitespace-nowrap"
                          style={{ color: active ? 'var(--neuron-text)' : 'var(--neuron-muted)' }}
                        >
                          {palette.name}
                        </span>
                      </button>

                      {palette.isCustom && (
                        <button
                          type="button"
                          aria-label={`Remove palette ${palette.name}`}
                          onClick={() => onRemoveCustomPalette(palette.id)}
                          className="absolute right-1 bottom-1 cursor-pointer rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
                          style={{ color: 'var(--neuron-muted)' }}
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <form
                  onSubmit={handlePaletteLinkSubmit}
                  className="flex min-w-[15rem] max-w-md flex-1 items-center gap-2 rounded-md border px-3 py-1.5"
                  style={{
                    backgroundColor: 'var(--neuron-surface)',
                    borderColor: 'var(--neuron-border)',
                  }}
                >
                  <Link2
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: 'var(--neuron-muted)' }}
                    aria-hidden="true"
                  />
                  <label htmlFor="palette-link-input" className="sr-only">
                    Paste palette link
                  </label>
                  <input
                    id="palette-link-input"
                    type="text"
                    value={paletteLinkInput}
                    onChange={(e) => {
                      setPaletteLinkInput(e.target.value);
                      if (paletteError) setPaletteError(null);
                    }}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData('text');
                      if (
                        pasted &&
                        (pasted.includes('lospec') ||
                          pasted.includes('coolors') ||
                          pasted.includes('colorhunt'))
                      ) {
                        e.preventDefault();
                        setPaletteLinkInput(pasted);
                        void applyPaletteInput(pasted);
                      }
                    }}
                    placeholder="paste lospec, coolors, or hex link..."
                    className="min-w-0 flex-1 bg-transparent text-xs text-[var(--neuron-text)] placeholder:opacity-55 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isImportingPalette || !paletteLinkInput.trim()}
                    className="cursor-pointer text-xs font-medium transition-opacity disabled:cursor-default disabled:opacity-40 hover:opacity-80 whitespace-nowrap shrink-0"
                    style={{ color: 'var(--neuron-accent)' }}
                  >
                    {isImportingPalette ? 'loading' : 'apply'}
                  </button>
                </form>

                <a
                  href="https://lospec.com/palette-list"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="open-lospec-btn"
                  aria-label="Open Lospec palettes"
                  className="neuron-btn-pop inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:border-[var(--neuron-accent)] hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: 'var(--neuron-surface)',
                    borderColor: 'var(--neuron-border)',
                    color: 'var(--neuron-muted)',
                  }}
                >
                  <span>lospec</span>
                  <ExternalLink className="h-3 w-3 opacity-75" aria-hidden="true" />
                </a>

                <a
                  href="https://coolors.co/palettes/trending"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="open-coolors-btn"
                  aria-label="Open Coolors palettes"
                  className="neuron-btn-pop inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:border-[var(--neuron-accent)] hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: 'var(--neuron-surface)',
                    borderColor: 'var(--neuron-border)',
                    color: 'var(--neuron-muted)',
                  }}
                >
                  <span>coolors</span>
                  <ExternalLink className="h-3 w-3 opacity-75" aria-hidden="true" />
                </a>
              </div>

              {paletteError && (
                <p className="text-xs" style={{ color: 'var(--neuron-accent)' }} role="alert">
                  {paletteError}
                </p>
              )}
            </div>
          </div>

          {/* UI Size */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-baseline sm:gap-8">
            <span
              className="inline-flex w-28 shrink-0 items-center gap-1.5 text-xs font-medium tracking-wide"
              style={{ color: 'var(--neuron-muted)' }}
            >
              <UiEmoji emoji="📐" enabled={uiEmojis} vendor={activeEmojiVendor} />
              <span>ui size</span>
            </span>
            <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="UI size">
              {UI_SIZE_OPTIONS.map((opt) => {
                const active = preferences.uiSize === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    data-testid={`ui-size-${opt.id}`}
                    onClick={() => onChangeUiSize(opt.id)}
                    style={{
                      backgroundColor: active ? 'var(--neuron-surface)' : 'transparent',
                      borderColor: active ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                      color: active ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                    }}
                    className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollbar */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-baseline sm:gap-8">
            <span
              className="inline-flex w-28 shrink-0 items-center gap-1.5 text-xs font-medium tracking-wide"
              style={{ color: 'var(--neuron-muted)' }}
            >
              <UiEmoji emoji="📜" enabled={uiEmojis} vendor={activeEmojiVendor} />
              <span>scrollbar</span>
            </span>
            <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Scrollbar style">
              {SCROLLBAR_STYLE_OPTIONS.map((opt) => {
                const active = preferences.scrollbarStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    data-testid={`scrollbar-style-${opt.id}`}
                    onClick={() => onChangeScrollbarStyle(opt.id)}
                    style={{
                      backgroundColor: active ? 'var(--neuron-surface)' : 'transparent',
                      borderColor: active ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                      color: active ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                    }}
                    className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title visibility ("show" / "hide") & document bar icon visibility */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-baseline sm:gap-8">
            <span
              className="inline-flex w-28 shrink-0 items-center gap-1.5 text-xs font-medium tracking-wide"
              style={{ color: 'var(--neuron-muted)' }}
            >
              <UiEmoji emoji="🏷️" enabled={uiEmojis} vendor={activeEmojiVendor} />
              <span>title</span>
            </span>
            <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Header title visibility">
              <button
                type="button"
                aria-pressed={preferences.showBrandWord}
                data-testid="toggle-brand-word"
                onClick={onToggleShowBrandWord}
                style={{
                  backgroundColor: preferences.showBrandWord ? 'var(--neuron-surface)' : 'transparent',
                  borderColor: preferences.showBrandWord ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                  color: preferences.showBrandWord ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                }}
                className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
              >
                {preferences.showBrandWord ? 'show' : 'hide'}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-baseline sm:gap-8">
            <span
              className="inline-flex w-28 shrink-0 items-center gap-1.5 text-xs font-medium tracking-wide"
              style={{ color: 'var(--neuron-muted)' }}
            >
              <UiEmoji emoji="🔘" enabled={uiEmojis} vendor={activeEmojiVendor} />
              <span>page buttons</span>
            </span>
            <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Document page icon visibility">
              <button
                type="button"
                aria-pressed={preferences.showSearchButton}
                data-testid="toggle-search-button"
                onClick={onToggleShowSearchButton}
                style={{
                  backgroundColor: preferences.showSearchButton ? 'var(--neuron-surface)' : 'transparent',
                  borderColor: preferences.showSearchButton ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                  color: preferences.showSearchButton ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                }}
                className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
              >
                {preferences.showSearchButton ? 'search · show' : 'search · hide'}
              </button>

              <button
                type="button"
                aria-pressed={preferences.showLockButton}
                data-testid="toggle-lock-button"
                onClick={onToggleShowLockButton}
                style={{
                  backgroundColor: preferences.showLockButton ? 'var(--neuron-surface)' : 'transparent',
                  borderColor: preferences.showLockButton ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                  color: preferences.showLockButton ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                }}
                className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
              >
                {preferences.showLockButton ? 'lock · show' : 'lock · hide'}
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 2: TYPOGRAPHY & LAYOUT */}
        <section
          aria-label="Typography and layout settings"
          data-testid="settings-section-typography"
          className="flex flex-col gap-6 border-t pt-6"
          style={{ borderColor: 'var(--neuron-border)' }}
        >
          <SectionHeading>typography & layout</SectionHeading>

          {/* Font */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-8">
            <span
              className="inline-flex w-28 shrink-0 items-center gap-1.5 pt-1.5 text-xs font-medium tracking-wide"
              style={{ color: 'var(--neuron-muted)' }}
            >
              <UiEmoji emoji="🔤" enabled={uiEmojis} vendor={activeEmojiVendor} />
              <span>font</span>
            </span>
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="OS font">
                {allFonts.map((font) => {
                  const active = preferences.font === font.id;
                  return (
                    <div key={font.id} className="relative inline-flex items-center">
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChangeFont(font.id)}
                        style={{
                          fontFamily: font.cssFamily,
                          backgroundColor: active ? 'var(--neuron-surface)' : 'transparent',
                          borderColor: active ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                          color: active ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                        }}
                        className={`neuron-btn-pop cursor-pointer rounded-md border py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0 ${
                          font.isCustom ? 'pl-3.5 pr-7' : 'px-3.5'
                        }`}
                      >
                        {font.familyLabel}
                      </button>

                      {font.isCustom && (
                        <button
                          type="button"
                          aria-label={`Remove font ${font.familyLabel}`}
                          onClick={() => onRemoveCustomFont(font.id)}
                          className="absolute right-1.5 cursor-pointer rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
                          style={{ color: 'var(--neuron-muted)' }}
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <form
                  onSubmit={handleFontLinkSubmit}
                  className="flex min-w-[15rem] max-w-md flex-1 items-center gap-2 rounded-md border px-3 py-1.5"
                  style={{
                    backgroundColor: 'var(--neuron-surface)',
                    borderColor: 'var(--neuron-border)',
                  }}
                >
                  <Link2
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: 'var(--neuron-muted)' }}
                    aria-hidden="true"
                  />
                  <label htmlFor="font-link-input" className="sr-only">
                    Paste Google Fonts link
                  </label>
                  <input
                    id="font-link-input"
                    type="text"
                    value={fontLinkInput}
                    onChange={(e) => {
                      setFontLinkInput(e.target.value);
                      if (fontError) setFontError(null);
                    }}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData('text');
                      if (pasted && (pasted.includes('fonts.google') || pasted.includes('fonts.googleapis'))) {
                        e.preventDefault();
                        setFontLinkInput(pasted);
                        void applyFontInput(pasted);
                      }
                    }}
                    placeholder="paste google fonts link or font name..."
                    className="min-w-0 flex-1 bg-transparent text-xs text-[var(--neuron-text)] placeholder:opacity-55 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isImportingFont || !fontLinkInput.trim()}
                    className="cursor-pointer text-xs font-medium transition-opacity disabled:cursor-default disabled:opacity-40 hover:opacity-80 whitespace-nowrap shrink-0"
                    style={{ color: 'var(--neuron-accent)' }}
                  >
                    {isImportingFont ? 'loading' : 'apply'}
                  </button>
                </form>

                <a
                  href="https://fonts.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="open-google-fonts-btn"
                  aria-label="Open Google Fonts"
                  className="neuron-btn-pop inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:border-[var(--neuron-accent)] hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: 'var(--neuron-surface)',
                    borderColor: 'var(--neuron-border)',
                    color: 'var(--neuron-muted)',
                  }}
                >
                  <span>google fonts</span>
                  <ExternalLink className="h-3 w-3 opacity-75" aria-hidden="true" />
                </a>
              </div>

              {fontError && (
                <p className="text-xs" style={{ color: 'var(--neuron-accent)' }} role="alert">
                  {fontError}
                </p>
              )}
            </div>
          </div>

          {/* Text Size */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-baseline sm:gap-8">
            <span
              className="inline-flex w-28 shrink-0 items-center gap-1.5 text-xs font-medium tracking-wide"
              style={{ color: 'var(--neuron-muted)' }}
            >
              <UiEmoji emoji="📏" enabled={uiEmojis} vendor={activeEmojiVendor} />
              <span>text size</span>
            </span>
            <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Editor text size">
              {TEXT_SIZE_OPTIONS.map((opt) => {
                const active = preferences.textSize === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    data-testid={`text-size-${opt.id}`}
                    onClick={() => onChangeTextSize(opt.id)}
                    style={{
                      backgroundColor: active ? 'var(--neuron-surface)' : 'transparent',
                      borderColor: active ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                      color: active ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                    }}
                    className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Line Spacing */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-baseline sm:gap-8">
            <span
              className="inline-flex w-28 shrink-0 items-center gap-1.5 text-xs font-medium tracking-wide whitespace-nowrap"
              style={{ color: 'var(--neuron-muted)' }}
            >
              <UiEmoji emoji="↕️" enabled={uiEmojis} vendor={activeEmojiVendor} />
              <span>line spacing</span>
            </span>
            <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Line spacing">
              {LINE_SPACING_OPTIONS.map((opt) => {
                const active = preferences.lineSpacing === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    data-testid={`line-spacing-${opt.id}`}
                    onClick={() => onChangeLineSpacing(opt.id)}
                    style={{
                      backgroundColor: active ? 'var(--neuron-surface)' : 'transparent',
                      borderColor: active ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                      color: active ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                    }}
                    className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Text Width */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-baseline sm:gap-8">
            <span
              className="inline-flex w-28 shrink-0 items-center gap-1.5 text-xs font-medium tracking-wide whitespace-nowrap"
              style={{ color: 'var(--neuron-muted)' }}
            >
              <UiEmoji emoji="↔️" enabled={uiEmojis} vendor={activeEmojiVendor} />
              <span>text width</span>
            </span>
            <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Text width">
              {TEXT_WIDTH_OPTIONS.map((opt) => {
                const active = preferences.textWidth === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    data-testid={`text-width-${opt.id}`}
                    onClick={() => onChangeTextWidth(opt.id)}
                    style={{
                      backgroundColor: active ? 'var(--neuron-surface)' : 'transparent',
                      borderColor: active ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                      color: active ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                    }}
                    className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Insights */}
          <div
            className="flex flex-col gap-2.5 sm:flex-row sm:items-baseline sm:gap-8"
            data-testid="settings-document-insights"
          >
            <span
              className="inline-flex w-28 shrink-0 items-center gap-1.5 text-xs font-medium tracking-wide"
              style={{ color: 'var(--neuron-muted)' }}
            >
              <UiEmoji emoji="📊" enabled={uiEmojis} vendor={activeEmojiVendor} />
              <span>insights</span>
            </span>
            <div
              className="flex flex-wrap items-center gap-2.5"
              role="group"
              aria-label="Insights"
            >
              {INSIGHT_OPTIONS.map((opt) => {
                const active = preferences.insights[opt.key];
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={active}
                    data-testid={`insight-toggle-${opt.key}`}
                    onClick={() => onToggleInsight(opt.key)}
                    style={{
                      backgroundColor: active ? 'var(--neuron-surface)' : 'transparent',
                      borderColor: active ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                      color: active ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                    }}
                    className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dyslexic */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-baseline sm:gap-8">
            <span
              className="inline-flex w-28 shrink-0 items-center gap-1.5 text-xs font-medium tracking-wide"
              style={{ color: 'var(--neuron-muted)' }}
            >
              <UiEmoji emoji="👁️" enabled={uiEmojis} vendor={activeEmojiVendor} />
              <span>dyslexic</span>
            </span>
            <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Dyslexic reading mode">
              <button
                type="button"
                aria-pressed={preferences.dyslexicMode}
                onClick={onToggleDyslexicMode}
                style={{
                  fontFamily: "'OpenDyslexicRegular', 'Lexend', system-ui, sans-serif",
                  backgroundColor: preferences.dyslexicMode ? 'var(--neuron-surface)' : 'transparent',
                  borderColor: preferences.dyslexicMode ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                  color: preferences.dyslexicMode ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                }}
                className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
              >
                {preferences.dyslexicMode ? 'on · opendyslexic' : 'off'}
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 3: WRITING & BLOCKS */}
        <section
          aria-label="Writing and blocks settings"
          data-testid="settings-section-writing"
          className="flex flex-col gap-6 border-t pt-6"
          style={{ borderColor: 'var(--neuron-border)' }}
        >
          <SectionHeading>writing & blocks</SectionHeading>

          {/* Spelling & Autocorrect (purely local/offline) */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-8">
            <span
              className="inline-flex w-28 shrink-0 items-center gap-1.5 pt-1.5 text-xs font-medium tracking-wide"
              style={{ color: 'var(--neuron-muted)' }}
            >
              <UiEmoji emoji="📝" enabled={uiEmojis} vendor={activeEmojiVendor} />
              <span>spelling</span>
            </span>
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  aria-pressed={preferences.spellcheckEnabled}
                  data-testid="spellcheck-toggle"
                  onClick={onToggleSpellcheck}
                  style={{
                    backgroundColor: preferences.spellcheckEnabled
                      ? 'var(--neuron-surface)'
                      : 'transparent',
                    borderColor: preferences.spellcheckEnabled
                      ? 'var(--neuron-accent)'
                      : 'var(--neuron-border)',
                    color: preferences.spellcheckEnabled
                      ? 'var(--neuron-text)'
                      : 'var(--neuron-muted)',
                  }}
                  className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                >
                  {preferences.spellcheckEnabled ? 'spellcheck on' : 'spellcheck off'}
                </button>

                <button
                  type="button"
                  aria-pressed={preferences.autocorrectEnabled}
                  data-testid="autocorrect-toggle"
                  onClick={onToggleAutocorrect}
                  style={{
                    backgroundColor: preferences.autocorrectEnabled
                      ? 'var(--neuron-surface)'
                      : 'transparent',
                    borderColor: preferences.autocorrectEnabled
                      ? 'var(--neuron-accent)'
                      : 'var(--neuron-border)',
                    color: preferences.autocorrectEnabled
                      ? 'var(--neuron-text)'
                      : 'var(--neuron-muted)',
                  }}
                  className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                >
                  {preferences.autocorrectEnabled ? 'autocorrect on' : 'autocorrect off'}
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const cleaned = dictWordInput.trim().toLowerCase();
                  if (!cleaned) return;
                  onAddCustomWord(cleaned);
                  setDictWordInput('');
                }}
                className="flex max-w-md items-center gap-2 rounded-md border px-3 py-1.5"
                style={{
                  backgroundColor: 'var(--neuron-surface)',
                  borderColor: 'var(--neuron-border)',
                }}
              >
                <label htmlFor="custom-dict-input" className="sr-only">
                  Add word to custom dictionary
                </label>
                <input
                  id="custom-dict-input"
                  type="text"
                  value={dictWordInput}
                  onChange={(e) => setDictWordInput(e.target.value)}
                  placeholder="add custom word to dictionary..."
                  className="min-w-0 flex-1 bg-transparent text-xs text-[var(--neuron-text)] placeholder:opacity-55 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!dictWordInput.trim()}
                  className="cursor-pointer text-xs font-medium transition-opacity disabled:cursor-default disabled:opacity-40 hover:opacity-80 whitespace-nowrap shrink-0"
                  style={{ color: 'var(--neuron-accent)' }}
                >
                  add
                </button>
              </form>

              {customDictionary.length > 0 && (
                <div
                  className="flex flex-wrap items-center gap-2"
                  aria-label="Custom dictionary words"
                >
                  {customDictionary.map((word) => (
                    <button
                      key={word}
                      type="button"
                      aria-label={`Remove custom word ${word}`}
                      onClick={() => onRemoveCustomWord(word)}
                      style={{
                        backgroundColor: 'var(--neuron-surface)',
                        borderColor: 'var(--neuron-border)',
                        color: 'var(--neuron-text)',
                      }}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-opacity hover:opacity-80"
                    >
                      <span>{word}</span>
                      <X
                        className="h-3 w-3 opacity-60"
                        style={{ color: 'var(--neuron-muted)' }}
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* (H) Box & (P) Canvas Shortcuts + Canvas Size + ? Quick Hint */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-8">
            <span
              className="inline-flex w-28 shrink-0 items-center gap-1.5 pt-1.5 text-xs font-medium tracking-wide"
              style={{ color: 'var(--neuron-muted)' }}
            >
              <UiEmoji emoji="🧩" enabled={uiEmojis} vendor={activeEmojiVendor} />
              <span>blocks</span>
            </span>
            <div className="flex flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Block shortcuts">
                <button
                  type="button"
                  aria-pressed={preferences.boxShortcutEnabled}
                  data-testid="box-shortcut-toggle"
                  onClick={onToggleBoxShortcut}
                  style={{
                    backgroundColor: preferences.boxShortcutEnabled
                      ? 'var(--neuron-surface)'
                      : 'transparent',
                    borderColor: preferences.boxShortcutEnabled
                      ? 'var(--neuron-accent)'
                      : 'var(--neuron-border)',
                    color: preferences.boxShortcutEnabled
                      ? 'var(--neuron-text)'
                      : 'var(--neuron-muted)',
                  }}
                  className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                >
                  {preferences.boxShortcutEnabled ? '(H) box on' : '(H) box off'}
                </button>

                <button
                  type="button"
                  aria-pressed={preferences.pixelShortcutEnabled}
                  data-testid="pixel-shortcut-toggle"
                  onClick={onTogglePixelShortcut}
                  style={{
                    backgroundColor: preferences.pixelShortcutEnabled
                      ? 'var(--neuron-surface)'
                      : 'transparent',
                    borderColor: preferences.pixelShortcutEnabled
                      ? 'var(--neuron-accent)'
                      : 'var(--neuron-border)',
                    color: preferences.pixelShortcutEnabled
                      ? 'var(--neuron-text)'
                      : 'var(--neuron-muted)',
                  }}
                  className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                >
                  {preferences.pixelShortcutEnabled ? '(P) canvas on' : '(P) canvas off'}
                </button>

                <button
                  type="button"
                  aria-expanded={showBlocksHelp}
                  aria-label="How blocks work"
                  title="How to use (H) and (P)"
                  data-testid="blocks-help-btn"
                  onClick={() => setShowBlocksHelp((prev) => !prev)}
                  style={{
                    backgroundColor: showBlocksHelp ? 'var(--neuron-surface)' : 'transparent',
                    borderColor: showBlocksHelp ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                    color: showBlocksHelp ? 'var(--neuron-accent)' : 'var(--neuron-muted)',
                  }}
                  className="neuron-btn-pop inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border text-xs transition-colors hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] shrink-0"
                >
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>

              <SmoothCollapse open={showBlocksHelp}>
                <p
                  data-testid="blocks-help-text"
                  className="pt-2.5 text-xs leading-relaxed"
                  style={{ color: 'var(--neuron-muted)' }}
                >
                  type <code className="text-[var(--neuron-text)]">(H)</code> in any note to insert a box table, or{' '}
                  <code className="text-[var(--neuron-text)]">(P)</code> to insert a drawing canvas.
                </p>
              </SmoothCollapse>

              <SmoothCollapse open={preferences.pixelShortcutEnabled}>
                <div className="flex flex-wrap items-center gap-2 pt-3" role="group" aria-label="Canvas size">
                  <span
                    className="mr-1 text-[11px] font-medium tracking-wide"
                    style={{ color: 'var(--neuron-muted)' }}
                  >
                    canvas size
                  </span>
                  {PIXEL_CANVAS_SIZE_OPTIONS.map((opt) => {
                    const active = preferences.pixelCanvasSize === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={active}
                        data-testid={`pixel-size-${opt.id}`}
                        onClick={() => onChangePixelCanvasSize(opt.id)}
                        style={{
                          backgroundColor: active ? 'var(--neuron-surface)' : 'transparent',
                          borderColor: active ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                          color: active ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                        }}
                        className="neuron-btn-pop cursor-pointer rounded-md border px-3 py-1 text-xs hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </SmoothCollapse>
            </div>
          </div>
        </section>

        {/* SECTION 4: AUDIO & EMOJI */}
        <section
          aria-label="Audio and emoji settings"
          data-testid="settings-section-audio"
          className="flex flex-col gap-6 border-t pt-6"
          style={{ borderColor: 'var(--neuron-border)' }}
        >
          <SectionHeading>audio & emoji</SectionHeading>

          {/* Typing Sound Themes + Upload Audio File + Unavailable Freesound Link Box */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-8">
            <span
              className="inline-flex w-28 shrink-0 items-center gap-1.5 pt-1.5 text-xs font-medium tracking-wide"
              style={{ color: 'var(--neuron-muted)' }}
            >
              <UiEmoji emoji="🔊" enabled={uiEmojis} vendor={activeEmojiVendor} />
              <span>sound</span>
            </span>
            <div className="flex flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Typing sound">
                {SOUND_OPTIONS.map((sound) => {
                  const active = preferences.sound === sound.id;
                  return (
                    <button
                      key={sound.id}
                      type="button"
                      aria-pressed={active}
                      data-testid={`sound-option-${sound.id}`}
                      title={sound.detail}
                      onClick={() => {
                        onChangeSound(sound.id);
                        if (sound.id !== 'off') {
                          playTypingSound(sound.id, 'char', preferences.soundVolume);
                        }
                      }}
                      style={{
                        backgroundColor: active ? 'var(--neuron-surface)' : 'transparent',
                        borderColor: active ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                        color: active ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                      }}
                      className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                    >
                      {sound.label}
                    </button>
                  );
                })}

                {customSounds.map((pack) => {
                  const active = preferences.sound === pack.id;
                  return (
                    <div key={pack.id} className="relative inline-flex items-center">
                      <button
                        type="button"
                        aria-pressed={active}
                        data-testid={`sound-option-${pack.id}`}
                        onClick={() => {
                          onChangeSound(pack.id);
                          playTypingSound(pack.id, 'char', preferences.soundVolume);
                        }}
                        style={{
                          backgroundColor: active ? 'var(--neuron-surface)' : 'transparent',
                          borderColor: active ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                          color: active ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                        }}
                        className="neuron-btn-pop cursor-pointer rounded-md border py-1.5 pl-3.5 pr-7 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                      >
                        {pack.label}
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove sound ${pack.label}`}
                        onClick={() => onRemoveCustomSound(pack.id)}
                        className="absolute right-1.5 cursor-pointer rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
                        style={{ color: 'var(--neuron-muted)' }}
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <SmoothCollapse open={preferences.sound !== 'off'}>
                <div
                  className="flex flex-wrap items-center gap-2 pt-3"
                  role="group"
                  aria-label="Sound volume"
                >
                  <span
                    className="mr-1 text-[11px] font-medium tracking-wide"
                    style={{ color: 'var(--neuron-muted)' }}
                  >
                    volume
                  </span>
                  {SOUND_VOLUME_OPTIONS.map((vol) => {
                    const active = preferences.soundVolume === vol.id;
                    return (
                      <button
                        key={vol.id}
                        type="button"
                        aria-pressed={active}
                        data-testid={`sound-volume-${vol.id}`}
                        onClick={() => {
                          onChangeSoundVolume(vol.id);
                          playTypingSound(preferences.sound, 'char', vol.id);
                        }}
                        style={{
                          backgroundColor: active ? 'var(--neuron-surface)' : 'transparent',
                          borderColor: active ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                          color: active ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                        }}
                        className="neuron-btn-pop cursor-pointer rounded-md border px-3 py-1 text-xs hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                      >
                        {vol.label}
                      </button>
                    );
                  })}
                </div>
              </SmoothCollapse>

              {/* Upload local sound + grayed-out unavailable link box */}
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  data-testid="upload-sound-btn"
                  disabled={isUploadingSound}
                  onClick={() => soundFileInputRef.current?.click()}
                  className="neuron-btn-pop inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:border-[var(--neuron-accent)] hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: 'var(--neuron-surface)',
                    borderColor: 'var(--neuron-border)',
                    color: 'var(--neuron-text)',
                  }}
                >
                  <Upload className="h-3.5 w-3.5" style={{ color: 'var(--neuron-accent)' }} aria-hidden="true" />
                  <span>{isUploadingSound ? 'uploading...' : 'upload sound'}</span>
                </button>
                <input
                  ref={soundFileInputRef}
                  type="file"
                  data-testid="upload-sound-input"
                  accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm,.flac,.aac"
                  onChange={handleSoundFileUpload}
                  className="hidden"
                  aria-label="Upload custom typing sound audio file"
                />

                {/* Grayed-out disabled Freesound link box with hover/focus unavailable popup */}
                <div
                  className="relative flex min-w-[15rem] max-w-md flex-1 items-center"
                  data-testid="disabled-sound-link-box"
                  onMouseEnter={() => setShowSoundLinkPopup(true)}
                  onMouseLeave={() => setShowSoundLinkPopup(false)}
                  onFocus={() => setShowSoundLinkPopup(true)}
                  onBlur={() => setShowSoundLinkPopup(false)}
                >
                  <div
                    aria-disabled="true"
                    tabIndex={0}
                    aria-label="Sound link import currently unavailable"
                    className="flex w-full cursor-not-allowed items-center gap-2 rounded-md border px-3 py-1.5 opacity-45 select-none"
                    style={{
                      backgroundColor: 'var(--neuron-surface)',
                      borderColor: 'var(--neuron-border)',
                      color: 'var(--neuron-muted)',
                    }}
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <input
                      type="text"
                      disabled
                      readOnly
                      value=""
                      placeholder="paste sound link"
                      aria-label="Paste sound link"
                      className="min-w-0 flex-1 cursor-not-allowed bg-transparent text-xs text-[var(--neuron-muted)] placeholder:opacity-75 focus:outline-none"
                    />
                  </div>

                  <AnimatePresence>
                    {showSoundLinkPopup && (
                      <motion.div
                        role="tooltip"
                        data-testid="sound-link-unavailable-popup"
                        initial={{ opacity: 0, y: -3, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -2, scale: 0.97 }}
                        transition={{ duration: 0.14 }}
                        className="pointer-events-none absolute top-full left-1/2 z-20 mt-2 -translate-x-1/2 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shadow-lg"
                        style={{
                          backgroundColor: 'var(--neuron-bg)',
                          borderColor: 'var(--neuron-border)',
                          color: 'var(--neuron-text)',
                        }}
                      >
                        feature currently unavailable :(
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <a
                  href="https://freesound.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="open-freesound-btn"
                  aria-label="Open Freesound"
                  className="neuron-btn-pop inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:border-[var(--neuron-accent)] hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: 'var(--neuron-surface)',
                    borderColor: 'var(--neuron-border)',
                    color: 'var(--neuron-muted)',
                  }}
                >
                  <span>freesound</span>
                  <ExternalLink className="h-3 w-3 opacity-75" aria-hidden="true" />
                </a>
              </div>

              {soundUploadError && (
                <p className="mt-2 text-xs" style={{ color: 'var(--neuron-accent)' }} role="alert">
                  {soundUploadError}
                </p>
              )}
            </div>
          </div>

          {/* Emoji Vendor Style & UI Emojis */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-8">
            <span
              className="inline-flex w-28 shrink-0 items-center gap-1.5 pt-1.5 text-xs font-medium tracking-wide"
              style={{ color: 'var(--neuron-muted)' }}
            >
              <UiEmoji emoji="😊" enabled={uiEmojis} vendor={activeEmojiVendor} />
              <span>emoji</span>
            </span>
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  aria-pressed={preferences.uiEmojisEnabled}
                  onClick={onToggleUiEmojis}
                  data-testid="ui-emojis-toggle"
                  style={{
                    backgroundColor: preferences.uiEmojisEnabled
                      ? 'var(--neuron-surface)'
                      : 'transparent',
                    borderColor: preferences.uiEmojisEnabled
                      ? 'var(--neuron-accent)'
                      : 'var(--neuron-border)',
                    color: preferences.uiEmojisEnabled
                      ? 'var(--neuron-text)'
                      : 'var(--neuron-muted)',
                  }}
                  className="neuron-btn-pop inline-flex cursor-pointer items-center gap-2 rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                >
                  <span className="inline-flex items-center text-base leading-none">
                    <EmojiGlyph emoji="🌈" vendor={activeEmojiVendor} />
                  </span>
                  <span>{preferences.uiEmojisEnabled ? 'ui emojis on' : 'ui emojis off'}</span>
                </button>
              </div>

              <div
                className="flex flex-wrap items-center gap-2.5"
                role="group"
                aria-label="Emoji vendor style"
              >
                {EMOJI_VENDORS.map((vendor) => {
                  const active = preferences.emojiVendor === vendor.id;
                  return (
                    <button
                      key={vendor.id}
                      type="button"
                      aria-pressed={active}
                      data-testid={`emoji-vendor-${vendor.id}`}
                      title={vendor.source}
                      onClick={() => onChangeEmojiVendor(vendor.id)}
                      style={{
                        backgroundColor: active ? 'var(--neuron-surface)' : 'transparent',
                        borderColor: active ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                        color: active ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                      }}
                      className="neuron-btn-pop inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
                    >
                      <span className="inline-flex items-center gap-1 text-base leading-none">
                        <EmojiGlyph emoji="😀" vendor={vendor} />
                        <EmojiGlyph emoji="🧠" vendor={vendor} />
                        <EmojiGlyph emoji="✨" vendor={vendor} />
                      </span>
                      <span>{vendor.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5: ABOUT */}
        <section
          aria-label="About neuron"
          className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-start sm:gap-8"
          style={{ borderColor: 'var(--neuron-border)' }}
          data-testid="settings-about"
        >
          <span
            className="inline-flex w-28 shrink-0 items-center gap-1.5 pt-1.5 text-xs font-medium tracking-wide"
            style={{ color: 'var(--neuron-muted)' }}
          >
            <UiEmoji emoji="💫" enabled={uiEmojis} vendor={activeEmojiVendor} />
            <span>about</span>
          </span>

          <div className="flex flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                data-testid="neuron-version"
                className="mr-1.5 text-sm font-medium tracking-tight"
                style={{ color: 'var(--neuron-text)' }}
              >
                neuron 1.0
              </span>

              <button
                type="button"
                data-testid="about-support-btn"
                aria-expanded={aboutPanel === 'support'}
                onClick={() => {
                  setAboutPanel((prev) => (prev === 'support' ? null : 'support'));
                  setLastAboutPanel('support');
                }}
                style={{
                  backgroundColor:
                    aboutPanel === 'support' ? 'var(--neuron-surface)' : 'transparent',
                  borderColor:
                    aboutPanel === 'support'
                      ? 'var(--neuron-accent)'
                      : 'var(--neuron-border)',
                  color:
                    aboutPanel === 'support'
                      ? 'var(--neuron-text)'
                      : 'var(--neuron-muted)',
                }}
                className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
              >
                support
              </button>

              <button
                type="button"
                data-testid="about-what-btn"
                aria-expanded={aboutPanel === 'what'}
                onClick={() => {
                  setAboutPanel((prev) => (prev === 'what' ? null : 'what'));
                  setLastAboutPanel('what');
                }}
                style={{
                  backgroundColor:
                    aboutPanel === 'what' ? 'var(--neuron-surface)' : 'transparent',
                  borderColor:
                    aboutPanel === 'what'
                      ? 'var(--neuron-accent)'
                      : 'var(--neuron-border)',
                  color:
                    aboutPanel === 'what'
                      ? 'var(--neuron-text)'
                      : 'var(--neuron-muted)',
                }}
                className="neuron-btn-pop cursor-pointer rounded-md border px-3.5 py-1.5 text-sm hover:text-[var(--neuron-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0"
              >
                what is neuron?
              </button>
            </div>

            <SmoothCollapse open={aboutPanel !== null}>
              <div className="pt-3">
                {(aboutPanel ?? lastAboutPanel) === 'support' ? (
                      <div
                        key="about-support-content"
                        data-testid="about-support-content"
                        className="w-full rounded-lg border p-4 text-sm leading-relaxed"
                        style={{
                          backgroundColor: 'var(--neuron-surface)',
                          borderColor: 'var(--neuron-border)',
                          color: 'var(--neuron-text)',
                        }}
                      >
                        <div className="flex flex-col gap-3">
                          <p>
                            Neuron is an independent software that is not supported financially by anyone because it has no investors, nor is it owned by some big company. Every time when you donate, the money goes directly to one person (me) for development of the new functionalities and improvements.
                          </p>
                          <p>
                            In addition, however, there is another way you can contribute to the growth of Neuron—just spread the word! Talk to your friends about the software if you know a lot of people who enjoy writing, write about it in your blogs, and write reviews. Thank you!
                          </p>
                          <p>
                            If you have any questions, feedback, or issues, please feel free to contact me here:{' '}
                            <a
                              href="mailto:cidygoesburner@proton.me"
                              className="font-medium underline decoration-[1.5px] underline-offset-4 transition-opacity hover:opacity-80"
                              style={{ color: 'var(--neuron-accent)' }}
                            >
                              cidygoesburner@proton.me
                            </a>
                            . I reply personally to all messages.
                            <br />
                            And if you enjoy using my little project, write to me about it as well and{' '}
                            <a
                              href="https://ko-fi.com/cidynin"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium underline decoration-[1.5px] underline-offset-4 transition-opacity hover:opacity-80"
                              style={{ color: 'var(--neuron-accent)' }}
                            >
                              buy me a coffee
                            </a>{' '}
                            whilst youre at it! :]&lt;3
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div
                        key="about-what-content"
                        data-testid="about-what-content"
                        className="w-full rounded-lg border p-4 text-sm leading-relaxed"
                        style={{
                          backgroundColor: 'var(--neuron-surface)',
                          borderColor: 'var(--neuron-border)',
                          color: 'var(--neuron-text)',
                        }}
                      >
                        <div className="flex flex-col gap-3">
                          <p>
                            Neuron is a simple note-taking tool. You don't need to create an account, and there is no advertising throughout the ui.
                          </p>
                          <p>
                            As Neuron does not store data on any remote server, all data is saved in your browser's local storage. I cannot view any data you enter into Neuron, Its fully yours!
                          </p>
                          <p>
                            You are responsible for storing your notes. If you clear your browser data, change devices, or experience hardware problems, any data saved in Neuron will be lost. I cannot help you restore it, so please back up any important data yourself.
                          </p>
                          <p>
                            This software is provided as is. Although I do our very best to ensure that the app runs smoothly, I cannot guarantee that it is completely bug-free or interruption-free.
                          </p>
                          <p>
                            If you have any questions, feedback, or issues, please feel free to contact me here:{' '}
                            <a
                              href="mailto:cidygoesburner@proton.me"
                              className="font-medium underline decoration-[1.5px] underline-offset-4 transition-opacity hover:opacity-80"
                              style={{ color: 'var(--neuron-accent)' }}
                            >
                              cidygoesburner@proton.me
                            </a>
                            . I reply personally to all messages.
                            <br />
                            And if you enjoy using my little project, write to me about it as well and{' '}
                            <a
                              href="https://ko-fi.com/cidynin"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium underline decoration-[1.5px] underline-offset-4 transition-opacity hover:opacity-80"
                              style={{ color: 'var(--neuron-accent)' }}
                            >
                              buy me a coffee
                            </a>{' '}
                            whilst youre at it! :]&lt;3
                          </p>
                        </div>
                      </div>
                    )}
              </div>
            </SmoothCollapse>
          </div>
        </section>
      </motion.div>
    </motion.nav>
  );
}
