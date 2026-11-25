import { isEmojiGrapheme, splitTextWithEmojis } from './emojiVendor';

export interface StyledRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  highlight?: boolean;
  code?: boolean;
  wikilink?: boolean;
  color?: string;
}

export type EmojiRenderTarget =
  | string
  | {
      url?: string | null;
      fontFamily?: string;
      vendorId?: string;
    }
  | null;

export type EmojiResolver = (emoji: string) => EmojiRenderTarget;

export type InlineToggleProp =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'highlight'
  | 'wikilink';

export interface DomNodeLike {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<DomNodeLike>;
  getAttribute?: (name: string) => string | null;
  style?: { color?: string };
}

function sameRunStyle(a: StyledRun, b: StyledRun): boolean {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.underline) === Boolean(b.underline) &&
    Boolean(a.strike) === Boolean(b.strike) &&
    Boolean(a.highlight) === Boolean(b.highlight) &&
    Boolean(a.code) === Boolean(b.code) &&
    Boolean(a.wikilink) === Boolean(b.wikilink) &&
    (a.color ?? '') === (b.color ?? '')
  );
}

export function mergeRuns(runs: StyledRun[]): StyledRun[] {
  const out: StyledRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const prev = out[out.length - 1];
    if (prev && sameRunStyle(prev, run)) {
      prev.text += run.text;
    } else {
      out.push({ ...run });
    }
  }
  return out;
}

export function runsEqual(a: StyledRun[], b: StyledRun[]): boolean {
  const ma = mergeRuns(a);
  const mb = mergeRuns(b);
  if (ma.length !== mb.length) return false;
  for (let i = 0; i < ma.length; i++) {
    if (ma[i].text !== mb[i].text || !sameRunStyle(ma[i], mb[i])) {
      return false;
    }
  }
  return true;
}

const WYSIWYG_INLINE_PATTERN =
  '(\\{color:#[0-9a-fA-F]{3,8}\\}[\\s\\S]*?\\{/color\\}|<u>[^<\\n]+?</u>|`[^`\\n]+`|\\*\\*\\*[^*\\n]+?\\*\\*\\*|___[^_\\n]+?___|\\*\\*[^*\\n]+?\\*\\*|__[^_\\n]+?__|\\+\\+[^+\\n]+?\\+\\+|(?<!\\*)\\*[^*\\s][^*\\n]*?\\*|(?<!\\*)\\*[^*\\s]\\*|~~[^~\\n]+?~~|==[^=\\n]+?==|\\[\\[[^\\]\\n]+?\\]\\])';

export function inlineMarkdownToRuns(
  markdown: string,
  inherited: Omit<StyledRun, 'text'> = {},
): StyledRun[] {
  if (!markdown) return [];
  const runs: StyledRun[] = [];
  const regex = new RegExp(WYSIWYG_INLINE_PATTERN, 'g');
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    if (match.index > cursor) {
      runs.push({
        ...inherited,
        text: markdown.slice(cursor, match.index),
      });
    }

    const raw = match[0];

    if (raw.startsWith('{color:')) {
      const closeBrace = raw.indexOf('}');
      const hex = raw.slice('{color:'.length, closeBrace);
      const inner = raw.slice(closeBrace + 1, raw.length - '{/color}'.length);
      runs.push(
        ...inlineMarkdownToRuns(inner, {
          ...inherited,
          color: inherited.color ?? hex,
        }),
      );
    } else if (raw.startsWith('<u>') && raw.endsWith('</u>')) {
      const inner = raw.slice(3, raw.length - 4);
      runs.push(...inlineMarkdownToRuns(inner, { ...inherited, underline: true }));
    } else if (raw.startsWith('`')) {
      runs.push({
        ...inherited,
        text: raw.slice(1, raw.length - 1),
        code: true,
      });
    } else if (raw.startsWith('***') || raw.startsWith('___')) {
      const inner = raw.slice(3, raw.length - 3);
      runs.push(
        ...inlineMarkdownToRuns(inner, { ...inherited, bold: true, italic: true }),
      );
    } else if (raw.startsWith('**')) {
      const inner = raw.slice(2, raw.length - 2);
      runs.push(...inlineMarkdownToRuns(inner, { ...inherited, bold: true }));
    } else if (raw.startsWith('__') || raw.startsWith('++')) {
      const inner = raw.slice(2, raw.length - 2);
      runs.push(...inlineMarkdownToRuns(inner, { ...inherited, underline: true }));
    } else if (raw.startsWith('*')) {
      const inner = raw.slice(1, raw.length - 1);
      runs.push(...inlineMarkdownToRuns(inner, { ...inherited, italic: true }));
    } else if (raw.startsWith('~~')) {
      const inner = raw.slice(2, raw.length - 2);
      runs.push(...inlineMarkdownToRuns(inner, { ...inherited, strike: true }));
    } else if (raw.startsWith('==')) {
      const inner = raw.slice(2, raw.length - 2);
      runs.push(...inlineMarkdownToRuns(inner, { ...inherited, highlight: true }));
    } else if (raw.startsWith('[[')) {
      const inner = raw.slice(2, raw.length - 2);
      runs.push({
        ...inherited,
        text: inner,
        wikilink: true,
      });
    }

    cursor = match.index + raw.length;
  }

  if (cursor < markdown.length) {
    runs.push({
      ...inherited,
      text: markdown.slice(cursor),
    });
  }

  return mergeRuns(runs);
}

