import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  Eraser,
  ExternalLink,
  EyeOff,
  Pen,
  Redo2,
  Undo2,
  X,
} from 'lucide-react';
import type { ColorPalette } from '../types/neuron';
import {
  pushImageStroke,
  redoImageStroke,
  undoImageStroke,
  type ImageAnnotationStroke,
  type ImageEditTool,
} from '../utils/imageEditor';
import { formatBytes, type StoredImage } from '../utils/images';

interface ImageLightboxProps {
  image: StoredImage | null;
  palette: ColorPalette;
  usageSummary?: string;
  onSaveImage?: (updated: StoredImage) => void;
  onClose: () => void;
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
  return unique.length > 0 ? unique : ['#f44b7a', '#ffffff', '#000000'];
}

function replayOverlayStrokes(
  overlayCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  strokes: ImageAnnotationStroke[],
  baseImg: HTMLImageElement | null,
) {
  overlayCtx.clearRect(0, 0, width, height);

  // Build optional offscreen pixel-sampling canvas for mosaic obscure brush
  let baseData: Uint8ClampedArray | null = null;
  const ensureBaseSamples = () => {
    if (baseData || !baseImg) return baseData;
    try {
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = width;
      sampleCanvas.height = height;
      const sCtx = sampleCanvas.getContext('2d');
      if (sCtx) {
        sCtx.drawImage(baseImg, 0, 0, width, height);
        baseData = sCtx.getImageData(0, 0, width, height).data;
      }
    } catch {
      baseData = null;
    }
    return baseData;
  };

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;

    if (stroke.tool === 'obscure') {
      overlayCtx.save();
      overlayCtx.globalCompositeOperation = 'source-over';
      const cellSize = Math.max(12, Math.round(stroke.size * 1.1));
      const pixels = ensureBaseSamples();
      const paintedCells = new Set<string>();

      const paintBrushAt = (px: number, py: number) => {
        const half = stroke.size * 0.85;
        const minCx = Math.max(0, Math.floor((px - half) / cellSize));
        const maxCx = Math.min(Math.floor((width - 1) / cellSize), Math.floor((px + half) / cellSize));
        const minCy = Math.max(0, Math.floor((py - half) / cellSize));
        const maxCy = Math.min(Math.floor((height - 1) / cellSize), Math.floor((py + half) / cellSize));

        for (let cy = minCy; cy <= maxCy; cy++) {
          for (let cx = minCx; cx <= maxCx; cx++) {
            const key = `${cx},${cy}`;
            if (paintedCells.has(key)) continue;
            paintedCells.add(key);

            const x0 = cx * cellSize;
            const y0 = cy * cellSize;
            const cw = Math.min(cellSize, width - x0);
            const ch = Math.min(cellSize, height - y0);

            if (pixels) {
              const sx = Math.min(width - 1, x0 + Math.floor(cw / 2));
              const sy = Math.min(height - 1, y0 + Math.floor(ch / 2));
              const off = (sy * width + sx) * 4;
              const r = Math.round(pixels[off] * 0.45);
              const g = Math.round(pixels[off + 1] * 0.45);
              const b = Math.round(pixels[off + 2] * 0.45);
              overlayCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            } else {
              overlayCtx.fillStyle = stroke.color || '#121212';
            }
            overlayCtx.fillRect(x0, y0, cw, ch);
          }
        }
      };

      for (let i = 0; i < stroke.points.length; i++) {
        const curr = stroke.points[i];
        const prev = i > 0 ? stroke.points[i - 1] : curr;
        const dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
        const steps = Math.max(1, Math.ceil(dist / Math.max(2, cellSize * 0.4)));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          paintBrushAt(prev.x + (curr.x - prev.x) * t, prev.y + (curr.y - prev.y) * t);
        }
      }
      overlayCtx.restore();
      continue;
    }

    overlayCtx.save();
    overlayCtx.globalCompositeOperation =
      stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    overlayCtx.strokeStyle = stroke.tool === 'eraser' ? 'rgba(0,0,0,1)' : stroke.color;
    overlayCtx.fillStyle = stroke.tool === 'eraser' ? 'rgba(0,0,0,1)' : stroke.color;
    overlayCtx.lineWidth = stroke.size;
    overlayCtx.lineCap = 'round';
    overlayCtx.lineJoin = 'round';

    if (stroke.points.length === 1) {
      overlayCtx.beginPath();
      overlayCtx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
      overlayCtx.fill();
    } else {
      overlayCtx.beginPath();
      overlayCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        overlayCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      overlayCtx.stroke();
    }
    overlayCtx.restore();
  }
}

