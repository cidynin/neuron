import englishWords from 'an-array-of-english-words';

export interface SpellIssue {
  word: string;
  normalized: string;
  start: number;
  end: number;
}

const EXTRA_MODERN_WORDS = [
  'neuron',
  'obsidian',
  'markdown',
  'lospec',
  'coolors',
  'colorhunt',
  'dyslexic',
  'opendyslexic',
  'google',
  'serif',
  'monospace',
  'chiptune',
  'notepad',
  'wikilink',
  'wikilinks',
  'checkbox',
  'checkboxes',
  'blockquote',
  'strikethrough',
  'spellcheck',
  'spellchecker',
  'screenshot',
  'screenshots',
  'playlist',
  'playlists',
  'podcast',
  'podcasts',
  'emoji',
  'emojis',
  'wifi',
  'ok',
  'okay',
  'app',
  'apps',
  'api',
  'apis',
  'url',
  'urls',
  'html',
  'css',
  'js',
  'ts',
  'json',
  'svg',
  'png',
  'jpg',
  'pdf',
  'ui',
  'ux',
  'os',
  'ai',
  'faq',
  'etc',
  'eg',
  'ie',
  'vs',
  'mr',
  'mrs',
  'ms',
  'dr',
  'github',
  'gitlab',
  'microsoft',
  'powerpoint',
  'excel',
  'onenote',
  'notion',
  'figma',
  'discord',
  'reddit',
  'youtube',
  'spotify',
  'twitch',
  'tiktok',
  'instagram',
  'netflix',
  'iphone',
  'ipad',
  'macbook',
  'macos',
  'windows',
  'linux',
  'android',
  'chrome',
  'firefox',
  'safari',
  'vscode',
  'typescript',
  'javascript',
  'python',
  'react',
  'vite',
  'tailwind',
  'nodejs',
  'localhost',
  'workflow',
  'workflows',
  'workspace',
  'workspaces',
  'checklist',
  'checklists',
  'autosave',
  'todo',
  'todos',
  'changelog',
  'roadmap',
  'pixel',
  'pixels',
  'eraser',
  'autocorrect',
  'recolor',
  'unpin',
  'hotkey',
  'hotkeys',
  'shortcut',
  'shortcuts',
  'spotlight',
  'calculator',
  'itll',
  'dont',
  'cant',
  'wont',
  'didnt',
  'isnt',
  'arent',
  'wasnt',
  'werent',
  'doesnt',
  'hasnt',
  'havent',
  'hadnt',
  'couldnt',
  'wouldnt',
  'shouldnt',
  'youre',
  'theyre',
  'ive',
  'youve',
  'weve',
  'theyve',
  'hes',
  'shes',
  'thats',
  'theres',
  'whats',
  'whos',
  'heres',
  'lets',
  // Common contractions (lowercase)
  "i'm",
  "i've",
  "i'll",
  "i'd",
  "you're",
  "you've",
  "you'll",
  "you'd",
  "he's",
  "she's",
  "it's",
  "we're",
  "we've",
  "we'll",
  "we'd",
  "they're",
  "they've",
  "they'll",
  "they'd",
  "that's",
  "there's",
  "here's",
  "what's",
  "who's",
  "where's",
  "when's",
  "why's",
  "how's",
  "isn't",
  "aren't",
  "wasn't",
  "weren't",
  "don't",
  "doesn't",
  "didn't",
  "haven't",
  "hasn't",
  "hadn't",
  "won't",
  "wouldn't",
  "can't",
  "cannot",
  "couldn't",
  "shouldn't",
  "mustn't",
  "mightn't",
  "needn't",
  "let's",
  "y'all",
  "o'clock",
  // Casual apostrophe-free contractions & modern internet/editor words
  'im',
  'ive',
  'ill',
  'itll',
  'itd',
  'youre',
  'youve',
  'youll',
  'youd',
  'hes',
  'shes',
  'weve',
  'theyre',
  'theyve',
  'theyll',
  'theyd',
  'thats',
  'thatll',
  'thatd',
  'theres',
  'therell',
  'thered',
  'therere',
  'heres',
  'herell',
  'hered',
  'whats',
  'whatll',
  'whatd',
  'whatre',
  'whatve',
  'whos',
  'wholl',
  'whod',
  'wheres',
  'wherell',
  'whered',
  'whens',
  'whenll',
  'whend',
  'whys',
  'whyll',
  'whyd',
  'hows',
  'howll',
  'howd',
  'isnt',
  'arent',
  'wasnt',
  'werent',
  'dont',
  'doesnt',
  'didnt',
  'havent',
  'hasnt',
  'hadnt',
  'wont',
  'wouldnt',
  'wouldve',
  'couldve',
  'shouldve',
  'mustve',
  'mightve',
  'oughtve',
  'oughtnt',
  'cant',
  'couldnt',
  'shouldnt',
  'mustnt',
  'mightnt',
  'neednt',
  'aint',
  'shant',
  'yall',
  'oclock',
  'gonna',
  'wanna',
  'gotta',
  'kinda',
  'sorta',
  'coulda',
  'shoulda',
  'woulda',
  'outta',
  'lotta',
  'tbh',
  'imo',
  'imho',
  'idk',
  'btw',
  'fyi',
  'website',
  'websites',
  'soundpack',
  'soundpacks',
  'laggy',
  'stuttery',
  'jittery',
  'keypress',
  'keypresses',
  'toolbar',
  'toolbars',
  'sidebar',
  'lightbox',
  'undo',
  'redo',
  'undoing',
  'redoing',
  'hotkey',
  'hotkeys',
  'shortcut',
  'shortcuts',
  'opensource',
  'readme',
  'localhost',
  'frontend',
  'backend',
  'fullstack',
  'codebase',
  'repo',
  'repos',
  'devops',
  'changelog',
  'async',
  'regex',
  'darkmode',
  'lightmode',
  'touchscreen',
  'trackpad',
  'keycap',
  'keycaps',
  // Common platforms, software, brands, and tech proper nouns
  'github',
  'gitlab',
  'bitbucket',
  'stackoverflow',
  'codepen',
  'codesandbox',
  'replit',
  'microsoft',
  'apple',
  'amazon',
  'meta',
  'facebook',
  'netflix',
  'nvidia',
  'amd',
  'intel',
  'samsung',
  'sony',
  'nintendo',
  'windows',
  'macos',
  'linux',
  'ubuntu',
  'debian',
  'fedora',
  'android',
  'ios',
  'ipados',
  'iphone',
  'iphones',
  'ipad',
  'macbook',
  'macbooks',
  'airpods',
  'chrome',
  'chromium',
  'firefox',
  'safari',
  'discord',
  'slack',
  'zoom',
  'telegram',
  'whatsapp',
  'spotify',
  'youtube',
  'twitch',
  'reddit',
  'twitter',
  'instagram',
  'tiktok',
  'bluesky',
  'mastodon',
  'linkedin',
  'pinterest',
  'snapchat',
  'vercel',
  'netlify',
  'cloudflare',
  'heroku',
  'railway',
  'render',
  'firebase',
  'supabase',
  'docker',
  'kubernetes',
  'javascript',
  'typescript',
  'python',
  'golang',
  'nodejs',
  'npm',
  'pnpm',
  'bun',
  'vite',
  'webpack',
  'eslint',
  'prettier',
  'tailwind',
  'tailwindcss',
  'react',
  'nextjs',
  'svelte',
  'vscode',
  'neovim',
  'jetbrains',
  'figma',
  'notion',
  'linear',
  'jira',
  'trello',
  'raycast',
  'openai',
  'chatgpt',
  'claude',
  'anthropic',
  'gemini',
  'copilot',
  'perplexity',
  'emojipedia',
  'twemoji',
  'openmoji',
  'noto',
  'kofi',
  'patreon',
  'paypal',
  'stripe',
  'shopify',
  'powerpoint',
  'excel',
  'onenote',
  'outlook',
  'sharepoint',
  'onedrive',
  'teams',
  'keynote',
  'photoshop',
  'illustrator',
  'indesign',
  'premiere',
  'aftereffects',
  'lightroom',
  'audition',
  'davinci',
  'blender',
  'unreal',
  'godot',
  'canva',
  'capcut',
  'dropbox',
  'icloud',
  'steam',
  'xbox',
  'playstation',
  'gmail',
  'gdrive',
  'gdocs',
  'gsheets',
  'gslides',
  'grok',
  'deepseek',
  'mistral',
  'cursor',
  'logseq',
  'airtable',
  'asana',
  'clickup',
  'loom',
  'miro',
  'excalidraw',
  'framer',
  'webflow',
  'wordpress',
  'squarespace',
  'venmo',
  'cashapp',
  'zelle',
  'facetime',
  'imessage',
  'substack',
  'wikipedia',
  'jupyter',
  'postgres',
  'postgresql',
  'mysql',
  'sqlite',
  'mongodb',
  'redis',
  'graphql',
  'prisma',
  'drizzle',
  'vuejs',
  'angularjs',
  'astro',
  'remix',
  'deno',
  'tauri',
  'playwright',
  'vitest',
  'jest',
  'cypress',
  'storybook',
  'turborepo',
  'monorepo',
  'autofill',
  'autocomplete',
  'keyframe',
  'keyframes',
  'waveform',
  'waveforms',
  'audiobook',
  'audiobooks',
  'livestream',
  'livestreams',
  'livestreaming',
  'vlog',
  'vlogs',
  'vlogger',
  'unbox',
  'unboxing',
  'screencast',
  'screencasts',
  'paywall',
  'paywalled',
  'unsubscribe',
  'repost',
  'reposted',
  'upvote',
  'downvote',
  'hyperlink',
  'hyperlinks',
  'metadata',
  'username',
  'usernames',
  'passcode',
  'passcodes',
  'passkey',
  'passkeys',
  'biometric',
  'biometrics',
  'login',
  'logins',
  'logout',
  'signup',
  'signups',
  'onboarding',
  'plugin',
  'plugins',
  'addon',
  'addons',
  'modal',
  'modals',
  'tooltip',
  'tooltips',
  'dropdown',
  'dropdowns',
  'scrollbar',
  'scrollbars',
  'touchpad',
  'ultrawide',
  'smartwatch',
  'earbuds',
  'headset',
  'webcam',
  'mic',
  'mics',
  'gpu',
  'gpus',
  'cpu',
  'cpus',
  'ssd',
  'vram',
  'hdmi',
  'usb',
  'bluetooth',
  'ethernet',
  'hotspot',
  'vpn',
  'dns',
  'https',
  'http',
  'oauth',
  'jwt',
  'webhook',
  'webhooks',
  'cron',
  'yaml',
  'toml',
  'csv',
  'webp',
  'avif',
  'wav',
  'ogg',
  'flac',
];