export function runsToPlainText(runs: StyledRun[]): string {
  return runs.map((r) => r.text).join('');
}

export function splitRunsAt(runs: StyledRun[], offset: number): {
  index: number;
  out: StyledRun[];
} {
  const out: StyledRun[] = [];
  let pos = 0;
  let splitIndex = runs.length;
  let assigned = false;

  for (const run of runs) {
    const start = pos;
    const end = pos + run.text.length;
    if (!assigned && offset <= start) {
      splitIndex = out.length;
      assigned = true;
    }
    if (offset > start && offset < end) {
      const cut = offset - start;
      out.push({ ...run, text: run.text.slice(0, cut) });
      splitIndex = out.length;
      assigned = true;
      out.push({ ...run, text: run.text.slice(cut) });
    } else {
      out.push({ ...run });
    }
    pos = end;
  }

  if (!assigned) {
    splitIndex = out.length;
  }
  return { index: splitIndex, out };
}

function sliceRunsRange(
  runs: StyledRun[],
  start: number,
  end: number,
): { before: StyledRun[]; target: StyledRun[]; after: StyledRun[] } {
  const s = Math.max(0, Math.min(start, end));
  const e = Math.max(s, Math.max(start, end));
  const first = splitRunsAt(runs, s);
  const adjustedEnd = splitRunsAt(first.out, e);
  // Re-find start index after end split (indices <= splitIdx unchanged since s <= e)
  return {
    before: adjustedEnd.out.slice(0, first.index),
    target: adjustedEnd.out.slice(first.index, adjustedEnd.index),
    after: adjustedEnd.out.slice(adjustedEnd.index),
  };
}

export function toggleRunFormat(
  runs: StyledRun[],
  start: number,
  end: number,
  prop: InlineToggleProp,
): StyledRun[] {
  if (start === end) return runs;
  const { before, target, after } = sliceRunsRange(runs, start, end);
  const allActive =
    target.length > 0 && target.every((run) => Boolean(run[prop]));
  const nextVal = !allActive;
  const updatedTarget = target.map((run) => {
    const copy = { ...run };
    if (nextVal) {
      copy[prop] = true;
    } else {
      delete copy[prop];
    }
    return copy;
  });
  return mergeRuns([...before, ...updatedTarget, ...after]);
}

export function applyRunColor(
  runs: StyledRun[],
  start: number,
  end: number,
  hexColor: string | null,
): StyledRun[] {
  if (start === end) return runs;
  const { before, target, after } = sliceRunsRange(runs, start, end);
  const updatedTarget = target.map((run) => {
    const copy = { ...run };
    if (hexColor) {
      copy.color = hexColor;
    } else {
      delete copy.color;
    }
    return copy;
  });
  return mergeRuns([...before, ...updatedTarget, ...after]);
}

export function replaceVisibleRangeInRuns(
  runs: StyledRun[],
  start: number,
  end: number,
  replacement: string,
): StyledRun[] {
  const { before, target, after } = sliceRunsRange(runs, start, end);
  const templateStyle: Omit<StyledRun, 'text'> = target[0]
    ? {
        bold: target[0].bold,
        italic: target[0].italic,
        underline: target[0].underline,
        strike: target[0].strike,
        highlight: target[0].highlight,
        code: target[0].code,
        wikilink: target[0].wikilink,
        color: target[0].color,
      }
    : {};
  return mergeRuns([
    ...before,
    ...(replacement ? [{ ...templateStyle, text: replacement }] : []),
    ...after,
  ]);
}

