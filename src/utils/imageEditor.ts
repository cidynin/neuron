export type ImageEditTool = 'pen' | 'eraser' | 'obscure';

export interface ImageAnnotationStroke {
  id: string;
  tool: ImageEditTool;
  color: string;
  size: number;
  points: Array<{ x: number; y: number }>;
}

export interface ImageStrokeHistoryState {
  strokes: ImageAnnotationStroke[];
  redoStrokes: ImageAnnotationStroke[];
}

export function pushImageStroke(
  state: ImageStrokeHistoryState,
  stroke: ImageAnnotationStroke,
): ImageStrokeHistoryState {
  if (stroke.points.length === 0) return state;
  return {
    strokes: [...state.strokes, stroke],
    redoStrokes: [],
  };
}

export function undoImageStroke(
  state: ImageStrokeHistoryState,
): ImageStrokeHistoryState {
  if (state.strokes.length === 0) return state;
  const popped = state.strokes[state.strokes.length - 1];
  return {
    strokes: state.strokes.slice(0, -1),
    redoStrokes: [popped, ...state.redoStrokes],
  };
}

export function redoImageStroke(
  state: ImageStrokeHistoryState,
): ImageStrokeHistoryState {
  if (state.redoStrokes.length === 0) return state;
  const [restored, ...rest] = state.redoStrokes;
  return {
    strokes: [...state.strokes, restored],
    redoStrokes: rest,
  };
}
