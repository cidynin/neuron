import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookPlus,
  ChevronDown,
  ChevronRight,
  EyeOff,
  ImagePlus,
} from 'lucide-react';
import type {
  ColorPalette,
  EmojiVendorOption,
  LineSpacing,
  PixelCanvasSize,
  SoundId,
  SoundVolume,
  TextSize,
  TextWidth,
  UiSize,
} from '../types/neuron';
import { getLineSpacingById } from '../data/sizing';
import type { StoredImage } from '../utils/images';
import {
  getEmojiImageUrls,
  searchEmojis,
  splitTextWithEmojis,
  type EmojiSearchItem,
} from '../utils/emojiVendor';
import {
  applyMultiLineColor,
  applyMultiLineHeading,
  applyMultiLineInlineToggle,
  applyMultiLinePrefix,
  extractMultiLinePlainText,
  getLineVisibleSliceBounds,
  isCrossLineSelection,
  normalizeMultiLineSelection,
  replaceMultiLineRange,
  type MultiLineSelection,
} from '../utils/multiLineSelection';
import {
  applyHeadingToRawLine,
  computeHiddenLineIndices,
  parseMarkdownLines,
  renumberOrderedLists,
  toggleRawLinePrefix,
  toggleTaskCheckboxAtLine,
  type ParsedLine,
} from '../utils/obsidianMarkdown';
import {
  applyRunColor,
  domToRuns,
  expandPlainRunsInlineShortcuts,
  findEmojiShortcodeMatch,
  findVisibleTextRangeInDom,
  getVisibleOffsetForDomPoint,
  getVisibleSelectionOffsets,
  inlineMarkdownToHtml,
  inlineMarkdownToRuns,
  measureCollapsedCaretRectInLine,
  replaceVisibleRangeInRuns,
  runsEqual,
  runsToInlineMarkdown,
  runsToPlainText,
  setVisibleSelectionOffsets,
  splitRunsAt,
  stepVisibleOffsetByGrapheme,
  toggleRunFormat,
  type DomNodeLike,
  type EmojiRenderTarget,
  type EmojiResolver,
  type InlineToggleProp,
  type StyledRun,
} from '../utils/wysiwygMarkdown';
import {
  classifyKey,
  classifyKeyEventForSound,
  playTypingSound,
} from '../utils/soundEngine';
import {
  findMisspellings,
  getAutocorrectReplacement,
  getSpellingSuggestions,
  type SpellIssue,
} from '../utils/spellcheck';
import {
  createEmptyPixelCanvas,
  serializePixelCanvas,
} from '../utils/pixelCanvas';
import {
  createDefaultBoxRows,
  parseDocumentBlocks,
  serializeBoxRows,
  type DocumentBlock,
} from '../utils/tableBox';
import { EmojiGlyph } from './EmojiGlyph';
import { ImageLightbox } from './ImageLightbox';
import { InlineImageBlock } from './InlineImageBlock';
import { JewelCrest } from './NeuronStar';
import { PixelCanvasBlock } from './PixelCanvasBlock';
import {
  getSelectionFormattingState,
} from '../utils/selectionFormatting';
import {
  SelectionToolbar,
  type SelectionToolbarPosition,
} from './SelectionToolbar';
import { TableBoxBlock } from './TableBoxBlock';

interface EditorCanvasProps {
  noteId: string;
  content: string;
  sound: SoundId;
  soundVolume: SoundVolume;
  uiSize: UiSize;
  textSize: TextSize;
  lineSpacing: LineSpacing;
  textWidth: TextWidth;
  spellcheckEnabled: boolean;
  autocorrectEnabled: boolean;
  boxShortcutEnabled: boolean;
  pixelShortcutEnabled: boolean;
  pixelCanvasSize: PixelCanvasSize;
  dyslexicMode: boolean;
  emojiVendor: EmojiVendorOption;
  palette: ColorPalette;
  customDictionary: string[];
  images: StoredImage[];
  focusLineRequest?: { noteId: string; lineNumber: number; nonce: number } | null;
  onUploadImages: (files: FileList | File[], insertAtCaret?: number) => Promise<void>;
  onRenameImage: (imageId: string, nextName: string) => void;
  onUpdateImage?: (updated: StoredImage) => void;
  onRemoveImageFromNote: (imageId: string) => void;
  onAddCustomWord: (word: string) => void;
  onChange: (
    nextContent: string,
    options?: { discrete?: boolean; coalesceKey?: string },
  ) => void;
  onUndo?: () => string | null;
  onRedo?: () => string | null;
}

interface SpellPopoverState {
  lineIndex: number;
  issue: SpellIssue;
  suggestions: string[];
  top: number;
  left: number;
}

interface CaretCoords {
  left: number;
  top: number;
  height: number;
  lineHeight: number;
}

function getHeadingScaleStyle(parsed: ParsedLine): React.CSSProperties {
  if (parsed.kind !== 'heading') {
    return { fontSize: 'var(--neuron-editor-size)' };
  }
  if (parsed.headingLevel === 1) {
    return { fontSize: 'calc(var(--neuron-editor-size) * 1.65)', lineHeight: 1.18 };
  }
  if (parsed.headingLevel === 2) {
    return { fontSize: 'calc(var(--neuron-editor-size) * 1.32)', lineHeight: 1.24 };
  }
  return { fontSize: 'calc(var(--neuron-editor-size) * 1.14)', lineHeight: 1.28 };
}

function hasUnstyledEmojiInDom(
  el: HTMLElement,
  vendor: EmojiVendorOption,
): boolean {
  if (vendor.id === 'native' && !vendor.urlTemplate && !vendor.fontFamily) {
    return false;
  }
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (!text) return false;
      return splitTextWithEmojis(text).some((part) => part.type === 'emoji');
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as Element;
      if (elem.hasAttribute('data-emoji') || elem.tagName === 'IMG') {
        return false;
      }
      for (let i = 0; i < elem.childNodes.length; i++) {
        if (walk(elem.childNodes[i])) return true;
      }
    }
    return false;
  };
  return walk(el);
}

function computeLineMisspellings(
  runs: StyledRun[],
  customWords: Set<string>,
  ignoredWords: Set<string>,
  activeCaretInLine: number | null,
): SpellIssue[] {
  const plain = runsToPlainText(runs);
  if (!plain) return [];

  // Identify plain-text ranges belonging to inline code spans so they aren't spellchecked
  const codeRanges: Array<[number, number]> = [];
  let cursor = 0;
  for (const r of runs) {
    const end = cursor + r.text.length;
    if (r.code) codeRanges.push([cursor, end]);
    cursor = end;
  }

  return findMisspellings(
    plain,
    customWords,
    ignoredWords,
    activeCaretInLine,
  ).filter(
    (issue) =>
      !codeRanges.some(([cs, ce]) => issue.start < ce && issue.end > cs),
  );
}

interface LineBlockProps {
  block: Extract<DocumentBlock, { type: 'line' }>;
  parsed: ParsedLine;
  bodyText: string;
  isPrimaryTestId: boolean;
  isActiveLine: boolean;
  inMultiSelection: boolean;
  isCollapsed: boolean;
  hiddenUnderHeaderCount: number;
  dyslexicMode: boolean;
  emojiVendor: EmojiVendorOption;
  uiSize: UiSize;
  textSize: TextSize;
  lineSpacing: LineSpacing;
  textWidth: TextWidth;
  lineGapPx: number;
  resolveEmoji: EmojiResolver;
  pendingSelectionRef: React.MutableRefObject<{
    lineIndex: number;
    start: number;
    end: number;
    preferOutsideInlineEnd?: boolean;
  } | null>;
  consumeLocalEcho: (lineIndex: number, bodyMd: string) => boolean;
  registerEditable: (lineIndex: number, el: HTMLDivElement | null) => void;
  onFocusLine: (lineIndex: number, visStart: number, visEnd: number) => void;
  onBlurLine: (lineIndex: number) => void;
  onDomInput: (lineIndex: number, el: HTMLDivElement) => void;
  onLineKeyDown: (
    lineIndex: number,
    e: React.KeyboardEvent<HTMLDivElement>,
  ) => void;
  onLineMouseDown: (
    lineIndex: number,
    e: React.MouseEvent<HTMLDivElement>,
  ) => void;
  onPastePlainText: (
    lineIndex: number,
    text: string,
    el: HTMLDivElement,
  ) => void;
  onSyncLineSelection: (
    lineIndex: number,
    visStart: number,
    visEnd: number,
    clicked?: boolean,
  ) => void;
  onToggleTask: (parsed: ParsedLine) => void;
  onToggleFold: (lineIndex: number) => void;
  onMeasureActive: () => void;
}

const LineBlock = memo(function LineBlock({
  block,
  parsed,
  bodyText,
  isPrimaryTestId,
  isActiveLine,
  inMultiSelection,
  isCollapsed,
  hiddenUnderHeaderCount,
  dyslexicMode,
  emojiVendor,
  uiSize,
  textSize,
  lineSpacing,
  textWidth,
  lineGapPx,
  resolveEmoji,
  pendingSelectionRef,
  consumeLocalEcho,
  registerEditable,
  onFocusLine,
  onBlurLine,
  onDomInput,
  onLineKeyDown,
  onLineMouseDown,
  onPastePlainText,
  onSyncLineSelection,
  onToggleTask,
  onToggleFold,
  onMeasureActive,
}: LineBlockProps) {
  const editableRef = useRef<HTMLDivElement | null>(null);
  const lastVendorIdRef = useRef<string>(emojiVendor.id);
  const isComposingRef = useRef<boolean>(false);

  const scaleStyle = useMemo(() => getHeadingScaleStyle(parsed), [parsed]);

  const baseTypographyClass = dyslexicMode
    ? 'tracking-[0.04em] [word-spacing:0.14em] font-normal'
    : 'tracking-[-0.022em] font-normal';

  const headingTypographyClass =
    parsed.kind === 'heading'
      ? parsed.headingLevel && parsed.headingLevel <= 2
        ? 'neuron-heading'
        : 'neuron-bold opacity-95'
      : '';

  const quoteTypographyClass = parsed.kind === 'quote' ? 'italic opacity-85' : '';
  const taskDoneClass =
    parsed.kind === 'task' && parsed.checked ? 'line-through opacity-50' : '';

  // Keep contentEditable innerHTML synchronized ONLY when styled runs or emoji vendor differ from live DOM
  useLayoutEffect(() => {
    const el = editableRef.current;
    if (!el || isComposingRef.current) return;

    const vendorChanged = lastVendorIdRef.current !== emojiVendor.id;
    const isFocusedLiveEl = document.activeElement === el;
    const hasPendingSel = Boolean(pendingSelectionRef.current);
    const wasLocalEcho = consumeLocalEcho(block.lineIndex, bodyText);
    const hasRawEmoji = hasUnstyledEmojiInDom(el, emojiVendor);

    if (
      !wasLocalEcho ||
      vendorChanged ||
      hasPendingSel ||
      !isFocusedLiveEl ||
      hasRawEmoji
    ) {
      const currentDomRuns = domToRuns(el as unknown as DomNodeLike);
      const targetRuns = inlineMarkdownToRuns(bodyText);
      if (!runsEqual(currentDomRuns, targetRuns) || vendorChanged || hasRawEmoji) {
        let preserveSel: { start: number; end: number } | null = null;
        if (!pendingSelectionRef.current && hasRawEmoji && isFocusedLiveEl) {
          preserveSel = getVisibleSelectionOffsets(el);
        }
        const targetHtml = inlineMarkdownToHtml(bodyText, resolveEmoji);
        if (el.innerHTML !== targetHtml) {
          el.innerHTML = targetHtml;
        }
        lastVendorIdRef.current = emojiVendor.id;
        if (preserveSel) {
          setVisibleSelectionOffsets(
            el,
            preserveSel.start,
            preserveSel.end,
            preserveSel.start === preserveSel.end,
          );
        }
      } else {
        lastVendorIdRef.current = emojiVendor.id;
      }
    }

    // Apply any queued selection directly after DOM sync so focus & caret never flicker
    const pending = pendingSelectionRef.current;
    if (pending && pending.lineIndex === block.lineIndex) {
      pendingSelectionRef.current = null;
      if (document.activeElement !== el) {
        el.focus({ preventScroll: true });
      }
      setVisibleSelectionOffsets(
        el,
        pending.start,
        pending.end,
        Boolean(pending.preferOutsideInlineEnd),
      );
    }

    if (isActiveLine) {
      onMeasureActive();
    }
  }, [
    bodyText,
    block.lineIndex,
    consumeLocalEcho,
    emojiVendor,
    isActiveLine,
    lineSpacing,
    onMeasureActive,
    pendingSelectionRef,
    resolveEmoji,
    textSize,
    textWidth,
    uiSize,
    parsed.kind,
    parsed.headingLevel,
  ]);

  // Ensure resize updates crest & toolbar geometry cleanly
  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (isActiveLine) onMeasureActive();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isActiveLine, onMeasureActive]);

  const indentPx = Math.min(48, parsed.indent.length * 14);

  return (
    <div
      data-line-index={block.lineIndex}
      data-line-kind={parsed.kind}
      data-heading-level={parsed.headingLevel}
      className={`group/line relative flex items-start ${
        parsed.kind === 'heading' ? 'mt-3 mb-1' : ''
      }`}
      style={{
        paddingLeft: indentPx > 0 ? `${indentPx}px` : undefined,
        marginTop: parsed.kind === 'heading' ? undefined : `${lineGapPx}px`,
        marginBottom: parsed.kind === 'heading' ? undefined : `${lineGapPx}px`,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          const el = editableRef.current;
          if (!el) return;
          el.focus({ preventScroll: true });
          const plainLen = runsToPlainText(
            domToRuns(el as unknown as DomNodeLike),
          ).length;
          setVisibleSelectionOffsets(el, plainLen, plainLen);
          onSyncLineSelection(block.lineIndex, plainLen, plainLen, false);
        }
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {/* Heading collapse chevron in left gutter */}
      {parsed.kind === 'heading' && (
        <button
          type="button"
          aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
          aria-expanded={!isCollapsed}
          data-testid={`fold-header-${block.lineIndex}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFold(block.lineIndex);
          }}
          className={`absolute -left-8 top-[0.24em] flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-all duration-150 hover:bg-white/10 ${
            isCollapsed
              ? 'opacity-90'
              : 'opacity-25 group-hover/line:opacity-80 focus-visible:opacity-90'
          }`}
          style={{
            color: isCollapsed ? 'var(--neuron-accent)' : 'var(--neuron-muted)',
          }}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      )}

      {/* Task checkbox */}
      {parsed.kind === 'task' && (
        <button
          type="button"
          role="checkbox"
          aria-checked={Boolean(parsed.checked)}
          aria-label={parsed.checked ? 'Uncheck task' : 'Complete task'}
          data-task-checkbox={parsed.checked ? 'checked' : 'unchecked'}
          data-testid={`task-checkbox-${block.lineIndex}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleTask(parsed);
          }}
          className="mt-[0.28em] mr-3 inline-flex h-[0.74em] w-[0.74em] shrink-0 cursor-pointer items-center justify-center rounded-[3px] border-[1.6px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
          style={{
            ...scaleStyle,
            borderColor: parsed.checked
              ? 'var(--neuron-accent)'
              : 'var(--neuron-muted)',
            backgroundColor: parsed.checked ? 'var(--neuron-accent)' : 'transparent',
            color: 'var(--neuron-bg)',
          }}
        >
          {parsed.checked && (
            <svg
              viewBox="0 0 12 12"
              className="h-[0.52em] w-[0.52em]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="2.2 6.4 4.8 9 9.8 3.2" />
            </svg>
          )}
        </button>
      )}

      {parsed.kind === 'bullet' && (
        <span
          aria-hidden="true"
          className="mr-3 inline-flex w-[0.65em] shrink-0 justify-center select-none"
          style={{ ...scaleStyle, color: 'var(--neuron-accent)' }}
        >
          •
        </span>
      )}

      {parsed.kind === 'ordered' && (
        <span
          aria-hidden="true"
          className="mr-2.5 shrink-0 select-none opacity-90"
          style={{ ...scaleStyle, color: 'var(--neuron-accent)' }}
        >
          {parsed.marker.trim()}
        </span>
      )}

      {parsed.kind === 'quote' && (
        <span
          aria-hidden="true"
          className="mt-[0.14em] mr-3.5 w-[2.5px] shrink-0 self-stretch rounded-full opacity-80"
          style={{ backgroundColor: 'var(--neuron-accent)' }}
        />
      )}

      {/* Clean WYSIWYG Editable Plane — Zero Shadow Delimiters */}
      <div className="relative min-w-0 flex-1">
        {parsed.kind === 'divider' && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-0 h-[1.5px] w-[min(36rem,82vw)] -translate-y-1/2 opacity-55"
            style={{ backgroundColor: 'var(--neuron-muted)' }}
          />
        )}

        <div
          ref={(el) => {
            editableRef.current = el;
            registerEditable(block.lineIndex, el);
          }}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="false"
          aria-label={
            block.lineIndex === 0
              ? 'Note editor'
              : `Line ${block.lineIndex + 1}`
          }
          data-testid={
            isPrimaryTestId ? 'note-editor' : `note-line-${block.lineIndex}`
          }
          data-line-editor={block.lineIndex}
          data-in-multi-selection={inMultiSelection && bodyText.length === 0 ? 'true' : undefined}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          onMouseDown={(e) => onLineMouseDown(block.lineIndex, e)}
          onFocus={(e) => {
            const el = e.currentTarget;
            const vis = getVisibleSelectionOffsets(el);
            const fallbackLen = runsToPlainText(
              domToRuns(el as unknown as DomNodeLike),
            ).length;
            onFocusLine(
              block.lineIndex,
              vis?.start ?? fallbackLen,
              vis?.end ?? fallbackLen,
            );
          }}
          onBlur={() => onBlurLine(block.lineIndex)}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            isComposingRef.current = false;
            const el = e.currentTarget;
            onDomInput(block.lineIndex, el);
          }}
          onInput={(e) => {
            const native = e.nativeEvent as InputEvent | undefined;
            if (native?.isComposing) {
              isComposingRef.current = true;
              return;
            }
            if (isComposingRef.current) {
              isComposingRef.current = false;
            }
            const el = e.currentTarget;
            // Clean stray <br> left by browser when line becomes completely empty
            if (el.textContent === '' && !el.querySelector('img')) {
              if (el.innerHTML !== '') {
                el.innerHTML = '';
              }
            }
            onDomInput(block.lineIndex, el);
          }}
          onKeyDown={(e) => onLineKeyDown(block.lineIndex, e)}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            const files = e.clipboardData?.files;
            const hasImage =
              (items &&
                Array.from(items).some(
                  (it) => it.kind === 'file' && it.type.startsWith('image/'),
                )) ||
              (files &&
                Array.from(files).some(
                  (f) =>
                    f.type.startsWith('image/') ||
                    /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(f.name),
                ));
            if (hasImage) {
              e.preventDefault();
              return; // Bubble to container's image paste handler
            }
            const plain = e.clipboardData?.getData('text/plain');
            if (plain !== undefined) {
              e.preventDefault();
              e.stopPropagation();
              onPastePlainText(block.lineIndex, plain, e.currentTarget);
            }
          }}
          onKeyUp={(e) => {
            const el = e.currentTarget;
            const vis = getVisibleSelectionOffsets(el);
            if (vis) {
              onSyncLineSelection(block.lineIndex, vis.start, vis.end, false);
            }
          }}
          onMouseUp={(e) => {
            const el = e.currentTarget;
            const vis = getVisibleSelectionOffsets(el);
            if (vis) {
              onSyncLineSelection(block.lineIndex, vis.start, vis.end, false);
            }
          }}
          onClick={(e) => {
            const el = e.currentTarget;
            const vis = getVisibleSelectionOffsets(el);
            if (vis) {
              onSyncLineSelection(block.lineIndex, vis.start, vis.end, true);
            }
          }}
          onErrorCapture={(e) => {
            const target = e.target as HTMLElement | null;
            if (
              target instanceof HTMLImageElement &&
              target.hasAttribute('data-emoji')
            ) {
              const emoji = target.getAttribute('data-emoji') ?? '';
              const urls = getEmojiImageUrls(emoji, emojiVendor);
              const attempt =
                Number(target.getAttribute('data-emoji-attempt') ?? '0') + 1;
              if (attempt < urls.length) {
                target.setAttribute('data-emoji-attempt', String(attempt));
                target.src = urls[attempt];
              } else {
                const span = document.createElement('span');
                span.setAttribute('data-emoji', emoji);
                span.setAttribute('data-emoji-failed', '1');
                span.className = 'inline-block leading-none select-none';
                span.textContent = emoji;
                target.replaceWith(span);
              }
            }
          }}
          className={`neuron-ce w-full break-words whitespace-pre-wrap caret-transparent text-[var(--neuron-text)] transition-[font-size] duration-150 focus:outline-none ${baseTypographyClass} ${headingTypographyClass} ${quoteTypographyClass} ${taskDoneClass}`}
          style={{
            ...scaleStyle,
            lineHeight:
              parsed.kind === 'heading'
                ? scaleStyle.lineHeight
                : 'var(--neuron-line-height)',
            minHeight:
              parsed.kind === 'heading'
                ? `${scaleStyle.lineHeight ?? 1.24}em`
                : 'var(--neuron-line-height)',
            fontFamily: 'var(--neuron-font)',
          }}
        />

        {/* Collapsed section fold badge */}
        {isCollapsed && hiddenUnderHeaderCount > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFold(block.lineIndex);
            }}
            data-testid={`folded-indicator-${block.lineIndex}`}
            className="mt-0.5 inline-flex cursor-pointer items-center gap-1 text-xs opacity-60 transition-opacity hover:opacity-100"
            style={{ color: 'var(--neuron-accent)' }}
          >
            <span>··· {hiddenUnderHeaderCount} hidden</span>
          </button>
        )}
      </div>
    </div>
  );
}, (prev, next) =>
  prev.block.lineIndex === next.block.lineIndex &&
  prev.parsed.raw === next.parsed.raw &&
  prev.parsed.kind === next.parsed.kind &&
  prev.parsed.headingLevel === next.parsed.headingLevel &&
  prev.parsed.checked === next.parsed.checked &&
  prev.bodyText === next.bodyText &&
  prev.isPrimaryTestId === next.isPrimaryTestId &&
  prev.isActiveLine === next.isActiveLine &&
  prev.inMultiSelection === next.inMultiSelection &&
  prev.isCollapsed === next.isCollapsed &&
  prev.hiddenUnderHeaderCount === next.hiddenUnderHeaderCount &&
  prev.dyslexicMode === next.dyslexicMode &&
  prev.emojiVendor.id === next.emojiVendor.id &&
  prev.uiSize === next.uiSize &&
  prev.textSize === next.textSize &&
  prev.lineSpacing === next.lineSpacing &&
  prev.textWidth === next.textWidth &&
  prev.lineGapPx === next.lineGapPx &&
  prev.resolveEmoji === next.resolveEmoji,
);