export function runsToInlineMarkdown(runs: StyledRun[]): string {
  const merged = mergeRuns(runs);
  return merged
    .map((run) => {
      let out = run.text;
      if (run.code) {
        out = `\`${out}\``;
      } else {
        if (run.wikilink) out = `[[${out}]]`;
        if (run.bold) out = `**${out}**`;
        if (run.italic) out = `*${out}*`;
        if (run.underline) out = `__${out}__`;
        if (run.strike) out = `~~${out}~~`;
        if (run.highlight) out = `==${out}==`;
      }
      if (run.color) {
        out = `{color:${run.color}}${out}{/color}`;
      }
      return out;
    })
    .join('');
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttr(value: string): string {
  return escapeHtmlText(value).replace(/"/g, '&quot;');
}

function renderTextWithCustomEmojis(
  text: string,
  resolveEmoji?: EmojiResolver,
): string {
  if (!resolveEmoji) {
    return escapeHtmlText(text);
  }
  const parts = splitTextWithEmojis(text);
  let out = '';
  for (const part of parts) {
    if (part.type === 'text') {
      out += escapeHtmlText(part.value);
      continue;
    }
    const emoji = part.value;
    const resolved = resolveEmoji(emoji);
    const descriptor =
      typeof resolved === 'string'
        ? { url: resolved }
        : resolved;
    const safe = escapeHtmlAttr(emoji);

    if (descriptor?.fontFamily) {
      const displayGlyph = escapeHtmlText(emoji.replace(/\uFE0F/g, ''));
      const vendorAttr = descriptor.vendorId
        ? ` data-emoji-vendor="${escapeHtmlAttr(descriptor.vendorId)}"`
        : '';
      out += `<span contenteditable="false" data-emoji="${safe}"${vendorAttr} style="font-family: ${escapeHtmlAttr(descriptor.fontFamily)}; font-variant-emoji: text;" class="inline-block leading-none select-none">${displayGlyph}</span>`;
    } else if (descriptor?.url) {
      const vendorAttr = descriptor.vendorId
        ? ` data-emoji-vendor="${escapeHtmlAttr(descriptor.vendorId)}"`
        : '';
      out += `<img src="${escapeHtmlAttr(descriptor.url)}" alt="${safe}" data-emoji="${safe}"${vendorAttr} draggable="false" class="inline-block h-[1.02em] w-[1.02em] align-[-0.14em] select-none" />`;
    } else {
      out += escapeHtmlText(emoji);
    }
  }
  return out;
}

export function runsToHtml(
  runs: StyledRun[],
  resolveEmoji?: EmojiResolver,
): string {
  const merged = mergeRuns(runs);
  if (merged.length === 0) return '';
  return merged
    .map((run) => {
      let inner = renderTextWithCustomEmojis(run.text, resolveEmoji);
      if (run.code) {
        inner = `<code class="neuron-inline-code rounded-[3px] px-1" style="background-color: var(--neuron-surface); color: var(--neuron-accent);">${inner}</code>`;
      } else {
        if (run.wikilink) {
          const colorAttr = run.color
            ? ` data-neuron-color="${escapeHtmlAttr(run.color)}"`
            : '';
          inner = `<span data-wikilink="1"${colorAttr} class="underline decoration-1 underline-offset-4" style="color: ${escapeHtmlAttr(run.color ?? 'var(--neuron-accent)')}; text-decoration-color: ${escapeHtmlAttr(run.color ?? 'var(--neuron-accent)')};">${inner}</span>`;
        }
        if (run.highlight) {
          inner = `<mark class="neuron-highlight">${inner}</mark>`;
        }
        if (run.strike) {
          inner = `<del class="line-through opacity-55">${inner}</del>`;
        }
        if (run.underline) {
          inner = `<u class="neuron-underline">${inner}</u>`;
        }
        if (run.italic) {
          inner = `<em>${inner}</em>`;
        }
        if (run.bold) {
          inner = `<strong>${inner}</strong>`;
        }
      }
      if (run.color && !run.wikilink) {
        const safeColor = escapeHtmlAttr(run.color);
        inner = `<span data-neuron-color="${safeColor}" style="color: ${safeColor};">${inner}</span>`;
      }
      return inner;
    })
    .join('');
}

export function inlineMarkdownToHtml(
  markdown: string,
  resolveEmoji?: EmojiResolver,
): string {
  return runsToHtml(inlineMarkdownToRuns(markdown), resolveEmoji);
}

function rgbOrHexToHex(rawColor: string | null | undefined): string | undefined {
  if (!rawColor) return undefined;
  const trimmed = rawColor.trim();
  if (trimmed.startsWith('#')) return trimmed;
  const rgbMatch = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (!rgbMatch) return undefined;
  const toHex = (n: string) =>
    Math.max(0, Math.min(255, parseInt(n, 10)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
}

export function domToRuns(
  node: DomNodeLike,
  inherited: Omit<StyledRun, 'text'> = {},
): StyledRun[] {
  // Text node (nodeType === 3)
  if (node.nodeType === 3) {
    const rawText = (node.textContent ?? '').replace(/\u00A0/g, ' ').replace(/\u200B/g, '');
    if (!rawText) return [];
    return [{ ...inherited, text: rawText }];
  }

  // Element node (nodeType === 1) or DocumentFragment (nodeType === 11)
  if (node.nodeType === 11) {
    const out: StyledRun[] = [];
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      out.push(...domToRuns(children[i], inherited));
    }
    return mergeRuns(out);
  }

  if (node.nodeType !== 1) return [];

  const tag = node.nodeName.toUpperCase();
  if (tag === 'BR') {
    return [];
  }

  if (tag === 'IMG') {
    const emoji = node.getAttribute?.('data-emoji') ?? node.getAttribute?.('alt') ?? '';
    if (!emoji) return [];
    return [{ ...inherited, text: emoji }];
  }

  const atomicEmoji = node.getAttribute?.('data-emoji');
  if (atomicEmoji) {
    return [{ ...inherited, text: atomicEmoji }];
  }

  const nextStyle: Omit<StyledRun, 'text'> = { ...inherited };

  if (tag === 'STRONG' || tag === 'B') nextStyle.bold = true;
  if (tag === 'EM' || tag === 'I') nextStyle.italic = true;
  if (tag === 'U') nextStyle.underline = true;
  if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') nextStyle.strike = true;
  if (tag === 'MARK') nextStyle.highlight = true;
  if (tag === 'CODE') nextStyle.code = true;

  if (node.getAttribute?.('data-wikilink')) {
    nextStyle.wikilink = true;
  }

  const explicitColor = node.getAttribute?.('data-neuron-color');
  if (explicitColor) {
    nextStyle.color = explicitColor;
  } else if (tag === 'FONT' && node.getAttribute?.('color')) {
    const c = rgbOrHexToHex(node.getAttribute('color'));
    if (c) nextStyle.color = c;
  } else if (tag === 'SPAN' && node.style?.color && !node.getAttribute?.('data-wikilink')) {
    const c = rgbOrHexToHex(node.style.color);
    if (c) nextStyle.color = c;
  }

  const out: StyledRun[] = [];
  const children = node.childNodes;
  for (let i = 0; i < children.length; i++) {
    out.push(...domToRuns(children[i], nextStyle));
  }
  return mergeRuns(out);
}

export function domToInlineMarkdown(root: DomNodeLike): string {
  return runsToInlineMarkdown(domToRuns(root));
}

/**
 * Expands any closed inline markdown syntax written inside plain DOM text runs (e.g. **bold**, *italic*, __underline__, ==highlight==, [[link]])
 * into true styled WYSIWYG runs and returns updated markdown + adjusted visible caret offset.
 */
export function expandPlainRunsInlineShortcuts(
  runs: StyledRun[],
  visibleCaretOffset: number,
): { runs: StyledRun[]; visibleCaretOffset: number; changed: boolean } {
  let changed = false;
  const origCaret = visibleCaretOffset;
  let totalDeltaBeforeCaret = 0;
  let runningPlainOffset = 0;
  const out: StyledRun[] = [];

  for (const run of runs) {
    const startOff = runningPlainOffset;
    const endOff = startOff + run.text.length;
    if (!run.code && !run.wikilink) {
      const reparsed = inlineMarkdownToRuns(run.text, {
        bold: run.bold,
        italic: run.italic,
        underline: run.underline,
        strike: run.strike,
        highlight: run.highlight,
        color: run.color,
      });
      const reparsedLen = runsToPlainText(reparsed).length;
      if (reparsedLen < run.text.length) {
        changed = true;
        const delta = run.text.length - reparsedLen;
        if (origCaret >= endOff) {
          totalDeltaBeforeCaret += delta;
        } else if (origCaret > startOff) {
          const clampedWithin = Math.min(origCaret - startOff, reparsedLen);
          totalDeltaBeforeCaret += origCaret - startOff - clampedWithin;
        }
        out.push(...reparsed);
        runningPlainOffset = endOff;
        continue;
      }
    }
    out.push(run);
    runningPlainOffset = endOff;
  }

  return {
    runs: changed ? mergeRuns(out) : runs,
    visibleCaretOffset: Math.max(0, origCaret - totalDeltaBeforeCaret),
    changed,
  };
}

export function convertCompletedInlineShortcuts(
  markdown: string,
  visibleCaretOffset: number,
): { markdown: string; visibleCaretOffset: number; changed: boolean } {
  const runs = inlineMarkdownToRuns(markdown);
  const plainLen = runsToPlainText(runs).length;
  if (plainLen < markdown.length && runs.some((r) => r.bold || r.italic || r.underline || r.highlight || r.wikilink || r.strike || r.code || r.color)) {
    return {
      markdown: runsToInlineMarkdown(runs),
      visibleCaretOffset: Math.min(visibleCaretOffset, plainLen),
      changed: true,
    };
  }
  return { markdown, visibleCaretOffset, changed: false };
}

/**
 * Measures / sets selection by visible text offsets across text nodes & emoji <img> nodes inside a contentEditable root.
 */
function getLeafLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\u200B/g, '').length;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    const dataEmoji = el.getAttribute('data-emoji');
    if (dataEmoji) return dataEmoji.length;
    if (el.tagName === 'IMG') {
      const emoji = el.getAttribute('alt') ?? '';
      return emoji.length || 1;
    }
  }
  return 0;
}

