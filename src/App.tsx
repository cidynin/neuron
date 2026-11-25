/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { Lock, LockOpen, Search } from 'lucide-react';
import { EditorCanvas } from './components/EditorCanvas';
import { LibraryView } from './components/LibraryView';
import { MenuView } from './components/MenuView';
import { NeuronStar } from './components/NeuronStar';
import { NoteLockModal } from './components/NoteLockModal';
import { SpotlightSearchModal } from './components/SpotlightSearchModal';
import { getFontById, getPaletteById } from './data/palettes';
import {
  getLineSpacingById,
  getTextSizeById,
  getTextWidthById,
  getUiSizeById,
} from './data/sizing';
import type {
  AppView,
  ColorPalette,
  CustomSoundPack,
  DocumentInsightsPrefs,
  EmojiVendorId,
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
} from './types/neuron';
import { getEmojiVendorById } from './utils/emojiVendor';
import { injectFontStylesheet } from './utils/fontLink';
import {
  extractHistoryImageIds,
  pushNoteHistory,
  redoNoteHistory,
  undoNoteHistory,
  type NoteHistoryMap,
} from './utils/history';
import {
  deleteStoredImage,
  loadStoredImages,
  readImageFileAsStoredImage,
  saveStoredImage,
} from './utils/imageDb';
import {
  extractImageReferences,
  insertImageMarkdownAtCaret,
  removeImageReferenceFromContent,
  sanitizeImageAlt,
  type StoredImage,
} from './utils/images';
import {
  createNoteLockCredentials,
  isNoteLocked,
  verifyNotePassword,
} from './utils/noteLock';
import {
  buildExportFilename,
  computeDocumentInsights,
  createNote,
  emptyTrash,
  getActiveNotes,
  getNoteTitle,
  moveAllActiveToTrash,
  moveNoteToTrash,
  permanentlyDeleteNote,
  renameNoteInList,
  restoreNoteFromTrash,
  toggleNotePin,
  updateNoteContent,
} from './utils/notes';
import {
  deleteCustomSoundPack,
  loadCustomSoundPacks,
  saveCustomSoundPack,
} from './utils/soundDb';
import {
  registerCustomSoundPack,
  registerCustomSoundPacks,
} from './utils/soundEngine';
import {
  loadInitialWorkspace,
  saveActiveNoteId,
  saveCustomDictionary,
  saveCustomFonts,
  saveCustomPalettes,
  saveNotes,
  savePreferences,
} from './utils/storage';