// Top high-frequency everyday English words prioritized for spelling suggestions
const COMMON_PRIORITY_WORDS = [
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not',
  'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from',
  'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would',
  'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which',
  'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
  'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see',
  'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think',
  'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
  'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
  'quick', 'brown', 'fox', 'jumps', 'lazy', 'dog', 'note', 'notes', 'write', 'writing',
  'text', 'test', 'word', 'words', 'sentence', 'sentences', 'list', 'lists', 'header',
  'headers', 'title', 'thought', 'thoughts', 'idea', 'ideas', 'today', 'tomorrow',
  'yesterday', 'morning', 'evening', 'night', 'place', 'places', 'thing', 'things',
  'world', 'life', 'hand', 'part', 'child', 'eye', 'woman', 'man', 'week', 'case',
  'point', 'government', 'company', 'number', 'group', 'problem', 'fact', 'right',
  'great', 'same', 'little', 'own', 'old', 'big', 'high', 'different', 'small',
  'large', 'next', 'early', 'young', 'important', 'few', 'public', 'bad', 'able',
  'receive', 'believe', 'achieve', 'separate', 'definitely', 'necessary', 'calendar',
  'spelling', 'grammar', 'check', 'checker', 'custom', 'dictionary', 'minimal',
  'minimalist', 'modern', 'simple', 'clean', 'sound', 'music', 'font', 'fonts',
  'color', 'colors', 'palette', 'theme', 'light', 'dark', 'line', 'lines', 'page',
  'pages', 'book', 'read', 'reading', 'story', 'stories', 'project', 'projects',
  'design', 'code', 'program', 'system', 'music', 'space', 'water', 'fire', 'earth',
  'because', 'through', 'between', 'before', 'around', 'always', 'never', 'often',
  'sometimes', 'really', 'actually', 'probably', 'especially', 'friends', 'friend',
  'family', 'home', 'house', 'room', 'school', 'work', 'money', 'love', 'help',
  'start', 'begin', 'keep', 'hold', 'turn', 'ask', 'feel', 'try', 'leave', 'call',
];