function collectVisibleLeaves(root: Node): Node[] {
  const leaves: Node[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      leaves.push(n);
      return;
    }
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as Element;
      if (el.tagName === 'IMG' || el.hasAttribute('data-emoji')) {
        leaves.push(n);
        return;
      }
      if (el.tagName === 'BR') return;
      for (let i = 0; i < n.childNodes.length; i++) {
        walk(n.childNodes[i]);
      }
    }
  };
  walk(root);
  return leaves;
}

export function getVisibleOffsetForDomPoint(
  root: HTMLElement,
  targetNode: Node,
  targetOffset: number,
): number {
  if (targetNode === root && targetOffset <= 0) return 0;

  let total = 0;
  let found = false;

  const visit = (n: Node) => {
    if (found) return;

    if (n === targetNode) {
      if (n.nodeType === Node.TEXT_NODE) {
        const prefix = (n.textContent ?? '')
          .slice(0, targetOffset)
          .replace(/\u200B/g, '');
        total += prefix.length;
        found = true;
        return;
      }
      if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as Element;
        if (el.tagName === 'IMG' || el.hasAttribute('data-emoji')) {
          if (targetOffset > 0) total += getLeafLength(n);
          found = true;
          return;
        }
        const limit = Math.min(targetOffset, n.childNodes.length);
        for (let i = 0; i < limit; i++) {
          visit(n.childNodes[i]);
          if (found) return;
        }
        found = true;
        return;
      }
    }

    if (n.nodeType === Node.TEXT_NODE) {
      total += getLeafLength(n);
      return;
    }

    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as Element;
      if (el.tagName === 'IMG' || el.hasAttribute('data-emoji')) {
        if (n.contains(targetNode)) {
          if (targetOffset > 0) total += getLeafLength(n);
          found = true;
          return;
        }
        total += getLeafLength(n);
        return;
      }
      if (el.tagName === 'BR') return;
      for (let i = 0; i < n.childNodes.length; i++) {
        visit(n.childNodes[i]);
        if (found) return;
      }
    }
  };

  visit(root);
  return total;
}

