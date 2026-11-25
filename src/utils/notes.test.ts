import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRASH_RETENTION_MS,
  buildExportFilename,
  computeDocumentInsights,
  countWords,
  createNote,
  emptyTrash,
  filterNotes,
  formatRelativeTime,
  formatTrashDaysRemaining,
  getActiveNotes,
  getNoteSnippet,
  getNoteTitle,
  getTrashedNotes,
  moveNoteToTrash,
  purgeExpiredTrash,
  renameNoteInList,
  restoreNoteFromTrash,
  searchNotesUniversal,
  sortNotes,
  toggleNotePin,
  updateNoteContent,
} from './notes';

test('createNote initializes note with timestamps and unpinned state', () => {
  const note = createNote('hello world', 1000, 'n1');
  assert.equal(note.id, 'n1');
  assert.equal(note.content, 'hello world');
  assert.equal(note.createdAt, 1000);
  assert.equal(note.updatedAt, 1000);
  assert.equal(note.pinned, false);
});

test('getNoteTitle (50% rule + custom title) and getNoteSnippet (80% rule) extract clean editorial text', () => {
  assert.equal(getNoteTitle('   \n  '), 'untitled note');
  assert.equal(
    getNoteTitle('the quick brown fox jumps over the lazy dog'),
    'the quick brown fox j…',
  );
  assert.equal(
    getNoteTitle('the quick brown fox jumps over the lazy dog', 'my custom title'),
    'my custom title',
  );
  assert.equal(getNoteTitle('# morning thoughts\nsecond line here'), 'morning…');
  assert.equal(
    getNoteSnippet('# morning thoughts\nsecond line here\nthird line'),
    'second line here thir…',
  );
  assert.equal(getNoteSnippet('single line only'), '');

  const messy = [
    '|  |  |',
    '| --- | --- |',
    '|  |  |',
    '**hello world**',
    '*dfdfdfd * ____ > {color:#f44b7a}pink{/color} __sd__',
  ].join('\n');
  assert.equal(getNoteTitle(messy), 'hello…');
  assert.equal(getNoteSnippet(messy), 'dfdfdfd > pin…');
  assert.equal(getNoteTitle('|  |  |\n| --- | --- |\n|  |  |'), 'untitled note');
});

test('renameNoteInList sets custom title or clears it back to inherited title', () => {
  const n1 = createNote('the quick brown fox jumps over the lazy dog', 100, 'n1');
  const renamed = renameNoteInList([n1], 'n1', 'renamed file', 200);
  assert.equal(renamed[0].title, 'renamed file');
  assert.equal(getNoteTitle(renamed[0].content, renamed[0].title), 'renamed file');

  const cleared = renameNoteInList(renamed, 'n1', '   ', 300);
  assert.equal(cleared[0].title, undefined);
  assert.equal(getNoteTitle(cleared[0].content, cleared[0].title), 'the quick brown fox j…');
});

test('computeDocumentInsights calculates words, characters, reading count, and reading time', () => {
  const empty = computeDocumentInsights('');
  assert.deepEqual(empty, {
    wordCount: 0,
    characterCount: 0,
    readingCount: 0,
    readingTimeLabel: '0 min read',
  });

  const stats = computeDocumentInsights('First sentence here. Second sentence.\nThird line');
  assert.equal(stats.wordCount, 7);
  assert.equal(stats.characterCount, 48);
  assert.equal(stats.readingCount, 3);
  assert.equal(stats.readingTimeLabel, '<1 min read');
});

test('countWords handles whitespace, markdown codes, and empty notes', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   \n\t  '), 0);
  assert.equal(countWords('the quick\nbrown fox\njumps over the\nlazy dog'), 9);
  assert.equal(countWords('**hello** {color:#fff}world{/color}\n|  |  |\n| --- | --- |'), 2);
});

test('sortNotes places pinned notes first then sorts by updatedAt descending', () => {
  const n1 = { ...createNote('oldest', 100, '1'), pinned: false };
  const n2 = { ...createNote('newest', 300, '2'), pinned: false };
  const n3 = { ...createNote('pinned older', 200, '3'), pinned: true };
  const sorted = sortNotes([n1, n2, n3]);
  assert.deepEqual(
    sorted.map((n) => n.id),
    ['3', '2', '1'],
  );
});

test('filterNotes matches case-insensitively and preserves pin/recency order', () => {
  const n1 = createNote('Design notes on typography', 100, '1');
  const n2 = createNote('Grocery list: oat milk', 200, '2');
  const n3 = { ...createNote('Typography scale ideas', 150, '3'), pinned: true };
  const filtered = filterNotes([n1, n2, n3], 'TYPOGRAPHY');
  assert.deepEqual(
    filtered.map((n) => n.id),
    ['3', '1'],
  );
});

