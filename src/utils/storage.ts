import type {
  ColorPalette,
  EmojiVendorOption,
  FontOption,
  NeuronPreferences,
  Note,
} from '../types/neuron';
import {
  isValidLineSpacing,
  isValidPixelCanvasSize,
  isValidScrollbarStyle,
  isValidTextSize,
  isValidTextWidth,
  isValidUiSize,
} from '../data/sizing';
import {
  createNote,
  getActiveNotes,
  purgeExpiredTrash,
} from './notes';

const STORAGE_NOTES_KEY = 'neuron.notes.v1';
const STORAGE_ACTIVE_ID_KEY = 'neuron.activeNoteId.v1';
const STORAGE_PREFS_KEY = 'neuron.preferences.v1';
const STORAGE_CUSTOM_PALETTES_KEY = 'neuron.customPalettes.v1';
const STORAGE_CUSTOM_FONTS_KEY = 'neuron.customFonts.v1';
const STORAGE_CUSTOM_DICT_KEY = 'neuron.customDictionary.v1';
const STORAGE_CUSTOM_EMOJI_VENDORS_KEY = 'neuron.customEmojiVendors.v1';

const LEGACY_TEMPLATE_CONTENTS = new Set([
  'the quick\nbrown fox\njumps over the\nlazy dog',
  'evening sketches\n\nleave space between sentences so thoughts can breathe.\nclick the star at top left to switch fonts, sounds, or palettes.',
  'reading list\n\nthe elements of typographic style — robert bringhurst\nin praise of shadows — junichiro tanizaki',
]);

export const DEFAULT_PREFERENCES: NeuronPreferences = {
  font: 'sans',
  sound: 'thock',
  soundVolume: 'default',
  palette: 'noir',
  uiSize: 'medium',
  textSize: 'medium',
  lineSpacing: 'default',
  textWidth: 'default',
  scrollbarStyle: 'thin',
  showBrandWord: true,
  showSearchButton: true,
  showLockButton: true,
  boxShortcutEnabled: true,
  pixelShortcutEnabled: true,
  pixelCanvasSize: 32,
  autocorrectEnabled: true,
  dyslexicMode: false,
  spellcheckEnabled: true,
  emojiVendor: 'native',
  uiEmojisEnabled: false,
  insights: {
    wordCount: true,
    characterCount: false,
    readingCount: false,
    readingTime: false,
  },
};

export function createSeedNotes(now = Date.now()): {
  notes: Note[];
  activeNoteId: string;
} {
  const frontPageNote: Note = {
    id: 'note-1',
    content: '',
    createdAt: now,
    updatedAt: now,
    pinned: false,
  };

  return {
    notes: [frontPageNote],
    activeNoteId: frontPageNote.id,
  };
}

export function stripUntouchedLegacyTemplates(notes: Note[]): Note[] {
  return notes.filter((note) => {
    if (
      note.id.startsWith('note-seed-') &&
      LEGACY_TEMPLATE_CONTENTS.has(note.content)
    ) {
      return false;
    }
    return true;
  });
}