export function getVisibleSelectionOffsets(
  root: HTMLElement,
): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }

  const s = getVisibleOffsetForDomPoint(root, range.startContainer, range.startOffset);
  const e = range.collapsed
    ? s
    : getVisibleOffsetForDomPoint(root, range.endContainer, range.endOffset);
  return { start: Math.min(s, e), end: Math.max(s, e) };
}

function isEmojiDomElement(node: Node | null | undefined): boolean {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as Element;
  return el.tagName === 'IMG' || el.hasAttribute('data-emoji');
}

function findDomPointForVisibleOffset(
  root: HTMLElement,
  targetOffset: number,
  preferOutsideInlineEnd = false,
): { container: Node; offset: number; escapedInlineWrapper: boolean } {
  const leaves = collectVisibleLeaves(root);
  if (leaves.length === 0) {
    return { container: root, offset: 0, escapedInlineWrapper: false };
  }

  let remaining = Math.max(0, targetOffset);
  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    const len = getLeafLength(leaf);
    if (remaining <= len) {
      if (
        preferOutsideInlineEnd &&
        remaining === len &&
        leaf.parentNode &&
        leaf.parentNode !== root &&
        !isEmojiDomElement(leaf.parentNode)
      ) {
        let topInline: Node = leaf.parentNode;
        while (topInline.parentNode && topInline.parentNode !== root) {
          topInline = topInline.parentNode;
        }
        if (
          topInline.parentNode === root &&
          !isEmojiDomElement(topInline) &&
          leaf === topInline.lastChild
        ) {
          const idx = Array.prototype.indexOf.call(root.childNodes, topInline);
          if (idx !== -1) {
            return {
              container: root,
              offset: idx + 1,
              escapedInlineWrapper: true,
            };
          }
        }
      }
      if (leaf.nodeType === Node.TEXT_NODE) {
        const raw = leaf.textContent ?? '';
        let realIdx = 0;
        let visSeen = 0;
        while (realIdx < raw.length && visSeen < remaining) {
          if (raw[realIdx] !== '\u200B') visSeen += 1;
          realIdx += 1;
        }
        return { container: leaf, offset: realIdx, escapedInlineWrapper: false };
      }
      const parent = leaf.parentNode ?? root;
      const childIdx = Array.prototype.indexOf.call(parent.childNodes, leaf);
      return {
        container: parent,
        offset: remaining === 0 ? childIdx : childIdx + 1,
        escapedInlineWrapper: false,
      };
    }
    remaining -= len;
  }

  const last = leaves[leaves.length - 1];
  if (last.nodeType === Node.TEXT_NODE) {
    return {
      container: last,
      offset: (last.textContent ?? '').length,
      escapedInlineWrapper: false,
    };
  }
  const parent = last.parentNode ?? root;
  return {
    container: parent,
    offset: parent.childNodes.length,
    escapedInlineWrapper: false,
  };
}

