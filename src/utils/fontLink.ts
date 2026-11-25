import type { FontOption } from '../types/neuron';

export interface ParsedGoogleFont {
  familyName: string;
  css2WithWeightsUrl: string;
  css2PlainUrl: string;
}

function cleanFamilyName(raw: string): string {
  return decodeURIComponent(raw.replace(/\+/g, ' '))
    .split(':')[0]
    .replace(/['"]/g, '')
    .trim();
}

export function parseGoogleFontInput(rawInput: string): ParsedGoogleFont | null {
  let trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Extract href if user pasted an HTML <link href="..."> tag
  const hrefMatch = trimmed.match(/href=["']([^"']+)["']/i);
  if (hrefMatch) {
    trimmed = hrefMatch[1].trim();
  }

  // 1. Google Fonts CSS / CSS2 URL: https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap
  if (/fonts\.googleapis\.com\/css/i.test(trimmed)) {
    try {
      const normalizedUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
      const url = new URL(normalizedUrl);
      const familyParam = url.searchParams.get('family');
      if (!familyParam) return null;
      const familyName = cleanFamilyName(familyParam);
      if (!familyName) return null;
      const encoded = encodeURIComponent(familyName).replace(/%20/g, '+');
      return {
        familyName,
        css2WithWeightsUrl: normalizedUrl,
        css2PlainUrl: `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`,
      };
    } catch {
      return null;
    }
  }

  // 2. Google Fonts specimen URL: https://fonts.google.com/specimen/Press+Start+2P
  const specimenMatch = trimmed.match(
    /(?:https?:\/\/)?fonts\.google\.com\/specimen\/([^/?#]+)/i,
  );
  if (specimenMatch) {
    const familyName = cleanFamilyName(specimenMatch[1]);
    if (!familyName) return null;
    const encoded = encodeURIComponent(familyName).replace(/%20/g, '+');
    return {
      familyName,
      css2WithWeightsUrl: `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700&display=swap`,
      css2PlainUrl: `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`,
    };
  }

  // 3. Google Fonts share/selection URL: https://fonts.google.com/share?selection.family=Playfair+Display
  if (/fonts\.google\.com/i.test(trimmed)) {
    try {
      const normalizedUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
      const url = new URL(normalizedUrl);
      const sel = url.searchParams.get('selection.family') || url.searchParams.get('family');
      if (sel) {
        const familyName = cleanFamilyName(sel);
        if (familyName) {
          const encoded = encodeURIComponent(familyName).replace(/%20/g, '+');
          return {
            familyName,
            css2WithWeightsUrl: `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700&display=swap`,
            css2PlainUrl: `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`,
          };
        }
      }
    } catch {
      return null;
    }
  }

  // 4. Direct Google Font family name fallback (e.g. "Space Mono", "Press Start 2P")
  if (!trimmed.includes('/') && !trimmed.includes('http') && /^[a-z0-9\s\-+]+$/i.test(trimmed)) {
    const familyName = cleanFamilyName(trimmed);
    if (familyName.length >= 2) {
      const encoded = encodeURIComponent(familyName).replace(/%20/g, '+');
      return {
        familyName,
        css2WithWeightsUrl: `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700&display=swap`,
        css2PlainUrl: `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`,
      };
    }
  }

  return null;
}

export function buildCustomFontOption(
  familyName: string,
  stylesheetUrl: string,
): FontOption {
  const slug = familyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const safeFamily = familyName.replace(/'/g, '');
  return {
    id: `gfont-${slug || Date.now().toString(36)}`,
    label: familyName.toLowerCase(),
    familyLabel: familyName,
    cssFamily: `'${safeFamily}', system-ui, sans-serif`,
    stylesheetUrl,
    isCustom: true,
  };
}

export function injectFontStylesheet(font: FontOption): void {
  if (typeof document === 'undefined' || !font.stylesheetUrl) return;
  const existing = document.querySelector(`link[data-neuron-font="${font.id}"]`);
  if (existing) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = font.stylesheetUrl;
  link.setAttribute('data-neuron-font', font.id);
  document.head.appendChild(link);
}

export async function resolveGoogleFontFromInput(rawInput: string): Promise<FontOption> {
  const parsed = parseGoogleFontInput(rawInput);
  if (!parsed) {
    throw new Error('paste a google fonts link or font name');
  }

  // Try weighted CSS2 endpoint first, then fallback to default weight URL
  let workingUrl = parsed.css2WithWeightsUrl;
  const res = await fetch(workingUrl);
  if (!res.ok) {
    workingUrl = parsed.css2PlainUrl;
    const fallbackRes = await fetch(workingUrl);
    if (!fallbackRes.ok) {
      throw new Error(`could not load "${parsed.familyName}" from google fonts`);
    }
  }

  const option = buildCustomFontOption(parsed.familyName, workingUrl);
  injectFontStylesheet(option);
  return option;
}