export function loadInitialWorkspace(): {
  notes: Note[];
  activeNoteId: string;
  preferences: NeuronPreferences;
  customPalettes: ColorPalette[];
  customFonts: FontOption[];
  customDictionary: string[];
  customEmojiVendors: EmojiVendorOption[];
} {
  const isBlankQuery =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('blank') === '1';

  let preferences: NeuronPreferences = {
    ...DEFAULT_PREFERENCES,
    insights: { ...DEFAULT_PREFERENCES.insights },
  };
  try {
    const rawPrefs = localStorage.getItem(STORAGE_PREFS_KEY);
    if (rawPrefs) {
      const parsed = JSON.parse(rawPrefs) as Partial<NeuronPreferences>;
      preferences = {
        font:
          parsed.font && parsed.font !== 'code'
            ? parsed.font
            : DEFAULT_PREFERENCES.font,
        sound:
          typeof parsed.sound === 'string' && parsed.sound.trim().length > 0
            ? parsed.sound
            : DEFAULT_PREFERENCES.sound,
        soundVolume:
          parsed.soundVolume === 'low' ||
          parsed.soundVolume === 'default' ||
          parsed.soundVolume === 'loud'
            ? parsed.soundVolume
            : DEFAULT_PREFERENCES.soundVolume,
        palette:
          parsed.palette && parsed.palette !== 'cerulean-blossom'
            ? parsed.palette
            : DEFAULT_PREFERENCES.palette,
        uiSize: isValidUiSize(parsed.uiSize)
          ? parsed.uiSize
          : DEFAULT_PREFERENCES.uiSize,
        textSize: isValidTextSize(parsed.textSize)
          ? parsed.textSize
          : DEFAULT_PREFERENCES.textSize,
        lineSpacing: isValidLineSpacing(parsed.lineSpacing)
          ? parsed.lineSpacing
          : DEFAULT_PREFERENCES.lineSpacing,
        textWidth: isValidTextWidth(parsed.textWidth)
          ? parsed.textWidth
          : DEFAULT_PREFERENCES.textWidth,
        scrollbarStyle: isValidScrollbarStyle(parsed.scrollbarStyle)
          ? parsed.scrollbarStyle
          : DEFAULT_PREFERENCES.scrollbarStyle,
        showBrandWord:
          typeof parsed.showBrandWord === 'boolean'
            ? parsed.showBrandWord
            : DEFAULT_PREFERENCES.showBrandWord,
        showSearchButton:
          typeof parsed.showSearchButton === 'boolean'
            ? parsed.showSearchButton
            : DEFAULT_PREFERENCES.showSearchButton,
        showLockButton:
          typeof parsed.showLockButton === 'boolean'
            ? parsed.showLockButton
            : DEFAULT_PREFERENCES.showLockButton,
        boxShortcutEnabled:
          typeof parsed.boxShortcutEnabled === 'boolean'
            ? parsed.boxShortcutEnabled
            : DEFAULT_PREFERENCES.boxShortcutEnabled,
        pixelShortcutEnabled:
          typeof parsed.pixelShortcutEnabled === 'boolean'
            ? parsed.pixelShortcutEnabled
            : DEFAULT_PREFERENCES.pixelShortcutEnabled,
        pixelCanvasSize: isValidPixelCanvasSize(parsed.pixelCanvasSize)
          ? parsed.pixelCanvasSize
          : DEFAULT_PREFERENCES.pixelCanvasSize,
        autocorrectEnabled:
          typeof parsed.autocorrectEnabled === 'boolean'
            ? parsed.autocorrectEnabled
            : DEFAULT_PREFERENCES.autocorrectEnabled,
        dyslexicMode:
          typeof parsed.dyslexicMode === 'boolean'
            ? parsed.dyslexicMode
            : DEFAULT_PREFERENCES.dyslexicMode,
        spellcheckEnabled:
          typeof parsed.spellcheckEnabled === 'boolean'
            ? parsed.spellcheckEnabled
            : DEFAULT_PREFERENCES.spellcheckEnabled,
        emojiVendor: parsed.emojiVendor ?? DEFAULT_PREFERENCES.emojiVendor,
        uiEmojisEnabled:
          typeof parsed.uiEmojisEnabled === 'boolean'
            ? parsed.uiEmojisEnabled
            : DEFAULT_PREFERENCES.uiEmojisEnabled,
        insights: {
          wordCount:
            typeof parsed.insights?.wordCount === 'boolean'
              ? parsed.insights.wordCount
              : DEFAULT_PREFERENCES.insights.wordCount,
          characterCount:
            typeof parsed.insights?.characterCount === 'boolean'
              ? parsed.insights.characterCount
              : DEFAULT_PREFERENCES.insights.characterCount,
          readingCount:
            typeof parsed.insights?.readingCount === 'boolean'
              ? parsed.insights.readingCount
              : DEFAULT_PREFERENCES.insights.readingCount,
          readingTime:
            typeof parsed.insights?.readingTime === 'boolean'
              ? parsed.insights.readingTime
              : DEFAULT_PREFERENCES.insights.readingTime,
        },
      };
    }
  } catch {
    // Ignore storage read errors
  }

  let customPalettes: ColorPalette[] = [];
  try {
    const rawCustom = localStorage.getItem(STORAGE_CUSTOM_PALETTES_KEY);
    if (rawCustom) {
      const parsed = JSON.parse(rawCustom) as ColorPalette[];
      if (Array.isArray(parsed)) {
        customPalettes = parsed;
      }
    }
  } catch {
    // Ignore storage read errors
  }

  let customFonts: FontOption[] = [];
  try {
    const rawFonts = localStorage.getItem(STORAGE_CUSTOM_FONTS_KEY);
    if (rawFonts) {
      const parsed = JSON.parse(rawFonts) as FontOption[];
      if (Array.isArray(parsed)) {
        customFonts = parsed;
      }
    }
  } catch {
    // Ignore storage read errors
  }

  let customDictionary: string[] = [];
  try {
    const rawDict = localStorage.getItem(STORAGE_CUSTOM_DICT_KEY);
    if (rawDict) {
      const parsed = JSON.parse(rawDict) as string[];
      if (Array.isArray(parsed)) {
        customDictionary = parsed.filter((w) => typeof w === 'string' && w.trim().length > 0);
      }
    }
  } catch {
    // Ignore storage read errors
  }

  let customEmojiVendors: EmojiVendorOption[] = [];
  try {
    const rawVendors = localStorage.getItem(STORAGE_CUSTOM_EMOJI_VENDORS_KEY);
    if (rawVendors) {
      const parsed = JSON.parse(rawVendors) as EmojiVendorOption[];
      if (Array.isArray(parsed)) {
        customEmojiVendors = parsed;
      }
    }
  } catch {
    // Ignore storage read errors
  }

  if (isBlankQuery) {
    const blank = createNote('');
    return {
      notes: [blank],
      activeNoteId: blank.id,
      preferences,
      customPalettes,
      customFonts,
      customDictionary,
      customEmojiVendors,
    };
  }

  try {
    const rawNotes = localStorage.getItem(STORAGE_NOTES_KEY);
    const savedActiveId = localStorage.getItem(STORAGE_ACTIVE_ID_KEY);
    if (rawNotes) {
      const parsed = JSON.parse(rawNotes) as Note[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned = purgeExpiredTrash(stripUntouchedLegacyTemplates(parsed));
        const activeList = getActiveNotes(cleaned);
        const finalNotes =
          activeList.length > 0 ? cleaned : [...createSeedNotes().notes, ...cleaned];
        const finalActivePool = getActiveNotes(finalNotes);
        const active =
          savedActiveId && finalActivePool.some((n) => n.id === savedActiveId)
            ? savedActiveId
            : finalActivePool[0].id;
        return {
          notes: finalNotes,
          activeNoteId: active,
          preferences,
          customPalettes,
          customFonts,
          customDictionary,
          customEmojiVendors,
        };
      }
    }
  } catch {
    // Fallback to clean blank note
  }

  const seeded = createSeedNotes();
  return {
    ...seeded,
    preferences,
    customPalettes,
    customFonts,
    customDictionary,
    customEmojiVendors,
  };
}

