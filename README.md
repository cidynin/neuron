# neuron

A tactile, zero-noise minimalist notepad built for focused writing in the browser.

## Features

- **Distraction-free WYSIWYG markdown**: Headings (`#`, `##`, `###`), bold, italic, underline, highlights, links, quotes, auto-renumbered lists, checklists, collapsible sections, inline `(H)` tables/boxes, and `(P)` `32×32` / `64×64` canvases.
- **Tactile keystroke synthesis**: Web Audio API sound profiles (`thock`, `typewriter`, `droplet`, `8bit`, `creamy`, `marimba`, `buckling`, `off`) plus local audio file uploads for custom sound packs.
- **Custom themes & typography**: Curated color palettes, Lospec/Coolors link imports, built-in and Google Fonts support, configurable UI scale, text size, line spacing, text width, scrollbar style, header button & title visibility, and OpenDyslexic mode.
- **Document insights, search, library & privacy**: Optional word count, character count, sentence count, and reading time; Spotlight universal search (`Cmd/Ctrl+K`); password-protected notes; and local-first IndexedDB image annotation & canvas gallery.
- **Offline spelling & autocorrect**: Client-side English spellchecker and subtle autocorrect with custom personal dictionary.
- **Emoji picker & vendor styles**: Searchable emoji popover (`:` trigger) and selectable rendering styles (`system`, `apple`, `google`, `noto emoji`, `fluent 3d`, `samsung`, `whatsapp`, `twemoji`, `facebook`, `joypixels`, `openmoji`, `blobmoji`).

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

- `npm run dev` — Start the Express + Vite development server on port 3000
- `npm run build` — Build production client assets into `dist/`
- `npm run start` — Serve the production build via `server.ts`
- `npm run lint` — Typecheck with `tsc --noEmit`

## License

[Apache-2.0](LICENSE)
