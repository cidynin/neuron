import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, PaintBucket, Pen, Redo2, RotateCcw, Undo2, X } from 'lucide-react';
import type { ColorPalette } from '../types/neuron';
import {
  createEmptyPixelGrid,
  floodFillPixelGrid,
  type PixelCanvasData,
} from '../utils/pixelCanvas';

export type PixelTool = 'pen' | 'eraser' | 'bucket';

interface PixelCanvasBlockProps {
  blockId: string;
  data: PixelCanvasData;
  palette: ColorPalette;
  onChangeData: (nextData: PixelCanvasData) => void;
  onDeleteBlock: () => void;
}

function getPaletteSwatches(palette: ColorPalette): string[] {
  const raw = [...palette.swatches, palette.accent, palette.text, palette.bg];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const hex of raw) {
    const clean = hex.trim().toLowerCase();
    if (/^#[0-9a-f]{3,8}$/i.test(clean) && !seen.has(clean)) {
      seen.add(clean);
      unique.push(clean);
    }
  }
  return unique.length > 0 ? unique : ['#ffffff', '#f44b7a', '#262626', '#000000'];
}

export function PixelCanvasBlock({
  blockId,
  data,
  palette,
  onChangeData,
  onDeleteBlock,
}: PixelCanvasBlockProps) {
  const swatches = useMemo(() => getPaletteSwatches(palette), [palette]);
  const [tool, setTool] = useState<PixelTool>('pen');
  const [activeColor, setActiveColor] = useState<string>(() => {
    const accent = palette.accent.trim().toLowerCase();
    return /^#[0-9a-f]{3,8}$/i.test(accent) ? accent : swatches[0];
  });
  const [draftPixels, setDraftPixels] = useState<string[]>(data.pixels);
  const [undoStack, setUndoStack] = useState<string[][]>([]);
  const [redoStack, setRedoStack] = useState<string[][]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const strokeStartPixelsRef = useRef<string[] | null>(null);
  const lastCellRef = useRef<{ x: number; y: number } | null>(null);
  const latestPixelsRef = useRef<string[]>(draftPixels);
  latestPixelsRef.current = draftPixels;

  useEffect(() => {
    if (!swatches.includes(activeColor)) {
      const accent = palette.accent.trim().toLowerCase();
      setActiveColor(swatches.includes(accent) ? accent : swatches[0]);
    }
  }, [activeColor, palette.accent, swatches]);

  useEffect(() => {
    if (!drawingRef.current) {
      setDraftPixels(data.pixels);
    }
  }, [data.pixels]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, data.size, data.size);
    for (let i = 0; i < data.size * data.size; i++) {
      const col = draftPixels[i];
      if (!col) continue;
      ctx.fillStyle = col;
      const x = i % data.size;
      const y = Math.floor(i / data.size);
      ctx.fillRect(x, y, 1, 1);
    }
  }, [data.size, draftPixels]);

  const getCellFromPointer = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const x = Math.max(
        0,
        Math.min(data.size - 1, Math.floor(((clientX - rect.left) / rect.width) * data.size)),
      );
      const y = Math.max(
        0,
        Math.min(data.size - 1, Math.floor(((clientY - rect.top) / rect.height) * data.size)),
      );
      return { x, y };
    },
    [data.size],
  );

  const paintLineOnGrid = useCallback(
    (
      base: string[],
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      color: string,
    ): string[] => {
      const next = [...base];
      let cx = x0;
      let cy = y0;
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;

      while (true) {
        if (cx >= 0 && cx < data.size && cy >= 0 && cy < data.size) {
          next[cy * data.size + cx] = color;
        }
        if (cx === x1 && cy === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          cx += sx;
        }
        if (e2 < dx) {
          err += dx;
          cy += sy;
        }
      }
      return next;
    },
    [data.size],
  );

  const commitChange = useCallback(
    (prevSnapshot: string[], nextPixels: string[]) => {
      const changed = prevSnapshot.some((val, idx) => val !== nextPixels[idx]);
      if (!changed) return;
      setUndoStack((s) => [...s.slice(-29), prevSnapshot]);
      setRedoStack([]);
      setDraftPixels(nextPixels);
      onChangeData({ size: data.size, pixels: nextPixels });
    },
    [data.size, onChangeData],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const cell = getCellFromPointer(e.clientX, e.clientY);
    if (!cell) return;

    if (tool === 'bucket') {
      const before = [...latestPixelsRef.current];
      const filled = floodFillPixelGrid(before, data.size, cell.x, cell.y, activeColor);
      commitChange(before, filled);
      return;
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable for synthetic/touch events
    }
    drawingRef.current = true;
    strokeStartPixelsRef.current = [...latestPixelsRef.current];
    lastCellRef.current = cell;

    const strokeColor = tool === 'eraser' ? '' : activeColor;
    const updated = paintLineOnGrid(
      latestPixelsRef.current,
      cell.x,
      cell.y,
      cell.x,
      cell.y,
      strokeColor,
    );
    latestPixelsRef.current = updated;
    setDraftPixels(updated);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || tool === 'bucket') return;
    const cell = getCellFromPointer(e.clientX, e.clientY);
    if (!cell) return;
    const prev = lastCellRef.current ?? cell;
    if (prev.x === cell.x && prev.y === cell.y) return;

    const strokeColor = tool === 'eraser' ? '' : activeColor;
    const updated = paintLineOnGrid(
      latestPixelsRef.current,
      prev.x,
      prev.y,
      cell.x,
      cell.y,
      strokeColor,
    );
    lastCellRef.current = cell;
    latestPixelsRef.current = updated;
    setDraftPixels(updated);
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastCellRef.current = null;
    const startSnapshot = strokeStartPixelsRef.current;
    strokeStartPixelsRef.current = null;
    if (startSnapshot) {
      commitChange(startSnapshot, latestPixelsRef.current);
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((r) => [latestPixelsRef.current, ...r.slice(0, 29)]);
    setDraftPixels(prev);
    onChangeData({ size: data.size, pixels: prev });
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const [next, ...rest] = redoStack;
    setRedoStack(rest);
    setUndoStack((s) => [...s.slice(-29), latestPixelsRef.current]);
    setDraftPixels(next);
    onChangeData({ size: data.size, pixels: next });
  };

  const handleClear = () => {
    const hasInk = latestPixelsRef.current.some(Boolean);
    if (!hasInk) return;
    commitChange([...latestPixelsRef.current], createEmptyPixelGrid(data.size));
  };

  return (
    <div
      data-testid={`pixel-canvas-block-${blockId}`}
      data-size={data.size}
      data-tool={tool}
      contentEditable={false}
      className="my-4 inline-flex w-full max-w-[440px] flex-col gap-2.5 rounded-xl border p-3 select-none"
      style={{
        backgroundColor: 'var(--neuron-surface)',
        borderColor: 'var(--neuron-border)',
      }}
    >
      {/* Toolbar: strictly Pen, Eraser, Paint Bucket (no shape tools) + Undo/Redo/Clear + Delete */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Canvas tools">
          <button
            type="button"
            aria-label="Pen tool"
            aria-pressed={tool === 'pen'}
            data-testid={`pixel-tool-pen-${blockId}`}
            onClick={() => setTool('pen')}
            className="inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs transition-colors"
            style={{
              backgroundColor: tool === 'pen' ? 'var(--neuron-bg)' : 'transparent',
              borderColor: tool === 'pen' ? 'var(--neuron-accent)' : 'var(--neuron-border)',
              color: tool === 'pen' ? 'var(--neuron-text)' : 'var(--neuron-muted)',
            }}
          >
            <Pen className="h-3.5 w-3.5" aria-hidden="true" />
            <span>pen</span>
          </button>

          <button
            type="button"
            aria-label="Eraser tool"
            aria-pressed={tool === 'eraser'}
            data-testid={`pixel-tool-eraser-${blockId}`}
            onClick={() => setTool('eraser')}
            className="inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs transition-colors"
            style={{
              backgroundColor: tool === 'eraser' ? 'var(--neuron-bg)' : 'transparent',
              borderColor: tool === 'eraser' ? 'var(--neuron-accent)' : 'var(--neuron-border)',
              color: tool === 'eraser' ? 'var(--neuron-text)' : 'var(--neuron-muted)',
            }}
          >
            <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
            <span>eraser</span>
          </button>

          <button
            type="button"
            aria-label="Paint bucket tool"
            aria-pressed={tool === 'bucket'}
            data-testid={`pixel-tool-bucket-${blockId}`}
            onClick={() => setTool('bucket')}
            className="inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs transition-colors"
            style={{
              backgroundColor: tool === 'bucket' ? 'var(--neuron-bg)' : 'transparent',
              borderColor: tool === 'bucket' ? 'var(--neuron-accent)' : 'var(--neuron-border)',
              color: tool === 'bucket' ? 'var(--neuron-text)' : 'var(--neuron-muted)',
            }}
          >
            <PaintBucket className="h-3.5 w-3.5" aria-hidden="true" />
            <span>bucket</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Undo canvas edit"
            disabled={undoStack.length === 0}
            data-testid={`pixel-undo-${blockId}`}
            onClick={handleUndo}
            className="cursor-pointer rounded p-1.5 transition-opacity disabled:cursor-default disabled:opacity-30 hover:opacity-80"
            style={{ color: 'var(--neuron-text)' }}
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Redo canvas edit"
            disabled={redoStack.length === 0}
            data-testid={`pixel-redo-${blockId}`}
            onClick={handleRedo}
            className="cursor-pointer rounded p-1.5 transition-opacity disabled:cursor-default disabled:opacity-30 hover:opacity-80"
            style={{ color: 'var(--neuron-text)' }}
          >
            <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Clear canvas"
            data-testid={`pixel-clear-${blockId}`}
            onClick={handleClear}
            className="cursor-pointer rounded p-1.5 transition-opacity hover:opacity-80"
            style={{ color: 'var(--neuron-muted)' }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Delete canvas"
            data-testid={`pixel-delete-${blockId}`}
            onClick={onDeleteBlock}
            className="cursor-pointer rounded p-1.5 transition-opacity hover:opacity-80"
            style={{ color: 'var(--neuron-muted)' }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Canvas Surface */}
      <div
        className="relative aspect-square w-full overflow-hidden rounded-lg border"
        style={{
          borderColor: 'var(--neuron-border)',
          backgroundColor: 'var(--neuron-bg)',
          backgroundImage:
            'linear-gradient(45deg, rgba(128,128,128,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(128,128,128,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(128,128,128,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(128,128,128,0.08) 75%)',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
        }}
      >
        <canvas
          ref={canvasRef}
          width={data.size}
          height={data.size}
          data-testid={`pixel-canvas-${blockId}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          className="h-full w-full cursor-crosshair touch-none"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      {/* Palette color swatches + canvas size metadata */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Palette colors">
          {swatches.map((hex) => {
            const isSelected = activeColor === hex && tool !== 'eraser';
            return (
              <button
                key={hex}
                type="button"
                aria-label={`Select color ${hex}`}
                aria-pressed={isSelected}
                data-testid={`pixel-color-${hex}`}
                onClick={() => {
                  setActiveColor(hex);
                  if (tool === 'eraser') setTool('pen');
                }}
                className="h-5 w-5 cursor-pointer rounded-full border transition-transform hover:scale-110"
                style={{
                  backgroundColor: hex,
                  borderColor: isSelected ? 'var(--neuron-text)' : 'var(--neuron-border)',
                  boxShadow: isSelected ? '0 0 0 2px var(--neuron-accent)' : undefined,
                }}
              />
            );
          })}
        </div>
        <span
          className="text-[11px] tabular-nums"
          style={{ color: 'var(--neuron-muted)' }}
        >
          {data.size}×{data.size} · saved
        </span>
      </div>
    </div>
  );
}