const COMMON_PRIORITY_SET = new Set(COMMON_PRIORITY_WORDS);

let cachedDictionary: Set<string> | null = null;

// Refined local everyday conversational terms so casual writing stays friction-free offline
const CASUAL_EVERYDAY_WORDS = [
  'aight', 'alr', 'asap', 'banger', 'based', 'bestie', 'btw', 'chillax', 'chillin',
  'clout', 'comfy', 'cozy', 'cringe', 'cringey', 'cuz', 'def', 'defo', 'dm', 'dms',
  'dope', 'dunno', 'ez', 'fam', 'fav', 'fave', 'flex', 'fomo', 'fr', 'ftw', 'fwiw',
  'fyi', 'gif', 'gifs', 'gimme', 'glitchy', 'goat', 'gtg', 'hella', 'hmu', 'homie',
  'hr', 'hrs', 'hype', 'hyped', 'idc', 'idk', 'iirc', 'ikr', 'imo', 'imho', 'inspo',
  'irl', 'janky', 'kk', 'kudos', 'legit', 'lemme', 'lit', 'lmao', 'lmk', 'lofi',
  'lowkey', 'meh', 'meme', 'memes', 'min', 'mins', 'msg', 'msgs', 'nocap', 'noob',
  'nope', 'np', 'omg', 'omw', 'oof', 'ootd', 'pic', 'pics', 'ping', 'pinged',
  'pinging', 'pls', 'plz', 'pm', 'pms', 'pov', 'prob', 'probs', 'prolly', 'props',
  'rad', 'rekt', 'rip', 'rly', 'rn', 'rofl', 'sec', 'secs', 'selfie', 'selfies',
  'smh', 'smth', 'snazzy', 'spiffy', 'srsly', 'sth', 'stoked', 'sus', 'swag',
  'tba', 'tbd', 'tbh', 'tho', 'thx', 'tldr', 'tmr', 'tmrw', 'ttyl', 'ty', 'tysm',
  'uncomfy', 'valid', 'vibe', 'vibed', 'vibes', 'vibin', 'vibing', 'vid', 'vids',
  'wassup', 'welp', 'whoa', 'wholesome', 'wk', 'wks', 'woah', 'wtf', 'wth', 'yea',
  'yeah', 'yep', 'yikes', 'yolo', 'yr', 'yrs', 'yup', 'yw',
];