export function ImageLightbox({
  image,
  palette,
  usageSummary,
  onSaveImage,
  onClose,
}: ImageLightboxProps) {
  const swatches = useMemo(() => getPaletteSwatches(palette), [palette]);
  const [tool, setTool] = useState<ImageEditTool>('pen');
  const [brushColor, setBrushColor] = useState<string>(() => {
    const accent = palette.accent.trim().toLowerCase();
    return /^#[0-9a-f]{3,8}$/i.test(accent) ? accent : swatches[0];
  });
  const [strokes, setStrokes] = useState<ImageAnnotationStroke[]>([]);
  const [redoStrokes, setRedoStrokes] = useState<ImageAnnotationStroke[]>([]);
  const [justSaved, setJustSaved] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImgRef = useRef<HTMLImageElement | null>(null);
  const loadedImageIdRef = useRef<string | null>(null);
  const activeStrokeRef = useRef<ImageAnnotationStroke | null>(null);
  const strokesRef = useRef<ImageAnnotationStroke[]>(strokes);
  const redoStrokesRef = useRef<ImageAnnotationStroke[]>(redoStrokes);
  strokesRef.current = strokes;
  redoStrokesRef.current = redoStrokes;

  useEffect(() => {
    if (!swatches.includes(brushColor)) {
      const accent = palette.accent.trim().toLowerCase();
      setBrushColor(swatches.includes(accent) ? accent : swatches[0]);
    }
  }, [brushColor, palette.accent, swatches]);

  const redrawVisibleCanvas = useCallback(
    (strokeList: ImageAnnotationStroke[], previewStroke?: ImageAnnotationStroke | null) => {
      const canvas = canvasRef.current;
      const baseImg = baseImgRef.current;
      if (!canvas || !baseImg || !baseImg.complete) return;

      const w = canvas.width;
      const h = canvas.height;
      if (w <= 0 || h <= 0) return;

      let overlay = overlayCanvasRef.current;
      if (!overlay) {
        overlay = document.createElement('canvas');
        overlayCanvasRef.current = overlay;
      }
      if (overlay.width !== w || overlay.height !== h) {
        overlay.width = w;
        overlay.height = h;
      }

      const overlayCtx = overlay.getContext('2d');
      const mainCtx = canvas.getContext('2d');
      if (!overlayCtx || !mainCtx) return;

      const all = previewStroke ? [...strokeList, previewStroke] : strokeList;
      replayOverlayStrokes(overlayCtx, w, h, all, baseImg);

      mainCtx.clearRect(0, 0, w, h);
      mainCtx.drawImage(baseImg, 0, 0, w, h);
      mainCtx.drawImage(overlay, 0, 0, w, h);
    },
    [],
  );

  useEffect(() => {
    if (!image) {
      loadedImageIdRef.current = null;
      baseImgRef.current = null;
      return;
    }

    const baseSrc = image.originalDataUrl ?? image.dataUrl;
    const isNewImage = loadedImageIdRef.current !== image.id;
    if (isNewImage) {
      loadedImageIdRef.current = image.id;
      setStrokes(image.strokes ?? []);
      setRedoStrokes(image.redoStrokes ?? []);
      setJustSaved(false);
    }

    const img = new Image();
    img.onload = () => {
      baseImgRef.current = img;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = img.naturalWidth || image.width || 600;
        canvas.height = img.naturalHeight || image.height || 400;
      }
      redrawVisibleCanvas(isNewImage ? image.strokes ?? [] : strokesRef.current);
    };
    img.src = baseSrc;
  }, [image, redrawVisibleCanvas]);

  useEffect(() => {
    if (image && baseImgRef.current?.complete) {
      redrawVisibleCanvas(strokes);
    }
  }, [image, redrawVisibleCanvas, strokes]);

  const persistFlattenedImage = useCallback(
    (nextStrokes: ImageAnnotationStroke[], nextRedoStrokes: ImageAnnotationStroke[]) => {
      if (!image || !onSaveImage) return;
      const canvas = canvasRef.current;
      const baseImg = baseImgRef.current;
      if (!canvas || !baseImg || !baseImg.complete) return;

      const w = canvas.width;
      const h = canvas.height;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = w;
      outCanvas.height = h;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) return;

      const overlay = document.createElement('canvas');
      overlay.width = w;
      overlay.height = h;
      const overlayCtx = overlay.getContext('2d');
      if (overlayCtx) {
        replayOverlayStrokes(overlayCtx, w, h, nextStrokes, baseImg);
      }

      outCtx.drawImage(baseImg, 0, 0, w, h);
      outCtx.drawImage(overlay, 0, 0, w, h);

      const originalDataUrl = image.originalDataUrl ?? image.dataUrl;
      let nextDataUrl = originalDataUrl;
      if (nextStrokes.length > 0) {
        const mime =
          image.mimeType === 'image/png' || image.mimeType === 'image/webp'
            ? image.mimeType
            : 'image/png';
        try {
          nextDataUrl = outCanvas.toDataURL(mime, 0.92);
        } catch {
          nextDataUrl = outCanvas.toDataURL('image/png');
        }
      }

      onSaveImage({
        ...image,
        dataUrl: nextDataUrl,
        originalDataUrl,
        strokes: nextStrokes,
        redoStrokes: nextRedoStrokes,
        width: w,
        height: h,
        sizeBytes: nextDataUrl.length,
      });
      setJustSaved(true);
    },
    [image, onSaveImage],
  );

  const handleCloseWithSave = useCallback(() => {
    if (image && onSaveImage) {
      persistFlattenedImage(strokesRef.current, redoStrokesRef.current);
    }
    onClose();
  }, [image, onClose, onSaveImage, persistFlattenedImage]);

  useEffect(() => {
    if (!image) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleCloseWithSave();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [handleCloseWithSave, image]);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onSaveImage || !canvasRef.current) return;
    const pt = getCanvasPoint(e);
    if (!pt) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable for synthetic/touch events
    }

    const baseScale = Math.max(4, Math.round(Math.max(canvasRef.current.width, canvasRef.current.height) * 0.008));
    const brushSize =
      tool === 'obscure'
        ? Math.max(18, baseScale * 3)
        : tool === 'eraser'
          ? Math.max(14, baseScale * 2.2)
          : Math.max(4, baseScale);

    const stroke: ImageAnnotationStroke = {
      id: `stk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool,
      color: brushColor,
      size: brushSize,
      points: [pt],
    };
    activeStrokeRef.current = stroke;
    setJustSaved(false);
    redrawVisibleCanvas(strokesRef.current, stroke);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const active = activeStrokeRef.current;
    if (!active) return;
    const pt = getCanvasPoint(e);
    if (!pt) return;
    active.points.push(pt);
    redrawVisibleCanvas(strokesRef.current, active);
  };

  const finishStroke = () => {
    const active = activeStrokeRef.current;
    if (!active) return;
    activeStrokeRef.current = null;
    const next = pushImageStroke(
      { strokes: strokesRef.current, redoStrokes: redoStrokesRef.current },
      active,
    );
    setStrokes(next.strokes);
    setRedoStrokes(next.redoStrokes);
    persistFlattenedImage(next.strokes, next.redoStrokes);
  };

  const handleUndo = () => {
    const next = undoImageStroke({ strokes, redoStrokes });
    setStrokes(next.strokes);
    setRedoStrokes(next.redoStrokes);
    redrawVisibleCanvas(next.strokes);
    persistFlattenedImage(next.strokes, next.redoStrokes);
  };

  const handleRedo = () => {
    const next = redoImageStroke({ strokes, redoStrokes });
    setStrokes(next.strokes);
    setRedoStrokes(next.redoStrokes);
    redrawVisibleCanvas(next.strokes);
    persistFlattenedImage(next.strokes, next.redoStrokes);
  };

  return (
    <AnimatePresence>
      {image && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`Image editor: ${image.name}`}
          data-testid="image-lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          onClick={handleCloseWithSave}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm sm:p-8"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30, mass: 0.8 }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[92vh] max-w-4xl flex-col overflow-hidden rounded-xl border shadow-2xl"
            style={{
              backgroundColor: 'var(--neuron-surface)',
              borderColor: 'var(--neuron-border)',
            }}
          >
            {/* Header + Info */}
            <div
              className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
              style={{ borderColor: 'var(--neuron-border)' }}
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-[var(--neuron-text)]">
                  {image.name}
                </span>
                <span
                  className="text-xs tabular-nums"
                  style={{ color: 'var(--neuron-muted)' }}
                >
                  {image.width > 0 && image.height > 0
                    ? `${image.width} × ${image.height} · `
                    : ''}
                  {formatBytes(image.sizeBytes)}
                  {usageSummary ? ` · ${usageSummary}` : ''}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {onSaveImage && (
                  <button
                    type="button"
                    data-testid="image-save-btn"
                    onClick={() => persistFlattenedImage(strokes, redoStrokes)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-85"
                    style={{
                      borderColor: justSaved ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                      color: justSaved ? 'var(--neuron-accent)' : 'var(--neuron-text)',
                    }}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{justSaved ? 'saved' : 'save'}</span>
                  </button>
                )}

                <a
                  href={image.dataUrl}
                  download={image.name}
                  aria-label={`Download ${image.name}`}
                  className="rounded p-1.5 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                  style={{ color: 'var(--neuron-muted)' }}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
                <button
                  type="button"
                  aria-label="Close image editor"
                  onClick={handleCloseWithSave}
                  className="cursor-pointer rounded p-1.5 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                  style={{ color: 'var(--neuron-text)' }}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Drawing Toolbar: Pen, Eraser, Obscure, Undo, Redo + Palette Swatches */}
            {onSaveImage && (
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2"
                style={{
                  borderColor: 'var(--neuron-border)',
                  backgroundColor: 'var(--neuron-bg)',
                }}
              >
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Image drawing tools">
                  <button
                    type="button"
                    data-testid="image-tool-pen"
                    aria-pressed={tool === 'pen'}
                    onClick={() => setTool('pen')}
                    className="inline-flex cursor-pointer items-center gap-1 rounded border px-2.5 py-1 text-xs"
                    style={{
                      backgroundColor: tool === 'pen' ? 'var(--neuron-surface)' : 'transparent',
                      borderColor: tool === 'pen' ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                      color: tool === 'pen' ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                    }}
                  >
                    <Pen className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>pen</span>
                  </button>

                  <button
                    type="button"
                    data-testid="image-tool-obscure"
                    aria-pressed={tool === 'obscure'}
                    title="Obscure sensitive details"
                    onClick={() => setTool('obscure')}
                    className="inline-flex cursor-pointer items-center gap-1 rounded border px-2.5 py-1 text-xs"
                    style={{
                      backgroundColor: tool === 'obscure' ? 'var(--neuron-surface)' : 'transparent',
                      borderColor: tool === 'obscure' ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                      color: tool === 'obscure' ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                    }}
                  >
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>obscure</span>
                  </button>

                  <button
                    type="button"
                    data-testid="image-tool-eraser"
                    aria-pressed={tool === 'eraser'}
                    onClick={() => setTool('eraser')}
                    className="inline-flex cursor-pointer items-center gap-1 rounded border px-2.5 py-1 text-xs"
                    style={{
                      backgroundColor: tool === 'eraser' ? 'var(--neuron-surface)' : 'transparent',
                      borderColor: tool === 'eraser' ? 'var(--neuron-accent)' : 'var(--neuron-border)',
                      color: tool === 'eraser' ? 'var(--neuron-text)' : 'var(--neuron-muted)',
                    }}
                  >
                    <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>eraser</span>
                  </button>

                  <span
                    className="mx-1 h-4 w-[1px]"
                    style={{ backgroundColor: 'var(--neuron-border)' }}
                    aria-hidden="true"
                  />

                  <button
                    type="button"
                    data-testid="image-undo-btn"
                    aria-label="Undo image edit"
                    disabled={strokes.length === 0}
                    onClick={handleUndo}
                    className="cursor-pointer rounded p-1.5 transition-opacity disabled:cursor-default disabled:opacity-30 hover:opacity-80"
                    style={{ color: 'var(--neuron-text)' }}
                  >
                    <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    data-testid="image-redo-btn"
                    aria-label="Redo image edit"
                    disabled={redoStrokes.length === 0}
                    onClick={handleRedo}
                    className="cursor-pointer rounded p-1.5 transition-opacity disabled:cursor-default disabled:opacity-30 hover:opacity-80"
                    style={{ color: 'var(--neuron-text)' }}
                  >
                    <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                {/* Active Palette Colors */}
                <div className="flex items-center gap-1.5" role="group" aria-label="Image brush colors">
                  {swatches.map((hex) => {
                    const selected = brushColor === hex && tool === 'pen';
                    return (
                      <button
                        key={hex}
                        type="button"
                        aria-label={`Select brush color ${hex}`}
                        aria-pressed={selected}
                        data-testid={`image-color-${hex}`}
                        onClick={() => {
                          setBrushColor(hex);
                          setTool('pen');
                        }}
                        className="h-5 w-5 cursor-pointer rounded-full border transition-transform hover:scale-110"
                        style={{
                          backgroundColor: hex,
                          borderColor: selected ? 'var(--neuron-text)' : 'var(--neuron-border)',
                          boxShadow: selected ? '0 0 0 2px var(--neuron-accent)' : undefined,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Canvas / Image Viewport */}
            <div className="flex items-center justify-center overflow-auto p-3 sm:p-5">
              {onSaveImage ? (
                <canvas
                  ref={canvasRef}
                  data-testid="image-editor-canvas"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={finishStroke}
                  onPointerCancel={finishStroke}
                  className="max-h-[68vh] max-w-full cursor-crosshair touch-none rounded-md object-contain"
                />
              ) : (
                <img
                  src={image.dataUrl}
                  alt={image.name}
                  className="max-h-[74vh] max-w-full rounded-md object-contain"
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
