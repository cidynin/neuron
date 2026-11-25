import type { Note } from '../types/neuron';
import type { ImageAnnotationStroke } from './imageEditor';
import { getNoteTitle, isNoteTrashed } from './notes';

export const IMAGE_URI_PREFIX = 'neuron-img://';

export interface StoredImage {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  originalDataUrl?: string;
  strokes?: ImageAnnotationStroke[];
  redoStrokes?: ImageAnnotationStroke[];
  width: number;
  height: number;
  sizeBytes: number;
  createdAt: number;
}

export interface ImageReference {
  id: string;
  alt: string;
  start: number;
  end: number;
}

export interface GalleryUsage {
  noteId: string;
  noteTitle: string;
  trashed: boolean;
  count: number;
}

export interface GalleryEntry {
  image: StoredImage;
  usages: GalleryUsage[];
  totalCount: number;
}

const IMAGE_MARKDOWN_REGEX = /!\[([^\]\n]*)\]\(neuron-img:\/\/([a-zA-Z0-9_-]+)\)/g;

export function sanitizeImageAlt(name: string): string {
  const cleaned = name
    .replace(/[\r\n[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'image';
}

export function formatImageMarkdown(name: string, imageId: string): string {
  return `![${sanitizeImageAlt(name)}](${IMAGE_URI_PREFIX}${imageId})`;
}

export function extractImageReferences(content: string): ImageReference[] {
  if (!content) return [];
  const refs: ImageReference[] = [];
  IMAGE_MARKDOWN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMAGE_MARKDOWN_REGEX.exec(content)) !== null) {
    refs.push({
      alt: match[1] || 'image',
      id: match[2],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return refs;
}

export function insertImageMarkdownAtCaret(
  content: string,
  caret: number,
  name: string,
  imageId: string,
): { text: string; caret: number } {
  const safeCaret = Math.max(0, Math.min(caret, content.length));
  const token = formatImageMarkdown(name, imageId);
  const before = content.slice(0, safeCaret);
  const after = content.slice(safeCaret);

  const needsLeadingNewline = before.length > 0 && !before.endsWith('\n');
  const needsTrailingNewline = after.length === 0 || !after.startsWith('\n');

  const prefix = needsLeadingNewline ? '\n' : '';
  const suffix = needsTrailingNewline ? '\n' : '';
  const nextText = `${before}${prefix}${token}${suffix}${after}`;
  // Position caret at column 0 of the line immediately following the image
  const nextCaret = before.length + prefix.length + token.length + 1;

  return {
    text: nextText,
    caret: nextCaret,
  };
}

export function removeImageReferenceFromContent(
  content: string,
  imageId: string,
): string {
  const escapedId = imageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lineRegex = new RegExp(
    `(?:^|\\n)!\\[[^\\]\\n]*\\]\\(neuron-img://${escapedId}\\)(?=\\n|$)`,
    'g',
  );
  let next = content.replace(lineRegex, '');

  const inlineRegex = new RegExp(
    `!\\[[^\\]\\n]*\\]\\(neuron-img://${escapedId}\\)`,
    'g',
  );
  next = next.replace(inlineRegex, '');
  next = next.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
  return next;
}

export function buildGalleryEntries(
  images: StoredImage[],
  notes: Note[],
): GalleryEntry[] {
  const usageMap = new Map<string, GalleryUsage[]>();

  for (const note of notes) {
    const refs = extractImageReferences(note.content);
    if (refs.length === 0) continue;

    const countsForNote = new Map<string, number>();
    for (const ref of refs) {
      countsForNote.set(ref.id, (countsForNote.get(ref.id) ?? 0) + 1);
    }

    const noteTitle = getNoteTitle(note.content, note.title);
    const trashed = isNoteTrashed(note);

    for (const [imageId, count] of countsForNote.entries()) {
      const list = usageMap.get(imageId) ?? [];
      list.push({
        noteId: note.id,
        noteTitle,
        trashed,
        count,
      });
      usageMap.set(imageId, list);
    }
  }

  return [...images]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((image) => {
      const usages = (usageMap.get(image.id) ?? []).sort((a, b) => {
        if (a.trashed !== b.trashed) return a.trashed ? 1 : -1;
        return a.noteTitle.localeCompare(b.noteTitle);
      });
      const totalCount = usages.reduce((sum, u) => sum + u.count, 0);
      return {
        image,
        usages,
        totalCount,
      };
    });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