export function getDictionarySet(): Set<string> {
  if (cachedDictionary) return cachedDictionary;
  const set = new Set<string>(englishWords);
  for (const w of EXTRA_MODERN_WORDS) {
    set.add(w);
  }
  for (const w of COMMON_PRIORITY_WORDS) {
    set.add(w);
  }
  for (const w of CASUAL_EVERYDAY_WORDS) {
    set.add(w);
  }
  cachedDictionary = set;
  return set;
}

export function normalizeWordToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/^['-]+|['-]+$/g, '');
}

export function isWordCorrect(
  rawWord: string,
  customWords: Set<string> = new Set(),
  ignoredWords: Set<string> = new Set(),
): boolean {
  const trimmed = rawWord.trim();
  if (!trimmed) return true;

  // Skip all-caps acronyms (e.g. NASA, API, HTML)
  if (/^[A-Z]{2,}$/.test(trimmed)) return true;

  // Skip tokens containing digits
  if (/\d/.test(trimmed)) return true;

  const clean = normalizeWordToken(trimmed);
  if (!clean || clean.length <= 1) return true;

  if (customWords.has(clean) || ignoredWords.has(clean)) return true;

  const dict = getDictionarySet();
  if (dict.has(clean)) return true;

  // Possessive handling (e.g., "fox's", "james'")
  if (clean.endsWith("'s")) {
    const base = clean.slice(0, -2);
    if (
      dict.has(base) ||
      customWords.has(base) ||
      ignoredWords.has(base)
    ) {
      return true;
    }
  }

  // Hyphenated compound words (e.g. "ultra-minimalist", "well-known")
  if (clean.includes('-')) {
    const parts = clean.split('-').filter(Boolean);
    if (
      parts.length > 1 &&
      parts.every((p) => isWordCorrect(p, customWords, ignoredWords))
    ) {
      return true;
    }
  }

  return false;
}

function buildMaskedCodeRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  // Pixel canvas fenced blocks
  const pixelRegex = /^:::pixel\s+(?:32|64)[\s\S]*?^:::$/gm;
  let match: RegExpExecArray | null;
  while ((match = pixelRegex.exec(text)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  // Fenced code blocks
  const fenceRegex = /```[\s\S]*?```/g;
  while ((match = fenceRegex.exec(text)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  // Inline code spans
  const inlineCodeRegex = /`[^`\n]+`/g;
  while ((match = inlineCodeRegex.exec(text)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  // URLs
  const urlRegex = /https?:\/\/[^\s)>\]]+/gi;
  while ((match = urlRegex.exec(text)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  // Embedded neuron image markdown tokens
  const imageTokenRegex = /!\[[^\]\n]*\]\(neuron-img:\/\/[a-zA-Z0-9_-]+\)/g;
  while ((match = imageTokenRegex.exec(text)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  // Color tags & underline HTML markers
  const formattingTagRegex = /\{color:#[0-9a-fA-F]{3,8}\}|\{\/color\}|<\/?u>/g;
  while ((match = formattingTagRegex.exec(text)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function isInsideRanges(index: number, ranges: Array<[number, number]>): boolean {
  for (const [start, end] of ranges) {
    if (index >= start && index < end) return true;
  }
  return false;
}

export function findMisspellings(
  text: string,
  customWords: Set<string> = new Set(),
  ignoredWords: Set<string> = new Set(),
  activeCaretIndex?: number | null,
): SpellIssue[] {
  if (!text) return [];
  const skipRanges = buildMaskedCodeRanges(text);
  const issues: SpellIssue[] = [];
  const wordRegex = /\b[A-Za-z][A-Za-z'’-]*[A-Za-z]\b/g;

  let match: RegExpExecArray | null;
  while ((match = wordRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (isInsideRanges(start, skipRanges)) continue;

    // Defer squiggle underline while user is still actively typing/editing this word
    if (
      activeCaretIndex !== undefined &&
      activeCaretIndex !== null &&
      activeCaretIndex >= start &&
      activeCaretIndex <= end
    ) {
      continue;
    }

    if (!isWordCorrect(match[0], customWords, ignoredWords)) {
      issues.push({
        word: match[0],
        normalized: normalizeWordToken(match[0]),
        start,
        end,
      });
    }
  }

  return issues;
}

function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        val = Math.min(val, dp[i - 2][j - 2] + cost);
      }
      dp[i][j] = val;
    }
  }
  return dp[m][n];
}

function generateEditDistance1(word: string): string[] {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const results: string[] = [];

  // Deletions
  for (let i = 0; i < word.length; i++) {
    results.push(word.slice(0, i) + word.slice(i + 1));
  }
  // Transpositions
  for (let i = 0; i < word.length - 1; i++) {
    results.push(
      word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2),
    );
  }
  // Replacements
  for (let i = 0; i < word.length; i++) {
    for (let c = 0; c < letters.length; c++) {
      if (word[i] !== letters[c]) {
        results.push(word.slice(0, i) + letters[c] + word.slice(i + 1));
      }
    }
  }
  // Insertions
  for (let i = 0; i <= word.length; i++) {
    for (let c = 0; c < letters.length; c++) {
      results.push(word.slice(0, i) + letters[c] + word.slice(i));
    }
  }
  return results;
}

function matchOriginalCase(original: string, suggestion: string): string {
  if (original.length > 0 && original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return suggestion[0].toUpperCase() + suggestion.slice(1);
  }
  return suggestion;
}

export function getSpellingSuggestions(
  rawWord: string,
  customWords: Set<string> = new Set(),
  max = 5,
): string[] {
  const target = normalizeWordToken(rawWord);
  if (!target) return [];
  const dict = getDictionarySet();

  const candidates = new Map<string, number>();

  const scoreCandidate = (cand: string, dist: number) => {
    const priorityBonus = COMMON_PRIORITY_SET.has(cand) ? -0.45 : 0;
    const customBonus = customWords.has(cand) ? -0.5 : 0;
    const sameFirstLetter = cand[0] === target[0] ? -0.15 : 0;
    const lengthPenalty = Math.abs(cand.length - target.length) * 0.05;
    const total = dist + priorityBonus + customBonus + sameFirstLetter + lengthPenalty;
    const prev = candidates.get(cand);
    if (prev === undefined || total < prev) {
      candidates.set(cand, total);
    }
  };

  // Pass 1: exact 1-edit lookup against the full dictionary
  const edits1 = generateEditDistance1(target);
  for (const e1 of edits1) {
    if (e1.length >= 2 && (dict.has(e1) || customWords.has(e1))) {
      scoreCandidate(e1, 1);
    }
  }

  // Pass 2: Damerau-Levenshtein <= 2 against common everyday vocabulary & custom words
  for (const w of COMMON_PRIORITY_WORDS) {
    if (Math.abs(w.length - target.length) <= 2) {
      const dist = damerauLevenshtein(target, w);
      if (dist <= 2 && dist > 0) {
        scoreCandidate(w, dist);
      }
    }
  }
  for (const cw of customWords) {
    if (Math.abs(cw.length - target.length) <= 2) {
      const dist = damerauLevenshtein(target, cw);
      if (dist <= 2 && dist > 0) {
        scoreCandidate(cw, dist);
      }
    }
  }

  return Array.from(candidates.entries())
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([word]) => matchOriginalCase(rawWord, word));
}

const AUTOCORRECT_TYPOS: Record<string, string> = {
  teh: 'the',
  hte: 'the',
  adn: 'and',
  nad: 'and',
  taht: 'that',
  htat: 'that',
  wiht: 'with',
  wtih: 'with',
  jsut: 'just',
  waht: 'what',
  hwat: 'what',
  yuo: 'you',
  oyu: 'you',
  thier: 'their',
  recieve: 'receive',
  recieved: 'received',
  seperate: 'separate',
  seperated: 'separated',
  definately: 'definitely',
  definitly: 'definitely',
  untill: 'until',
  becuase: 'because',
  beacuse: 'because',
  becasue: 'because',
  wierd: 'weird',
  freind: 'friend',
  freinds: 'friends',
  beleive: 'believe',
  occured: 'occurred',
  occurence: 'occurrence',
  accomodate: 'accommodate',
  acheive: 'achieve',
  arguement: 'argument',
  calender: 'calendar',
  commitee: 'committee',
  concious: 'conscious',
  embaress: 'embarrass',
  enviroment: 'environment',
  existance: 'existence',
  goverment: 'government',
  grammer: 'grammar',
  happend: 'happened',
  immediatly: 'immediately',
  independant: 'independent',
  knowlege: 'knowledge',
  langauge: 'language',
  libary: 'library',
  neccessary: 'necessary',
  noticable: 'noticeable',
  ocassion: 'occasion',
  persistant: 'persistent',
  posession: 'possession',
  priviledge: 'privilege',
  publically: 'publicly',
  recomend: 'recommend',
  refered: 'referred',
  religous: 'religious',
  rythm: 'rhythm',
  sucessful: 'successful',
  temprature: 'temperature',
  tommorow: 'tomorrow',
  tomorow: 'tomorrow',
  tounge: 'tongue',
  truely: 'truly',
  writting: 'writing',
  tset: 'test',
  speling: 'spelling',
  quik: 'quick',
  helo: 'hello',
  wrold: 'world',
  mispelled: 'misspelled',
};

function preserveWordCase(original: string, replacement: string): string {
  if (
    original.length > 1 &&
    original === original.toUpperCase() &&
    original !== original.toLowerCase()
  ) {
    return replacement.toUpperCase();
  }
  return matchOriginalCase(original, replacement);
}

/**
 * Returns an automatic typo correction only when confidence is unambiguous:
 * either an explicit common-typo match or a unique 1-edit match against everyday priority words.
 */
export function getAutocorrectReplacement(
  rawWord: string,
  customWords: Set<string> = new Set(),
  ignoredWords: Set<string> = new Set(),
): string | null {
  if (!rawWord || rawWord.length < 3 || rawWord.length > 28) return null;
  // Never alter ALL-CAPS acronyms or internal camelCase identifiers
  if (rawWord === rawWord.toUpperCase() && rawWord !== rawWord.toLowerCase()) {
    return null;
  }
  if (/[a-z][A-Z]/.test(rawWord)) {
    return null;
  }

  if (isWordCorrect(rawWord, customWords, ignoredWords)) {
    return null;
  }

  const clean = normalizeWordToken(rawWord);
  if (!clean || clean.length < 3) return null;

  const direct = AUTOCORRECT_TYPOS[clean];
  if (direct && direct !== clean) {
    return preserveWordCase(rawWord, direct);
  }

  // Unique 1-edit match among high-frequency everyday English words (min length 4)
  if (clean.length >= 4) {
    const matches = new Set<string>();
    const edits1 = generateEditDistance1(clean);
    for (const cand of edits1) {
      if (cand !== clean && COMMON_PRIORITY_SET.has(cand)) {
        matches.add(cand);
        if (matches.size > 1) break;
      }
    }
    if (matches.size === 1) {
      const only = Array.from(matches)[0];
      return preserveWordCase(rawWord, only);
    }
  }

  return null;
}