export function setVisibleSelectionOffsets(
  root: HTMLElement,
  start: number,
  end = start,
  preferOutsideInlineEnd = false,
): void {
  const sel = window.getSelection();
  if (!sel) return;
  const s = Math.min(start, end);
  const e = Math.max(start, end);
  let p1 = findDomPointForVisibleOffset(root, s, s === e && preferOutsideInlineEnd);
  if (
    s === e &&
    preferOutsideInlineEnd &&
    p1.escapedInlineWrapper &&
    p1.container === root
  ) {
    const nextNode = root.childNodes[p1.offset] ?? null;
    if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
      p1 = { container: nextNode, offset: 0, escapedInlineWrapper: false };
    } else {
      const zws = document.createTextNode('\u200B');
      root.insertBefore(zws, nextNode);
      p1 = { container: zws, offset: 1, escapedInlineWrapper: false };
    }
  }
  const p2 = s === e ? p1 : findDomPointForVisibleOffset(root, e);
  const range = document.createRange();
  try {
    range.setStart(p1.container, p1.offset);
    range.setEnd(p2.container, p2.offset);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // Ignore transient DOM range errors
  }
}

export function findVisibleTextRangeInDom(
  root: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const p1 = findDomPointForVisibleOffset(root, start);
  const p2 = findDomPointForVisibleOffset(root, end);
  const range = document.createRange();
  try {
    range.setStart(p1.container, p1.offset);
    range.setEnd(p2.container, p2.offset);
    return range;
  } catch {
    return null;
  }
}

const graphemeSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('en', { granularity: 'grapheme' })
    : null;

function listGraphemeSegments(text: string): Array<{ segment: string; start: number; end: number }> {
  const segments: Array<{ segment: string; start: number; end: number }> = [];
  if (!text) return segments;
  if (graphemeSegmenter) {
    for (const seg of graphemeSegmenter.segment(text)) {
      segments.push({
        segment: seg.segment,
        start: seg.index,
        end: seg.index + seg.segment.length,
      });
    }
    return segments;
  }
  let idx = 0;
  for (const ch of text) {
    segments.push({ segment: ch, start: idx, end: idx + ch.length });
    idx += ch.length;
  }
  return segments;
}

/**
 * Steps a visible UTF-16 caret offset left (-1) or right (+1) by one full grapheme cluster,
 * ensuring multi-code-unit / ZWJ emojis act as a single atomic character.
 */
