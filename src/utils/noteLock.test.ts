import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNoteLockCredentials,
  isNoteLocked,
  verifyNotePassword,
} from './noteLock';

test('createNoteLockCredentials hashes with unique salt and verifies password cleanly', async () => {
  const creds1 = await createNoteLockCredentials('secret123');
  const creds2 = await createNoteLockCredentials('secret123');

  assert.notEqual(creds1.passwordSalt, creds2.passwordSalt);
  assert.notEqual(creds1.passwordHash, 'secret123');
  assert.equal(isNoteLocked(creds1), true);
  assert.equal(isNoteLocked({}), false);

  assert.equal(await verifyNotePassword(creds1, 'secret123'), true);
  assert.equal(await verifyNotePassword(creds1, 'wrongpass'), false);
  assert.equal(await verifyNotePassword(creds1, ''), false);
  assert.equal(await verifyNotePassword({}, 'anything'), true);
});

test('createNoteLockCredentials rejects empty password', async () => {
  await assert.rejects(() => createNoteLockCredentials(''));
});
