import type { ColorPalette, FontOption, PaletteId, SoundOption } from '../types/neuron';

export const FONT_OPTIONS: FontOption[] = [
  {
    id: 'sans',
    label: 'sans',
    familyLabel: 'Google Sans Flex',
    cssFamily: "'Google Sans Flex', system-ui, -apple-system, sans-serif",
  },
  {
    id: 'g-code',
    label: 'flex code',
    familyLabel: 'Google Sans Code',
    cssFamily: "'Google Sans Code', ui-monospace, SFMono-Regular, monospace",
  },
  {
    id: 'plex-serif',
    label: 'editorial',
    familyLabel: 'IBM Plex Serif',
    cssFamily: "'IBM Plex Serif', Georgia, Cambria, serif",
  },
  {
    id: 'serif',
    label: 'serif',
    familyLabel: 'Lora',
    cssFamily: "'Lora', Georgia, Cambria, serif",
  },
];

export const SOUND_OPTIONS: SoundOption[] = [
  {
    id: 'thock',
    label: 'thock',
    detail: 'deep tactile keycap',
  },
  {
    id: 'creamy',
    label: 'creamy',
    detail: 'smooth lubed linear switch',
  },
  {
    id: 'typewriter',
    label: 'typewriter',
    detail: 'crisp mechanical click',
  },
  {
    id: 'buckling',
    label: 'buckling',
    detail: 'springy vintage IBM snap',
  },
  {
    id: 'droplet',
    label: 'droplet',
    detail: 'soft glassy resonance',
  },
  {
    id: 'marimba',
    label: 'marimba',
    detail: 'warm wooden mallet',
  },
  {
    id: '8bit',
    label: '8-bit',
    detail: 'retro chiptune pulse',
  },
  {
    id: 'off',
    label: 'silent',
    detail: 'no typing audio',
  },
];

export const PALETTES: ColorPalette[] = [
  {
    id: 'noir',
    name: 'noir',
    swatches: ['#000000', '#262626', '#f44b7a', '#ffffff'],
    bg: '#000000',
    surface: '#19191c',
    text: '#ffffff',
    muted: '#9e9ea6',
    accent: '#f44b7a',
    jewel: '#f44b7a',
    star: '#ffffff',
    border: '#2c2c32',
    selection: 'rgba(244, 75, 122, 0.28)',
  },
  {
    id: 'hollow-dusk',
    name: 'hollow dusk',
    swatches: ['#051f39', '#4a2480', '#c53a9d', '#ff8e80'],
    bg: '#051f39',
    surface: '#2b1f5c',
    text: '#ff8e80',
    muted: '#e08ec7',
    accent: '#c53a9d',
    jewel: '#c53a9d',
    star: '#c53a9d',
    border: '#4a2480',
    selection: 'rgba(197, 58, 157, 0.36)',
  },
  {
    id: 'velvet-sunset',
    name: 'velvet sunset',
    swatches: ['#7c3f58', '#eb6b6f', '#f9a875', '#fff6d3'],
    bg: '#7c3f58',
    surface: '#6a334a',
    text: '#fff6d3',
    muted: '#f9a875',
    accent: '#eb6b6f',
    jewel: '#eb6b6f',
    star: '#f9a875',
    border: '#eb6b6f',
    selection: 'rgba(235, 107, 111, 0.42)',
  },
  {
    id: 'abyssal-jade',
    name: 'abyssal jade',
    swatches: ['#0f052d', '#203671', '#36868f', '#5fc75d'],
    bg: '#0f052d',
    surface: '#1a2859',
    text: '#a4eba2',
    muted: '#5eb6be',
    accent: '#5fc75d',
    jewel: '#5fc75d',
    star: '#36868f',
    border: '#203671',
    selection: 'rgba(95, 199, 93, 0.28)',
  },
  {
    id: 'coral-tide',
    name: 'coral tide',
    swatches: ['#00303b', '#ff7777', '#ffce96', '#f1f2da'],
    bg: '#00303b',
    surface: '#063d4a',
    text: '#f1f2da',
    muted: '#ffce96',
    accent: '#ff7777',
    jewel: '#ff7777',
    star: '#ffce96',
    border: 'rgba(255, 119, 119, 0.5)',
    selection: 'rgba(255, 119, 119, 0.36)',
  },
  {
    id: 'mauve-ash',
    name: 'mauve ash',
    swatches: ['#282328', '#545c7e', '#c56981', '#a3a29a'],
    bg: '#282328',
    surface: '#3b3e54',
    text: '#d7d6cf',
    muted: '#a3a29a',
    accent: '#c56981',
    jewel: '#c56981',
    star: '#c56981',
    border: '#545c7e',
    selection: 'rgba(197, 105, 129, 0.34)',
  },
  {
    id: 'violet-cyan',
    name: 'violet cyan',
    swatches: ['#622e4c', '#7550e8', '#608fcf', '#8be5ff'],
    bg: '#622e4c',
    surface: '#593373',
    text: '#8be5ff',
    muted: '#a6c6f0',
    accent: '#7550e8',
    jewel: '#8be5ff',
    star: '#608fcf',
    border: '#7550e8',
    selection: 'rgba(117, 80, 232, 0.44)',
  },
  {
    id: 'olive-phosphor',
    name: 'olive phosphor',
    swatches: ['#d0d058', '#a0a840', '#708028', '#405010'],
    bg: '#405010',
    surface: '#53641a',
    text: '#e3e37c',
    muted: '#c2c965',
    accent: '#d0d058',
    jewel: '#d0d058',
    star: '#a0a840',
    border: '#708028',
    selection: 'rgba(160, 168, 64, 0.42)',
  },
];

export function getPaletteById(
  id: PaletteId,
  customPalettes: ColorPalette[] = [],
): ColorPalette {
  return (
    customPalettes.find((p) => p.id === id) ??
    PALETTES.find((p) => p.id === id) ??
    PALETTES[0]
  );
}

export function getFontById(
  id: string,
  customFonts: FontOption[] = [],
): FontOption {
  return (
    customFonts.find((f) => f.id === id) ??
    FONT_OPTIONS.find((f) => f.id === id) ??
    FONT_OPTIONS[0]
  );
}