export default function App() {
  const initial = useMemo(() => loadInitialWorkspace(), []);
  const [notes, setNotes] = useState<Note[]>(initial.notes);
  const [activeNoteId, setActiveNoteId] = useState<string>(initial.activeNoteId);
  const [preferences, setPreferences] = useState<NeuronPreferences>(initial.preferences);
  const [customPalettes, setCustomPalettes] = useState<ColorPalette[]>(
    initial.customPalettes,
  );
  const [customFonts, setCustomFonts] = useState<FontOption[]>(initial.customFonts);
  const [customDictionary, setCustomDictionary] = useState<string[]>(
    initial.customDictionary,
  );
  const [customSounds, setCustomSounds] = useState<CustomSoundPack[]>([]);
  const [historyMap, setHistoryMap] = useState<NoteHistoryMap>({});
  const [images, setImages] = useState<StoredImage[]>([]);
  const [view, setView] = useState<AppView>('editor');
  const [libraryTab, setLibraryTab] = useState<'notes' | 'gallery' | 'trash'>('notes');
  const [unlockedNoteIds, setUnlockedNoteIds] = useState<Set<string>>(() => new Set());
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [noteLockModalOpen, setNoteLockModalOpen] = useState(false);
  const [editorUnlockPass, setEditorUnlockPass] = useState('');
  const [editorUnlockError, setEditorUnlockError] = useState<string | null>(null);
  const [editorUnlockBusy, setEditorUnlockBusy] = useState(false);
  const [focusLineRequest, setFocusLineRequest] = useState<{
    noteId: string;
    lineNumber: number;
    nonce: number;
  } | null>(null);
  const imagesReadyRef = useRef(false);
  const imagesRef = useRef<StoredImage[]>(images);
  imagesRef.current = images;
  const historyMapRef = useRef<NoteHistoryMap>(historyMap);
  historyMapRef.current = historyMap;

  const activeNotes = useMemo(() => getActiveNotes(notes), [notes]);

  const activeNote = useMemo(
    () => activeNotes.find((n) => n.id === activeNoteId) ?? activeNotes[0],
    [activeNotes, activeNoteId],
  );

  const activePalette = useMemo(
    () => getPaletteById(preferences.palette, customPalettes),
    [preferences.palette, customPalettes],
  );

  const activeFont = useMemo(
    () => getFontById(preferences.font, customFonts),
    [preferences.font, customFonts],
  );

  const activeEmojiVendor = useMemo(
    () => getEmojiVendorById(preferences.emojiVendor),
    [preferences.emojiVendor],
  );

  const activeUiSize = useMemo(
    () => getUiSizeById(preferences.uiSize),
    [preferences.uiSize],
  );

  const activeTextSize = useMemo(
    () => getTextSizeById(preferences.textSize),
    [preferences.textSize],
  );

  const activeLineSpacing = useMemo(
    () => getLineSpacingById(preferences.lineSpacing),
    [preferences.lineSpacing],
  );

  const activeTextWidth = useMemo(
    () => getTextWidthById(preferences.textWidth),
    [preferences.textWidth],
  );

  // Ensure any persisted custom Google Fonts stylesheets are injected into head
  useEffect(() => {
    customFonts.forEach((font) => injectFontStylesheet(font));
  }, [customFonts]);

  // Load persisted custom sound packs from IndexedDB & decode into WebAudio cache
  useEffect(() => {
    let active = true;
    void loadCustomSoundPacks().then((loaded) => {
      if (!active) return;
      setCustomSounds(loaded);
      registerCustomSoundPacks(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    registerCustomSoundPacks(customSounds);
  }, [customSounds]);

  // Load persisted gallery images from IndexedDB and reconcile against notes
  useEffect(() => {
    let active = true;
    void loadStoredImages().then((loaded) => {
      if (!active) return;
      imagesReadyRef.current = true;
      setImages(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  // Automatically prune orphaned images from Gallery & IndexedDB ONLY once zero notes
  // AND zero undo/redo history entries reference them (debounced so typing stays fast)
  useEffect(() => {
    if (!imagesReadyRef.current || imagesRef.current.length === 0) return;
    const timer = window.setTimeout(() => {
      if (imagesRef.current.length === 0) return;
      const usedIds = new Set<string>();
      for (const note of notes) {
        for (const ref of extractImageReferences(note.content)) {
          usedIds.add(ref.id);
        }
      }
      const historyIds = extractHistoryImageIds(historyMap);
      for (const hid of historyIds) {
        usedIds.add(hid);
      }
      setImages((prev) => {
        const orphaned = prev.filter((img) => !usedIds.has(img.id));
        if (orphaned.length === 0) return prev;
        for (const dead of orphaned) {
          void deleteStoredImage(dead.id);
        }
        return prev.filter((img) => usedIds.has(img.id));
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [notes, historyMap]);

  // Sync OS-wide font, pointer skin, independent UI/editor sizes, line spacing, and palette CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--neuron-bg', activePalette.bg);
    root.style.setProperty('--neuron-surface', activePalette.surface);
    root.style.setProperty('--neuron-text', activePalette.text);
    root.style.setProperty('--neuron-muted', activePalette.muted);
    root.style.setProperty('--neuron-accent', activePalette.accent);
    root.style.setProperty('--neuron-jewel', activePalette.jewel);
    root.style.setProperty('--neuron-star', activePalette.star);
    root.style.setProperty('--neuron-border', activePalette.border);
    root.style.setProperty('--neuron-selection', activePalette.selection);
    root.style.setProperty(
      '--neuron-font',
      preferences.dyslexicMode
        ? "'OpenDyslexicRegular', 'Lexend', system-ui, sans-serif"
        : activeFont.cssFamily,
    );
    root.style.fontSize = `${activeUiSize.rootFontPx}px`;
    root.style.setProperty(
      '--neuron-editor-size',
      preferences.dyslexicMode
        ? activeTextSize.dyslexicCssFontSize
        : activeTextSize.cssFontSize,
    );
    root.style.setProperty(
      '--neuron-line-height',
      String(
        preferences.dyslexicMode
          ? activeLineSpacing.dyslexicLineHeight
          : activeLineSpacing.lineHeight,
      ),
    );
    root.dataset.scrollbar = preferences.scrollbarStyle;
  }, [
    activePalette,
    activeFont,
    activeUiSize,
    activeTextSize,
    activeLineSpacing,
    preferences.dyslexicMode,
    preferences.scrollbarStyle,
  ]);

  useEffect(() => {
    setEditorUnlockPass('');
    setEditorUnlockError(null);
    setNoteLockModalOpen(false);
  }, [activeNote?.id]);

  // Persist workspace state + debounced notes saving + silent flush on unload/tab hide
  const latestStateRef = useRef({
    notes,
    activeNoteId: activeNote?.id ?? activeNoteId,
    preferences,
    customPalettes,
    customFonts,
    customDictionary,
  });
  latestStateRef.current = {
    notes,
    activeNoteId: activeNote?.id ?? activeNoteId,
    preferences,
    customPalettes,
    customFonts,
    customDictionary,
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveNotes(notes);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [notes]);

  useEffect(() => {
    if (activeNote) {
      saveActiveNoteId(activeNote.id);
    }
  }, [activeNote]);

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    saveCustomPalettes(customPalettes);
  }, [customPalettes]);

  useEffect(() => {
    saveCustomFonts(customFonts);
  }, [customFonts]);

  useEffect(() => {
    saveCustomDictionary(customDictionary);
  }, [customDictionary]);

  useEffect(() => {
    const flushSilentAutosave = () => {
      const snap = latestStateRef.current;
      saveNotes(snap.notes);
      saveActiveNoteId(snap.activeNoteId);
      savePreferences(snap.preferences);
      saveCustomPalettes(snap.customPalettes);
      saveCustomFonts(snap.customFonts);
      saveCustomDictionary(snap.customDictionary);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushSilentAutosave();
      }
    };
    window.addEventListener('beforeunload', flushSilentAutosave);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', flushSilentAutosave);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const handleToggleMenu = useCallback(() => {
    setView((prev) => (prev === 'editor' ? 'menu' : 'editor'));
  }, []);

  // Global keyboard shortcuts: Cmd/Ctrl+K or Cmd/Ctrl+Shift+F opens Spotlight Search;
  // Escape closes modals or toggles menu
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key.toLowerCase() === 'k' || (e.shiftKey && e.key.toLowerCase() === 'f'))) {
        e.preventDefault();
        setSpotlightOpen((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') {
        if (noteLockModalOpen) {
          e.preventDefault();
          setNoteLockModalOpen(false);
          return;
        }
        if (spotlightOpen) {
          return;
        }
        e.preventDefault();
        handleToggleMenu();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleToggleMenu, noteLockModalOpen, spotlightOpen]);

  const recordHistoryAndSetContent = useCallback(
    (
      noteId: string,
      prevContent: string,
      nextContent: string,
      options: { discrete?: boolean; coalesceKey?: string } = {},
    ) => {
      if (prevContent === nextContent) return;
      setHistoryMap((prev) => ({
        ...prev,
        [noteId]: pushNoteHistory(prev[noteId], prevContent, nextContent, {
          discrete: options.discrete,
          coalesceKey: options.coalesceKey,
        }),
      }));
      setNotes((prev) => updateNoteContent(prev, noteId, nextContent));
    },
    [],
  );

  const handleNoteChange = useCallback(
    (
      nextContent: string,
      options: { discrete?: boolean; coalesceKey?: string } = {},
    ) => {
      if (!activeNote) return;
      recordHistoryAndSetContent(
        activeNote.id,
        activeNote.content,
        nextContent,
        options,
      );
    },
    [activeNote, recordHistoryAndSetContent],
  );

  const handleUndo = useCallback((): string | null => {
    if (!activeNote) return null;
    const res = undoNoteHistory(historyMapRef.current[activeNote.id], activeNote.content);
    if (!res.didUndo) return null;
    setHistoryMap((prev) => ({
      ...prev,
      [activeNote.id]: res.nextStack,
    }));
    setNotes((prev) => updateNoteContent(prev, activeNote.id, res.nextContent));
    return res.nextContent;
  }, [activeNote]);

  const handleRedo = useCallback((): string | null => {
    if (!activeNote) return null;
    const res = redoNoteHistory(historyMapRef.current[activeNote.id], activeNote.content);
    if (!res.didRedo) return null;
    setHistoryMap((prev) => ({
      ...prev,
      [activeNote.id]: res.nextStack,
    }));
    setNotes((prev) => updateNoteContent(prev, activeNote.id, res.nextContent));
    return res.nextContent;
  }, [activeNote]);

  const handleNewNote = useCallback(() => {
    const fresh = createNote('');
    setNotes((prev) => [fresh, ...prev]);
    setActiveNoteId(fresh.id);
    setView('editor');
  }, []);

  const handleSelectNote = useCallback((noteId: string, lineNumber?: number) => {
    setActiveNoteId(noteId);
    setView('editor');
    if (lineNumber !== undefined) {
      setFocusLineRequest({ noteId, lineNumber, nonce: Date.now() });
    }
  }, []);

  const handleImportNote = useCallback((content: string) => {
    const imported = createNote(content);
    setNotes((prev) => [imported, ...prev]);
    setActiveNoteId(imported.id);
    setView('editor');
  }, []);

  const handleExportNote = useCallback((note: Note) => {
    const blob = new Blob([note.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildExportFilename(note.content, note.title);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const handleRenameNote = useCallback((noteId: string, nextTitle: string) => {
    setNotes((prev) => renameNoteInList(prev, noteId, nextTitle));
  }, []);

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      setNotes((prev) => {
        const result = moveNoteToTrash(prev, noteId, activeNoteId);
        setActiveNoteId(result.activeNoteId);
        return result.notes;
      });
    },
    [activeNoteId],
  );

  const handleClearAllNotes = useCallback(() => {
    setNotes((prev) => {
      const result = moveAllActiveToTrash(prev);
      setActiveNoteId(result.activeNoteId);
      return result.notes;
    });
  }, []);

  const handleRestoreNote = useCallback((noteId: string) => {
    setNotes((prev) => restoreNoteFromTrash(prev, noteId));
  }, []);

  const handlePermanentDeleteNote = useCallback((noteId: string) => {
    setNotes((prev) => permanentlyDeleteNote(prev, noteId));
  }, []);

  const handleEmptyTrash = useCallback(() => {
    setNotes((prev) => emptyTrash(prev));
  }, []);

  const handleTogglePin = useCallback((noteId: string) => {
    setNotes((prev) => toggleNotePin(prev, noteId));
  }, []);

  const handleChangeFont = useCallback((font: FontId) => {
    setPreferences((prev) => ({ ...prev, font }));
  }, []);

  const handleAddCustomFont = useCallback((font: FontOption) => {
    injectFontStylesheet(font);
    setCustomFonts((prev) => {
      const deduped = prev.filter((f) => f.id !== font.id);
      return [...deduped, font];
    });
    setPreferences((prev) => ({ ...prev, font: font.id }));
  }, []);

  const handleRemoveCustomFont = useCallback((fontId: FontId) => {
    setCustomFonts((prev) => prev.filter((f) => f.id !== fontId));
    setPreferences((prev) =>
      prev.font === fontId ? { ...prev, font: 'sans' } : prev,
    );
  }, []);

  const handleChangeSound = useCallback((sound: SoundId) => {
    setPreferences((prev) => ({ ...prev, sound }));
  }, []);

  const handleAddCustomSound = useCallback((pack: CustomSoundPack) => {
    registerCustomSoundPack(pack);
    void saveCustomSoundPack(pack);
    setCustomSounds((prev) => {
      const deduped = prev.filter((s) => s.id !== pack.id);
      return [...deduped, pack];
    });
    setPreferences((prev) => ({ ...prev, sound: pack.id }));
  }, []);

  const handleRemoveCustomSound = useCallback((soundId: SoundId) => {
    void deleteCustomSoundPack(soundId);
    setCustomSounds((prev) => prev.filter((s) => s.id !== soundId));
    setPreferences((prev) =>
      prev.sound === soundId ? { ...prev, sound: 'thock' } : prev,
    );
  }, []);

  const handleChangeSoundVolume = useCallback((soundVolume: SoundVolume) => {
    setPreferences((prev) => ({ ...prev, soundVolume }));
  }, []);

  const handleChangePalette = useCallback((palette: PaletteId) => {
    setPreferences((prev) => ({ ...prev, palette }));
  }, []);

  const handleChangeUiSize = useCallback((uiSize: UiSize) => {
    setPreferences((prev) => ({ ...prev, uiSize }));
  }, []);

  const handleChangeTextSize = useCallback((textSize: TextSize) => {
    setPreferences((prev) => ({ ...prev, textSize }));
  }, []);

  const handleChangeLineSpacing = useCallback((lineSpacing: LineSpacing) => {
    setPreferences((prev) => ({ ...prev, lineSpacing }));
  }, []);

  const handleChangeTextWidth = useCallback((textWidth: TextWidth) => {
    setPreferences((prev) => ({ ...prev, textWidth }));
  }, []);

  const handleAddCustomPalette = useCallback((palette: ColorPalette) => {
    setCustomPalettes((prev) => {
      const deduped = prev.filter(
        (p) =>
          p.name !== palette.name ||
          (p.sourceUrl && p.sourceUrl !== palette.sourceUrl),
      );
      return [...deduped, palette];
    });
    setPreferences((prev) => ({ ...prev, palette: palette.id }));
  }, []);

  const handleRemoveCustomPalette = useCallback((paletteId: PaletteId) => {
    setCustomPalettes((prev) => prev.filter((p) => p.id !== paletteId));
    setPreferences((prev) =>
      prev.palette === paletteId ? { ...prev, palette: 'noir' } : prev,
    );
  }, []);

  const handleToggleDyslexicMode = useCallback(() => {
    setPreferences((prev) => ({ ...prev, dyslexicMode: !prev.dyslexicMode }));
  }, []);

  const handleToggleSpellcheck = useCallback(() => {
    setPreferences((prev) => ({
      ...prev,
      spellcheckEnabled: !prev.spellcheckEnabled,
    }));
  }, []);

  const handleChangeScrollbarStyle = useCallback((scrollbarStyle: ScrollbarStyle) => {
    setPreferences((prev) => ({ ...prev, scrollbarStyle }));
  }, []);

  const handleToggleShowBrandWord = useCallback(() => {
    setPreferences((prev) => ({ ...prev, showBrandWord: !prev.showBrandWord }));
  }, []);

  const handleToggleShowSearchButton = useCallback(() => {
    setPreferences((prev) => ({ ...prev, showSearchButton: !prev.showSearchButton }));
  }, []);

  const handleToggleShowLockButton = useCallback(() => {
    setPreferences((prev) => ({ ...prev, showLockButton: !prev.showLockButton }));
  }, []);

  const handleToggleAutocorrect = useCallback(() => {
    setPreferences((prev) => ({
      ...prev,
      autocorrectEnabled: !prev.autocorrectEnabled,
    }));
  }, []);

  const handleToggleBoxShortcut = useCallback(() => {
    setPreferences((prev) => ({
      ...prev,
      boxShortcutEnabled: !prev.boxShortcutEnabled,
    }));
  }, []);

  const handleTogglePixelShortcut = useCallback(() => {
    setPreferences((prev) => ({
      ...prev,
      pixelShortcutEnabled: !prev.pixelShortcutEnabled,
    }));
  }, []);

  const handleChangePixelCanvasSize = useCallback((pixelCanvasSize: PixelCanvasSize) => {
    setPreferences((prev) => ({ ...prev, pixelCanvasSize }));
  }, []);

  const handleLockNote = useCallback(async (noteId: string, password: string) => {
    const { passwordHash, passwordSalt } = await createNoteLockCredentials(password);
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId
          ? { ...n, passwordHash, passwordSalt, updatedAt: Date.now() }
          : n,
      ),
    );
    setUnlockedNoteIds((prev) => {
      const next = new Set(prev);
      next.add(noteId);
      return next;
    });
  }, []);

  const handleUnlockNote = useCallback(
    async (noteId: string, password: string): Promise<boolean> => {
      const target = notes.find((n) => n.id === noteId);
      if (!target) return false;
      const ok = await verifyNotePassword(target, password);
      if (!ok) return false;
      setUnlockedNoteIds((prev) => {
        const next = new Set(prev);
        next.add(noteId);
        return next;
      });
      return true;
    },
    [notes],
  );

  const handleRemoveNoteLock = useCallback(
    async (noteId: string, currentPassword: string): Promise<boolean> => {
      const target = notes.find((n) => n.id === noteId);
      if (!target) return false;
      const ok = await verifyNotePassword(target, currentPassword);
      if (!ok) return false;
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? { ...n, passwordHash: undefined, passwordSalt: undefined, updatedAt: Date.now() }
            : n,
        ),
      );
      return true;
    },
    [notes],
  );

  const handleRelockNote = useCallback((noteId: string) => {
    setUnlockedNoteIds((prev) => {
      if (!prev.has(noteId)) return prev;
      const next = new Set(prev);
      next.delete(noteId);
      return next;
    });
  }, []);

  const handleToggleInsight = useCallback((key: keyof DocumentInsightsPrefs) => {
    setPreferences((prev) => ({
      ...prev,
      insights: {
        ...prev.insights,
        [key]: !prev.insights[key],
      },
    }));
  }, []);

  const handleAddCustomWord = useCallback((word: string) => {
    const clean = word.trim().toLowerCase();
    if (!clean) return;
    setCustomDictionary((prev) =>
      prev.includes(clean) ? prev : [...prev, clean],
    );
  }, []);

  const handleRemoveCustomWord = useCallback((word: string) => {
    setCustomDictionary((prev) => prev.filter((w) => w !== word));
  }, []);

  const handleChangeEmojiVendor = useCallback((emojiVendor: EmojiVendorId) => {
    setPreferences((prev) => ({ ...prev, emojiVendor }));
  }, []);

  const handleToggleUiEmojis = useCallback(() => {
    setPreferences((prev) => ({
      ...prev,
      uiEmojisEnabled: !prev.uiEmojisEnabled,
    }));
  }, []);

  const handleUploadImages = useCallback(
    async (
      files: FileList | File[],
      options: { insertInNote?: boolean; caret?: number } = {},
    ) => {
      const fileArray = Array.from(files).filter(
        (file) =>
          file.type.startsWith('image/') ||
          /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(file.name),
      );
      if (fileArray.length === 0) return;

      const uploaded: StoredImage[] = [];
      for (const file of fileArray) {
        try {
          const stored = await readImageFileAsStoredImage(file);
          await saveStoredImage(stored);
          uploaded.push(stored);
        } catch {
          // Skip unreadable image file gracefully
        }
      }
      if (uploaded.length === 0) return;

      setImages((prev) => [...uploaded.reverse(), ...prev]);

      if (options.insertInNote !== false && activeNote) {
        let nextContent = activeNote.content;
        let cursor =
          options.caret !== undefined
            ? Math.min(options.caret, nextContent.length)
            : nextContent.length;
        for (const img of uploaded) {
          const res = insertImageMarkdownAtCaret(
            nextContent,
            cursor,
            img.name,
            img.id,
          );
          nextContent = res.text;
          cursor = res.caret;
        }
        recordHistoryAndSetContent(activeNote.id, activeNote.content, nextContent, {
          discrete: true,
        });
      }
    },
    [activeNote, recordHistoryAndSetContent],
  );

  const handleRenameImage = useCallback((imageId: string, nextName: string) => {
    const safeAlt = sanitizeImageAlt(nextName);
    setImages((prev) =>
      prev.map((img) => {
        if (img.id !== imageId) return img;
        const updated = { ...img, name: nextName.trim() || 'image' };
        void saveStoredImage(updated);
        return updated;
      }),
    );
    const escapedId = imageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`!\\[[^\\]\\n]*\\]\\(neuron-img://${escapedId}\\)`, 'g');
    setNotes((prev) =>
      prev.map((note) => {
        if (!regex.test(note.content)) return note;
        regex.lastIndex = 0;
        const nextContent = note.content.replace(
          regex,
          `![${safeAlt}](neuron-img://${imageId})`,
        );
        setHistoryMap((hPrev) => ({
          ...hPrev,
          [note.id]: pushNoteHistory(hPrev[note.id], note.content, nextContent, {
            discrete: true,
          }),
        }));
        return {
          ...note,
          content: nextContent,
          updatedAt: Date.now(),
        };
      }),
    );
  }, []);

  const handleRemoveImageFromActiveNote = useCallback(
    (imageId: string) => {
      if (!activeNote) return;
      const nextContent = removeImageReferenceFromContent(activeNote.content, imageId);
      recordHistoryAndSetContent(activeNote.id, activeNote.content, nextContent, {
        discrete: true,
      });
    },
    [activeNote, recordHistoryAndSetContent],
  );

  const handleInsertImageToActiveNote = useCallback(
    (image: StoredImage) => {
      if (activeNote) {
        const res = insertImageMarkdownAtCaret(
          activeNote.content,
          activeNote.content.length,
          image.name,
          image.id,
        );
        recordHistoryAndSetContent(activeNote.id, activeNote.content, res.text, {
          discrete: true,
        });
      }
      setView('editor');
    },
    [activeNote, recordHistoryAndSetContent],
  );

  const handleDeleteImage = useCallback((imageId: string) => {
    setImages((prev) => prev.filter((img) => img.id !== imageId));
    void deleteStoredImage(imageId);
    setNotes((prev) =>
      prev.map((note) => {
        const cleaned = removeImageReferenceFromContent(note.content, imageId);
        if (cleaned === note.content) return note;
        return {
          ...note,
          content: cleaned,
          updatedAt: Date.now(),
        };
      }),
    );
  }, []);

  const handleUpdateImage = useCallback((updated: StoredImage) => {
    setImages((prev) => prev.map((img) => (img.id === updated.id ? updated : img)));
    void saveStoredImage(updated);
  }, []);

  const isActiveNoteLockedAndClosed = Boolean(
    activeNote && isNoteLocked(activeNote) && !unlockedNoteIds.has(activeNote.id),
  );

  const insights = useMemo(
    () =>
      activeNote && !isActiveNoteLockedAndClosed
        ? computeDocumentInsights(activeNote.content)
        : computeDocumentInsights(''),
    [activeNote, isActiveNoteLockedAndClosed],
  );

  const hasAnyInsightEnabled =
    preferences.insights.wordCount ||
    preferences.insights.characterCount ||
    preferences.insights.readingCount ||
    preferences.insights.readingTime;

  const showInsights = Boolean(
    view === 'editor' &&
      !isActiveNoteLockedAndClosed &&
      hasAnyInsightEnabled &&
      (insights.wordCount > 0 || insights.characterCount > 0),
  );

  const insightItems: { key: string; testId: string; label: string }[] = [];
  if (preferences.insights.wordCount) {
    insightItems.push({
      key: 'words',
      testId: 'word-count',
      label: `${insights.wordCount} ${insights.wordCount === 1 ? 'word' : 'words'}`,
    });
  }
  if (preferences.insights.characterCount) {
    insightItems.push({
      key: 'chars',
      testId: 'insight-character-count',
      label: `${insights.characterCount} ${insights.characterCount === 1 ? 'char' : 'chars'}`,
    });
  }
  if (preferences.insights.readingCount) {
    insightItems.push({
      key: 'readingCount',
      testId: 'insight-reading-count',
      label: `${insights.readingCount} ${insights.readingCount === 1 ? 'sentence' : 'sentences'}`,
    });
  }
  if (preferences.insights.readingTime) {
    insightItems.push({
      key: 'readingTime',
      testId: 'insight-reading-time',
      label: insights.readingTimeLabel,
    });
  }

  const openHeaderLockModal = () => {
    setNoteLockModalOpen(true);
  };

  const handleEditorUnlockSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeNote || editorUnlockBusy) return;
    if (!editorUnlockPass) {
      setEditorUnlockError('enter password');
      return;
    }
    setEditorUnlockBusy(true);
    try {
      const ok = await handleUnlockNote(activeNote.id, editorUnlockPass);
      if (!ok) {
        setEditorUnlockError('incorrect password');
        return;
      }
      setEditorUnlockPass('');
      setEditorUnlockError(null);
    } finally {
      setEditorUnlockBusy(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={`min-h-screen w-full bg-[var(--neuron-bg)] text-[var(--neuron-text)] transition-colors duration-300 ${
          preferences.dyslexicMode ? 'neuron-dyslexic' : ''
        }`}
        data-palette={preferences.palette}
        data-font={preferences.font}
        data-sound={preferences.sound}
        data-sound-volume={preferences.soundVolume}
        data-ui-size={preferences.uiSize}
        data-text-size={preferences.textSize}
        data-line-spacing={preferences.lineSpacing}
        data-text-width={preferences.textWidth}
        data-scrollbar={preferences.scrollbarStyle}
        data-dyslexic={preferences.dyslexicMode ? 'true' : 'false'}
        data-spellcheck={preferences.spellcheckEnabled ? 'true' : 'false'}
        data-autocorrect={preferences.autocorrectEnabled ? 'true' : 'false'}
        data-emoji-vendor={preferences.emojiVendor}
        data-ui-emojis={preferences.uiEmojisEnabled ? 'true' : 'false'}
        data-view={view}
      >
        <div
          className="mx-auto flex min-h-screen w-full flex-col px-6 pt-8 transition-[max-width] duration-200 sm:px-12 sm:pt-12"
          style={{
            maxWidth: activeTextWidth.maxWidthCss,
          }}
        >
          {/* Ultra-minimal Header: clickable star icon + optional neuron wordmark + insights & quick tools */}
          <header className="mb-10 flex items-center justify-between gap-4 sm:mb-12">
            <button
              type="button"
              onClick={handleToggleMenu}
              aria-expanded={view !== 'editor'}
              aria-label={view === 'editor' ? 'Open neuron menu' : 'Close neuron menu'}
              data-testid="star-menu-trigger"
              className="group inline-flex cursor-pointer items-center gap-4 text-left text-[var(--neuron-text)] transition-all duration-150 hover:opacity-85 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--neuron-accent)]"
            >
              <NeuronStar isOpen={view !== 'editor'} size={activeUiSize.starSize} />
              {preferences.showBrandWord && (
                <span
                  data-testid="brand-wordmark"
                  className="relative -top-[0.065em] text-[1.6rem] font-bold leading-none tracking-[-0.03em]"
                >
                  neuron
                </span>
              )}
            </button>

            <div className="flex items-center justify-end gap-3">
              <AnimatePresence>
                {showInsights && (
                  <motion.div
                    key="document-insights"
                    initial={{ opacity: 0, y: -3 }}
                    animate={{ opacity: 0.72, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-wrap items-center justify-end gap-1.5 text-xs tabular-nums transition-opacity duration-200 hover:opacity-100"
                    style={{ color: 'var(--neuron-muted)' }}
                    data-testid="document-insights"
                  >
                    {insightItems.map((item, idx) => (
                      <span key={item.key} className="inline-flex items-center gap-1.5">
                        {idx > 0 && <span aria-hidden="true">·</span>}
                        <span data-testid={item.testId}>{item.label}</span>
                      </span>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center gap-1">
                {preferences.showLockButton && view === 'editor' && activeNote && (
                  <button
                    type="button"
                    onClick={openHeaderLockModal}
                    title={
                      isNoteLocked(activeNote)
                        ? isActiveNoteLockedAndClosed
                          ? 'Unlock note'
                          : 'Note lock settings'
                        : 'Lock note with password'
                    }
                    aria-label="Note password lock"
                    data-testid="header-lock-btn"
                    className="inline-flex cursor-pointer items-center justify-center rounded-sm p-1.5 opacity-60 transition-opacity hover:opacity-100"
                    style={{
                      color: isNoteLocked(activeNote)
                        ? 'var(--neuron-accent)'
                        : 'var(--neuron-muted)',
                    }}
                  >
                    {isActiveNoteLockedAndClosed ? (
                      <Lock size={14} strokeWidth={1.8} />
                    ) : isNoteLocked(activeNote) ? (
                      <LockOpen size={14} strokeWidth={1.8} />
                    ) : (
                      <Lock size={14} strokeWidth={1.6} />
                    )}
                  </button>
                )}

                {preferences.showSearchButton && (
                  <button
                    type="button"
                    onClick={() => setSpotlightOpen(true)}
                    title="Universal search (⌘K)"
                    aria-label="Universal search"
                    data-testid="header-search-btn"
                    className="inline-flex cursor-pointer items-center justify-center rounded-sm p-1.5 opacity-60 transition-opacity hover:opacity-100"
                    style={{ color: 'var(--neuron-muted)' }}
                  >
                    <Search size={14} strokeWidth={1.7} />
                  </button>
                )}
              </div>
            </div>
          </header>

          {/* Main Workspace Canvas */}
          <main className="flex flex-1 flex-col">
            <AnimatePresence mode="wait">
              {view === 'editor' && activeNote && isActiveNoteLockedAndClosed && (
                <motion.div
                  key={`locked-${activeNote.id}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  data-testid="locked-note-gate"
                  className="flex flex-1 flex-col items-center justify-center pb-24"
                >
                  <form
                    onSubmit={handleEditorUnlockSubmit}
                    className="w-full max-w-sm rounded-sm border p-6"
                    style={{
                      backgroundColor: 'var(--neuron-surface)',
                      borderColor: 'var(--neuron-border)',
                    }}
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <Lock size={15} style={{ color: 'var(--neuron-accent)' }} />
                      <span className="truncate text-sm font-medium lowercase">
                        {getNoteTitle(activeNote.content, activeNote.title)}
                      </span>
                    </div>
                    <p
                      className="mb-4 text-xs leading-relaxed"
                      style={{ color: 'var(--neuron-muted)' }}
                    >
                      this note is password protected. enter your password to view and edit it for this session.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="password"
                        value={editorUnlockPass}
                        onChange={(e) => {
                          setEditorUnlockPass(e.target.value);
                          setEditorUnlockError(null);
                        }}
                        placeholder="password"
                        autoFocus
                        data-testid="locked-note-password-input"
                        className="min-w-0 flex-1 border-b bg-transparent px-1 py-1.5 text-sm outline-none"
                        style={{
                          borderColor: 'var(--neuron-border)',
                          color: 'var(--neuron-text)',
                        }}
                      />
                      <button
                        type="submit"
                        disabled={editorUnlockBusy}
                        data-testid="locked-note-unlock-btn"
                        className="cursor-pointer rounded-sm border px-3 py-1.5 text-xs lowercase transition-colors disabled:opacity-50"
                        style={{
                          borderColor: 'var(--neuron-accent)',
                          color: 'var(--neuron-accent)',
                        }}
                      >
                        unlock
                      </button>
                    </div>
                    {editorUnlockError && (
                      <p
                        className="mt-2.5 text-xs"
                        style={{ color: 'var(--neuron-accent)' }}
                        data-testid="locked-note-error"
                      >
                        {editorUnlockError}
                      </p>
                    )}
                    <div
                      className="mt-5 flex items-center justify-between border-t pt-3 text-xs"
                      style={{ borderColor: 'var(--neuron-border)', color: 'var(--neuron-muted)' }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setLibraryTab('notes');
                          setView('library');
                        }}
                        className="cursor-pointer lowercase transition-colors hover:text-[var(--neuron-text)]"
                      >
                        all notes
                      </button>
                      <button
                        type="button"
                        onClick={handleNewNote}
                        className="cursor-pointer lowercase transition-colors hover:text-[var(--neuron-accent)]"
                      >
                        new note
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {view === 'editor' && activeNote && !isActiveNoteLockedAndClosed && (
                <EditorCanvas
                  key={`editor-${activeNote.id}`}
                  noteId={activeNote.id}
                  content={activeNote.content}
                  sound={preferences.sound}
                  soundVolume={preferences.soundVolume}
                  uiSize={preferences.uiSize}
                  textSize={preferences.textSize}
                  lineSpacing={preferences.lineSpacing}
                  textWidth={preferences.textWidth}
                  spellcheckEnabled={preferences.spellcheckEnabled}
                  autocorrectEnabled={preferences.autocorrectEnabled}
                  boxShortcutEnabled={preferences.boxShortcutEnabled}
                  pixelShortcutEnabled={preferences.pixelShortcutEnabled}
                  pixelCanvasSize={preferences.pixelCanvasSize}
                  dyslexicMode={preferences.dyslexicMode}
                  emojiVendor={activeEmojiVendor}
                  palette={activePalette}
                  customDictionary={customDictionary}
                  images={images}
                  focusLineRequest={focusLineRequest}
                  onUploadImages={(files, caret) =>
                    handleUploadImages(files, { insertInNote: true, caret })
                  }
                  onRenameImage={handleRenameImage}
                  onUpdateImage={handleUpdateImage}
                  onRemoveImageFromNote={handleRemoveImageFromActiveNote}
                  onAddCustomWord={handleAddCustomWord}
                  onChange={handleNoteChange}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                />
              )}

              {view === 'menu' && (
                <MenuView
                  key="menu"
                  notes={notes}
                  activeNoteId={activeNote?.id ?? ''}
                  preferences={preferences}
                  customPalettes={customPalettes}
                  customFonts={customFonts}
                  customSounds={customSounds}
                  activeEmojiVendor={activeEmojiVendor}
                  onNewNote={handleNewNote}
                  onSelectNote={handleSelectNote}
                  onOpenLibrary={() => {
                    setLibraryTab('notes');
                    setView('library');
                  }}
                  onOpenSearch={() => setSpotlightOpen(true)}
                  onImportNote={handleImportNote}
                  onExportCurrent={() => activeNote && handleExportNote(activeNote)}
                  onChangeFont={handleChangeFont}
                  onAddCustomFont={handleAddCustomFont}
                  onRemoveCustomFont={handleRemoveCustomFont}
                  onChangeSound={handleChangeSound}
                  onAddCustomSound={handleAddCustomSound}
                  onRemoveCustomSound={handleRemoveCustomSound}
                  onChangeSoundVolume={handleChangeSoundVolume}
                  onChangePalette={handleChangePalette}
                  onAddCustomPalette={handleAddCustomPalette}
                  onRemoveCustomPalette={handleRemoveCustomPalette}
                  onChangeUiSize={handleChangeUiSize}
                  onChangeTextSize={handleChangeTextSize}
                  onChangeLineSpacing={handleChangeLineSpacing}
                  onChangeTextWidth={handleChangeTextWidth}
                  onChangeScrollbarStyle={handleChangeScrollbarStyle}
                  onToggleShowBrandWord={handleToggleShowBrandWord}
                  onToggleShowSearchButton={handleToggleShowSearchButton}
                  onToggleShowLockButton={handleToggleShowLockButton}
                  customDictionary={customDictionary}
                  onToggleDyslexicMode={handleToggleDyslexicMode}
                  onToggleSpellcheck={handleToggleSpellcheck}
                  onToggleAutocorrect={handleToggleAutocorrect}
                  onToggleBoxShortcut={handleToggleBoxShortcut}
                  onTogglePixelShortcut={handleTogglePixelShortcut}
                  onChangePixelCanvasSize={handleChangePixelCanvasSize}
                  onToggleInsight={handleToggleInsight}
                  onToggleUiEmojis={handleToggleUiEmojis}
                  onAddCustomWord={handleAddCustomWord}
                  onRemoveCustomWord={handleRemoveCustomWord}
                  onChangeEmojiVendor={handleChangeEmojiVendor}
                  onCloseMenu={() => setView('editor')}
                />
              )}

              {view === 'library' && (
                <LibraryView
                  key="library"
                  notes={notes}
                  images={images}
                  activeNoteId={activeNote?.id ?? ''}
                  activeTab={libraryTab}
                  palette={activePalette}
                  emojiVendor={activeEmojiVendor}
                  uiEmojisEnabled={preferences.uiEmojisEnabled}
                  unlockedNoteIds={unlockedNoteIds}
                  onChangeTab={setLibraryTab}
                  onSelectNote={handleSelectNote}
                  onNewNote={handleNewNote}
                  onRenameNote={handleRenameNote}
                  onTogglePin={handleTogglePin}
                  onDeleteNote={handleDeleteNote}
                  onClearAllNotes={handleClearAllNotes}
                  onRestoreNote={handleRestoreNote}
                  onPermanentDeleteNote={handlePermanentDeleteNote}
                  onEmptyTrash={handleEmptyTrash}
                  onExportNote={handleExportNote}
                  onInsertImageToActiveNote={handleInsertImageToActiveNote}
                  onUpdateImage={handleUpdateImage}
                  onDeleteImage={handleDeleteImage}
                  onLockNote={handleLockNote}
                  onUnlockNote={handleUnlockNote}
                  onRemoveNoteLock={handleRemoveNoteLock}
                  onRelockNote={handleRelockNote}
                  onBack={() => setView('editor')}
                />
              )}
            </AnimatePresence>
          </main>
        </div>

        {/* Universal Spotlight Search Modal */}
        <SpotlightSearchModal
          isOpen={spotlightOpen}
          notes={notes}
          activeNoteId={activeNote?.id ?? ''}
          unlockedNoteIds={unlockedNoteIds}
          emojiVendor={activeEmojiVendor}
          onSelectNote={handleSelectNote}
          onClose={() => setSpotlightOpen(false)}
        />

        {/* Header Note Password Lock Modal */}
        <NoteLockModal
          open={noteLockModalOpen && Boolean(activeNote)}
          noteTitle={activeNote ? getNoteTitle(activeNote.content, activeNote.title) : 'untitled note'}
          isLocked={activeNote ? isNoteLocked(activeNote) : false}
          isUnlocked={activeNote ? unlockedNoteIds.has(activeNote.id) : false}
          onClose={() => setNoteLockModalOpen(false)}
          onLock={async (password) => {
            if (activeNote) await handleLockNote(activeNote.id, password);
          }}
          onUnlock={async (password) =>
            activeNote ? handleUnlockNote(activeNote.id, password) : false
          }
          onRemoveLock={async (password) =>
            activeNote ? handleRemoveNoteLock(activeNote.id, password) : false
          }
          onRelock={() => {
            if (activeNote) handleRelockNote(activeNote.id);
          }}
          testIdPrefix="header-lock"
        />
      </div>
    </MotionConfig>
  );
}
