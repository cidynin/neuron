import dataByEmojiRaw from 'unicode-emoji-json/data-by-emoji.json';
import type { EmojiVendorId, EmojiVendorOption } from '../types/neuron';

interface EmojiMeta {
  name: string;
  slug: string;
  group: string;
}

const EMOJI_DATA = dataByEmojiRaw as Record<string, EmojiMeta>;

export const EMOJI_VENDORS: EmojiVendorOption[] = [
  {
    id: 'native',
    label: 'system',
    source: 'device os font',
  },
  {
    id: 'apple',
    label: 'apple',
    source: 'emoji-datasource / emojipedia',
    urlTemplate:
      'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/{code}.png',
    emojipediaVendor: 'apple',
    emojipediaRev: '391',
  },
  {
    id: 'google',
    label: 'google',
    source: 'noto color emoji',
    urlTemplate:
      'https://cdn.jsdelivr.net/npm/emoji-datasource-google@15.1.2/img/google/64/{code}.png',
    emojipediaVendor: 'google',
    emojipediaRev: '412',
  },
  {
    id: 'noto-emoji',
    label: 'noto emoji',
    source: 'emojipedia / google noto monochrome',
    fontFamily: "'Noto Emoji', sans-serif",
  },
  {
    id: 'fluent',
    label: 'fluent 3d',
    source: 'microsoft fluent 3d',
    urlTemplate:
      'https://cdn.jsdelivr.net/npm/@lobehub/fluent-emoji-3d@latest/assets/{code}.webp',
    emojipediaVendor: 'microsoft',
    emojipediaRev: '407',
  },
  {
    id: 'samsung',
    label: 'samsung',
    source: 'emojipedia one ui',
    urlTemplate:
      'https://em-content.zobj.net/source/samsung/405/{slug}_{code}.png',
    emojipediaVendor: 'samsung',
    emojipediaRev: '405',
  },
  {
    id: 'whatsapp',
    label: 'whatsapp',
    source: 'emojipedia whatsapp',
    urlTemplate:
      'https://em-content.zobj.net/source/whatsapp/401/{slug}_{code}.png',
    emojipediaVendor: 'whatsapp',
    emojipediaRev: '401',
  },
  {
    id: 'twitter',
    label: 'twemoji',
    source: 'twitter / x open source',
    urlTemplate:
      'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/{code_no_fe0f}.svg',
  },
  {
    id: 'facebook',
    label: 'facebook',
    source: 'meta emoji set',
    urlTemplate:
      'https://cdn.jsdelivr.net/npm/emoji-datasource-facebook@15.1.2/img/facebook/64/{code}.png',
    emojipediaVendor: 'facebook',
    emojipediaRev: '355',
  },
  {
    id: 'joypixels',
    label: 'joypixels',
    source: 'joypixels 64px',
    urlTemplate:
      'https://cdn.jsdelivr.net/npm/emoji-assets@latest/png/64/{code_no_fe0f}.png',
    emojipediaVendor: 'joypixels',
    emojipediaRev: '340',
  },
  {
    id: 'openmoji',
    label: 'openmoji',
    source: 'openmoji color svg',
    urlTemplate:
      'https://cdn.jsdelivr.net/npm/openmoji@15.1.0/color/svg/{CODE_NO_FE0F}.svg',
  },
  {
    id: 'blobmoji',
    label: 'blobmoji',
    source: 'classic android blobs',
    urlTemplate:
      'https://cdn.jsdelivr.net/npm/@svgmoji/blob@2.0.0/svg/{CODE_NO_FE0F}.svg',
  },
];