export function EditorCanvas({
  noteId,
  content,
  sound,
  soundVolume,
  uiSize,
  textSize,
  lineSpacing,
  textWidth,
  spellcheckEnabled,
  autocorrectEnabled,
  boxShortcutEnabled,
  pixelShortcutEnabled,
  pixelCanvasSize,
  dyslexicMode,
  emojiVendor,
  palette,
  customDictionary,
  images,
  focusLineRequest,
  onUploadImages,
  onRenameImage,
  onUpdateImage,
  onRemoveImageFromNote,
  onAddCustomWord,
  onChange,
  onUndo,
  onRedo,
}: EditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const emojiPopoverRef = useRef<HTMLDivElement | null>(null);
  const hiddenImageInputRef = useRef<HTMLInputElement | null>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const typingTimerRef = useRef<number | null>(null);
  const dragWatchdogRef = useRef<number | null>(null);
  const pendingSelectionRef = useRef<{
    lineIndex: number;
    start: number;
    end: number;
    preferOutsideInlineEnd?: boolean;
  } | null>(null);
  const pendingLocalEchoesRef = useRef<Map<number, string[]>>(new Map());
  const mouseDragRef = useRef<{
    active: boolean;
    anchorLine: number;
    anchorOffset: number;
    movedAcrossLines: boolean;
  } | null>(null);

  const [activeLineIndex, setActiveLineIndex] = useState<number>(0);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });
  const [multiSelection, setMultiSelection] = useState<MultiLineSelection | null>(null);
  const [caretIndex, setCaretIndex] = useState<number>(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [activeTypingCaret, setActiveTypingCaret] = useState<{
    lineIndex: number;
    offset: number;
  } | null>(null);
  const [ignoredWords, setIgnoredWords] = useState<string[]>([]);
  const [spellPopover, setSpellPopover] = useState<SpellPopoverState | null>(null);
  const [dismissedEmojiStart, setDismissedEmojiStart] = useState<number | null>(null);
  const [emojiActiveIdx, setEmojiActiveIdx] = useState(0);
  const emojiPickGuardRef = useRef<{ key: string; time: number } | null>(null);
  const [collapsedHeaders, setCollapsedHeaders] = useState<Set<number>>(() => new Set());
  const [toolbarPos, setToolbarPos] = useState<SelectionToolbarPosition | null>(null);
  const [caretCoords, setCaretCoords] = useState<CaretCoords>({
    left: 0,
    top: 0,
    height: 36,
    lineHeight: 44,
  });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isAllSelected, setIsAllSelected] = useState(false);
  const allSelectStampRef = useRef<number>(0);
  const [selectionSyncNonce, setSelectionSyncNonce] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<StoredImage | null>(null);

  const activeLineIndexRef = useRef(activeLineIndex);
  activeLineIndexRef.current = activeLineIndex;
  const selectionRangeRef = useRef(selectionRange);
  selectionRangeRef.current = selectionRange;
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;
  const lineSpellCacheRef = useRef<{
    signature: unknown[];
    entries: Map<string, SpellIssue[]>;
  } | null>(null);

  const consumeLocalEcho = useCallback((lineIndex: number, bodyMd: string): boolean => {
    const queue = pendingLocalEchoesRef.current.get(lineIndex);
    if (!queue || queue.length === 0) return false;
    const idx = queue.indexOf(bodyMd);
    if (idx === -1) return false;
    queue.splice(0, idx + 1);
    if (queue.length === 0) {
      pendingLocalEchoesRef.current.delete(lineIndex);
    }
    return true;
  }, []);

  const registerEditable = useCallback(
    (lineIndex: number, el: HTMLDivElement | null) => {
      if (el) {
        lineRefs.current.set(lineIndex, el);
      } else {
        lineRefs.current.delete(lineIndex);
      }
    },
    [],
  );

  const activeLineSpacing = useMemo(
    () => getLineSpacingById(lineSpacing),
    [lineSpacing],
  );

  const resolveEmoji: EmojiResolver = useCallback(
    (emoji: string): EmojiRenderTarget => {
      if (emojiVendor.id === 'native' && !emojiVendor.urlTemplate && !emojiVendor.fontFamily) {
        return null;
      }
      if (emojiVendor.fontFamily) {
        return {
          fontFamily: emojiVendor.fontFamily,
          vendorId: emojiVendor.id,
        };
      }
      const urls = getEmojiImageUrls(emoji, emojiVendor);
      return urls[0]
        ? { url: urls[0], vendorId: emojiVendor.id }
        : null;
    },
    [emojiVendor],
  );

  const parsedLines = useMemo(() => parseMarkdownLines(content), [content]);
  const blocks = useMemo(() => parseDocumentBlocks(content), [content]);
  const foldInfo = useMemo(
    () => computeHiddenLineIndices(parsedLines, collapsedHeaders),
    [parsedLines, collapsedHeaders],
  );

  const imageMap = useMemo(
    () => new Map(images.map((img) => [img.id, img])),
    [images],
  );

  const customWordSet = useMemo(
    () => new Set(customDictionary.map((w) => w.toLowerCase())),
    [customDictionary],
  );
  const ignoredWordSet = useMemo(
    () => new Set(ignoredWords.map((w) => w.toLowerCase())),
    [ignoredWords],
  );

  const visibleLineIndices = useMemo(
    () =>
      blocks
        .filter((b): b is Extract<DocumentBlock, { type: 'line' }> => b.type === 'line')
        .filter((b) => !foldInfo.hiddenIndices.has(b.lineIndex))
        .map((b) => b.lineIndex),
    [blocks, foldInfo.hiddenIndices],
  );

  const primaryTestIdLineIndex = useMemo(() => {
    if (visibleLineIndices.includes(activeLineIndex)) {
      return activeLineIndex;
    }
    return visibleLineIndices[0] ?? 0;
  }, [visibleLineIndices, activeLineIndex]);

  // Synchronous per-line memoized misspellings so live DOM and highlights stay in exact sync with zero flicker
  const lineMisspellingsMap = useMemo(() => {
    const map = new Map<number, SpellIssue[]>();
    if (!spellcheckEnabled) return map;

    const sig = [customWordSet, ignoredWordSet];
    let cache = lineSpellCacheRef.current;
    if (
      !cache ||
      cache.signature[0] !== sig[0] ||
      cache.signature[1] !== sig[1]
    ) {
      cache = { signature: sig, entries: new Map() };
      lineSpellCacheRef.current = cache;
    }

    for (const block of blocks) {
      if (block.type !== 'line') continue;
      if (foldInfo.hiddenIndices.has(block.lineIndex)) continue;
      const parsed = parsedLines[block.lineIndex];
      if (!parsed || parsed.kind === 'codeblock' || parsed.kind === 'divider') continue;
      const bodyText = parsed.raw.slice(parsed.bodyStart - parsed.start);
      if (!bodyText) continue;

      let baseIssues = cache.entries.get(bodyText);
      if (baseIssues === undefined) {
        const runs = inlineMarkdownToRuns(bodyText);
        baseIssues = computeLineMisspellings(
          runs,
          customWordSet,
          ignoredWordSet,
          null,
        );
        if (cache.entries.size > 600) {
          cache.entries.clear();
        }
        cache.entries.set(bodyText, baseIssues);
      }

      const activeCaretForLine =
        activeTypingCaret && activeTypingCaret.lineIndex === block.lineIndex
          ? activeTypingCaret.offset
          : null;

      const filteredIssues =
        activeCaretForLine === null
          ? baseIssues
          : baseIssues.filter(
              (issue) =>
                !(
                  activeCaretForLine >= issue.start &&
                  activeCaretForLine <= issue.end
                ),
            );

      if (filteredIssues.length > 0) {
        map.set(block.lineIndex, filteredIssues);
      }
    }
    return map;
  }, [
    spellcheckEnabled,
    blocks,
    foldInfo.hiddenIndices,
    parsedLines,
    activeTypingCaret,
    customWordSet,
    ignoredWordSet,
  ]);

  // Clean up CSS custom highlight on unmount
  useEffect(() => {
    return () => {
      const cssAny =
        typeof CSS !== 'undefined'
          ? (CSS as unknown as { highlights?: Map<string, unknown> })
          : undefined;
      cssAny?.highlights?.delete('neuron-spell');
    };
  }, []);

  // Apply native CSS Custom Highlight API squiggles atomically with zero delete-before-set flicker
  useLayoutEffect(() => {
    const cssAny = typeof CSS !== 'undefined' ? (CSS as unknown as { highlights?: Map<string, unknown> }) : undefined;
    const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (!cssAny?.highlights || !HighlightCtor) return;

    if (!spellcheckEnabled || lineMisspellingsMap.size === 0) {
      cssAny.highlights.delete('neuron-spell');
      return;
    }

    const ranges: Range[] = [];
    for (const [lineIdx, issues] of lineMisspellingsMap.entries()) {
      const el = lineRefs.current.get(lineIdx);
      if (!el) continue;
      for (const issue of issues) {
        const range = findVisibleTextRangeInDom(el, issue.start, issue.end);
        if (range) ranges.push(range);
      }
    }

    if (ranges.length > 0) {
      cssAny.highlights.set('neuron-spell', new HighlightCtor(...ranges));
    } else {
      cssAny.highlights.delete('neuron-spell');
    }
  }, [spellcheckEnabled, lineMisspellingsMap, content, emojiVendor.id]);

  // Apply CSS Custom Highlight (`neuron-sel`) across lines during cross-line mouse drag selections
  useLayoutEffect(() => {
    const cssAny = typeof CSS !== 'undefined' ? (CSS as unknown as { highlights?: Map<string, unknown> }) : undefined;
    const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (!cssAny?.highlights || !HighlightCtor) return;

    if (!isCrossLineSelection(multiSelection) || !multiSelection) {
      cssAny.highlights.delete('neuron-sel');
      return;
    }

    const norm = normalizeMultiLineSelection(multiSelection);
    const ranges: Range[] = [];
    for (let i = norm.startLine; i <= norm.endLine; i++) {
      const el = lineRefs.current.get(i);
      const parsed = parsedLines[i];
      if (!el || !parsed) continue;
      const bodyMd = parsed.raw.slice(parsed.bodyStart - parsed.start);
      const plainLen = runsToPlainText(inlineMarkdownToRuns(bodyMd)).length;
      const bounds = getLineVisibleSliceBounds(i, plainLen, norm);
      if (!bounds || bounds.start >= bounds.end) continue;
      const range = findVisibleTextRangeInDom(el, bounds.start, bounds.end);
      if (range) ranges.push(range);
    }

    if (ranges.length > 0) {
      cssAny.highlights.set('neuron-sel', new HighlightCtor(...ranges));
    } else {
      cssAny.highlights.delete('neuron-sel');
    }

    return () => {
      cssAny.highlights?.delete('neuron-sel');
    };
  }, [multiSelection, parsedLines, content, emojiVendor.id]);

  const computeToolbarPosForLineRange = useCallback(
    (startLine: number, endLine: number) => {
      const firstEl = lineRefs.current.get(startLine);
      const lastEl = lineRefs.current.get(endLine) ?? firstEl;
      if (!firstEl || !lastEl) {
        setToolbarPos(null);
        return;
      }
      const firstRect = firstEl.getBoundingClientRect();
      const lastRect = lastEl.getBoundingClientRect();
      if (firstRect.height <= 0) return;
      const toolbarApproxWidth = 396;
      const centerX = firstRect.left + Math.min(firstRect.width, 320) / 2;
      const minLeft = 12;
      const maxLeft = Math.max(
        minLeft,
        window.innerWidth - toolbarApproxWidth - 12,
      );
      const clampedLeft = Math.min(
        Math.max(minLeft, centerX - toolbarApproxWidth / 2),
        maxLeft,
      );
      const placeBelow = firstRect.top - 82 < 98;
      const top = placeBelow
        ? Math.min(window.innerHeight - 92, (lastRect.height > 0 ? lastRect.bottom : firstRect.bottom) + 14)
        : Math.max(12, firstRect.top - 82);
      const arrowOffset = Math.min(
        toolbarApproxWidth - 24,
        Math.max(14, centerX - clampedLeft - 5),
      );
      setToolbarPos({
        left: clampedLeft,
        top,
        arrowOffset,
        placement: placeBelow ? 'below' : 'above',
      });
    },
    [],
  );

  const resolveLineAndOffsetFromPoint = useCallback(
    (clientX: number, clientY: number): { lineIndex: number; offset: number } | null => {
      const doc = document as Document & {
        caretPositionFromPoint?: (
          x: number,
          y: number,
        ) => { offsetNode: Node; offset: number } | null;
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
      };

      const getOffsetInLineEl = (lineEl: HTMLDivElement, node: Node | null, rawOffset: number): number => {
        if (!node || !lineEl.contains(node)) {
          const lineIdx = parseInt(lineEl.getAttribute('data-line-editor') ?? '0', 10);
          const parsed = parsedLines[lineIdx];
          const plainLen = parsed
            ? runsToPlainText(inlineMarkdownToRuns(parsed.raw.slice(parsed.bodyStart - parsed.start))).length
            : 0;
          const rect = lineEl.getBoundingClientRect();
          return clientX <= rect.left + 4 ? 0 : plainLen;
        }
        return getVisibleOffsetForDomPoint(lineEl, node, rawOffset);
      };

      let hitNode: Node | null = null;
      let hitOffset = 0;
      if (typeof doc.caretPositionFromPoint === 'function') {
        const pos = doc.caretPositionFromPoint(clientX, clientY);
        if (pos) {
          hitNode = pos.offsetNode;
          hitOffset = pos.offset;
        }
      } else if (typeof doc.caretRangeFromPoint === 'function') {
        const range = doc.caretRangeFromPoint(clientX, clientY);
        if (range) {
          hitNode = range.startContainer;
          hitOffset = range.startOffset;
        }
      }

      if (hitNode) {
        const hitEl =
          hitNode.nodeType === Node.ELEMENT_NODE
            ? (hitNode as Element)
            : hitNode.parentElement;
        const matchedLineEl = hitEl?.closest<HTMLDivElement>('[data-line-editor]');
        if (matchedLineEl && containerRef.current?.contains(matchedLineEl)) {
          const idx = parseInt(matchedLineEl.getAttribute('data-line-editor') ?? '', 10);
          if (Number.isFinite(idx)) {
            const pointEl =
              document.elementFromPoint(clientX, clientY)?.closest('[data-emoji], img') ??
              hitEl?.closest('[data-emoji], img');
            if (pointEl && matchedLineEl.contains(pointEl) && pointEl.parentNode) {
              const rect = pointEl.getBoundingClientRect();
              const childIdx = Array.prototype.indexOf.call(pointEl.parentNode.childNodes, pointEl);
              if (childIdx !== -1 && rect.width > 0) {
                const startOff = getVisibleOffsetForDomPoint(
                  matchedLineEl,
                  pointEl.parentNode,
                  childIdx,
                );
                const endOff = getVisibleOffsetForDomPoint(
                  matchedLineEl,
                  pointEl.parentNode,
                  childIdx + 1,
                );
                return {
                  lineIndex: idx,
                  offset: clientX < rect.left + rect.width / 2 ? startOff : endOff,
                };
              }
            }
            return {
              lineIndex: idx,
              offset: getOffsetInLineEl(matchedLineEl, hitNode, hitOffset),
            };
          }
        }
      }

      let bestLineIdx: number | null = null;
      let bestDist = Infinity;
      for (const idx of visibleLineIndices) {
        const el = lineRefs.current.get(idx);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          bestLineIdx = idx;
          bestDist = 0;
          break;
        }
        const dist = clientY < rect.top ? rect.top - clientY : clientY - rect.bottom;
        if (dist < bestDist) {
          bestDist = dist;
          bestLineIdx = idx;
        }
      }

      if (bestLineIdx === null) return null;
      const targetEl = lineRefs.current.get(bestLineIdx);
      if (!targetEl) return null;
      const targetRect = targetEl.getBoundingClientRect();
      const parsed = parsedLines[bestLineIdx];
      const plainLen = parsed
        ? runsToPlainText(inlineMarkdownToRuns(parsed.raw.slice(parsed.bodyStart - parsed.start))).length
        : 0;

      if (clientX <= targetRect.left + 2) {
        return { lineIndex: bestLineIdx, offset: 0 };
      }

      const clampedX = Math.min(Math.max(clientX, targetRect.left + 1), targetRect.right - 1);
      const clampedY = Math.min(Math.max(clientY, targetRect.top + 2), targetRect.bottom - 2);
      if (typeof doc.caretPositionFromPoint === 'function') {
        const pos = doc.caretPositionFromPoint(clampedX, clampedY);
        if (pos && targetEl.contains(pos.offsetNode)) {
          return {
            lineIndex: bestLineIdx,
            offset: getVisibleOffsetForDomPoint(targetEl, pos.offsetNode, pos.offset),
          };
        }
      } else if (typeof doc.caretRangeFromPoint === 'function') {
        const range = doc.caretRangeFromPoint(clampedX, clampedY);
        if (range && targetEl.contains(range.startContainer)) {
          return {
            lineIndex: bestLineIdx,
            offset: getVisibleOffsetForDomPoint(
              targetEl,
              range.startContainer,
              range.startOffset,
            ),
          };
        }
      }

      return { lineIndex: bestLineIdx, offset: plainLen };
    },
    [parsedLines, visibleLineIndices],
  );

  // Measure live caret & selection directly from the active contentEditable Range
  const measureActiveCaretAndSelection = useCallback(() => {
    const container = containerRef.current;
    const el = lineRefs.current.get(activeLineIndex);
    if (!container || !el) return;

    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const computed = window.getComputedStyle(el);
    const fontSize = parseFloat(computed.fontSize) || 32;
    const lineHeight =
      parseFloat(computed.lineHeight) || fontSize * (dyslexicMode ? 1.6 : 1.34);
    const crestHeight = Math.round(fontSize * 1.12);

    const sel = window.getSelection();
    const hasDomSelection =
      sel && sel.rangeCount > 0 && el.contains(sel.focusNode);

    let measuredEdge: { left: number; top: number; height: number } | null = null;
    let isCollapsed = true;

    if (hasDomSelection && sel) {
      const domRange = sel.getRangeAt(0);
      isCollapsed = domRange.collapsed;

      if (!isCollapsed) {
        const selRects = Array.from(domRange.getClientRects()).filter(
          (r) => r.width > 0.5 && r.height > 0.5,
        );
        const anchorRect = selRects[0] ?? domRange.getBoundingClientRect();
        if (anchorRect && anchorRect.width > 0) {
          const toolbarApproxWidth = 396;
          const centerX = anchorRect.left + anchorRect.width / 2;
          const minLeft = 12;
          const maxLeft = Math.max(
            minLeft,
            window.innerWidth - toolbarApproxWidth - 12,
          );
          const clampedLeft = Math.min(
            Math.max(minLeft, centerX - toolbarApproxWidth / 2),
            maxLeft,
          );
          const placeBelow = anchorRect.top - 82 < 98;
          const top = placeBelow
            ? Math.min(window.innerHeight - 92, anchorRect.bottom + 14)
            : Math.max(12, anchorRect.top - 82);
          const arrowOffset = Math.min(
            toolbarApproxWidth - 24,
            Math.max(14, centerX - clampedLeft - 5),
          );
          setToolbarPos({
            left: clampedLeft,
            top,
            arrowOffset,
            placement: placeBelow ? 'below' : 'above',
          });
        } else {
          setToolbarPos((prev) => (prev === null ? prev : null));
        }
      } else if (!isAllSelected && !isCrossLineSelection(multiSelection)) {
        setToolbarPos((prev) => (prev === null ? prev : null));
      }

      measuredEdge = measureCollapsedCaretRectInLine(el, domRange);
    } else if (!isAllSelected && !isCrossLineSelection(multiSelection)) {
      setToolbarPos((prev) => (prev === null ? prev : null));
    }

    // Fallback measurement for empty lines or boundary cursors
    if (!measuredEdge) {
      const targetVis = findVisibleTextRangeInDom(el, caretIndex, caretIndex);
      if (targetVis) {
        measuredEdge = measureCollapsedCaretRectInLine(el, targetVis);
      }
    }

    if (measuredEdge) {
      const left = Math.max(-1, measuredEdge.left - containerRect.left - 1);
      const vPad = Math.max(0, (measuredEdge.height - crestHeight) / 2);
      const top = Math.max(0, measuredEdge.top - containerRect.top + vPad);
      setCaretCoords({ left, top, height: crestHeight, lineHeight });
    } else {
      const left = Math.max(-1, elRect.left - containerRect.left - 1);
      const vPad = Math.max(0, (lineHeight - crestHeight) / 2);
      const top = Math.max(0, elRect.top - containerRect.top + vPad);
      setCaretCoords({ left, top, height: crestHeight, lineHeight });
    }
  }, [
    activeLineIndex,
    caretIndex,
    dyslexicMode,
    isAllSelected,
    lineSpacing,
    multiSelection,
    textWidth,
  ]);

  useLayoutEffect(() => {
    if (isFocused) {
      measureActiveCaretAndSelection();
    }
  }, [
    isFocused,
    activeLineIndex,
    caretIndex,
    selectionRange.start,
    selectionRange.end,
    measureActiveCaretAndSelection,
  ]);

  const focusLineAt = useCallback(
    (lineIndex: number, visStart: number, visEnd = visStart) => {
      pendingLocalEchoesRef.current.delete(lineIndex);
      pendingSelectionRef.current = { lineIndex, start: visStart, end: visEnd };
      setActiveTypingCaret((prev) =>
        prev && prev.lineIndex !== lineIndex ? null : prev,
      );
      setActiveLineIndex(lineIndex);
      setCaretIndex(visEnd);
      setSelectionRange({ start: visStart, end: visEnd });
      setIsFocused(true);
      setSelectionSyncNonce((n) => n + 1);
    },
    [],
  );

  // Also ensure focus is applied immediately if target LineBlock did not change props
  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending) return;
    const el = lineRefs.current.get(pending.lineIndex);
    if (!el) return;
    pendingSelectionRef.current = null;
    if (document.activeElement !== el) {
      el.focus({ preventScroll: true });
    }
    setVisibleSelectionOffsets(
      el,
      pending.start,
      pending.end,
      Boolean(pending.preferOutsideInlineEnd),
    );
    measureActiveCaretAndSelection();
  }, [content, activeLineIndex, caretIndex, selectionSyncNonce, measureActiveCaretAndSelection]);

  const prevImageCountsRef = useRef<Map<string, number> | null>(null);
  const prevImageNoteIdRef = useRef<string>(noteId);
  const justFinishedCrossDragRef = useRef<number>(0);

  // Reset state & focus last line on note switch
  useEffect(() => {
    pendingLocalEchoesRef.current.clear();
    setCollapsedHeaders(new Set());
    setSpellPopover(null);
    setToolbarPos(null);
    setActiveTypingCaret(null);
    setIsAllSelected(false);
    setMultiSelection(null);
    mouseDragRef.current = null;
    const lines = parseMarkdownLines(content);
    const allBlocks = parseDocumentBlocks(content);
    const initialCounts = new Map<string, number>();
    for (const b of allBlocks) {
      if (b.type === 'image') {
        initialCounts.set(b.imageId, (initialCounts.get(b.imageId) ?? 0) + 1);
      }
    }
    prevImageNoteIdRef.current = noteId;
    prevImageCountsRef.current = initialCounts;
    const lastLineBlock = [...allBlocks]
      .reverse()
      .find((b): b is Extract<DocumentBlock, { type: 'line' }> => b.type === 'line');
    const targetIdx = lastLineBlock?.lineIndex ?? 0;
    const parsed = lines[targetIdx];
    const bodyText = parsed ? parsed.raw.slice(parsed.bodyStart - parsed.start) : '';
    const visLen = runsToPlainText(inlineMarkdownToRuns(bodyText)).length;
    focusLineAt(targetIdx, visLen, visLen);
    // Intentionally scoped to noteId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // Focus and scroll to target line when jumping from universal Spotlight search
  useEffect(() => {
    if (!focusLineRequest || focusLineRequest.noteId !== noteId) return;
    const rawTarget = Math.max(0, focusLineRequest.lineNumber - 1);
    const targetIdx = visibleLineIndices.includes(rawTarget)
      ? rawTarget
      : (visibleLineIndices.find((idx) => idx >= rawTarget) ??
        visibleLineIndices[visibleLineIndices.length - 1] ??
        0);
    focusLineAt(targetIdx, 0, 0);
    const timer = window.setTimeout(() => {
      const el = lineRefs.current.get(targetIdx);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 30);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusLineRequest?.nonce, noteId]);

  // Automatically focus the line immediately below newly pasted/dropped/uploaded images
  useLayoutEffect(() => {
    const currentImages = blocks.filter(
      (b): b is Extract<DocumentBlock, { type: 'image' }> => b.type === 'image',
    );
    const nextCounts = new Map<string, number>();
    for (const b of currentImages) {
      nextCounts.set(b.imageId, (nextCounts.get(b.imageId) ?? 0) + 1);
    }

    if (prevImageNoteIdRef.current !== noteId || prevImageCountsRef.current === null) {
      prevImageNoteIdRef.current = noteId;
      prevImageCountsRef.current = nextCounts;
      return;
    }

    const prevCounts = prevImageCountsRef.current;
    const seen = new Map<string, number>();
    let lastAddedImage: Extract<DocumentBlock, { type: 'image' }> | null = null;
    for (const b of currentImages) {
      const count = (seen.get(b.imageId) ?? 0) + 1;
      seen.set(b.imageId, count);
      if (count > (prevCounts.get(b.imageId) ?? 0)) {
        lastAddedImage = b;
      }
    }
    prevImageCountsRef.current = nextCounts;

    if (lastAddedImage) {
      const nextLineBlock = blocks.find(
        (b): b is Extract<DocumentBlock, { type: 'line' }> =>
          b.type === 'line' && b.lineIndex > lastAddedImage.lineIndex,
      );
      if (nextLineBlock) {
        setSpellPopover(null);
        setToolbarPos(null);
        setIsAllSelected(false);
        setMultiSelection(null);
        focusLineAt(nextLineBlock.lineIndex, 0, 0);
      }
    }
  }, [blocks, focusLineAt, noteId]);

  // Re-measure active caret coordinates whenever container layout shifts (e.g. image decode)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      if (isFocused) {
        measureActiveCaretAndSelection();
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [isFocused, measureActiveCaretAndSelection]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
      }
      if (dragWatchdogRef.current !== null) {
        window.clearTimeout(dragWatchdogRef.current);
      }
    };
  }, []);

  // Ensure file drag overlay NEVER stays stuck on window dragend, drop, blur, Escape, or timeout
  useEffect(() => {
    if (!isDraggingImage) return;
    const clearDrag = () => setIsDraggingImage(false);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setIsDraggingImage(false);
    };
    window.addEventListener('dragend', clearDrag);
    window.addEventListener('drop', clearDrag);
    window.addEventListener('blur', clearDrag);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('dragend', clearDrag);
      window.removeEventListener('drop', clearDrag);
      window.removeEventListener('blur', clearDrag);
      window.removeEventListener('keydown', onKey);
    };
  }, [isDraggingImage]);

  // Dismiss spellcheck popover on outside click
  useEffect(() => {
    if (!spellPopover) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (popoverRef.current?.contains(target)) return;
      setSpellPopover(null);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [spellPopover]);

  const selectAllDocumentLines = useCallback(() => {
    const container = containerRef.current;
    const firstIdx = visibleLineIndices[0];
    const lastIdx = visibleLineIndices[visibleLineIndices.length - 1];
    const firstEl = firstIdx !== undefined ? lineRefs.current.get(firstIdx) : null;
    const lastEl = lastIdx !== undefined ? lineRefs.current.get(lastIdx) : null;
    if (!container || !firstEl || !lastEl) return;

    allSelectStampRef.current = Date.now();
    setSpellPopover(null);
    setIsAllSelected(true);
    setIsFocused(true);

    const firstRow = firstEl.closest('[data-line-index]') ?? firstEl;
    const lastRow = lastEl.closest('[data-line-index]') ?? lastEl;

    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      try {
        // Anchor at non-editable row boundaries so Chromium spans across all contentEditable lines
        if (firstRow.parentNode && lastRow.parentNode) {
          range.setStartBefore(firstRow);
          range.setEndAfter(lastRow);
        } else {
          range.setStart(firstEl, 0);
          range.setEnd(lastEl, lastEl.childNodes.length);
        }
        sel.removeAllRanges();
        sel.addRange(range);
      } catch {
        // Ignore transient DOM range errors
      }
    }

    const firstRect = firstEl.getBoundingClientRect();
    const lastRect = lastEl.getBoundingClientRect();
    if (firstRect.height > 0) {
      const toolbarApproxWidth = 396;
      const centerX = firstRect.left + Math.min(firstRect.width, 320) / 2;
      const minLeft = 12;
      const maxLeft = Math.max(
        minLeft,
        window.innerWidth - toolbarApproxWidth - 12,
      );
      const clampedLeft = Math.min(
        Math.max(minLeft, centerX - toolbarApproxWidth / 2),
        maxLeft,
      );
      const placeBelow = firstRect.top - 82 < 98;
      const top = placeBelow
        ? Math.min(window.innerHeight - 92, (lastRect.height > 0 ? lastRect.bottom : firstRect.bottom) + 14)
        : Math.max(12, firstRect.top - 82);
      const arrowOffset = Math.min(
        toolbarApproxWidth - 24,
        Math.max(14, centerX - clampedLeft - 5),
      );
      setToolbarPos({
        left: clampedLeft,
        top,
        arrowOffset,
        placement: placeBelow ? 'below' : 'above',
      });
    }
  }, [visibleLineIndices]);

  // Keep selection range & toolbar synced cleanly on any document selectionchange
  useEffect(() => {
    const handleDocumentSelectionChange = () => {
      if (pendingSelectionRef.current) return;
      if (mouseDragRef.current?.movedAcrossLines) return;
      const sel = window.getSelection();
      const container = containerRef.current;

      if (sel && sel.rangeCount > 0 && container) {
        const range = sel.getRangeAt(0);
        const startEl = (
          range.startContainer.nodeType === Node.ELEMENT_NODE
            ? (range.startContainer as Element)
            : range.startContainer.parentElement
        )?.closest<HTMLDivElement>('[data-line-editor]');
        const endEl = (
          range.endContainer.nodeType === Node.ELEMENT_NODE
            ? (range.endContainer as Element)
            : range.endContainer.parentElement
        )?.closest<HTMLDivElement>('[data-line-editor]');

        const spansContainerOutsideLine =
          !range.collapsed &&
          container.contains(range.commonAncestorContainer) &&
          (!startEl || !endEl || startEl !== endEl);

        if (spansContainerOutsideLine) {
          setIsFocused(true);
          return;
        }
      }

      if (
        isAllSelected &&
        sel &&
        sel.rangeCount > 0 &&
        !sel.getRangeAt(0).collapsed &&
        Date.now() - allSelectStampRef.current < 300
      ) {
        return;
      }

      if (isAllSelected) {
        setIsAllSelected(false);
      }
      if (isCrossLineSelection(multiSelection)) {
        if (Date.now() - justFinishedCrossDragRef.current < 260) {
          return;
        }
        if (!sel || sel.rangeCount === 0) return;
      }

      let targetLineEl: HTMLDivElement | null = null;

      if (sel && sel.rangeCount > 0) {
        const anchorNode = sel.anchorNode;
        const anchorEl =
          anchorNode?.nodeType === Node.ELEMENT_NODE
            ? (anchorNode as Element)
            : anchorNode?.parentElement;
        const matched = anchorEl?.closest<HTMLDivElement>('[data-line-editor]');
        if (matched && containerRef.current?.contains(matched)) {
          targetLineEl = matched;
        }
      }

      if (!targetLineEl && document.activeElement instanceof HTMLDivElement) {
        const attr = document.activeElement.getAttribute('data-line-editor');
        if (attr !== null && containerRef.current?.contains(document.activeElement)) {
          targetLineEl = document.activeElement;
        }
      }

      if (!targetLineEl) return;
      const attr = targetLineEl.getAttribute('data-line-editor');
      if (attr === null) return;
      const lineIdx = parseInt(attr, 10);
      if (!Number.isFinite(lineIdx)) return;
      const vis = getVisibleSelectionOffsets(targetLineEl);
      if (!vis) return;
      const unchanged =
        isFocusedRef.current &&
        lineIdx === activeLineIndexRef.current &&
        vis.start === selectionRangeRef.current.start &&
        vis.end === selectionRangeRef.current.end;
      if (unchanged) {
        return;
      }
      setIsFocused(true);
      setActiveLineIndex(lineIdx);
      setCaretIndex(vis.end);
      setSelectionRange(vis);
      measureActiveCaretAndSelection();
    };
    document.addEventListener('selectionchange', handleDocumentSelectionChange);
    return () =>
      document.removeEventListener('selectionchange', handleDocumentSelectionChange);
  }, [isAllSelected, measureActiveCaretAndSelection, multiSelection]);

  const markTypingPulse = useCallback(() => {
    setIsTyping(true);
    if (typingTimerRef.current !== null) {
      window.clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = window.setTimeout(() => {
      setIsTyping(false);
    }, 520);
  }, []);

  // Cross-line mouse drag selection handlers (both upward and downward dragging across lines)
  const handleLineMouseDown = useCallback(
    (lineIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      pendingSelectionRef.current = null;
      setIsAllSelected(false);
      if (e.shiftKey && isFocused && lineIndex !== activeLineIndex) {
        e.preventDefault();
        const resolved = resolveLineAndOffsetFromPoint(e.clientX, e.clientY);
        const focusOff = resolved?.offset ?? 0;
        const sel: MultiLineSelection = {
          anchorLine: activeLineIndex,
          anchorOffset: caretIndex,
          focusLine: lineIndex,
          focusOffset: focusOff,
        };
        justFinishedCrossDragRef.current = Date.now();
        window.getSelection()?.removeAllRanges();
        setMultiSelection(sel);
        const norm = normalizeMultiLineSelection(sel);
        computeToolbarPosForLineRange(norm.startLine, norm.endLine);
        return;
      }

      setMultiSelection(null);
      const resolved = resolveLineAndOffsetFromPoint(e.clientX, e.clientY);
      const parsed = parsedLines[lineIndex];
      const fallbackLen = parsed
        ? runsToPlainText(inlineMarkdownToRuns(parsed.raw.slice(parsed.bodyStart - parsed.start))).length
        : 0;
      const anchorOffset =
        resolved && resolved.lineIndex === lineIndex ? resolved.offset : fallbackLen;
      mouseDragRef.current = {
        active: true,
        anchorLine: lineIndex,
        anchorOffset,
        movedAcrossLines: false,
      };
    },
    [
      activeLineIndex,
      caretIndex,
      computeToolbarPosForLineRange,
      isFocused,
      parsedLines,
      resolveLineAndOffsetFromPoint,
    ],
  );

  useEffect(() => {
    const updateCrossLineDrag = (clientX: number, clientY: number) => {
      const drag = mouseDragRef.current;
      if (!drag || !drag.active) return;
      const resolved = resolveLineAndOffsetFromPoint(clientX, clientY);
      if (!resolved) return;

      if (resolved.lineIndex !== drag.anchorLine || drag.movedAcrossLines) {
        drag.movedAcrossLines = true;
        window.getSelection()?.removeAllRanges();
        setSpellPopover(null);
        setToolbarPos(null);
        setIsFocused(true);
        setMultiSelection({
          anchorLine: drag.anchorLine,
          anchorOffset: drag.anchorOffset,
          focusLine: resolved.lineIndex,
          focusOffset: resolved.offset,
        });
      }
    };

    const finalizeCrossLineDrag = (clientX: number, clientY: number) => {
      const drag = mouseDragRef.current;
      if (!drag || !drag.active) return;
      mouseDragRef.current = null;
      if (!drag.movedAcrossLines) return;

      justFinishedCrossDragRef.current = Date.now();
      const resolved = resolveLineAndOffsetFromPoint(clientX, clientY);
      const focusLine = resolved?.lineIndex ?? drag.anchorLine;
      const focusOffset = resolved?.offset ?? drag.anchorOffset;

      if (focusLine === drag.anchorLine) {
        setMultiSelection(null);
        const s = Math.min(drag.anchorOffset, focusOffset);
        const end = Math.max(drag.anchorOffset, focusOffset);
        focusLineAt(focusLine, s, end);
        return;
      }

      const finalSel: MultiLineSelection = {
        anchorLine: drag.anchorLine,
        anchorOffset: drag.anchorOffset,
        focusLine,
        focusOffset,
      };
      window.getSelection()?.removeAllRanges();
      setMultiSelection(finalSel);
      setIsFocused(true);
      setActiveLineIndex(focusLine);
      setCaretIndex(focusOffset);
      const norm = normalizeMultiLineSelection(finalSel);
      computeToolbarPosForLineRange(norm.startLine, norm.endLine);
    };

    const onWindowMouseMove = (e: MouseEvent) => {
      if (!mouseDragRef.current?.active) return;
      if ((e.buttons & 1) === 0) {
        finalizeCrossLineDrag(e.clientX, e.clientY);
        return;
      }
      updateCrossLineDrag(e.clientX, e.clientY);
    };

    const onWindowMouseUp = (e: MouseEvent) => {
      if (!mouseDragRef.current?.active) return;
      finalizeCrossLineDrag(e.clientX, e.clientY);
    };

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [computeToolbarPosForLineRange, focusLineAt, resolveLineAndOffsetFromPoint]);

  const restoreCaretAfterHistory = useCallback(
    (prevText: string, nextText: string) => {
      const prevLines = prevText.split('\n');
      const nextLines = nextText.split('\n');
      const nextParsedLines = parseMarkdownLines(nextText);
      const nextBlocks = parseDocumentBlocks(nextText);
      const lineSet = new Set(
        nextBlocks
          .filter((b): b is Extract<DocumentBlock, { type: 'line' }> => b.type === 'line')
          .map((b) => b.lineIndex),
      );

      let diffLine = Math.max(0, nextLines.length - 1);
      const maxLen = Math.max(prevLines.length, nextLines.length);
      for (let i = 0; i < maxLen; i++) {
        if (prevLines[i] !== nextLines[i]) {
          diffLine = Math.min(i, Math.max(0, nextLines.length - 1));
          break;
        }
      }

      if (!lineSet.has(diffLine)) {
        const nearest =
          Array.from(lineSet).find((idx) => idx >= diffLine) ??
          Array.from(lineSet).pop() ??
          0;
        diffLine = nearest;
      }

      const parsed = nextParsedLines[diffLine];
      const plain = parsed
        ? runsToPlainText(inlineMarkdownToRuns(parsed.raw.slice(parsed.bodyStart - parsed.start)))
        : '';
      setIsAllSelected(false);
      setMultiSelection(null);
      setSpellPopover(null);
      setToolbarPos(null);
      setActiveTypingCaret(null);
      focusLineAt(diffLine, plain.length, plain.length);
    },
    [focusLineAt],
  );

  const performUndo = useCallback(() => {
    if (!onUndo) return false;
    pendingLocalEchoesRef.current.clear();
    const prevText = content;
    const nextText = onUndo();
    if (nextText === null) return false;
    playTypingSound(sound, 'backspace', soundVolume);
    markTypingPulse();
    restoreCaretAfterHistory(prevText, nextText);
    return true;
  }, [content, markTypingPulse, onUndo, restoreCaretAfterHistory, sound, soundVolume]);

  const performRedo = useCallback(() => {
    if (!onRedo) return false;
    pendingLocalEchoesRef.current.clear();
    const prevText = content;
    const nextText = onRedo();
    if (nextText === null) return false;
    playTypingSound(sound, 'char', soundVolume);
    markTypingPulse();
    restoreCaretAfterHistory(prevText, nextText);
    return true;
  }, [content, markTypingPulse, onRedo, restoreCaretAfterHistory, sound, soundVolume]);

  // Capture Ctrl+Z / Cmd+Z (Undo) and Ctrl+Shift+Z / Ctrl+Y (Redo) anywhere inside the editor
  useEffect(() => {
    const onUndoRedoKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const lower = e.key.toLowerCase();
      if (lower !== 'z' && lower !== 'y') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') &&
        !containerRef.current?.contains(target)
      ) {
        return;
      }
      if (lower === 'z' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        performUndo();
      } else if ((lower === 'z' && e.shiftKey) || (lower === 'y' && !e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        performRedo();
      }
    };
    window.addEventListener('keydown', onUndoRedoKeyDown, true);
    return () => window.removeEventListener('keydown', onUndoRedoKeyDown, true);
  }, [performRedo, performUndo]);

  const replaceLineInContent = useCallback(
    (lineIndex: number, nextRawLine: string) => {
      const rawLines = content.split('\n');
      rawLines[lineIndex] = nextRawLine;
      return rawLines.join('\n');
    },
    [content],
  );

  // Convert line index + body plain offset to safe markdown insert offset in content
  const toGlobalOffset = useCallback(
    (lineIndex: number, bodyOffset: number): number => {
      const parsed = parsedLines[lineIndex];
      if (!parsed) return content.length;
      if (bodyOffset <= 0) {
        return parsed.start;
      }
      const bodyMd = parsed.raw.slice(parsed.bodyStart - parsed.start);
      const runs = inlineMarkdownToRuns(bodyMd);
      const plainLen = runsToPlainText(runs).length;
      if (bodyOffset >= plainLen) {
        return Math.min(content.length, parsed.end);
      }
      const { index, out } = splitRunsAt(runs, bodyOffset);
      const mdBefore = runsToInlineMarkdown(out.slice(0, index));
      return Math.min(content.length, parsed.end, parsed.bodyStart + mdBefore.length);
    },
    [content.length, parsedLines],
  );

  const getSafeImageInsertOffset = useCallback((): number => {
    const enclosingBox = blocks.find(
      (b): b is Extract<DocumentBlock, { type: 'box' }> =>
        b.type === 'box' &&
        activeLineIndex >= b.startLineIndex &&
        activeLineIndex <= b.endLineIndex,
    );
    if (enclosingBox) {
      return enclosingBox.end;
    }
    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLElement) {
      const boxEl = activeEl.closest<HTMLElement>('[data-box-end]');
      const endAttr = boxEl?.getAttribute('data-box-end');
      if (endAttr !== null && endAttr !== undefined) {
        const parsedEnd = parseInt(endAttr, 10);
        if (Number.isFinite(parsedEnd)) return parsedEnd;
      }
    }
    return toGlobalOffset(activeLineIndex, caretIndex);
  }, [activeLineIndex, blocks, caretIndex, toGlobalOffset]);

  const openPopoverForIssue = useCallback(
    (lineIndex: number, issue: SpellIssue) => {
      const container = containerRef.current;
      const lineEl = lineRefs.current.get(lineIndex);
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      let top = caretCoords.top + caretCoords.lineHeight + 6;
      let left = Math.max(0, caretCoords.left);
      if (lineEl) {
        const range = findVisibleTextRangeInDom(lineEl, issue.start, issue.end);
        if (range) {
          const wordRect = range.getBoundingClientRect();
          if (wordRect.height > 0) {
            top = wordRect.bottom - containerRect.top + 8;
            left = Math.max(
              0,
              Math.min(
                wordRect.left - containerRect.left,
                Math.max(0, containerRect.width - 248),
              ),
            );
          }
        }
      }
      const suggestions = getSpellingSuggestions(
        issue.word,
        customWordSet,
        5,
      );
      setSpellPopover({ lineIndex, issue, suggestions, top, left });
    },
    [
      caretCoords.left,
      caretCoords.lineHeight,
      caretCoords.top,
      customWordSet,
    ],
  );

  // Core WYSIWYG DOM input handler
  const handleDomInput = useCallback(
    (lineIndex: number, el: HTMLDivElement) => {
      pendingSelectionRef.current = null;
      const parsed = parsedLines[lineIndex];
      if (!parsed) return;
      const prefix = parsed.raw.slice(0, parsed.bodyStart - parsed.start);
      const visSel = getVisibleSelectionOffsets(el) ?? { start: 0, end: 0 };
      const rawRuns = domToRuns(el as unknown as DomNodeLike);
      const expanded = expandPlainRunsInlineShortcuts(rawRuns, visSel.end);
      const runsToSave = expanded.runs;
      const finalCaret = expanded.visibleCaretOffset;
      const nextBodyPlain = runsToPlainText(runsToSave);
      const nextBodyMd = runsToInlineMarkdown(runsToSave);
      const combinedRaw = prefix + nextBodyMd;

      // 1. Live trigger: `(H)` anywhere on a line inserts a 2x2 box
      const boxTriggerMatch = boxShortcutEnabled
        ? nextBodyPlain.match(/^(.*?)\(H\)\s*$/)
        : null;
      if (boxTriggerMatch) {
        const beforeCount = boxTriggerMatch[1].trimEnd().length;
        const beforeRuns = beforeCount > 0 ? splitRunsAt(runsToSave, beforeCount).out : [];
        // Keep only runs before (H) cleanly
        let taken = 0;
        const keptBefore: StyledRun[] = [];
        for (const r of beforeRuns) {
          if (taken >= beforeCount) break;
          const takeLen = Math.min(r.text.length, beforeCount - taken);
          if (takeLen > 0) {
            keptBefore.push({ ...r, text: r.text.slice(0, takeLen) });
            taken += takeLen;
          }
        }
        const beforeLine = prefix + runsToInlineMarkdown(keptBefore);
        const boxMd = serializeBoxRows(createDefaultBoxRows(2, 2));
        const rawLines = content.split('\n');
        const boxLineCount = boxMd.split('\n').length;
        const replacement = beforeLine.trim()
          ? `${beforeLine}\n${boxMd}\n`
          : `${boxMd}\n`;
        const insertedLines = replacement.split('\n');
        rawLines.splice(lineIndex, 1, ...insertedLines);
        onChange(renumberOrderedLists(rawLines.join('\n')), { discrete: true });
        const afterBoxLine = lineIndex + (beforeLine.trim() ? 1 : 0) + boxLineCount;
        setActiveLineIndex(afterBoxLine);
        setCaretIndex(0);
        setSelectionRange({ start: 0, end: 0 });
        setSpellPopover(null);
        setToolbarPos(null);
        playTypingSound(sound, 'enter', soundVolume);
        markTypingPulse();
        window.requestAnimationFrame(() => {
          const boxTarget = containerRef.current?.querySelector<HTMLTextAreaElement>(
            '[data-testid="box-cell-0-0"]',
          );
          boxTarget?.focus();
        });
        return;
      }

      // 1b. Live trigger: `(P)` anywhere on a line inserts a 32x32 or 64x64 pixel canvas
      const pixelTriggerMatch = pixelShortcutEnabled
        ? nextBodyPlain.match(/^(.*?)\(P\)\s*$/)
        : null;
      if (pixelTriggerMatch) {
        const beforeCount = pixelTriggerMatch[1].trimEnd().length;
        const beforeRuns = beforeCount > 0 ? splitRunsAt(runsToSave, beforeCount).out : [];
        let taken = 0;
        const keptBefore: StyledRun[] = [];
        for (const r of beforeRuns) {
          if (taken >= beforeCount) break;
          const takeLen = Math.min(r.text.length, beforeCount - taken);
          if (takeLen > 0) {
            keptBefore.push({ ...r, text: r.text.slice(0, takeLen) });
            taken += takeLen;
          }
        }
        const beforeLine = prefix + runsToInlineMarkdown(keptBefore);
        const pixelMd = serializePixelCanvas(createEmptyPixelCanvas(pixelCanvasSize));
        const rawLines = content.split('\n');
        const pixelLineCount = pixelMd.split('\n').length;
        const replacement = beforeLine.trim()
          ? `${beforeLine}\n${pixelMd}\n`
          : `${pixelMd}\n`;
        const insertedLines = replacement.split('\n');
        rawLines.splice(lineIndex, 1, ...insertedLines);
        onChange(renumberOrderedLists(rawLines.join('\n')), { discrete: true });
        const afterPixelLine = lineIndex + (beforeLine.trim() ? 1 : 0) + pixelLineCount;
        setActiveLineIndex(afterPixelLine);
        setCaretIndex(0);
        setSelectionRange({ start: 0, end: 0 });
        setSpellPopover(null);
        setToolbarPos(null);
        playTypingSound(sound, 'enter', soundVolume);
        markTypingPulse();
        focusLineAt(afterPixelLine, 0, 0);
        return;
      }

      // 2. Live trigger: `/image` opens file upload picker
      const imgCmdMatch = nextBodyPlain.match(/^(.*?)\/image\s?$/);
      if (imgCmdMatch) {
        const keepLen = imgCmdMatch[1].length;
        const { index, out } = splitRunsAt(runsToSave, keepLen);
        const cleanedMd = runsToInlineMarkdown(out.slice(0, index));
        onChange(renumberOrderedLists(replaceLineInContent(lineIndex, prefix + cleanedMd)), {
          discrete: true,
        });
        focusLineAt(lineIndex, keepLen, keepLen);
        hiddenImageInputRef.current?.click();
        return;
      }

      // 3. Multi-line input fallback
      if (nextBodyMd.includes('\n')) {
        const rawLines = content.split('\n');
        const inserted = combinedRaw.split('\n');
        rawLines.splice(lineIndex, 1, ...inserted);
        onChange(renumberOrderedLists(rawLines.join('\n')), { discrete: true });
        const targetLine = lineIndex + inserted.length - 1;
        const lastVisLen = runsToPlainText(
          inlineMarkdownToRuns(inserted[inserted.length - 1]),
        ).length;
        focusLineAt(targetLine, lastVisLen, lastVisLen);
        markTypingPulse();
        return;
      }

      // 4. Live block conversion on typing `# `, `## `, `### `, `[] `, `* `, `- `, `1. `, `> `, `--`, `---`
      const oldKind = parsed.kind;
      const nextParsedSingle = parseMarkdownLines(combinedRaw)[0];
      const nextText = renumberOrderedLists(replaceLineInContent(lineIndex, combinedRaw));

      setActiveLineIndex(lineIndex);
      setSpellPopover(null);
      markTypingPulse();

      if (nextParsedSingle && nextParsedSingle.kind !== oldKind) {
        const updatedParsed = parseMarkdownLines(nextText)[lineIndex] ?? nextParsedSingle;
        const convertedBody = updatedParsed.raw.slice(
          updatedParsed.bodyStart - updatedParsed.start,
        );
        const convertedPlainLen = runsToPlainText(
          inlineMarkdownToRuns(convertedBody),
        ).length;
        onChange(nextText, { discrete: true });
        setActiveTypingCaret(null);
        focusLineAt(lineIndex, convertedPlainLen, convertedPlainLen);
        return;
      }

      // 4b. Offline autocorrect when a user finishes typing a word with a delimiter (` `, `.`, `,`, `!`, `?`, `;`, `:`)
      const isForwardInsertion =
        nextBodyPlain.length > runsToPlainText(inlineMarkdownToRuns(parsed.raw.slice(parsed.bodyStart - parsed.start))).length;
      if (
        autocorrectEnabled &&
        isForwardInsertion &&
        visSel.start === visSel.end &&
        finalCaret >= 4
      ) {
        const beforeCaret = nextBodyPlain.slice(0, finalCaret);
        const wordMatch = beforeCaret.match(
          /(?:^|[^A-Za-z'’])([A-Za-z'’]{3,28})([ \u00A0.,!?;:])$/,
        );
        if (wordMatch) {
          const word = wordMatch[1];
          const wordEnd = finalCaret - 1;
          const wordStart = wordEnd - word.length;
          // Skip autocorrect inside inline code runs
          let curOffset = 0;
          let insideCode = false;
          for (const r of runsToSave) {
            const end = curOffset + r.text.length;
            if (r.code && wordStart < end && wordEnd > curOffset) {
              insideCode = true;
              break;
            }
            curOffset = end;
          }
          if (!insideCode) {
            const replacement = getAutocorrectReplacement(
              word,
              customWordSet,
              ignoredWordSet,
            );
            if (replacement && replacement !== word) {
              const correctedRuns = replaceVisibleRangeInRuns(
                runsToSave,
                wordStart,
                wordEnd,
                replacement,
              );
              const correctedCaret = wordStart + replacement.length + 1;
              const correctedDoc = renumberOrderedLists(
                replaceLineInContent(
                  lineIndex,
                  prefix + runsToInlineMarkdown(correctedRuns),
                ),
              );
              pendingLocalEchoesRef.current.delete(lineIndex);
              pendingSelectionRef.current = {
                lineIndex,
                start: correctedCaret,
                end: correctedCaret,
              };
              setActiveTypingCaret(null);
              setCaretIndex(correctedCaret);
              setSelectionRange({ start: correctedCaret, end: correctedCaret });
              onChange(correctedDoc, { discrete: true });
              return;
            }
          }
        }
      }

      // 5. Avoid redundant no-op echoes (e.g. trailing input after compositionend)
      if (nextText === content && nextParsedSingle?.kind === oldKind && !expanded.changed) {
        setActiveTypingCaret({ lineIndex, offset: finalCaret });
        setCaretIndex(finalCaret);
        setSelectionRange({ start: finalCaret, end: finalCaret });
        return;
      }

      // 6. If inline shortcut like *word* or **word** expanded, queue DOM sync + adjusted caret outside tag
      if (expanded.changed) {
        pendingLocalEchoesRef.current.delete(lineIndex);
        pendingSelectionRef.current = {
          lineIndex,
          start: finalCaret,
          end: finalCaret,
          preferOutsideInlineEnd: true,
        };
      } else {
        const q = pendingLocalEchoesRef.current.get(lineIndex) ?? [];
        q.push(nextBodyMd);
        if (q.length > 32) q.splice(0, q.length - 32);
        pendingLocalEchoesRef.current.set(lineIndex, q);
      }

      setActiveTypingCaret({ lineIndex, offset: finalCaret });
      setCaretIndex(finalCaret);
      setSelectionRange({ start: finalCaret, end: finalCaret });
      onChange(
        nextText,
        expanded.changed
          ? { discrete: true }
          : { coalesceKey: nextText.length < content.length ? 'del' : 'type' },
      );
    },
    [
      autocorrectEnabled,
      boxShortcutEnabled,
      content,
      customWordSet,
      focusLineAt,
      ignoredWordSet,
      markTypingPulse,
      onChange,
      parsedLines,
      pixelCanvasSize,
      pixelShortcutEnabled,
      replaceLineInContent,
      sound,
      soundVolume,
    ],
  );

  // Detect `:emoji` shortcode query on active line using visible plain text
  const activeParsedLine = parsedLines[activeLineIndex];
  const activeBodyText = activeParsedLine
    ? activeParsedLine.raw.slice(activeParsedLine.bodyStart - activeParsedLine.start)
    : '';
  const activeRuns = useMemo(
    () => inlineMarkdownToRuns(activeBodyText),
    [activeBodyText],
  );
  const activePlainText = useMemo(
    () => runsToPlainText(activeRuns),
    [activeRuns],
  );

  const activeEmojiMatch = useMemo(() => {
    if (!isFocused || selectionRange.start !== selectionRange.end || spellPopover) {
      return null;
    }
    const clamped = Math.min(caretIndex, activePlainText.length);
    const before = activePlainText.slice(0, clamped);
    const m = findEmojiShortcodeMatch(before);
    if (!m) return null;
    if (dismissedEmojiStart === m.colonStart) return null;
    const items = searchEmojis(m.query, 6);
    if (items.length === 0) return null;
    return { colonStart: m.colonStart, end: clamped, items };
  }, [
    isFocused,
    selectionRange.start,
    selectionRange.end,
    spellPopover,
    caretIndex,
    activePlainText,
    dismissedEmojiStart,
  ]);

  useEffect(() => {
    setEmojiActiveIdx(0);
  }, [activeEmojiMatch?.colonStart, activeEmojiMatch?.items[0]?.slug]);

  useEffect(() => {
    if (dismissedEmojiStart !== null) {
      const before = activePlainText.slice(0, Math.min(caretIndex, activePlainText.length));
      if (!findEmojiShortcodeMatch(before)) {
        setDismissedEmojiStart(null);
      }
    }
  }, [activePlainText, caretIndex, dismissedEmojiStart]);

  const handlePickEmojiSuggestion = useCallback(
    (item: EmojiSearchItem) => {
      if (!activeEmojiMatch || !activeParsedLine) return;
      const guardKey = `${activeLineIndex}:${activeEmojiMatch.colonStart}:${item.emoji}`;
      const now = Date.now();
      if (
        emojiPickGuardRef.current &&
        emojiPickGuardRef.current.key === guardKey &&
        now - emojiPickGuardRef.current.time < 120
      ) {
        return;
      }
      emojiPickGuardRef.current = { key: guardKey, time: now };

      const replacement = `${item.emoji} `;
      const nextRuns = replaceVisibleRangeInRuns(
        activeRuns,
        activeEmojiMatch.colonStart,
        activeEmojiMatch.end,
        replacement,
      );
      const nextPos = activeEmojiMatch.colonStart + replacement.length;
      const prefix = activeParsedLine.raw.slice(
        0,
        activeParsedLine.bodyStart - activeParsedLine.start,
      );
      setDismissedEmojiStart(null);
      setEmojiActiveIdx(0);
      setActiveTypingCaret(null);
      playTypingSound(sound, 'char', soundVolume);
      onChange(
        replaceLineInContent(activeLineIndex, prefix + runsToInlineMarkdown(nextRuns)),
        { discrete: true },
      );
      focusLineAt(activeLineIndex, nextPos, nextPos);
    },
    [
      activeEmojiMatch,
      activeLineIndex,
      activeParsedLine,
      activeRuns,
      focusLineAt,
      onChange,
      replaceLineInContent,
      sound,
      soundVolume,
    ],
  );

  // Inline WYSIWYG toggle formatting (bold, italic, underline, highlight, wikilink)
  const runInlineToggle = useCallback(
    (prop: InlineToggleProp) => {
      pendingLocalEchoesRef.current.clear();
      if (isAllSelected) {
        const rawLines = content.split('\n');
        for (const block of blocks) {
          if (block.type !== 'line') continue;
          const parsed = parsedLines[block.lineIndex];
          if (!parsed || parsed.kind === 'divider' || parsed.kind === 'codeblock') continue;
          const prefix = parsed.raw.slice(0, parsed.bodyStart - parsed.start);
          const bodyMd = parsed.raw.slice(parsed.bodyStart - parsed.start);
          const runs = inlineMarkdownToRuns(bodyMd);
          const len = runsToPlainText(runs).length;
          if (len === 0) continue;
          rawLines[block.lineIndex] = prefix + runsToInlineMarkdown(toggleRunFormat(runs, 0, len, prop));
        }
        onChange(rawLines.join('\n'), { discrete: true });
        playTypingSound(sound, 'char', soundVolume);
        markTypingPulse();
        window.requestAnimationFrame(() => selectAllDocumentLines());
        return;
      }

      if (multiSelection && isCrossLineSelection(multiSelection)) {
        const nextText = applyMultiLineInlineToggle(content, parsedLines, multiSelection, prop);
        onChange(nextText, { discrete: true });
        playTypingSound(sound, 'char', soundVolume);
        markTypingPulse();
        return;
      }

      if (!activeParsedLine) return;
      const s = Math.min(selectionRange.start, selectionRange.end);
      const e = Math.max(selectionRange.start, selectionRange.end);
      if (s === e) return;
      const nextRuns = toggleRunFormat(activeRuns, s, e, prop);
      const prefix = activeParsedLine.raw.slice(
        0,
        activeParsedLine.bodyStart - activeParsedLine.start,
      );
      onChange(
        replaceLineInContent(activeLineIndex, prefix + runsToInlineMarkdown(nextRuns)),
        { discrete: true },
      );
      playTypingSound(sound, 'char', soundVolume);
      markTypingPulse();
      focusLineAt(activeLineIndex, s, e);
    },
    [
      activeLineIndex,
      activeParsedLine,
      activeRuns,
      blocks,
      content,
      focusLineAt,
      isAllSelected,
      markTypingPulse,
      multiSelection,
      onChange,
      parsedLines,
      replaceLineInContent,
      selectAllDocumentLines,
      selectionRange.end,
      selectionRange.start,
      sound,
      soundVolume,
    ],
  );

  // Clean replacement color application (replaces any existing color instead of stacking)
  const runApplyColor = useCallback(
    (hex: string | null) => {
      pendingLocalEchoesRef.current.clear();
      if (isAllSelected) {
        const rawLines = content.split('\n');
        for (const block of blocks) {
          if (block.type !== 'line') continue;
          const parsed = parsedLines[block.lineIndex];
          if (!parsed || parsed.kind === 'divider' || parsed.kind === 'codeblock') continue;
          const prefix = parsed.raw.slice(0, parsed.bodyStart - parsed.start);
          const bodyMd = parsed.raw.slice(parsed.bodyStart - parsed.start);
          const runs = inlineMarkdownToRuns(bodyMd);
          const len = runsToPlainText(runs).length;
          if (len === 0) continue;
          rawLines[block.lineIndex] = prefix + runsToInlineMarkdown(applyRunColor(runs, 0, len, hex));
        }
        onChange(rawLines.join('\n'), { discrete: true });
        playTypingSound(sound, 'char', soundVolume);
        markTypingPulse();
        window.requestAnimationFrame(() => selectAllDocumentLines());
        return;
      }

      if (multiSelection && isCrossLineSelection(multiSelection)) {
        const nextText = applyMultiLineColor(content, parsedLines, multiSelection, hex);
        onChange(nextText, { discrete: true });
        playTypingSound(sound, 'char', soundVolume);
        markTypingPulse();
        return;
      }

      if (!activeParsedLine) return;
      const s = Math.min(selectionRange.start, selectionRange.end);
      const e = Math.max(selectionRange.start, selectionRange.end);
      if (s === e) return;
      const nextRuns = applyRunColor(activeRuns, s, e, hex);
      const prefix = activeParsedLine.raw.slice(
        0,
        activeParsedLine.bodyStart - activeParsedLine.start,
      );
      onChange(
        replaceLineInContent(activeLineIndex, prefix + runsToInlineMarkdown(nextRuns)),
        { discrete: true },
      );
      playTypingSound(sound, 'char', soundVolume);
      markTypingPulse();
      focusLineAt(activeLineIndex, s, e);
    },
    [
      activeLineIndex,
      activeParsedLine,
      activeRuns,
      blocks,
      content,
      focusLineAt,
      isAllSelected,
      markTypingPulse,
      multiSelection,
      onChange,
      parsedLines,
      replaceLineInContent,
      selectAllDocumentLines,
      selectionRange.end,
      selectionRange.start,
      sound,
      soundVolume,
    ],
  );

  const runApplyHeading = useCallback(
    (level: 1 | 2 | 3) => {
      pendingLocalEchoesRef.current.clear();
      if (isAllSelected) {
        const rawLines = content.split('\n');
        for (const block of blocks) {
          if (block.type !== 'line') continue;
          const parsed = parsedLines[block.lineIndex];
          if (!parsed || parsed.kind === 'divider' || parsed.kind === 'codeblock') continue;
          rawLines[block.lineIndex] = applyHeadingToRawLine(parsed.raw, level);
        }
        onChange(rawLines.join('\n'), { discrete: true });
        playTypingSound(sound, 'char', soundVolume);
        markTypingPulse();
        window.requestAnimationFrame(() => selectAllDocumentLines());
        return;
      }
      if (multiSelection && isCrossLineSelection(multiSelection)) {
        onChange(applyMultiLineHeading(content, parsedLines, multiSelection, level), {
          discrete: true,
        });
        playTypingSound(sound, 'char', soundVolume);
        markTypingPulse();
        return;
      }
      if (!activeParsedLine) return;
      const nextRaw = applyHeadingToRawLine(activeParsedLine.raw, level);
      onChange(replaceLineInContent(activeLineIndex, nextRaw), { discrete: true });
      playTypingSound(sound, 'char', soundVolume);
      const maxVis = activePlainText.length;
      focusLineAt(
        activeLineIndex,
        Math.min(selectionRange.start, maxVis),
        Math.min(selectionRange.end, maxVis),
      );
    },
    [
      activeLineIndex,
      activeParsedLine,
      activePlainText.length,
      blocks,
      content,
      focusLineAt,
      isAllSelected,
      markTypingPulse,
      multiSelection,
      onChange,
      parsedLines,
      replaceLineInContent,
      selectAllDocumentLines,
      selectionRange.end,
      selectionRange.start,
      sound,
      soundVolume,
    ],
  );

  const runTogglePrefix = useCallback(
    (kind: 'bullet' | 'ordered' | 'task' | 'quote') => {
      pendingLocalEchoesRef.current.clear();
      if (isAllSelected) {
        const rawLines = content.split('\n');
        for (const block of blocks) {
          if (block.type !== 'line') continue;
          const parsed = parsedLines[block.lineIndex];
          if (!parsed || parsed.kind === 'divider' || parsed.kind === 'codeblock') continue;
          rawLines[block.lineIndex] = toggleRawLinePrefix(parsed.raw, kind);
        }
        onChange(renumberOrderedLists(rawLines.join('\n')), { discrete: true });
        playTypingSound(sound, 'char', soundVolume);
        markTypingPulse();
        window.requestAnimationFrame(() => selectAllDocumentLines());
        return;
      }
      if (multiSelection && isCrossLineSelection(multiSelection)) {
        onChange(
          renumberOrderedLists(
            applyMultiLinePrefix(content, parsedLines, multiSelection, kind),
          ),
          { discrete: true },
        );
        playTypingSound(sound, 'char', soundVolume);
        markTypingPulse();
        return;
      }
      if (!activeParsedLine) return;
      const nextRaw = toggleRawLinePrefix(activeParsedLine.raw, kind);
      onChange(renumberOrderedLists(replaceLineInContent(activeLineIndex, nextRaw)), {
        discrete: true,
      });
      playTypingSound(sound, 'char', soundVolume);
      const maxVis = activePlainText.length;
      focusLineAt(
        activeLineIndex,
        Math.min(selectionRange.start, maxVis),
        Math.min(selectionRange.end, maxVis),
      );
    },
    [
      activeLineIndex,
      activeParsedLine,
      activePlainText.length,
      blocks,
      content,
      focusLineAt,
      isAllSelected,
      markTypingPulse,
      multiSelection,
      onChange,
      parsedLines,
      replaceLineInContent,
      selectAllDocumentLines,
      selectionRange.end,
      selectionRange.start,
      sound,
      soundVolume,
    ],
  );

  const handlePastePlainText = useCallback(
    (lineIndex: number, text: string, el: HTMLDivElement) => {
      const normalized = text.replace(/\r\n?/g, '\n');
      if (isAllSelected) {
        setIsAllSelected(false);
        setMultiSelection(null);
        setToolbarPos(null);
        onChange(normalized, { discrete: true });
        playTypingSound(sound, normalized.includes('\n') ? 'enter' : 'char', soundVolume);
        markTypingPulse();
        const pastedLines = normalized.split('\n');
        const targetIdx = pastedLines.length - 1;
        const lastParsed = parseMarkdownLines(pastedLines[targetIdx] ?? '')[0];
        const bodyMd = lastParsed
          ? lastParsed.raw.slice(lastParsed.bodyStart - lastParsed.start)
          : '';
        const endLen = runsToPlainText(inlineMarkdownToRuns(bodyMd)).length;
        focusLineAt(targetIdx, endLen, endLen);
        return;
      }

      if (multiSelection && isCrossLineSelection(multiSelection)) {
        const res = replaceMultiLineRange(content, parsedLines, multiSelection, normalized);
        setMultiSelection(null);
        setToolbarPos(null);
        onChange(res.nextContent, { discrete: true });
        playTypingSound(sound, normalized.includes('\n') ? 'enter' : 'char', soundVolume);
        markTypingPulse();
        focusLineAt(res.nextLineIndex, res.nextCaretOffset, res.nextCaretOffset);
        return;
      }

      const parsed = parsedLines[lineIndex];
      if (!parsed) return;
      const prefix = parsed.raw.slice(0, parsed.bodyStart - parsed.start);
      const currentRuns = domToRuns(el as unknown as DomNodeLike);
      const vis = getVisibleSelectionOffsets(el) ?? {
        start: runsToPlainText(currentRuns).length,
        end: runsToPlainText(currentRuns).length,
      };
      const s = Math.min(vis.start, vis.end);
      const e = Math.max(vis.start, vis.end);

      if (!normalized.includes('\n')) {
        const splicedRuns = replaceVisibleRangeInRuns(currentRuns, s, e, normalized);
        const expanded = expandPlainRunsInlineShortcuts(
          splicedRuns,
          s + normalized.length,
        );
        const combinedRaw = prefix + runsToInlineMarkdown(expanded.runs);
        const nextParsedSingle = parseMarkdownLines(combinedRaw)[0];
        onChange(replaceLineInContent(lineIndex, combinedRaw), { discrete: true });
        playTypingSound(sound, 'char', soundVolume);
        markTypingPulse();
        if (nextParsedSingle && nextParsedSingle.kind !== parsed.kind) {
          const newBody = nextParsedSingle.raw.slice(
            nextParsedSingle.bodyStart - nextParsedSingle.start,
          );
          const len = runsToPlainText(inlineMarkdownToRuns(newBody)).length;
          focusLineAt(lineIndex, len, len);
        } else {
          focusLineAt(
            lineIndex,
            expanded.visibleCaretOffset,
            expanded.visibleCaretOffset,
          );
        }
        return;
      }

      const pasteLines = normalized.split('\n');
      const firstSplit = splitRunsAt(currentRuns, s);
      const secondSplit = splitRunsAt(firstSplit.out, e);
      const beforeRuns = secondSplit.out.slice(0, firstSplit.index);
      const afterRuns = secondSplit.out.slice(secondSplit.index);

      const firstLineMd =
        prefix + runsToInlineMarkdown(beforeRuns) + pasteLines[0];
      const middleLines = pasteLines.slice(1, -1);
      const lastLineText = pasteLines[pasteLines.length - 1];
      const lastLineMd = lastLineText + runsToInlineMarkdown(afterRuns);

      const rawLines = content.split('\n');
      rawLines.splice(lineIndex, 1, firstLineMd, ...middleLines, lastLineMd);
      onChange(renumberOrderedLists(rawLines.join('\n')), { discrete: true });
      playTypingSound(sound, 'enter', soundVolume);
      markTypingPulse();

      const targetLine = lineIndex + pasteLines.length - 1;
      focusLineAt(targetLine, lastLineText.length, lastLineText.length);
    },
    [
      content,
      focusLineAt,
      isAllSelected,
      markTypingPulse,
      multiSelection,
      onChange,
      parsedLines,
      replaceLineInContent,
      sound,
      soundVolume,
    ],
  );

  const handleLineKeyDown = useCallback(
    (lineIndex: number, e: React.KeyboardEvent<HTMLDivElement>) => {
      const parsed = parsedLines[lineIndex];
      if (!parsed) return;
      const el = e.currentTarget;
      const currentRuns = domToRuns(el as unknown as DomNodeLike);
      const plainText = runsToPlainText(currentRuns);
      const vis = getVisibleSelectionOffsets(el) ?? {
        start: plainText.length,
        end: plainText.length,
      };
      const selStart = vis.start;
      const selEnd = vis.end;

      // Ctrl+A / Cmd+A selects all lines across the entire document
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'a'
      ) {
        e.preventDefault();
        e.stopPropagation();
        selectAllDocumentLines();
        return;
      }

      if (e.key === 'Escape' && (spellPopover || activeEmojiMatch || toolbarPos || isAllSelected)) {
        e.preventDefault();
        e.stopPropagation();
        setSpellPopover(null);
        setToolbarPos(null);
        setIsAllSelected(false);
        if (activeEmojiMatch) {
          setDismissedEmojiStart(activeEmojiMatch.colonStart);
        }
        return;
      }

      if (
        activeEmojiMatch &&
        activeEmojiMatch.items.length > 0 &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setEmojiActiveIdx((idx) => (idx + 1) % activeEmojiMatch.items.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setEmojiActiveIdx(
            (idx) =>
              (idx - 1 + activeEmojiMatch.items.length) %
              activeEmojiMatch.items.length,
          );
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          if (!e.repeat) {
            handlePickEmojiSuggestion(
              activeEmojiMatch.items[emojiActiveIdx] ?? activeEmojiMatch.items[0],
            );
          }
          return;
        }
      }

      // Formatting shortcuts: Cmd/Ctrl + B / I / U
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const lower = e.key.toLowerCase();
        if (lower === 'b') {
          e.preventDefault();
          runInlineToggle('bold');
          return;
        }
        if (lower === 'i') {
          e.preventDefault();
          runInlineToggle('italic');
          return;
        }
        if (lower === 'u') {
          e.preventDefault();
          runInlineToggle('underline');
          return;
        }
      }

      // Enter: split styled runs cleanly & continue task / bullet / ordered / quote lists
      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        playTypingSound(sound, 'enter', soundVolume);
        markTypingPulse();
        setSpellPopover(null);
        setToolbarPos(null);
        setActiveTypingCaret(null);

        const rawLines = content.split('\n');
        const prefix = parsed.raw.slice(0, parsed.bodyStart - parsed.start);

        if (
          (parsed.kind === 'task' ||
            parsed.kind === 'bullet' ||
            parsed.kind === 'ordered' ||
            parsed.kind === 'quote') &&
          plainText.trim() === ''
        ) {
          rawLines[lineIndex] = '';
          onChange(renumberOrderedLists(rawLines.join('\n')), { discrete: true });
          focusLineAt(lineIndex, 0, 0);
          return;
        }

        const firstSplit = splitRunsAt(currentRuns, selStart);
        const secondSplit = splitRunsAt(firstSplit.out, selEnd);
        const beforeMd = runsToInlineMarkdown(
          secondSplit.out.slice(0, firstSplit.index),
        );
        const afterMd = runsToInlineMarkdown(
          secondSplit.out.slice(secondSplit.index),
        );

        let nextLinePrefix = '';
        if (parsed.kind === 'task') {
          nextLinePrefix = prefix.replace(/\[[ xX]?\]/, (b) =>
            b === '[]' ? '[]' : '[ ]',
          );
        } else if (parsed.kind === 'bullet') {
          nextLinePrefix = prefix;
        } else if (parsed.kind === 'ordered') {
          const numMatch = prefix.match(/^(\s*)(\d+)(\.\s+)$/);
          nextLinePrefix = numMatch
            ? `${numMatch[1]}${parseInt(numMatch[2], 10) + 1}${numMatch[3]}`
            : '1. ';
        } else if (parsed.kind === 'quote') {
          nextLinePrefix = prefix;
        }

        rawLines.splice(
          lineIndex,
          1,
          prefix + beforeMd,
          nextLinePrefix + afterMd,
        );
        onChange(renumberOrderedLists(rawLines.join('\n')), { discrete: true });
        focusLineAt(lineIndex + 1, 0, 0);
        return;
      }

      // Tab / Shift+Tab indents or outdents lists
      if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (
          parsed.kind === 'bullet' ||
          parsed.kind === 'ordered' ||
          parsed.kind === 'task'
        ) {
          e.preventDefault();
          const rawLines = content.split('\n');
          if (e.shiftKey) {
            if (parsed.raw.startsWith('  ')) {
              rawLines[lineIndex] = parsed.raw.slice(2);
              onChange(renumberOrderedLists(rawLines.join('\n')), { discrete: true });
            }
          } else {
            rawLines[lineIndex] = `  ${parsed.raw}`;
            onChange(renumberOrderedLists(rawLines.join('\n')), { discrete: true });
          }
          playTypingSound(sound, 'space', soundVolume);
          markTypingPulse();
          focusLineAt(lineIndex, selStart, selEnd);
          return;
        }
      }

      // Backspace at offset 0: unwrap heading/list prefix or merge cleanly with previous line
      if (
        e.key === 'Backspace' &&
        !e.shiftKey &&
        selStart === 0 &&
        selEnd === 0
      ) {
        const lineBodyMd = runsToInlineMarkdown(currentRuns);
        if (
          parsed.kind === 'heading' ||
          parsed.kind === 'task' ||
          parsed.kind === 'bullet' ||
          parsed.kind === 'ordered' ||
          parsed.kind === 'quote' ||
          parsed.kind === 'divider'
        ) {
          e.preventDefault();
          playTypingSound(sound, 'backspace', soundVolume, { isRepeat: e.repeat });
          markTypingPulse();
          onChange(
            renumberOrderedLists(
              replaceLineInContent(lineIndex, parsed.indent + lineBodyMd),
            ),
            { discrete: true },
          );
          focusLineAt(lineIndex, 0, 0);
          return;
        }

        if (lineIndex > 0) {
          const posInVisible = visibleLineIndices.indexOf(lineIndex);
          if (posInVisible > 0) {
            const prevIdx = visibleLineIndices[posInVisible - 1];
            const prevParsed = parsedLines[prevIdx];
            if (prevIdx === lineIndex - 1 && prevParsed) {
              e.preventDefault();
              playTypingSound(sound, 'backspace', soundVolume, { isRepeat: e.repeat });
              markTypingPulse();
              const prevPrefix = prevParsed.raw.slice(
                0,
                prevParsed.bodyStart - prevParsed.start,
              );
              const prevBodyMd = prevParsed.raw.slice(
                prevParsed.bodyStart - prevParsed.start,
              );
              const prevRuns = inlineMarkdownToRuns(prevBodyMd);
              const prevPlainLen = runsToPlainText(prevRuns).length;
              const mergedMd = runsToInlineMarkdown([...prevRuns, ...currentRuns]);
              const rawLines = content.split('\n');
              rawLines.splice(prevIdx, 2, prevPrefix + mergedMd);
              onChange(renumberOrderedLists(rawLines.join('\n')), { discrete: true });
              focusLineAt(prevIdx, prevPlainLen, prevPlainLen);
              return;
            } else if (plainText === '') {
              e.preventDefault();
              const rawLines = content.split('\n');
              rawLines.splice(lineIndex, 1);
              onChange(renumberOrderedLists(rawLines.join('\n')), { discrete: true });
              const prevBodyMd = prevParsed
                ? prevParsed.raw.slice(prevParsed.bodyStart - prevParsed.start)
                : '';
              const prevPlainLen = runsToPlainText(
                inlineMarkdownToRuns(prevBodyMd),
              ).length;
              focusLineAt(prevIdx, prevPlainLen, prevPlainLen);
              return;
            }
          }
        }
      }

      // ArrowUp / ArrowDown across line blocks (respecting soft-wrapped multi-line divs)
      if (e.key === 'ArrowUp' && !e.shiftKey && !e.metaKey && !e.altKey) {
        const elRect = el.getBoundingClientRect();
        const lineHeightPx =
          parseFloat(window.getComputedStyle(el).lineHeight) || 36;
        const domSel = window.getSelection();
        const r =
          domSel && domSel.rangeCount > 0
            ? domSel.getRangeAt(0).getClientRects()[0]
            : null;
        const onFirstVisualLine = !r || r.top - elRect.top < lineHeightPx * 0.8;
        if (onFirstVisualLine) {
          const posInVisible = visibleLineIndices.indexOf(lineIndex);
          if (posInVisible > 0) {
            e.preventDefault();
            playTypingSound(sound, 'nav', soundVolume, { isRepeat: e.repeat });
            markTypingPulse();
            const targetIdx = visibleLineIndices[posInVisible - 1];
            const targetParsed = parsedLines[targetIdx];
            const targetBodyMd = targetParsed
              ? targetParsed.raw.slice(targetParsed.bodyStart - targetParsed.start)
              : '';
            const targetVisLen = runsToPlainText(
              inlineMarkdownToRuns(targetBodyMd),
            ).length;
            focusLineAt(targetIdx, Math.min(selStart, targetVisLen));
            return;
          }
        }
      }

      if (e.key === 'ArrowDown' && !e.shiftKey && !e.metaKey && !e.altKey) {
        const elRect = el.getBoundingClientRect();
        const lineHeightPx =
          parseFloat(window.getComputedStyle(el).lineHeight) || 36;
        const domSel = window.getSelection();
        const r =
          domSel && domSel.rangeCount > 0
            ? domSel.getRangeAt(0).getClientRects()[0]
            : null;
        const onLastVisualLine = !r || elRect.bottom - r.bottom < lineHeightPx * 0.8;
        if (onLastVisualLine) {
          const posInVisible = visibleLineIndices.indexOf(lineIndex);
          if (posInVisible !== -1 && posInVisible < visibleLineIndices.length - 1) {
            e.preventDefault();
            playTypingSound(sound, 'nav', soundVolume, { isRepeat: e.repeat });
            markTypingPulse();
            const targetIdx = visibleLineIndices[posInVisible + 1];
            const targetParsed = parsedLines[targetIdx];
            const targetBodyMd = targetParsed
              ? targetParsed.raw.slice(targetParsed.bodyStart - targetParsed.start)
              : '';
            const targetVisLen = runsToPlainText(
              inlineMarkdownToRuns(targetBodyMd),
            ).length;
            focusLineAt(targetIdx, Math.min(selStart, targetVisLen));
            return;
          }
        }
      }

      // Atomic Backspace / Delete across multi-codepoint emoji graphemes & stray zero-width spaces
      if (
        (e.key === 'Backspace' || e.key === 'Delete') &&
        !e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        selStart === selEnd
      ) {
        const dir = e.key === 'Backspace' ? -1 : 1;
        const canStep =
          (dir === -1 && selStart > 0) ||
          (dir === 1 && selStart < plainText.length);
        if (canStep) {
          const step = stepVisibleOffsetByGrapheme(plainText, selStart, dir);
          const domSel = window.getSelection();
          const focusNode = domSel?.focusNode ?? null;
          const focusOffset = domSel?.focusOffset ?? 0;
          const focusText = focusNode?.nodeType === Node.TEXT_NODE ? (focusNode.textContent ?? '') : '';
          const charAdjacentIsZws =
            focusNode?.nodeType === Node.TEXT_NODE &&
            ((dir === -1 && focusOffset > 0 && focusText[focusOffset - 1] === '\u200B') ||
              (dir === 1 && focusOffset < focusText.length && focusText[focusOffset] === '\u200B'));
          if (step.crossedEmoji || charAdjacentIsZws) {
            e.preventDefault();
            const delStart = Math.min(selStart, step.nextOffset);
            const delEnd = Math.max(selStart, step.nextOffset);
            const prefix = parsed.raw.slice(0, parsed.bodyStart - parsed.start);
            const nextRuns = replaceVisibleRangeInRuns(
              currentRuns,
              delStart,
              delEnd,
              '',
            );
            pendingLocalEchoesRef.current.delete(lineIndex);
            onChange(
              replaceLineInContent(lineIndex, prefix + runsToInlineMarkdown(nextRuns)),
              { discrete: true },
            );
            playTypingSound(sound, 'backspace', soundVolume, { isRepeat: e.repeat });
            markTypingPulse();
            focusLineAt(lineIndex, delStart, delStart);
            return;
          }
        }
      }

      // Grapheme-aware ArrowLeft / ArrowRight across atomic emojis and element boundaries
      if (
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const dir: -1 | 1 = e.key === 'ArrowLeft' ? -1 : 1;
        const domSel = window.getSelection();
        const focusNode = domSel?.focusNode ?? null;
        const focusVis =
          domSel && domSel.rangeCount > 0 && domSel.focusNode && el.contains(domSel.focusNode)
            ? getVisibleOffsetForDomPoint(el, domSel.focusNode, domSel.focusOffset)
            : dir === -1
              ? selStart
              : selEnd;
        const anchorVis =
          domSel && domSel.rangeCount > 0 && domSel.anchorNode && el.contains(domSel.anchorNode)
            ? getVisibleOffsetForDomPoint(el, domSel.anchorNode, domSel.anchorOffset)
            : selStart;

        const step = stepVisibleOffsetByGrapheme(plainText, focusVis, dir);
        const onElementOrZws = Boolean(
          focusNode &&
            (focusNode.nodeType === Node.ELEMENT_NODE ||
              (focusNode.nodeType === Node.TEXT_NODE &&
                (focusNode.textContent ?? '').includes('\u200B'))),
        );

        if (!e.shiftKey && selStart === selEnd && (step.crossedEmoji || onElementOrZws)) {
          e.preventDefault();
          setVisibleSelectionOffsets(el, step.nextOffset, step.nextOffset, false);
          setActiveLineIndex(lineIndex);
          setCaretIndex(step.nextOffset);
          setSelectionRange({ start: step.nextOffset, end: step.nextOffset });
          measureActiveCaretAndSelection();
          playTypingSound(sound, 'nav', soundVolume, { isRepeat: e.repeat });
          markTypingPulse();
          return;
        }

        if (e.shiftKey && step.crossedEmoji) {
          e.preventDefault();
          const s = Math.min(anchorVis, step.nextOffset);
          const end = Math.max(anchorVis, step.nextOffset);
          setVisibleSelectionOffsets(el, s, end, false);
          setActiveLineIndex(lineIndex);
          setCaretIndex(step.nextOffset);
          setSelectionRange({ start: s, end });
          measureActiveCaretAndSelection();
          playTypingSound(sound, 'nav', soundVolume, { isRepeat: e.repeat });
          markTypingPulse();
          return;
        }
      }

      if (
        e.key === 'Home' ||
        e.key === 'End' ||
        e.key === 'PageUp' ||
        e.key === 'PageDown'
      ) {
        markTypingPulse();
      }

      const soundKind = classifyKeyEventForSound({
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
      });
      if (soundKind) {
        playTypingSound(sound, soundKind, soundVolume, { isRepeat: e.repeat });
        markTypingPulse();
      }
    },
    [
      activeEmojiMatch,
      content,
      emojiActiveIdx,
      focusLineAt,
      handlePickEmojiSuggestion,
      isAllSelected,
      markTypingPulse,
      measureActiveCaretAndSelection,
      onChange,
      parsedLines,
      replaceLineInContent,
      runInlineToggle,
      selectAllDocumentLines,
      sound,
      soundVolume,
      spellPopover,
      toolbarPos,
      visibleLineIndices,
    ],
  );

  // When full document (Ctrl+A) OR cross-line mouse selection is active, handle delete/replace/copy/cut/paste/format cleanly across all selected lines
  const hasCrossLineSel = isCrossLineSelection(multiSelection);
  useEffect(() => {
    if (!isAllSelected && !hasCrossLineSel) return;

    const getSelectedPlainText = () => {
      if (isAllSelected) {
        return parsedLines
          .map((p) =>
            runsToPlainText(
              inlineMarkdownToRuns(p.raw.slice(p.bodyStart - p.start)),
            ),
          )
          .join('\n');
      }
      if (multiSelection) {
        return extractMultiLinePlainText(parsedLines, multiSelection);
      }
      return '';
    };

    const applyReplaceSelection = (replacement: string, soundKind: 'backspace' | 'enter' | 'char') => {
      if (isAllSelected) {
        setIsAllSelected(false);
        setToolbarPos(null);
        onChange(replacement, { discrete: true });
        playTypingSound(sound, soundKind, soundVolume);
        markTypingPulse();
        const nextLen = replacement && replacement !== '\n' ? replacement.length : 0;
        focusLineAt(0, nextLen, nextLen);
        return;
      }
      if (multiSelection) {
        const res = replaceMultiLineRange(content, parsedLines, multiSelection, replacement);
        setMultiSelection(null);
        setToolbarPos(null);
        onChange(renumberOrderedLists(res.nextContent), { discrete: true });
        playTypingSound(sound, soundKind, soundVolume);
        markTypingPulse();
        focusLineAt(res.nextLineIndex, res.nextCaretOffset, res.nextCaretOffset);
      }
    };

    const handleMultiLineKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const lower = e.key.toLowerCase();
        if (lower === 'a') {
          e.preventDefault();
          e.stopPropagation();
          setMultiSelection(null);
          selectAllDocumentLines();
          return;
        }
        if (lower === 'b') {
          e.preventDefault();
          e.stopPropagation();
          runInlineToggle('bold');
          return;
        }
        if (lower === 'i') {
          e.preventDefault();
          e.stopPropagation();
          runInlineToggle('italic');
          return;
        }
        if (lower === 'u') {
          e.preventDefault();
          e.stopPropagation();
          runInlineToggle('underline');
          return;
        }
        if (lower === 'x') {
          e.preventDefault();
          e.stopPropagation();
          void navigator.clipboard?.writeText?.(getSelectedPlainText());
          applyReplaceSelection('', 'backspace');
          return;
        }
        if (lower === 'c') {
          e.preventDefault();
          e.stopPropagation();
          void navigator.clipboard?.writeText?.(getSelectedPlainText());
          return;
        }
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        e.stopPropagation();
        applyReplaceSelection('', 'backspace');
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        applyReplaceSelection(isAllSelected ? '' : '\n', 'enter');
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsAllSelected(false);
        setMultiSelection(null);
        setToolbarPos(null);
        focusLineAt(activeLineIndex, caretIndex, caretIndex);
        return;
      }

      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowDown'
      ) {
        playTypingSound(sound, 'nav', soundVolume, { isRepeat: e.repeat });
        markTypingPulse();
        if (isAllSelected) {
          setIsAllSelected(false);
          setToolbarPos(null);
          const firstIdx = visibleLineIndices[0] ?? 0;
          const lastIdx = visibleLineIndices[visibleLineIndices.length - 1] ?? 0;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            focusLineAt(firstIdx, 0, 0);
          } else {
            const lastParsed = parsedLines[lastIdx];
            const len = lastParsed
              ? runsToPlainText(
                  inlineMarkdownToRuns(
                    lastParsed.raw.slice(lastParsed.bodyStart - lastParsed.start),
                  ),
                ).length
              : 0;
            focusLineAt(lastIdx, len, len);
          }
          return;
        }
        if (multiSelection) {
          e.preventDefault();
          e.stopPropagation();
          const norm = normalizeMultiLineSelection(multiSelection);
          setMultiSelection(null);
          setToolbarPos(null);
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            focusLineAt(norm.startLine, norm.startOffset, norm.startOffset);
          } else {
            focusLineAt(norm.endLine, norm.endOffset, norm.endOffset);
          }
          return;
        }
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
        e.preventDefault();
        e.stopPropagation();
        applyReplaceSelection(e.key, (classifyKey(e.key) ?? 'char') as 'char');
      }
    };

    const handleMultiLineCopy = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
        return;
      }
      e.clipboardData?.setData('text/plain', getSelectedPlainText());
      e.preventDefault();
    };

    const handleMultiLineCut = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
        return;
      }
      e.clipboardData?.setData('text/plain', getSelectedPlainText());
      e.preventDefault();
      applyReplaceSelection('', 'backspace');
    };

    const handleMultiLinePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
        return;
      }
      const items = e.clipboardData?.items;
      const pastedFiles: File[] = [];
      if (items) {
        for (const item of Array.from(items)) {
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) pastedFiles.push(file);
          }
        }
      }
      if (pastedFiles.length === 0 && e.clipboardData?.files) {
        for (const file of Array.from(e.clipboardData.files)) {
          if (
            file.type.startsWith('image/') ||
            /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(file.name)
          ) {
            pastedFiles.push(file);
          }
        }
      }
      if (pastedFiles.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        setIsAllSelected(false);
        setMultiSelection(null);
        setToolbarPos(null);
        void onUploadImages(pastedFiles, content.length);
        return;
      }
      const plain = e.clipboardData?.getData('text/plain');
      if (plain !== undefined) {
        e.preventDefault();
        e.stopPropagation();
        const normalized = plain.replace(/\r\n?/g, '\n');
        if (isAllSelected) {
          setIsAllSelected(false);
          setToolbarPos(null);
          onChange(normalized, { discrete: true });
          playTypingSound(sound, normalized.includes('\n') ? 'enter' : 'char', soundVolume);
          markTypingPulse();
          const pastedLines = normalized.split('\n');
          const targetIdx = pastedLines.length - 1;
          const lastParsed = parseMarkdownLines(pastedLines[targetIdx] ?? '')[0];
          const bodyMd = lastParsed
            ? lastParsed.raw.slice(lastParsed.bodyStart - lastParsed.start)
            : '';
          const endLen = runsToPlainText(inlineMarkdownToRuns(bodyMd)).length;
          focusLineAt(targetIdx, endLen, endLen);
        } else if (multiSelection) {
          const res = replaceMultiLineRange(content, parsedLines, multiSelection, normalized);
          setMultiSelection(null);
          setToolbarPos(null);
          onChange(res.nextContent, { discrete: true });
          playTypingSound(sound, normalized.includes('\n') ? 'enter' : 'char', soundVolume);
          markTypingPulse();
          focusLineAt(res.nextLineIndex, res.nextCaretOffset, res.nextCaretOffset);
        }
      }
    };

    window.addEventListener('keydown', handleMultiLineKeyDown, true);
    document.addEventListener('copy', handleMultiLineCopy, true);
    document.addEventListener('cut', handleMultiLineCut, true);
    document.addEventListener('paste', handleMultiLinePaste, true);
    return () => {
      window.removeEventListener('keydown', handleMultiLineKeyDown, true);
      document.removeEventListener('copy', handleMultiLineCopy, true);
      document.removeEventListener('cut', handleMultiLineCut, true);
      document.removeEventListener('paste', handleMultiLinePaste, true);
    };
  }, [
    activeLineIndex,
    caretIndex,
    content,
    focusLineAt,
    hasCrossLineSel,
    isAllSelected,
    markTypingPulse,
    multiSelection,
    onChange,
    onUploadImages,
    parsedLines,
    runInlineToggle,
    selectAllDocumentLines,
    sound,
    soundVolume,
    visibleLineIndices,
  ]);

  const handleSyncLineSelection = useCallback(
    (lineIndex: number, visStart: number, visEnd: number, clicked = false) => {
      const moved =
        lineIndex !== activeLineIndexRef.current ||
        visStart !== selectionRangeRef.current.start ||
        visEnd !== selectionRangeRef.current.end;
      if (clicked || moved) {
        markTypingPulse();
      }
      setActiveLineIndex(lineIndex);
      setCaretIndex(visEnd);
      setSelectionRange({ start: visStart, end: visEnd });
      measureActiveCaretAndSelection();

      if (clicked) {
        setActiveTypingCaret(null);
      } else {
        const lineEl = lineRefs.current.get(lineIndex);
        const plain = lineEl
          ? runsToPlainText(domToRuns(lineEl as unknown as DomNodeLike))
          : (() => {
              const parsed = parsedLines[lineIndex];
              const bodyMd = parsed ? parsed.raw.slice(parsed.bodyStart - parsed.start) : '';
              return runsToPlainText(inlineMarkdownToRuns(bodyMd));
            })();
        setActiveTypingCaret((prev) => {
          if (!prev || prev.lineIndex !== lineIndex) return null;
          const min = Math.min(prev.offset, visEnd);
          const max = Math.max(prev.offset, visEnd);
          const crossed = /[^A-Za-z'’-]/.test(plain.slice(min, max));
          return crossed || visStart !== visEnd ? null : prev;
        });
      }

      if (clicked && visStart === visEnd && spellcheckEnabled) {
        const parsed = parsedLines[lineIndex];
        if (!parsed) {
          setSpellPopover(null);
          return;
        }
        const bodyMd = parsed.raw.slice(parsed.bodyStart - parsed.start);
        const runs = inlineMarkdownToRuns(bodyMd);
        const lineIssues = computeLineMisspellings(
          runs,
          customWordSet,
          ignoredWordSet,
          null,
        );
        const clickedIssue = lineIssues.find(
          (issue) => visStart >= issue.start && visStart <= issue.end,
        );
        if (clickedIssue) {
          openPopoverForIssue(lineIndex, clickedIssue);
          return;
        }
        setSpellPopover(null);
      } else if (visStart !== visEnd) {
        setSpellPopover(null);
      }
    },
    [
      customWordSet,
      ignoredWordSet,
      markTypingPulse,
      measureActiveCaretAndSelection,
      openPopoverForIssue,
      parsedLines,
      spellcheckEnabled,
    ],
  );

  const handleToggleTask = useCallback(
    (parsed: ParsedLine) => {
      const updated = toggleTaskCheckboxAtLine(content, parsed.start, parsed.end);
      if (updated !== null) {
        onChange(updated, { discrete: true });
        playTypingSound(sound, 'space', soundVolume);
        setSpellPopover(null);
      }
    },
    [content, onChange, sound, soundVolume],
  );

  const handleToggleFold = useCallback((lineIndex: number) => {
    setCollapsedHeaders((prev) => {
      const next = new Set(prev);
      if (next.has(lineIndex)) {
        next.delete(lineIndex);
      } else {
        next.add(lineIndex);
      }
      return next;
    });
    setToolbarPos(null);
  }, []);

  const handleAcceptSuggestion = (replacement: string) => {
    if (!spellPopover) return;
    const { lineIndex, issue } = spellPopover;
    const parsed = parsedLines[lineIndex];
    if (!parsed) return;
    const prefix = parsed.raw.slice(0, parsed.bodyStart - parsed.start);
    const bodyMd = parsed.raw.slice(parsed.bodyStart - parsed.start);
    const runs = inlineMarkdownToRuns(bodyMd);
    const nextRuns = replaceVisibleRangeInRuns(
      runs,
      issue.start,
      issue.end,
      replacement,
    );
    const nextCaret = issue.start + replacement.length;
    setSpellPopover(null);
    setActiveTypingCaret(null);
    playTypingSound(sound, 'char', soundVolume);
    onChange(replaceLineInContent(lineIndex, prefix + runsToInlineMarkdown(nextRuns)), {
      discrete: true,
    });
    focusLineAt(lineIndex, nextCaret, nextCaret);
  };

  const handleAddToDictionary = () => {
    if (!spellPopover) return;
    onAddCustomWord(spellPopover.issue.normalized);
    setSpellPopover(null);
  };

  const handleIgnoreWord = () => {
    if (!spellPopover) return;
    const normalized = spellPopover.issue.normalized;
    setIgnoredWords((prev) =>
      prev.includes(normalized) ? prev : [...prev, normalized],
    );
    setSpellPopover(null);
  };

  const hasSelection =
    isAllSelected ||
    isCrossLineSelection(multiSelection) ||
    selectionRange.start !== selectionRange.end;

  const selectionFormatting = useMemo(() => {
    if (!hasSelection) return undefined;
    if (isAllSelected) {
      return getSelectionFormattingState(parsedLines, {
        mode: 'all',
        blocks,
        hiddenIndices: foldInfo.hiddenIndices,
      });
    }
    if (multiSelection && isCrossLineSelection(multiSelection)) {
      return getSelectionFormattingState(parsedLines, {
        mode: 'multi',
        multiSelection,
      });
    }
    return getSelectionFormattingState(parsedLines, {
      mode: 'single',
      lineIndex: activeLineIndex,
      start: selectionRange.start,
      end: selectionRange.end,
    });
  }, [
    activeLineIndex,
    blocks,
    foldInfo.hiddenIndices,
    hasSelection,
    isAllSelected,
    multiSelection,
    parsedLines,
    selectionRange.end,
    selectionRange.start,
  ]);

  const multiNorm = useMemo(
    () =>
      multiSelection && isCrossLineSelection(multiSelection)
        ? normalizeMultiLineSelection(multiSelection)
        : null,
    [multiSelection],
  );

  return (
    <motion.div
      key={noteId}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      className={`relative flex-1 pb-[36vh] ${dyslexicMode ? 'neuron-dyslexic' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault();
          setIsDraggingImage(true);
          if (dragWatchdogRef.current !== null) {
            window.clearTimeout(dragWatchdogRef.current);
          }
          dragWatchdogRef.current = window.setTimeout(() => {
            setIsDraggingImage(false);
          }, 450);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsDraggingImage(false);
        }
      }}
      onDrop={(e) => {
        setIsDraggingImage(false);
        if (dragWatchdogRef.current !== null) {
          window.clearTimeout(dragWatchdogRef.current);
          dragWatchdogRef.current = null;
        }
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          const hasImage = Array.from(files).some(
            (f) =>
              f.type.startsWith('image/') ||
              /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(f.name),
          );
          if (hasImage) {
            e.preventDefault();
            const pos = getSafeImageInsertOffset();
            void onUploadImages(files, pos);
          }
        }
      }}
      onPaste={(e) => {
        const items = e.clipboardData?.items;
        const pastedFiles: File[] = [];
        if (items) {
          for (const item of Array.from(items)) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
              const file = item.getAsFile();
              if (file) pastedFiles.push(file);
            }
          }
        }
        if (pastedFiles.length === 0 && e.clipboardData?.files) {
          for (const file of Array.from(e.clipboardData.files)) {
            if (
              file.type.startsWith('image/') ||
              /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(file.name)
            ) {
              pastedFiles.push(file);
            }
          }
        }
        if (pastedFiles.length > 0) {
          e.preventDefault();
          if (isAllSelected) {
            setIsAllSelected(false);
            setToolbarPos(null);
          }
          const pos = getSafeImageInsertOffset();
          void onUploadImages(pastedFiles, pos);
          return;
        }
        if (isAllSelected) {
          const plain = e.clipboardData?.getData('text/plain');
          if (plain !== undefined) {
            e.preventDefault();
            e.stopPropagation();
            const normalized = plain.replace(/\r\n?/g, '\n');
            setIsAllSelected(false);
            setToolbarPos(null);
            onChange(normalized);
            const pastedLines = normalized.split('\n');
            const targetIdx = pastedLines.length - 1;
            const lastParsed = parseMarkdownLines(pastedLines[targetIdx] ?? '')[0];
            const bodyMd = lastParsed
              ? lastParsed.raw.slice(lastParsed.bodyStart - lastParsed.start)
              : '';
            const endLen = runsToPlainText(inlineMarkdownToRuns(bodyMd)).length;
            focusLineAt(targetIdx, endLen, endLen);
          }
        }
      }}
      onCopy={(e) => {
        if (!isAllSelected) return;
        const allPlain = parsedLines
          .map((p) =>
            runsToPlainText(
              inlineMarkdownToRuns(p.raw.slice(p.bodyStart - p.start)),
            ),
          )
          .join('\n');
        e.clipboardData?.setData('text/plain', allPlain);
        e.preventDefault();
      }}
      onMouseDown={(e) => {
        // Prevent blur+refocus blink of JewelCrest when clicking empty canvas or non-interactive areas
        const target = e.target as HTMLElement | null;
        if (
          target &&
          !target.closest(
            'button, input, textarea, img, [data-line-editor], [role="dialog"], [role="listbox"], [role="toolbar"]',
          )
        ) {
          e.preventDefault();
          if (isAllSelected || multiSelection) {
            setIsAllSelected(false);
            setMultiSelection(null);
            setToolbarPos(null);
          }
        }
      }}
      onClick={() => {
        if (Date.now() - justFinishedCrossDragRef.current < 260) {
          return;
        }
        const lastVisible = visibleLineIndices[visibleLineIndices.length - 1] ?? 0;
        const lastParsed = parsedLines[lastVisible];
        const bodyMd = lastParsed
          ? lastParsed.raw.slice(lastParsed.bodyStart - lastParsed.start)
          : '';
        const visLen = runsToPlainText(inlineMarkdownToRuns(bodyMd)).length;
        focusLineAt(lastVisible, visLen, visLen);
      }}
    >
      {/* Hidden image upload input triggered by `/image` */}
      <input
        ref={hiddenImageInputRef}
        type="file"
        accept="image/*"
        multiple
        data-testid="editor-image-input"
        className="hidden"
        aria-label="Choose images to insert"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            const pos = getSafeImageInsertOffset();
            void onUploadImages(e.target.files, pos);
          }
          e.target.value = '';
        }}
      />

      <AnimatePresence>
        {isDraggingImage && (
          <motion.div
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none fixed inset-6 z-40 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed backdrop-blur-[2px]"
            style={{
              borderColor: 'var(--neuron-accent)',
              backgroundColor: 'color-mix(in srgb, var(--neuron-bg) 82%, transparent)',
            }}
          >
            <ImagePlus
              className="h-8 w-8"
              style={{ color: 'var(--neuron-accent)' }}
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-[var(--neuron-text)]">
              drop image into note
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Block Document Canvas */}
      <div
        ref={containerRef}
        data-all-selected={isAllSelected ? 'true' : 'false'}
        className="relative flex w-full flex-col"
        style={{ fontFamily: 'var(--neuron-font)' }}
      >
        {/* Single Persistent JewelCrest — glides seamlessly across lines, never unmounts/blinks on click */}
        <div
          aria-hidden="true"
          data-testid="jewel-crest"
          data-typing={isTyping ? 'true' : 'false'}
          className="neuron-crest-glide pointer-events-none absolute top-0 left-0 z-20 flex items-center justify-center"
          style={{
            width: '3px',
            height: `${caretCoords.height}px`,
            opacity:
              isFocused && !hasSelection && visibleLineIndices.includes(activeLineIndex)
                ? 1
                : 0,
            transform: `translate3d(${caretCoords.left}px, ${caretCoords.top}px, 0)`,
          }}
        >
          <JewelCrest
            isTyping={isTyping}
            isFocused={
              isFocused && !hasSelection && visibleLineIndices.includes(activeLineIndex)
            }
          />
        </div>

        {blocks.map((block) => {
          const anchorLine =
            block.type === 'box' || block.type === 'pixel'
              ? block.startLineIndex
              : block.lineIndex;
          if (foldInfo.hiddenIndices.has(anchorLine)) {
            return null;
          }

          if (block.type === 'image') {
            return (
              <InlineImageBlock
                key={block.id}
                imageId={block.imageId}
                alt={block.alt}
                image={imageMap.get(block.imageId)}
                onInspect={(img) => setLightboxImage(img)}
                onRename={onRenameImage}
                onMediaLoad={measureActiveCaretAndSelection}
                onRemove={() => {
                  onRemoveImageFromNote(block.imageId);
                  const fallbackIdx =
                    visibleLineIndices.find((idx) => idx > block.lineIndex) ??
                    visibleLineIndices[0] ??
                    0;
                  focusLineAt(fallbackIdx, 0, 0);
                }}
              />
            );
          }

          if (block.type === 'pixel') {
            return (
              <PixelCanvasBlock
                key={block.id}
                blockId={block.id}
                data={block.pixelData}
                palette={palette}
                onChangeData={(nextData) => {
                  const serialized = serializePixelCanvas(nextData);
                  const nextContent =
                    content.slice(0, block.start) +
                    serialized +
                    content.slice(block.end);
                  onChange(nextContent, { discrete: true });
                }}
                onDeleteBlock={() => {
                  const rawLines = content.split('\n');
                  rawLines.splice(
                    block.startLineIndex,
                    block.endLineIndex - block.startLineIndex + 1,
                  );
                  const nextText = renumberOrderedLists(
                    rawLines.length > 0 ? rawLines.join('\n') : '',
                  );
                  onChange(nextText, { discrete: true });
                  const focusIdx = Math.max(0, block.startLineIndex - 1);
                  focusLineAt(focusIdx, 0, 0);
                }}
              />
            );
          }

          if (block.type === 'box') {
            return (
              <div key={block.id} data-box-end={block.end}>
                <TableBoxBlock
                  blockId={block.id}
                  rows={block.rows}
                  sound={sound}
                  soundVolume={soundVolume}
                  onChangeRows={(nextRows, opts) => {
                    const serialized = serializeBoxRows(nextRows);
                    const nextContent =
                      content.slice(0, block.start) +
                      serialized +
                      content.slice(block.end);
                    onChange(
                      nextContent,
                      opts?.discrete
                        ? { discrete: true }
                        : { coalesceKey: `box-type-${block.id}` },
                    );
                  }}
                  onDeleteBox={() => {
                    const rawLines = content.split('\n');
                    rawLines.splice(
                      block.startLineIndex,
                      block.endLineIndex - block.startLineIndex + 1,
                    );
                    const nextText = renumberOrderedLists(
                      rawLines.length > 0 ? rawLines.join('\n') : '',
                    );
                    onChange(nextText, { discrete: true });
                    const focusIdx = Math.max(0, block.startLineIndex - 1);
                    focusLineAt(focusIdx, 0, 0);
                  }}
                />
              </div>
            );
          }

          const parsed = parsedLines[block.lineIndex];
          if (!parsed) return null;
          const bodyText = parsed.raw.slice(parsed.bodyStart - parsed.start);
          const isLineActive = activeLineIndex === block.lineIndex;
          const inMultiSelection = Boolean(
            multiNorm &&
              block.lineIndex >= multiNorm.startLine &&
              block.lineIndex <= multiNorm.endLine,
          );

          return (
            <LineBlock
              key={block.id}
              block={block}
              parsed={parsed}
              bodyText={bodyText}
              isPrimaryTestId={primaryTestIdLineIndex === block.lineIndex}
              isActiveLine={isLineActive}
              inMultiSelection={inMultiSelection}
              isCollapsed={collapsedHeaders.has(block.lineIndex)}
              hiddenUnderHeaderCount={foldInfo.hiddenCounts.get(block.lineIndex) ?? 0}
              dyslexicMode={dyslexicMode}
              emojiVendor={emojiVendor}
              uiSize={uiSize}
              textSize={textSize}
              lineSpacing={lineSpacing}
              textWidth={textWidth}
              lineGapPx={activeLineSpacing.lineGapPx}
              resolveEmoji={resolveEmoji}
              pendingSelectionRef={pendingSelectionRef}
              consumeLocalEcho={consumeLocalEcho}
              registerEditable={registerEditable}
              onFocusLine={(idx, s, e) => {
                pendingSelectionRef.current = null;
                markTypingPulse();
                setActiveLineIndex(idx);
                setIsFocused(true);
                setCaretIndex(e);
                setSelectionRange({ start: s, end: e });
                measureActiveCaretAndSelection();
              }}
              onBlurLine={(idx) => {
                setActiveTypingCaret((prev) =>
                  prev && prev.lineIndex === idx ? null : prev,
                );
                if (activeLineIndex === idx && !isCrossLineSelection(multiSelection) && !isAllSelected) {
                  setIsFocused(false);
                  setToolbarPos(null);
                }
              }}
              onDomInput={handleDomInput}
              onLineKeyDown={handleLineKeyDown}
              onLineMouseDown={handleLineMouseDown}
              onPastePlainText={handlePastePlainText}
              onSyncLineSelection={handleSyncLineSelection}
              onToggleTask={handleToggleTask}
              onToggleFold={handleToggleFold}
              onMeasureActive={measureActiveCaretAndSelection}
            />
          );
        })}

        {/* If document ends with an image or box, provide a quiet invisible click target below */}
        {blocks.length > 0 && blocks[blocks.length - 1].type !== 'line' && (
          <button
            type="button"
            aria-label="Continue writing below"
            onClick={(e) => {
              e.stopPropagation();
              const nextContent = `${content}\n`;
              onChange(nextContent, { discrete: true });
              const nextIdx = content.split('\n').length;
              focusLineAt(nextIdx, 0, 0);
            }}
            className="mt-2 h-8 w-full cursor-text bg-transparent text-left opacity-0"
          />
        )}

        {/* Emoji shortcode autocomplete popover (:rocket, :brain, etc.) */}
        <AnimatePresence>
          {activeEmojiMatch && (
            <motion.div
              ref={emojiPopoverRef}
              role="listbox"
              aria-label="Emoji suggestions"
              data-testid="emoji-autocomplete"
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -3, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 460, damping: 32, mass: 0.5 }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => e.stopPropagation()}
              className="absolute z-30 w-56 rounded-lg border p-1.5 shadow-xl"
              style={{
                top: caretCoords.top + caretCoords.lineHeight + 8,
                left: Math.max(
                  0,
                  Math.min(
                    caretCoords.left,
                    Math.max(0, (containerRef.current?.clientWidth ?? 600) - 230),
                  ),
                ),
                backgroundColor: 'var(--neuron-surface)',
                borderColor: 'var(--neuron-border)',
              }}
            >
              {activeEmojiMatch.items.map((item, idx) => {
                const isSelectedOption = idx === emojiActiveIdx;
                return (
                  <button
                    key={item.slug}
                    type="button"
                    role="option"
                    aria-selected={isSelectedOption}
                    onClick={() => handlePickEmojiSuggestion(item)}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-white/5"
                    style={{
                      backgroundColor: isSelectedOption
                        ? 'color-mix(in srgb, var(--neuron-accent) 12%, transparent)'
                        : undefined,
                      color: isSelectedOption
                        ? 'var(--neuron-accent)'
                        : 'var(--neuron-text)',
                    }}
                  >
                    <span className="inline-flex items-center gap-2 font-medium">
                      <EmojiGlyph
                        emoji={item.emoji}
                        vendor={emojiVendor}
                        className="text-base"
                      />
                      <span>:{item.slug}:</span>
                    </span>
                    {isSelectedOption && (
                      <span
                        className="text-[10px] opacity-60"
                        style={{ color: 'var(--neuron-muted)' }}
                      >
                        tab
                      </span>
                    )}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Minimalist inline Spellcheck Popover */}
        <AnimatePresence>
          {spellPopover && (
            <motion.div
              ref={popoverRef}
              role="dialog"
              aria-label={`Spelling suggestions for ${spellPopover.issue.word}`}
              data-testid="spellcheck-popover"
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -3, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 460, damping: 32, mass: 0.5 }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => e.stopPropagation()}
              className="absolute z-30 w-60 rounded-lg border p-2 shadow-xl"
              style={{
                top: spellPopover.top,
                left: spellPopover.left,
                backgroundColor: 'var(--neuron-surface)',
                borderColor: 'var(--neuron-border)',
              }}
            >
              <div
                className="mb-1.5 flex items-center justify-between border-b px-1.5 pb-1 text-[11px]"
                style={{
                  borderColor: 'var(--neuron-border)',
                  color: 'var(--neuron-muted)',
                }}
              >
                <span className="truncate">"{spellPopover.issue.word}"</span>
                <span>spelling</span>
              </div>

              {spellPopover.suggestions.length > 0 ? (
                <ul className="mb-1.5 flex flex-col gap-0.5">
                  {spellPopover.suggestions.map((suggestion) => (
                    <li key={suggestion}>
                      <button
                        type="button"
                        onClick={() => handleAcceptSuggestion(suggestion)}
                        className="flex w-full cursor-pointer items-center justify-between rounded px-2 py-1 text-left text-sm font-medium text-[var(--neuron-text)] transition-colors hover:bg-white/5"
                        style={{ color: 'var(--neuron-accent)' }}
                      >
                        <span>{suggestion}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p
                  className="mb-1.5 px-2 py-1 text-xs"
                  style={{ color: 'var(--neuron-muted)' }}
                >
                  no suggestions
                </p>
              )}

              <div
                className="flex flex-col gap-0.5 border-t pt-1.5"
                style={{ borderColor: 'var(--neuron-border)' }}
              >
                <button
                  type="button"
                  onClick={handleAddToDictionary}
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:text-[var(--neuron-text)]"
                  style={{ color: 'var(--neuron-muted)' }}
                >
                  <BookPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>add to dictionary</span>
                </button>
                <button
                  type="button"
                  onClick={handleIgnoreWord}
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:text-[var(--neuron-text)]"
                  style={{ color: 'var(--neuron-muted)' }}
                >
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>ignore in note</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Selection Formatting Toolbar */}
      <AnimatePresence>
        {hasSelection && toolbarPos && (
          <SelectionToolbar
            position={toolbarPos}
            palette={palette}
            formatting={selectionFormatting}
            onHeading={runApplyHeading}
            onBold={() => runInlineToggle('bold')}
            onItalic={() => runInlineToggle('italic')}
            onUnderline={() => runInlineToggle('underline')}
            onHighlight={() => runInlineToggle('highlight')}
            onWikilink={() => runInlineToggle('wikilink')}
            onQuote={() => runTogglePrefix('quote')}
            onBullet={() => runTogglePrefix('bullet')}
            onOrdered={() => runTogglePrefix('ordered')}
            onTask={() => runTogglePrefix('task')}
            onApplyColor={runApplyColor}
          />
        )}
      </AnimatePresence>

      {/* Lightbox & drawing editor for note images */}
      <ImageLightbox
        image={lightboxImage ? (imageMap.get(lightboxImage.id) ?? lightboxImage) : null}
        palette={palette}
        onSaveImage={(updated) => {
          setLightboxImage(updated);
          onUpdateImage?.(updated);
        }}
        onClose={() => setLightboxImage(null)}
      />
    </motion.div>
  );
}
