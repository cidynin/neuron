import type {
  LineSpacing,
  PixelCanvasSize,
  ScrollbarStyle,
  TextSize,
  TextWidth,
  UiSize,
} from '../types/neuron';

export interface UiSizeOption {
  id: UiSize;
  label: string;
  rootFontPx: number;
  starSize: number;
}

export interface TextSizeOption {
  id: TextSize;
  label: string;
  cssFontSize: string;
  dyslexicCssFontSize: string;
}

export interface LineSpacingOption {
  id: LineSpacing;
  label: string;
  lineHeight: number;
  dyslexicLineHeight: number;
  lineGapPx: number;
}

export interface TextWidthOption {
  id: TextWidth;
  label: string;
  maxWidthCss: string;
}

export const UI_SIZE_OPTIONS: UiSizeOption[] = [
  {
    id: 'small',
    label: 'small',
    rootFontPx: 14,
    starSize: 32,
  },
  {
    id: 'medium',
    label: 'default',
    rootFontPx: 16,
    starSize: 38,
  },
  {
    id: 'large',
    label: 'large',
    rootFontPx: 18.5,
    starSize: 44,
  },
];

export const TEXT_SIZE_OPTIONS: TextSizeOption[] = [
  {
    id: 'very-small',
    label: 'tiny',
    cssFontSize: 'clamp(15px, 1.4vw, 19px)',
    dyslexicCssFontSize: 'clamp(14px, 1.3vw, 17.5px)',
  },
  {
    id: 'small',
    label: 'small',
    cssFontSize: 'clamp(20px, 2.05vw, 28px)',
    dyslexicCssFontSize: 'clamp(18.5px, 1.9vw, 25.5px)',
  },
  {
    id: 'medium',
    label: 'default',
    cssFontSize: 'clamp(26px, 3.1vw, 42.4px)',
    dyslexicCssFontSize: 'clamp(24px, 2.85vw, 38.4px)',
  },
  {
    id: 'large',
    label: 'large',
    cssFontSize: 'clamp(32px, 3.9vw, 54px)',
    dyslexicCssFontSize: 'clamp(29px, 3.6vw, 49px)',
  },
  {
    id: 'max',
    label: 'max',
    cssFontSize: 'clamp(38px, 4.9vw, 68px)',
    dyslexicCssFontSize: 'clamp(34px, 4.4vw, 61px)',
  },
];

export const LINE_SPACING_OPTIONS: LineSpacingOption[] = [
  {
    id: 'compact',
    label: 'compact',
    lineHeight: 1.18,
    dyslexicLineHeight: 1.42,
    lineGapPx: 0,
  },
  {
    id: 'default',
    label: 'default',
    lineHeight: 1.34,
    dyslexicLineHeight: 1.6,
    lineGapPx: 1,
  },
  {
    id: 'relaxed',
    label: 'relaxed',
    lineHeight: 1.58,
    dyslexicLineHeight: 1.85,
    lineGapPx: 5,
  },
];

export const TEXT_WIDTH_OPTIONS: TextWidthOption[] = [
  {
    id: 'narrow',
    label: 'narrow',
    maxWidthCss: '38rem',
  },
  {
    id: 'default',
    label: 'default',
    maxWidthCss: '56rem',
  },
  {
    id: 'wide',
    label: 'wide',
    maxWidthCss: '76rem',
  },
];

export interface ScrollbarStyleOption {
  id: ScrollbarStyle;
  label: string;
}

export const SCROLLBAR_STYLE_OPTIONS: ScrollbarStyleOption[] = [
  { id: 'thin', label: 'thin' },
  { id: 'default', label: 'default' },
  { id: 'hide', label: 'hide' },
];

export const PIXEL_CANVAS_SIZE_OPTIONS: Array<{ id: PixelCanvasSize; label: string }> = [
  { id: 16, label: '16 × 16' },
  { id: 32, label: '32 × 32' },
  { id: 64, label: '64 × 64' },
];

export function isValidUiSize(value: unknown): value is UiSize {
  return value === 'small' || value === 'medium' || value === 'large';
}

export function isValidTextSize(value: unknown): value is TextSize {
  return (
    value === 'very-small' ||
    value === 'small' ||
    value === 'medium' ||
    value === 'large' ||
    value === 'max'
  );
}

export function isValidLineSpacing(value: unknown): value is LineSpacing {
  return value === 'compact' || value === 'default' || value === 'relaxed';
}

export function isValidTextWidth(value: unknown): value is TextWidth {
  return value === 'narrow' || value === 'default' || value === 'wide';
}

export function isValidScrollbarStyle(value: unknown): value is ScrollbarStyle {
  return value === 'thin' || value === 'default' || value === 'hide';
}

export function isValidPixelCanvasSize(value: unknown): value is PixelCanvasSize {
  return value === 16 || value === 32 || value === 64;
}

export function getUiSizeById(id: UiSize): UiSizeOption {
  return UI_SIZE_OPTIONS.find((opt) => opt.id === id) ?? UI_SIZE_OPTIONS[1];
}

export function getTextSizeById(id: TextSize): TextSizeOption {
  return TEXT_SIZE_OPTIONS.find((opt) => opt.id === id) ?? TEXT_SIZE_OPTIONS[2];
}

export function getLineSpacingById(id: LineSpacing): LineSpacingOption {
  return LINE_SPACING_OPTIONS.find((opt) => opt.id === id) ?? LINE_SPACING_OPTIONS[1];
}

export function getTextWidthById(id: TextWidth): TextWidthOption {
  return TEXT_WIDTH_OPTIONS.find((opt) => opt.id === id) ?? TEXT_WIDTH_OPTIONS[1];
}