// Additional Emojipedia archive vendors resolved when pasted via URL or name
const EMOJIPEDIA_EXTRA_REVS: Record<string, { label: string; rev: string }> = {
  microsoft: { label: 'microsoft flat', rev: '407' },
  'toss-face': { label: 'toss face', rev: '381' },
  lg: { label: 'lg', rev: '307' },
  htc: { label: 'htc', rev: '122' },
  mozilla: { label: 'mozilla', rev: '36' },
  apple: { label: 'apple', rev: '391' },
  google: { label: 'google', rev: '412' },
  samsung: { label: 'samsung', rev: '405' },
  whatsapp: { label: 'whatsapp', rev: '401' },
  facebook: { label: 'facebook', rev: '355' },
  joypixels: { label: 'joypixels', rev: '340' },
};

export function getEmojiVendorById(
  id: EmojiVendorId,
  customVendors: EmojiVendorOption[] = [],
): EmojiVendorOption {
  return (
    customVendors.find((v) => v.id === id) ??
    EMOJI_VENDORS.find((v) => v.id === id) ??
    EMOJI_VENDORS[0]
  );
}

export function emojiToUnifiedCodepoints(
  emoji: string,
  options: { stripFe0f?: boolean; uppercase?: boolean } = {},
): string {
  const { stripFe0f = false, uppercase = false } = options;
  const parts: string[] = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    const hex = cp.toString(16);
    if (stripFe0f && hex === 'fe0f') continue;
    parts.push(uppercase ? hex.toUpperCase() : hex.toLowerCase());
  }
  return parts.join('-');
}

export function getEmojipediaSlug(emoji: string): string | null {
  const direct = EMOJI_DATA[emoji];
  if (direct?.slug) {
    return direct.slug.replace(/_/g, '-');
  }
  const withFe0f = emoji.includes('\uFE0F') ? emoji : `${emoji}\uFE0F`;
  if (EMOJI_DATA[withFe0f]?.slug) {
    return EMOJI_DATA[withFe0f].slug.replace(/_/g, '-');
  }
  const withoutFe0f = emoji.replace(/\uFE0F/g, '');
  if (EMOJI_DATA[withoutFe0f]?.slug) {
    return EMOJI_DATA[withoutFe0f].slug.replace(/_/g, '-');
  }
  return null;
}

function interpolateTemplate(
  template: string,
  emoji: string,
  preferStripFe0f = false,
): string | null {
  const codeWithFe0f = emojiToUnifiedCodepoints(emoji, {
    stripFe0f: false,
    uppercase: false,
  });
  const codeNoFe0f = emojiToUnifiedCodepoints(emoji, {
    stripFe0f: true,
    uppercase: false,
  });
  const chosenLower = preferStripFe0f ? codeNoFe0f : codeWithFe0f;
  const chosenUpper = chosenLower.toUpperCase();

  let url = template
    .replace(/\{code\}/g, chosenLower)
    .replace(/\{CODE\}/g, chosenUpper)
    .replace(/\{code_no_fe0f\}/g, codeNoFe0f)
    .replace(/\{CODE_NO_FE0F\}/g, codeNoFe0f.toUpperCase());

  if (url.includes('{slug}')) {
    const slug = getEmojipediaSlug(emoji);
    if (!slug) return null;
    url = url.replace(/\{slug\}/g, slug);
  }
  return url;
}

/**
 * Returns ordered candidate CDN URLs for rendering `emoji` in `vendor` style.
 * Empty array means render native OS glyph (`system`).
 */
export function getEmojiImageUrls(
  emoji: string,
  vendor: EmojiVendorOption,
): string[] {
  if (vendor.id === 'native' || (!vendor.urlTemplate && !vendor.emojipediaVendor)) {
    return [];
  }

  const candidates: string[] = [];
  if (vendor.urlTemplate) {
    const primary = interpolateTemplate(vendor.urlTemplate, emoji, false);
    const alternate = interpolateTemplate(vendor.urlTemplate, emoji, true);
    if (primary) candidates.push(primary);
    if (alternate && !candidates.includes(alternate)) candidates.push(alternate);
  }

  // Automatic Emojipedia fallback if vendor provides Emojipedia vendor+revision
  if (vendor.emojipediaVendor && vendor.emojipediaRev) {
    const zobjTemplate = `https://em-content.zobj.net/source/${vendor.emojipediaVendor}/${vendor.emojipediaRev}/{slug}_{code}.png`;
    const zobjPrimary = interpolateTemplate(zobjTemplate, emoji, false);
    const zobjAlt = interpolateTemplate(zobjTemplate, emoji, true);
    if (zobjPrimary && !candidates.includes(zobjPrimary)) candidates.push(zobjPrimary);
    if (zobjAlt && !candidates.includes(zobjAlt)) candidates.push(zobjAlt);
  }

  return candidates;
}

