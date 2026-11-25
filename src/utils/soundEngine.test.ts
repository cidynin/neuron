import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyKeyEventForSound,
  getEightBitOscillatorSpec,
  isSoundRepeatThrottled,
} from './soundEngine';

test('8-bit soundpack uses crisp square chiptune wave for spacebar instead of drum thump', () => {
  const spaceSpec = getEightBitOscillatorSpec('space');
  const charSpec = getEightBitOscillatorSpec('char', 0);
  const enterSpec = getEightBitOscillatorSpec('enter');
  const backSpec = getEightBitOscillatorSpec('backspace');

  assert.equal(spaceSpec.waveform, 'square');
  assert.equal(charSpec.waveform, 'square');
  assert.equal(enterSpec.waveform, 'square');
  assert.equal(backSpec.waveform, 'square');
});

test('classifyKeyEventForSound triggers backspace sound for Ctrl+Backspace and Cmd+Backspace', () => {
  assert.equal(
    classifyKeyEventForSound({ key: 'Backspace', ctrlKey: true }),
    'backspace',
  );
  assert.equal(
    classifyKeyEventForSound({ key: 'Backspace', metaKey: true }),
    'backspace',
  );
  assert.equal(
    classifyKeyEventForSound({ key: 'Delete', ctrlKey: true }),
    'backspace',
  );
  assert.equal(classifyKeyEventForSound({ key: 'a', ctrlKey: true }), null);
  assert.equal(classifyKeyEventForSound({ key: 'a' }), 'char');
});

test('isSoundRepeatThrottled throttles rapid key repeats cleanly while allowing single presses', () => {
  assert.equal(isSoundRepeatThrottled(100, 110, false), false);
  assert.equal(isSoundRepeatThrottled(100, 110, true, 34), true);
  assert.equal(isSoundRepeatThrottled(100, 145, true, 34), false);
});

test('classifyKeyEventForSound classifies arrow keys as nav sound across modifiers', () => {
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    assert.equal(classifyKeyEventForSound({ key }), 'nav');
    assert.equal(classifyKeyEventForSound({ key, shiftKey: true }), 'nav');
    assert.equal(classifyKeyEventForSound({ key, ctrlKey: true }), 'nav');
  }
  assert.equal(getEightBitOscillatorSpec('nav').waveform, 'square');
});
