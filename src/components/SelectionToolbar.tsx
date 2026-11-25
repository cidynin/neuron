import { motion } from 'motion/react';
import {
  Bold,
  Check,
  CheckSquare,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  Underline,
} from 'lucide-react';
import type { ColorPalette } from '../types/neuron';
import { getPaletteThemeColors } from '../utils/obsidianMarkdown';
import {
  isLightHexColor,
  type SelectionFormattingState,
} from '../utils/selectionFormatting';

export interface SelectionToolbarPosition {
  left: number;
  top: number;
  arrowOffset: number;
  placement?: 'above' | 'below';
}

interface SelectionToolbarProps {
  position: SelectionToolbarPosition;
  palette: ColorPalette;
  formatting?: SelectionFormattingState;
  onHeading: (level: 1 | 2 | 3) => void;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onHighlight: () => void;
  onWikilink: () => void;
  onQuote: () => void;
  onBullet: () => void;
  onOrdered: () => void;
  onTask: () => void;
  onApplyColor: (hex: string | null) => void;
}

export function SelectionToolbar({
  position,
  palette,
  formatting,
  onHeading,
  onBold,
  onItalic,
  onUnderline,
  onHighlight,
  onWikilink,
  onQuote,
  onBullet,
  onOrdered,
  onTask,
  onApplyColor,
}: SelectionToolbarProps) {
  const themeColors = getPaletteThemeColors(palette);

  const preventFocusLoss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const iconBtnClass =
    'inline-flex h-7 min-w-[1.75rem] cursor-pointer items-center justify-center rounded px-1.5 text-[12px] font-medium transition-colors duration-150 hover:bg-white/12 focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)] whitespace-nowrap shrink-0';

  const getActiveStyle = (isActive: boolean): React.CSSProperties => ({
    color: isActive ? 'var(--neuron-accent)' : 'var(--neuron-text)',
    backgroundColor: isActive
      ? 'color-mix(in srgb, var(--neuron-accent) 16%, transparent)'
      : undefined,
  });

  const isBold = Boolean(formatting?.bold);
  const isItalic = Boolean(formatting?.italic);
  const isUnderline = Boolean(formatting?.underline);
  const isHighlight = Boolean(formatting?.highlight);
  const isWikilink = Boolean(formatting?.wikilink);
  const isQuote = Boolean(formatting?.quote);
  const activeColorLower = formatting?.activeColor?.toLowerCase();

  return (
    <motion.div
      data-testid="selection-toolbar"
      role="toolbar"
      aria-label="Text formatting toolbar"
      initial={{ opacity: 0, y: 8, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 5, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 460, damping: 30, mass: 0.52 }}
      onMouseDown={preventFocusLoss}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-40 flex flex-col gap-1.5 rounded-lg border px-2 py-1.5 shadow-2xl backdrop-blur-md"
      style={{
        left: position.left,
        top: position.top,
        backgroundColor: 'color-mix(in srgb, var(--neuron-surface) 92%, #111114 8%)',
        borderColor: 'var(--neuron-border)',
        color: 'var(--neuron-text)',
      }}
    >
      {/* Row 1: Headings, inline formatting, lists, box & image */}
      <div className="flex flex-wrap items-center gap-0.5">
        {([1, 2, 3] as const).map((lvl) => {
          const isActive = formatting?.headingLevel === lvl;
          return (
            <button
              key={`h-${lvl}`}
              type="button"
              aria-label={`Heading ${lvl}`}
              aria-pressed={isActive}
              data-testid={`toolbar-h${lvl}`}
              onMouseDown={preventFocusLoss}
              onClick={() => onHeading(lvl)}
              className={iconBtnClass}
              style={getActiveStyle(isActive)}
            >
              H{lvl}
            </button>
          );
        })}

        <span
          aria-hidden="true"
          className="mx-1 h-4 w-px"
          style={{ backgroundColor: 'var(--neuron-border)' }}
        />

        <button
          type="button"
          aria-label="Bold"
          aria-pressed={isBold}
          data-testid="toolbar-bold"
          onMouseDown={preventFocusLoss}
          onClick={onBold}
          className={iconBtnClass}
          style={getActiveStyle(isBold)}
        >
          <Bold className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <button
          type="button"
          aria-label="Italic"
          aria-pressed={isItalic}
          data-testid="toolbar-italic"
          onMouseDown={preventFocusLoss}
          onClick={onItalic}
          className={iconBtnClass}
          style={getActiveStyle(isItalic)}
        >
          <Italic className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <button
          type="button"
          aria-label="Underline"
          aria-pressed={isUnderline}
          data-testid="toolbar-underline"
          onMouseDown={preventFocusLoss}
          onClick={onUnderline}
          className={iconBtnClass}
          style={getActiveStyle(isUnderline)}
        >
          <Underline className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <button
          type="button"
          aria-label="Highlight"
          aria-pressed={isHighlight}
          data-testid="toolbar-highlight"
          onMouseDown={preventFocusLoss}
          onClick={onHighlight}
          className={iconBtnClass}
          style={getActiveStyle(isHighlight)}
        >
          <Highlighter className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <button
          type="button"
          aria-label="Wikilink"
          aria-pressed={isWikilink}
          data-testid="toolbar-link"
          onMouseDown={preventFocusLoss}
          onClick={onWikilink}
          className={iconBtnClass}
          style={getActiveStyle(isWikilink)}
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <span
          aria-hidden="true"
          className="mx-1 h-4 w-px"
          style={{ backgroundColor: 'var(--neuron-border)' }}
        />

        <button
          type="button"
          aria-label="Quote"
          aria-pressed={isQuote}
          data-testid="toolbar-quote"
          onMouseDown={preventFocusLoss}
          onClick={onQuote}
          className={iconBtnClass}
          style={getActiveStyle(isQuote)}
        >
          <Quote className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <button
          type="button"
          aria-label="Bullet list"
          data-testid="toolbar-bullet"
          onMouseDown={preventFocusLoss}
          onClick={onBullet}
          className={iconBtnClass}
        >
          <List className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <button
          type="button"
          aria-label="Ordered list"
          data-testid="toolbar-ordered"
          onMouseDown={preventFocusLoss}
          onClick={onOrdered}
          className={iconBtnClass}
        >
          <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <button
          type="button"
          aria-label="Task list"
          data-testid="toolbar-task"
          onMouseDown={preventFocusLoss}
          onClick={onTask}
          className={iconBtnClass}
        >
          <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Row 2: Active Theme Palette Swatches for coloring document text */}
      <div
        className="flex items-center justify-between gap-3 border-t pt-2"
        style={{ borderColor: 'var(--neuron-border)' }}
        aria-label="Theme text colors"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="mr-0.5 text-[10px] tracking-wide"
            style={{ color: 'var(--neuron-muted)' }}
          >
            color
          </span>
          {themeColors.map((swatch) => {
            const isColorActive =
              Boolean(activeColorLower) &&
              swatch.hex.toLowerCase() === activeColorLower;
            const lightSwatch = isLightHexColor(swatch.hex);
            return (
              <button
                key={swatch.hex}
                type="button"
                aria-label={`Color text ${swatch.label} (${swatch.hex})`}
                aria-pressed={isColorActive}
                data-active={isColorActive ? 'true' : undefined}
                data-testid={`toolbar-color-${swatch.hex.replace('#', '')}`}
                title={`${palette.name}: ${swatch.label}`}
                onMouseDown={preventFocusLoss}
                onClick={() => onApplyColor(swatch.hex)}
                className="relative inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border transition-all duration-150 hover:scale-110 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neuron-accent)]"
                style={{
                  backgroundColor: swatch.hex,
                  borderColor: lightSwatch
                    ? 'rgba(0,0,0,0.22)'
                    : 'rgba(255,255,255,0.24)',
                  boxShadow: isColorActive
                    ? '0 0 0 2px color-mix(in srgb, var(--neuron-surface) 92%, #111114 8%), 0 0 0 3.5px var(--neuron-text)'
                    : undefined,
                }}
              >
                {isColorActive && (
                  <Check
                    aria-hidden="true"
                    data-testid={`toolbar-color-active-check-${swatch.hex.replace('#', '')}`}
                    className="pointer-events-none h-2.5 w-2.5"
                    strokeWidth={3}
                    style={{
                      color: lightSwatch ? '#141418' : '#ffffff',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-label="Reset text color"
          title="Reset color"
          data-testid="toolbar-color-reset"
          onMouseDown={preventFocusLoss}
          onClick={() => onApplyColor(null)}
          className="inline-flex h-5 cursor-pointer items-center gap-1 rounded px-1.5 text-[10px] transition-colors hover:bg-white/10"
          style={{ color: 'var(--neuron-muted)' }}
        >
          <RemoveFormatting className="h-3 w-3" aria-hidden="true" />
          <span>clear</span>
        </button>
      </div>

      {/* Pointer triangle */}
      {position.placement === 'below' ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-[5px] h-2.5 w-2.5 rotate-45 border-l border-t"
          style={{
            left: position.arrowOffset,
            backgroundColor: 'color-mix(in srgb, var(--neuron-surface) 92%, #111114 8%)',
            borderColor: 'var(--neuron-border)',
          }}
        />
      ) : (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-[5px] h-2.5 w-2.5 rotate-45 border-r border-b"
          style={{
            left: position.arrowOffset,
            backgroundColor: 'color-mix(in srgb, var(--neuron-surface) 92%, #111114 8%)',
            borderColor: 'var(--neuron-border)',
          }}
        />
      )}
    </motion.div>
  );
}
