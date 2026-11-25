import type { ColorPalette } from '../types/neuron';

export type ParsedPaletteSource =
  | { kind: 'lospec'; slug: string; jsonUrl: string; sourceUrl: string }
  | { kind: 'colors'; name: string; colors: string[]; sourceUrl?: string };

export function normalizeHex(raw: string): string | null {
  const cleaned = raw.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const expanded = cleaned
      .split('')
      .map((c) => c + c)
      .join('')
      .toLowerCase();
    return `#${expanded}`;
  }
  return null;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = normalizeHex(hex) ?? '#000000';
  return [
    parseInt(n.slice(1, 3), 16),
    parseInt(n.slice(3, 5), 16),
    parseInt(n.slice(5, 7), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function saturationScore(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  return (max - min) / (max + 0.05);
}

export function parsePaletteInput(rawInput: string): ParsedPaletteSource | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // 1. Lospec palette URL: https://lospec.com/palette-list/<slug>
  const lospecMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?lospec\.com\/palette-list\/([a-z0-9-_]+)(?:\.[a-z0-9]+)?\/?(?:[?#].*)?$/i,
  );
  if (lospecMatch) {
    const slug = lospecMatch[1].toLowerCase();
    return {
      kind: 'lospec',
      slug,
      jsonUrl: `https://lospec.com/palette-list/${slug}.json`,
      sourceUrl: `https://lospec.com/palette-list/${slug}`,
    };
  }

  // 2. Coolors URL: https://coolors.co/051f39-4a2480-c53a9d-ff8e80
  const coolorsMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?coolors\.co\/(?:palette\/)?([0-9a-fA-F]{6}(?:-[0-9a-fA-F]{6})+)/i,
  );
  if (coolorsMatch) {
    const colors = coolorsMatch[1]
      .split('-')
      .map((c) => normalizeHex(c))
      .filter((c): c is string => Boolean(c));
    if (colors.length >= 2) {
      return {
        kind: 'colors',
        name: 'coolors import',
        colors,
        sourceUrl: trimmed.startsWith('http') ? trimmed : `https://${trimmed}`,
      };
    }
  }

  // 3. Color Hunt URL: https://colorhunt.co/palette/051f394a2480c53a9dff8e80
  const colorHuntMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?colorhunt\.co\/palette\/([0-9a-fA-F]{12,48})/i,
  );
  if (colorHuntMatch) {
    const hexStream = colorHuntMatch[1];
    const colors: string[] = [];
    for (let i = 0; i + 6 <= hexStream.length; i += 6) {
      const hex = normalizeHex(hexStream.slice(i, i + 6));
      if (hex) colors.push(hex);
    }
    if (colors.length >= 2) {
      return {
        kind: 'colors',
        name: 'colorhunt import',
        colors,
        sourceUrl: trimmed.startsWith('http') ? trimmed : `https://${trimmed}`,
      };
    }
  }

  // 4. Raw hex codes (space, comma, or dash separated)
  const hexTokens = trimmed.match(/#?[0-9a-fA-F]{6}\b|#?[0-9a-fA-F]{3}\b/g);
  if (hexTokens && hexTokens.length >= 2) {
    const colors = hexTokens
      .map((t) => normalizeHex(t))
      .filter((c): c is string => Boolean(c));
    if (colors.length >= 2) {
      return {
        kind: 'colors',
        name: 'custom palette',
        colors,
      };
    }
  }

  return null;
}

export function buildPaletteFromColors(
  name: string,
  rawColors: string[],
  options?: { id?: string; sourceUrl?: string },
): ColorPalette {
  const normalized = Array.from(
    new Set(
      rawColors
        .map((c) => normalizeHex(c))
        .filter((c): c is string => Boolean(c)),
    ),
  );

  const safeColors = normalized.length >= 2 ? normalized : ['#000000', '#ffffff'];
  const sortedByLum = [...safeColors].sort(
    (a, b) => relativeLuminance(a) - relativeLuminance(b),
  );

  const darkest = sortedByLum[0];
  const lightest = sortedByLum[sortedByLum.length - 1];
  const isLightTheme = relativeLuminance(darkest) > 0.25 && relativeLuminance(lightest) > 0.72;

  // Pigment 1: Primary canvas background
  const bg = isLightTheme ? lightest : darkest;

  // Pigment 4: Primary high-contrast reading/writing ink
  let text = isLightTheme ? darkest : lightest;
  if (contrastRatio(bg, text) < 4.5) {
    const target = isLightTheme ? '#111111' : '#f7f7f5';
    for (const step of [0.35, 0.6, 0.85, 1]) {
      const candidate = mixHex(text, target, step);
      if (contrastRatio(bg, candidate) >= 4.5) {
        text = candidate;
        break;
      }
    }
  }

  // Remaining middle pigments (for 3- or 4-pigment palettes, distribute BOTH middle pigments!)
  const middleColors = sortedByLum.slice(1, -1);
  const nonBg = safeColors.filter((c) => c !== bg);

  // Pigment 2: Structural surface & border pigment (prefers darker/mid-tone distinct from bg & text)
  const borderPigment =
    middleColors[0] ??
    nonBg.find((c) => c !== text) ??
    mixHex(bg, text, 0.22);

  // Pigment 3: Vibrant accent / crest / star pigment (prefers higher saturation & visible contrast)
  const accentPool = middleColors.length >= 2 ? middleColors.slice(1) : nonBg;
  const scoredAccent = [...accentPool].sort((a, b) => {
    const aReadable = contrastRatio(bg, a) >= 2.6 ? 1 : 0;
    const bReadable = contrastRatio(bg, b) >= 2.6 ? 1 : 0;
    if (aReadable !== bReadable) return bReadable - aReadable;
    return saturationScore(b) - saturationScore(a);
  });

  const accent = scoredAccent[0] ?? text;

  // Star & muted use the other middle pigments so all 4 pigments show together
  const star =
    middleColors.find((c) => c !== borderPigment) ?? accent;

  const mutedRaw =
    middleColors.find((c) => contrastRatio(bg, c) >= 3.2) ??
    (contrastRatio(bg, accent) >= 3.2 ? accent : mixHex(text, bg, 0.34));

  const surface = mixHex(bg, borderPigment, 0.35);
  const [ar, ag, ab] = hexToRgb(accent);

  const cleanName = name.trim().toLowerCase().slice(0, 32) || 'custom palette';
  const slug = cleanName.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom';

  return {
    id: options?.id ?? `custom-${slug}-${Date.now().toString(36)}`,
    name: cleanName,
    swatches: safeColors.slice(0, 4),
    bg,
    surface,
    text,
    muted: mutedRaw,
    accent,
    jewel: accent,
    star,
    border: borderPigment,
    selection: `rgba(${ar}, ${ag}, ${ab}, 0.32)`,
    isCustom: true,
    sourceUrl: options?.sourceUrl,
  };
}

export async function resolvePaletteFromInput(rawInput: string): Promise<ColorPalette> {
  const parsed = parsePaletteInput(rawInput);
  if (!parsed) {
    throw new Error('paste a lospec, coolors, colorhunt link, or hex codes');
  }

  if (parsed.kind === 'colors') {
    return buildPaletteFromColors(parsed.name, parsed.colors, {
      sourceUrl: parsed.sourceUrl,
    });
  }

  const res = await fetch(parsed.jsonUrl);
  if (!res.ok) {
    throw new Error(`could not load palette "${parsed.slug}"`);
  }
  const data = (await res.json()) as { name?: string; colors?: string[] };
  if (!Array.isArray(data.colors) || data.colors.length < 2) {
    throw new Error('palette has no usable colors');
  }

  return buildPaletteFromColors(data.name || parsed.slug, data.colors, {
    sourceUrl: parsed.sourceUrl,
  });
}
