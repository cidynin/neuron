import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractHistoryImageIds,
  getEmptyHistoryStack,
  pushNoteHistory,
  redoNoteHistory,
  undoNoteHistory,
} from './history';

test('push, undo, and redo handle text, color tags, and images cleanly', () => {
  let stack = getEmptyHistoryStack();
  let content = 'hello world';

  // Discrete color change
  const colored = '{color:#f44b7a}hello{/color} world';
  stack = pushNoteHistory(stack, content, colored, { now: 1000, discrete: true });
  content = colored;

  // Add image
  const withImg = `${colored}\n![shot](neuron-img://img-abc)`;
  stack = pushNoteHistory(stack, content, withImg, { now: 2000, discrete: true });
  content = withImg;

  // Remove image
  const withoutImg = colored;
  stack = pushNoteHistory(stack, content, withoutImg, { now: 3000, discrete: true });
  content = withoutImg;

  // Image ID must remain protected in history even after removal from current note!
  const protectedIds = extractHistoryImageIds({ 'note-1': stack });
  assert.equal(protectedIds.has('img-abc'), true);

  // Undo restores the removed image
  const u1 = undoNoteHistory(stack, content, 3100);
  assert.equal(u1.didUndo, true);
  assert.equal(u1.nextContent, withImg);
  stack = u1.nextStack;
  content = u1.nextContent;

  // Undo again reverts image insertion
  const u2 = undoNoteHistory(stack, content, 3200);
  assert.equal(u2.didUndo, true);
  assert.equal(u2.nextContent, colored);
  stack = u2.nextStack;
  content = u2.nextContent;

  // Undo again reverts color change
  const u3 = undoNoteHistory(stack, content, 3300);
  assert.equal(u3.didUndo, true);
  assert.equal(u3.nextContent, 'hello world');
  stack = u3.nextStack;
  content = u3.nextContent;

  // Redo restores color -> image -> removal step by step
  const r1 = redoNoteHistory(stack, content, 3400);
  assert.equal(r1.nextContent, colored);
  const r2 = redoNoteHistory(r1.nextStack, r1.nextContent, 3500);
  assert.equal(r2.nextContent, withImg);
  const r3 = redoNoteHistory(r2.nextStack, r2.nextContent, 3600);
  assert.equal(r3.nextContent, withoutImg);
});

test('coalesces rapid typing within window while isolating discrete changes', () => {
  let stack = getEmptyHistoryStack();
  stack = pushNoteHistory(stack, '', 'a', { now: 1000, coalesceKey: 'type' });
  stack = pushNoteHistory(stack, 'a', 'ab', { now: 1120, coalesceKey: 'type' });
  stack = pushNoteHistory(stack, 'ab', 'abc', { now: 1250, coalesceKey: 'type' });
  assert.equal(stack.past.length, 1);

  // New burst after window creates separate undo step
  stack = pushNoteHistory(stack, 'abc', 'abcd', { now: 2200, coalesceKey: 'type' });
  assert.equal(stack.past.length, 2);

  // Discrete change always creates own step
  stack = pushNoteHistory(stack, 'abcd', '**abcd**', { now: 2210, discrete: true });
  assert.equal(stack.past.length, 3);
});