export function stepVisibleOffsetByGrapheme(
  text: string,
  offset: number,
  direction: -1 | 1,
): { nextOffset: number; crossedEmoji: boolean; grapheme: string } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  if (!text) {
    return { nextOffset: 0, crossedEmoji: false, grapheme: '' };
  }
  const segs = listGraphemeSegments(text);
  if (direction === -1) {
    if (clamped <= 0) {
      return { nextOffset: 0, crossedEmoji: false, grapheme: '' };
    }
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      if (clamped > s.start && clamped <= s.end) {
        return {
          nextOffset: s.start,
          crossedEmoji: isEmojiGrapheme(s.segment),
          grapheme: s.segment,
        };
      }
    }
    return { nextOffset: 0, crossedEmoji: false, grapheme: '' };
  }

  if (clamped >= text.length) {
    return { nextOffset: text.length, crossedEmoji: false, grapheme: '' };
  }
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (clamped >= s.start && clamped < s.end) {
      return {
        nextOffset: s.end,
        crossedEmoji: isEmojiGrapheme(s.segment),
        grapheme: s.segment,
      };
    }
  }
  return { nextOffset: text.length, crossedEmoji: false, grapheme: '' };
}

/**
 * Detects an active `:shortcode` (or `:shortcode:`) emoji query immediately before the caret,
 * allowing trigger at line start, after whitespace or `(`, or directly after another emoji.
 */
export function findEmojiShortcodeMatch(
  beforeCursor: string,
): { colonStart: number; query: string } | null {
  const match = beforeCursor.match(/(:([a-z0-9_+-]{2,}):?)$/i);
  if (!match) return null;
  const colonStart = beforeCursor.length - match[1].length;
  if (colonStart > 0) {
    const prefix = beforeCursor.slice(0, colonStart).replace(/\u200B+$/g, '');
    if (prefix.length > 0) {
      const lastChar = prefix[prefix.length - 1];
      if (!/[\s(]/.test(lastChar)) {
        const segs = listGraphemeSegments(prefix);
        const lastSeg = segs[segs.length - 1]?.segment ?? '';
        if (!isEmojiGrapheme(lastSeg)) {
          return null;
        }
      }
    }
  }
  return { colonStart, query: match[2] };
}

export interface CaretEdgeRect {
  left: number;
  top: number;
  height: number;
}

function hasUsableRect(rect: DOMRect | null | undefined): rect is DOMRect {
  return Boolean(
    rect &&
      rect.height > 2 &&
      (rect.left !== 0 || rect.top !== 0 || rect.right !== 0),
  );
}

function isVisualDomNode(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\u200B/g, '').length > 0;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    if (el.tagName === 'BR') return false;
    if (isEmojiDomElement(el)) return true;
    return ((el.textContent ?? '').replace(/\u200B/g, '').length > 0) || Boolean(el.querySelector('img, [data-emoji]'));
  }
  return false;
}