export interface EmojiTextPart {
  type: 'text' | 'emoji';
  value: string;
  start: number;
  end: number;
}

const EMOJI_CLUSTER_REGEX =
  /(?:\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]{2}|[0-9#*]\uFE0F?\u20E3)/u;

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('en', { granularity: 'grapheme' })
    : null;

export function isEmojiGrapheme(grapheme: string): boolean {
  if (!grapheme) return false;
  return EMOJI_CLUSTER_REGEX.test(grapheme);
}

/**
 * Splits any string into alternating plain-text and emoji grapheme segments
 * preserving exact UTF-16 character offsets (`start` / `end`).
 */
export function splitTextWithEmojis(text: string): EmojiTextPart[] {
  if (!text) return [];
  const parts: EmojiTextPart[] = [];
  let buffer = '';
  let bufferStart = 0;

  const pushBuffer = (endIdx: number) => {
    if (buffer) {
      parts.push({
        type: 'text',
        value: buffer,
        start: bufferStart,
        end: endIdx,
      });
      buffer = '';
    }
  };

  if (segmenter) {
    for (const seg of segmenter.segment(text)) {
      const g = seg.segment;
      const idx = seg.index;
      if (isEmojiGrapheme(g)) {
        pushBuffer(idx);
        parts.push({
          type: 'emoji',
          value: g,
          start: idx,
          end: idx + g.length,
        });
        bufferStart = idx + g.length;
      } else {
        if (!buffer) bufferStart = idx;
        buffer += g;
      }
    }
    pushBuffer(text.length);
  } else {
    let offset = 0;
    for (const ch of text) {
      if (isEmojiGrapheme(ch)) {
        pushBuffer(offset);
        parts.push({
          type: 'emoji',
          value: ch,
          start: offset,
          end: offset + ch.length,
        });
        bufferStart = offset + ch.length;
      } else {
        if (!buffer) bufferStart = offset;
        buffer += ch;
      }
      offset += ch.length;
    }
    pushBuffer(text.length);
  }

  return parts;
}

export function parseEmojiVendorInput(rawInput: string): EmojiVendorOption {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('paste an emojipedia vendor link or custom image template');
  }

  const lower = trimmed.toLowerCase();

  // 1. Direct match by built-in vendor id or alias
  const aliasMap: Record<string, EmojiVendorId> = {
    system: 'native',
    native: 'native',
    apple: 'apple',
    ios: 'apple',
    macos: 'apple',
    google: 'google',
    noto: 'google',
    android: 'google',
    'noto-emoji': 'noto-emoji',
    notoemoji: 'noto-emoji',
    fluent: 'fluent',
    'fluent-3d': 'fluent',
    samsung: 'samsung',
    whatsapp: 'whatsapp',
    twitter: 'twitter',
    twemoji: 'twitter',
    x: 'twitter',
    facebook: 'facebook',
    meta: 'facebook',
    messenger: 'facebook',
    joypixels: 'joypixels',
    emojione: 'joypixels',
    openmoji: 'openmoji',
    blobmoji: 'blobmoji',
    blob: 'blobmoji',
  };

  if (aliasMap[lower]) {
    const match = EMOJI_VENDORS.find((v) => v.id === aliasMap[lower]);
    if (match) return match;
  }

  // 2. Custom CDN template URL containing placeholders
  if (
    /^https?:\/\//i.test(trimmed) &&
    /\{(code|CODE|code_no_fe0f|CODE_NO_FE0F|slug)\}/.test(trimmed)
  ) {
    let hostLabel = 'custom';
    try {
      hostLabel = new URL(trimmed).hostname.replace(/^www\./, '').split('.')[0];
    } catch {
      // Keep fallback label
    }
    return {
      id: `custom-${hostLabel}-${Date.now().toString(36)}`,
      label: hostLabel,
      source: 'custom emoji source',
      urlTemplate: trimmed,
      isCustom: true,
    };
  }

  // 3. Direct Emojipedia image URL: https://em-content.zobj.net/source/<vendor>/<rev>/<slug>_<code>.png
  const zobjMatch = trimmed.match(
    /em-content\.zobj\.net\/source\/([a-z0-9-]+)\/(\d+)\//i,
  );
  if (zobjMatch) {
    const vendorSlug = zobjMatch[1].toLowerCase();
    const rev = zobjMatch[2];
    return {
      id: `emojipedia-${vendorSlug}-${rev}`,
      label: vendorSlug.replace(/-/g, ' '),
      source: `emojipedia ${vendorSlug}`,
      urlTemplate: `https://em-content.zobj.net/source/${vendorSlug}/${rev}/{slug}_{code}.png`,
      emojipediaVendor: vendorSlug,
      emojipediaRev: rev,
      isCustom: true,
    };
  }

  // 4. Emojipedia vendor page URL: https://emojipedia.org/<vendor>
  const emojipediaPageMatch = trimmed.match(
    /emojipedia\.org\/([a-z0-9-]+)(?:\/|$|\?)/i,
  );
  if (emojipediaPageMatch || EMOJIPEDIA_EXTRA_REVS[lower]) {
    const slug = (emojipediaPageMatch?.[1] ?? lower).toLowerCase();

    // If mapped to one of our built-in curated vendors, check extra/built-in
    if (aliasMap[slug] && slug !== 'microsoft') {
      const builtIn = EMOJI_VENDORS.find((v) => v.id === aliasMap[slug]);
      if (builtIn) return builtIn;
    }

    const extra = EMOJIPEDIA_EXTRA_REVS[slug];
    if (extra) {
      return {
        id: `emojipedia-${slug}`,
        label: extra.label,
        source: `emojipedia ${slug}`,
        urlTemplate: `https://em-content.zobj.net/source/${slug}/${extra.rev}/{slug}_{code}.png`,
        emojipediaVendor: slug,
        emojipediaRev: extra.rev,
        isCustom: true,
      };
    }

    throw new Error(
      `unsupported emojipedia vendor "${slug}". try samsung, whatsapp, microsoft, toss-face, lg, htc, mozilla, or a {code} image template url`,
    );
  }

  throw new Error(
    'paste an emojipedia vendor url (e.g. emojipedia.org/toss-face), em-content.zobj.net link, or {code} template',
  );
}

export interface EmojiSearchItem {
  emoji: string;
  name: string;
  slug: string;
}

const ALL_EMOJI_ITEMS: EmojiSearchItem[] = Object.entries(EMOJI_DATA).map(
  ([emoji, meta]) => ({
    emoji,
    name: meta.name,
    slug: meta.slug,
  }),
);

export function searchEmojis(query: string, limit = 8): EmojiSearchItem[] {
  const q = query.trim().toLowerCase().replace(/^:+/, '');
  if (q.length < 2) return [];

  const startsWith: EmojiSearchItem[] = [];
  const contains: EmojiSearchItem[] = [];

  for (const item of ALL_EMOJI_ITEMS) {
    const nameLower = item.name.toLowerCase();
    const slugLower = item.slug.toLowerCase();
    if (slugLower.startsWith(q) || nameLower.startsWith(q)) {
      startsWith.push(item);
    } else if (slugLower.includes(q) || nameLower.includes(q)) {
      contains.push(item);
    }
    if (startsWith.length >= limit) break;
  }

  return [...startsWith, ...contains].slice(0, limit);
}