export function saveNotes(notes: Note[]): void {
  try {
    localStorage.setItem(STORAGE_NOTES_KEY, JSON.stringify(notes));
  } catch {
    // Ignore storage quota errors
  }
}

export function saveActiveNoteId(id: string): void {
  try {
    localStorage.setItem(STORAGE_ACTIVE_ID_KEY, id);
  } catch {
    // Ignore storage quota errors
  }
}

export function savePreferences(prefs: NeuronPreferences): void {
  try {
    localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

export function saveCustomPalettes(palettes: ColorPalette[]): void {
  try {
    localStorage.setItem(STORAGE_CUSTOM_PALETTES_KEY, JSON.stringify(palettes));
  } catch {
    // Ignore storage quota errors
  }
}

export function saveCustomFonts(fonts: FontOption[]): void {
  try {
    localStorage.setItem(STORAGE_CUSTOM_FONTS_KEY, JSON.stringify(fonts));
  } catch {
    // Ignore storage quota errors
  }
}

export function saveCustomDictionary(words: string[]): void {
  try {
    localStorage.setItem(STORAGE_CUSTOM_DICT_KEY, JSON.stringify(words));
  } catch {
    // Ignore storage quota errors
  }
}

export function saveCustomEmojiVendors(vendors: EmojiVendorOption[]): void {
  try {
    localStorage.setItem(
      STORAGE_CUSTOM_EMOJI_VENDORS_KEY,
      JSON.stringify(vendors),
    );
  } catch {
    // Ignore storage quota errors
  }
}