function measureNodeEdge(node: Node, edge: 'start' | 'end'): CaretEdgeRect | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const raw = node.textContent ?? '';
    let targetIdx = -1;
    if (edge === 'end') {
      for (let i = raw.length - 1; i >= 0; i--) {
        if (raw[i] !== '\u200B') {
          targetIdx = i;
          break;
        }
      }
    } else {
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] !== '\u200B') {
          targetIdx = i;
          break;
        }
      }
    }
    if (targetIdx === -1) return null;
    const r = document.createRange();
    try {
      r.setStart(node, targetIdx);
      r.setEnd(node, targetIdx + 1);
      const rects = Array.from(r.getClientRects()).filter(hasUsableRect);
      const rect = rects.length > 0 ? rects[edge === 'end' ? rects.length - 1 : 0] : r.getBoundingClientRect();
      if (hasUsableRect(rect)) {
        return {
          left: edge === 'end' ? rect.right : rect.left,
          top: rect.top,
          height: rect.height,
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const rects = Array.from(el.getClientRects()).filter(hasUsableRect);
    const fallback = el.getBoundingClientRect();
    const rect =
      rects.length > 0
        ? rects[edge === 'end' ? rects.length - 1 : 0]
        : hasUsableRect(fallback)
          ? fallback
          : null;
    if (rect) {
      return {
        left: edge === 'end' ? rect.right : rect.left,
        top: rect.top,
        height: rect.height,
      };
    }
  }
  return null;
}

/**
 * Resolves exact visual caret geometry for a collapsed Range inside a contentEditable line,
 * including element boundaries between adjacent emoji <img> / <span data-emoji> nodes where
 * browsers return 0x0 client rects.
 */
export function measureCollapsedCaretRectInLine(
  lineEl: HTMLElement,
  range: Range,
): CaretEdgeRect | null {
  const collapsed = range.cloneRange();
  collapsed.collapse(false);

  const onZwsTextNode =
    collapsed.startContainer.nodeType === Node.TEXT_NODE &&
    (collapsed.startContainer.textContent ?? '').replace(/\u200B/g, '').length === 0;

  if (!onZwsTextNode && collapsed.startContainer.nodeType === Node.TEXT_NODE) {
    const text = collapsed.startContainer.textContent ?? '';
    const off = collapsed.startOffset;
    // Try direct browser rects first when inside real text (and not sitting directly on a ZWS char)
    const charBeforeIsZws = off > 0 && text[off - 1] === '\u200B';
    const charAfterIsZws = off < text.length && text[off] === '\u200B';
    if (!charBeforeIsZws && !charAfterIsZws) {
      const clientRects = Array.from(collapsed.getClientRects()).filter(hasUsableRect);
      const candidate =
        clientRects.length > 0 ? clientRects[clientRects.length - 1] : collapsed.getBoundingClientRect();
      if (hasUsableRect(candidate)) {
        return {
          left: candidate.left,
          top: candidate.top,
          height: candidate.height,
        };
      }
    }
    // Measure neighboring non-ZWS character inside this text node
    for (let i = off - 1; i >= 0; i--) {
      if (text[i] !== '\u200B') {
        const slice = document.createRange();
        slice.setStart(collapsed.startContainer, i);
        slice.setEnd(collapsed.startContainer, i + 1);
        const rects = Array.from(slice.getClientRects()).filter(hasUsableRect);
        const r = rects[rects.length - 1] ?? slice.getBoundingClientRect();
        if (hasUsableRect(r)) {
          return { left: r.right, top: r.top, height: r.height };
        }
        break;
      }
    }
    for (let i = off; i < text.length; i++) {
      if (text[i] !== '\u200B') {
        const slice = document.createRange();
        slice.setStart(collapsed.startContainer, i);
        slice.setEnd(collapsed.startContainer, i + 1);
        const rects = Array.from(slice.getClientRects()).filter(hasUsableRect);
        const r = rects[0] ?? slice.getBoundingClientRect();
        if (hasUsableRect(r)) {
          return { left: r.left, top: r.top, height: r.height };
        }
        break;
      }
    }
  }

  // Element boundary or ZWS-only text node: walk siblings around the boundary
  let cursorEl: Element | null = null;
  let childIdx = 0;

  if (collapsed.startContainer.nodeType === Node.TEXT_NODE) {
    const parent = collapsed.startContainer.parentElement;
    if (!parent || !lineEl.contains(parent)) return null;
    cursorEl = parent;
    const rawIdx = Array.prototype.indexOf.call(parent.childNodes, collapsed.startContainer);
    childIdx = collapsed.startOffset > 0 ? rawIdx + 1 : rawIdx;
  } else if (collapsed.startContainer.nodeType === Node.ELEMENT_NODE) {
    const el = collapsed.startContainer as Element;
    if (!lineEl.contains(el)) return null;
    if (isEmojiDomElement(el)) {
      const parent = el.parentElement;
      if (parent && lineEl.contains(parent)) {
        const idx = Array.prototype.indexOf.call(parent.childNodes, el);
        cursorEl = parent;
        childIdx = collapsed.startOffset > 0 ? idx + 1 : idx;
      } else {
        cursorEl = el;
        childIdx = collapsed.startOffset;
      }
    } else {
      cursorEl = el;
      childIdx = collapsed.startOffset;
    }
  }

  while (cursorEl && lineEl.contains(cursorEl)) {
    const children = cursorEl.childNodes;
    for (let i = Math.min(childIdx - 1, children.length - 1); i >= 0; i--) {
      const node = children[i];
      if (!isVisualDomNode(node)) continue;
      const edge = measureNodeEdge(node, 'end');
      if (edge) return edge;
    }
    for (let i = Math.max(0, childIdx); i < children.length; i++) {
      const node = children[i];
      if (!isVisualDomNode(node)) continue;
      const edge = measureNodeEdge(node, 'start');
      if (edge) return edge;
    }
    if (cursorEl === lineEl) break;
    const parent: Element | null = cursorEl.parentElement;
    if (!parent) break;
    childIdx = Array.prototype.indexOf.call(parent.childNodes, cursorEl);
    cursorEl = parent;
  }

  if (!onZwsTextNode) {
    const clientRects = Array.from(collapsed.getClientRects()).filter(hasUsableRect);
    const candidate =
      clientRects.length > 0 ? clientRects[clientRects.length - 1] : collapsed.getBoundingClientRect();
    if (hasUsableRect(candidate)) {
      return { left: candidate.left, top: candidate.top, height: candidate.height };
    }
  }

  return null;
}
