import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pushImageStroke,
  redoImageStroke,
  undoImageStroke,
  type ImageAnnotationStroke,
} from './imageEditor';

function makeStroke(id: string): ImageAnnotationStroke {
  return {
    id,
    tool: 'pen',
    color: '#ff0000',
    size: 4,
    points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
  };
}

test('image stroke undo/redo stack preserves history across push, undo, and redo', () => {
  const s1 = makeStroke('s1');
  const s2 = makeStroke('s2');

  let state = { strokes: [] as ImageAnnotationStroke[], redoStrokes: [] as ImageAnnotationStroke[] };
  state = pushImageStroke(state, s1);
  state = pushImageStroke(state, s2);
  assert.deepEqual(state.strokes.map((s) => s.id), ['s1', 's2']);
  assert.equal(state.redoStrokes.length, 0);

  state = undoImageStroke(state);
  assert.deepEqual(state.strokes.map((s) => s.id), ['s1']);
  assert.deepEqual(state.redoStrokes.map((s) => s.id), ['s2']);

  state = redoImageStroke(state);
  assert.deepEqual(state.strokes.map((s) => s.id), ['s1', 's2']);
  assert.equal(state.redoStrokes.length, 0);

  // Pushing new stroke clears redo stack
  state = undoImageStroke(state);
  const s3 = makeStroke('s3');
  state = pushImageStroke(state, s3);
  assert.deepEqual(state.strokes.map((s) => s.id), ['s1', 's3']);
  assert.equal(state.redoStrokes.length, 0);
});
