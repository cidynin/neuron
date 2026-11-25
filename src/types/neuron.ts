export type BuiltInFontId = 'sans' | 'g-code' | 'plex-serif' | 'serif';

export type FontId = BuiltInFontId | (string & {});

export type BuiltInSoundId =
  | 'thock'
  | 'typewriter'
  | 'droplet'
  | '8bit'
  | 'creamy'
  | 'marimba'
  | 'buckling'
  | 'off';

export type SoundId = BuiltInSoundId | (string & {});

export interface CustomSoundPack {
  id: string;
  label: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  sourceUrl?: string;
  createdAt: number;
}

export type BuiltInPaletteId =
  | 'noir'
  | 'hollow-dusk'
  | 'velvet-sunset'
  | 'abyssal-jade'
  | 'coral-tide'
  | 'mauve-ash'
  | 'violet-cyan'
  | 'olive-phosphor';

export type PaletteId = BuiltInPaletteId | (string & {});

export type AppView = 'editor' | 'menu' | 'library';

export interface Note {
  id: string;
  title?: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  deletedAt?: number;
  passwordHash?: string;
  passwordSalt?: string;
}

export interface ColorPalette {
  id: PaletteId;
  name: string;
  swatches: string[];
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  jewel: string;
  star: string;
  border: string;
  selection: string;
  isCustom?: boolean;
  sourceUrl?: string;
}

export interface FontOption {
  id: FontId;
  label: string;
  familyLabel: string;
  cssFamily: string;
  stylesheetUrl?: string;
  isCustom?: boolean;
}

export interface SoundOption {
  id: SoundId;
  label: string;
  detail: string;
  isCustom?: boolean;
}

export type BuiltInEmojiVendorId =
  | 'native'
  | 'apple'
  | 'google'
  | 'noto-emoji'
  | 'fluent'
  | 'samsung'
  | 'whatsapp'
  | 'twitter'
  | 'facebook'
  | 'joypixels'
  | 'openmoji'
  | 'blobmoji';

export type EmojiVendorId = BuiltInEmojiVendorId | (string & {});

export interface EmojiVendorOption {
  id: EmojiVendorId;
  label: string;
  source: string;
  urlTemplate?: string;
  fontFamily?: string;
  emojipediaVendor?: string;
  emojipediaRev?: string;
  isCustom?: boolean;
}

export type UiSize = 'small' | 'medium' | 'large';

export type TextSize = 'very-small' | 'small' | 'medium' | 'large' | 'max';

export type LineSpacing = 'compact' | 'default' | 'relaxed';

export type TextWidth = 'narrow' | 'default' | 'wide';

export type ScrollbarStyle = 'thin' | 'default' | 'hide';

export type PixelCanvasSize = 16 | 32 | 64;

export type SoundVolume = 'low' | 'default' | 'loud';

export interface DocumentInsightsPrefs {
  wordCount: boolean;
  characterCount: boolean;
  readingCount: boolean;
  readingTime: boolean;
}

export interface NeuronPreferences {
  font: FontId;
  sound: SoundId;
  soundVolume: SoundVolume;
  palette: PaletteId;
  uiSize: UiSize;
  textSize: TextSize;
  lineSpacing: LineSpacing;
  textWidth: TextWidth;
  scrollbarStyle: ScrollbarStyle;
  showBrandWord: boolean;
  showSearchButton: boolean;
  showLockButton: boolean;
  boxShortcutEnabled: boolean;
  pixelShortcutEnabled: boolean;
  pixelCanvasSize: PixelCanvasSize;
  autocorrectEnabled: boolean;
  dyslexicMode: boolean;
  spellcheckEnabled: boolean;
  emojiVendor: EmojiVendorId;
  uiEmojisEnabled: boolean;
  insights: DocumentInsightsPrefs;
}