test('searchNotesUniversal searches across all files including trash and returns match lines', () => {
  const n1 = createNote('Header\nfind typography here\nand typography again', 100, '1');
  const n2 = { ...createNote('Archived typography note', 200, '2'), deletedAt: 500 };
  const n3 = createNote('Unrelated recipe', 300, '3');

  const results = searchNotesUniversal([n1, n2, n3], 'typography');
  assert.equal(results.length, 2);
  assert.equal(results[0].note.id, '1');
  assert.equal(results[0].matchCount, 2);
  assert.equal(results[0].matchLines[0].lineNumber, 2);
  assert.equal(results[1].note.id, '2');
});

test('updateNoteContent and toggleNotePin mutate only targeted note', () => {
  const n1 = createNote('alpha', 100, '1');
  const n2 = createNote('beta', 200, '2');
  const updated = updateNoteContent([n1, n2], '1', 'alpha edited', 500);
  assert.equal(updated[0].content, 'alpha edited');
  assert.equal(updated[0].updatedAt, 500);
  assert.equal(updated[1].content, 'beta');

  const pinned = toggleNotePin(updated, '2');
  assert.equal(pinned[1].pinned, true);
  assert.equal(pinned[0].pinned, false);
});

test('trash lifecycle moves deleted notes to 7-day trash, restores, and purges expired', () => {
  const t0 = 1_000_000;
  const n1 = createNote('one', 100, '1');
  const n2 = createNote('two', 200, '2');

  const res1 = moveNoteToTrash([n1, n2], '2', '2', t0);
  assert.equal(getActiveNotes(res1.notes).length, 1);
  assert.equal(getTrashedNotes(res1.notes).length, 1);
  assert.equal(res1.activeNoteId, '1');
  assert.equal(formatTrashDaysRemaining(t0, t0), '7d left');

  const restored = restoreNoteFromTrash(res1.notes, '2');
  assert.equal(getActiveNotes(restored).length, 2);
  assert.equal(getTrashedNotes(restored).length, 0);

  // Deleting last active note creates a fresh blank note while preserving trashed note
  const res2 = moveNoteToTrash(res1.notes, '1', '1', t0 + 1000);
  assert.equal(getActiveNotes(res2.notes).length, 1);
  assert.equal(getActiveNotes(res2.notes)[0].content, '');
  assert.equal(getTrashedNotes(res2.notes).length, 2);

  // Purging after 7 days permanently removes expired trashed notes
  const afterWeek = purgeExpiredTrash(res2.notes, t0 + TRASH_RETENTION_MS + 5000);
  assert.equal(getTrashedNotes(afterWeek).length, 0);
  assert.equal(getActiveNotes(afterWeek).length, 1);

  assert.equal(getTrashedNotes(emptyTrash(res2.notes)).length, 0);
});

test('buildExportFilename produces clean markdown filenames', () => {
  assert.equal(buildExportFilename('the quick brown fox!'), 'the-quick-brown-fox.md');
  assert.equal(buildExportFilename('   '), 'untitled-note.md');
});

test('formatRelativeTime formats seconds, minutes, hours, and days', () => {
  const now = 1_700_000_000_000;
  assert.equal(formatRelativeTime(now - 10_000, now), 'just now');
  assert.equal(formatRelativeTime(now - 5 * 60_000, now), '5m ago');
  assert.equal(formatRelativeTime(now - 3 * 3600_000, now), '3h ago');
  assert.equal(formatRelativeTime(now - 2 * 86400_000, now), '2d ago');
});

test('searchNotesUniversal shields locked note body text unless unlocked and ignores pixel canvas data', () => {
  const lockedNote = {
    ...createNote('secret treasure coordinates\nsecond secret line', 200, 'locked-1'),
    title: 'vault diary',
    passwordHash: 'hash',
    passwordSalt: 'salt',
  };
  const pixelNote = createNote('intro line\n:::pixel 32\np:#ff0000\nd:1024.\n:::\nafter sketch', 300, 'pix-1');

  // Searching locked body text returns 0 matches when locked
  assert.equal(searchNotesUniversal([lockedNote], 'treasure', false, new Set()).length, 0);
  // Title search still works when locked
  assert.equal(searchNotesUniversal([lockedNote], 'vault', false, new Set()).length, 1);
  // Unlocked note exposes body match lines
  const unlockedMatches = searchNotesUniversal([lockedNote], 'treasure', false, new Set(['locked-1']));
  assert.equal(unlockedMatches.length, 1);
  assert.equal(unlockedMatches[0].matchLines[0].text, 'secret treasure coordinates');

  // Pixel data payload lines are never matched or included in word count
  assert.equal(searchNotesUniversal([pixelNote], '1024', false).length, 0);
  assert.equal(countWords(pixelNote.content), 4);
});
