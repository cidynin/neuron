import { useEffect, useMemo, useState } from 'react';
import type { EmojiVendorOption } from '../types/neuron';
import { getEmojiImageUrls, splitTextWithEmojis } from '../utils/emojiVendor';

interface EmojiGlyphProps {
  emoji: string;
  vendor: EmojiVendorOption;
  /**
   * When true, wraps an invisible native emoji glyph so the inline advance width
   * matches a native <textarea> character cell 1:1.
   */
  preserveAdvance?: boolean;
  className?: string;
}

export function EmojiGlyph({
  emoji,
  vendor,
  preserveAdvance = false,
  className = '',
}: EmojiGlyphProps) {
  const urls = useMemo(() => getEmojiImageUrls(emoji, vendor), [emoji, vendor]);
  const key = `${emoji}|${vendor.id}|${vendor.urlTemplate ?? ''}`;
  const [attemptState, setAttemptState] = useState<{ key: string; idx: number }>({
    key,
    idx: 0,
  });
  const attemptIdx = attemptState.key === key ? attemptState.idx : 0;

  useEffect(() => {
    setAttemptState({ key, idx: 0 });
  }, [key]);

  const setAttemptIdx = (updater: (prev: number) => number) => {
    setAttemptState((prev) => ({
      key,
      idx: updater(prev.key === key ? prev.idx : 0),
    }));
  };

  const activeUrl = !vendor.fontFamily && attemptIdx < urls.length ? urls[attemptIdx] : null;

  if (vendor.fontFamily) {
    const displayGlyph = emoji.replace(/\uFE0F/g, '');
    const notoStyle: React.CSSProperties = {
      fontFamily: vendor.fontFamily,
      fontVariantEmoji: 'text',
    };

    if (preserveAdvance) {
      return (
        <span
          className={`relative inline-block align-baseline ${className}`}
          data-emoji-vendor={vendor.id}
        >
          <span className="opacity-0 select-none">{emoji}</span>
          <span
            aria-hidden="true"
            style={notoStyle}
            className="pointer-events-none absolute inset-0 flex items-center justify-center leading-none select-none"
          >
            {displayGlyph}
          </span>
        </span>
      );
    }

    return (
      <span
        data-emoji-vendor={vendor.id}
        style={notoStyle}
        className={`inline-block leading-none select-none ${className}`}
      >
        {displayGlyph}
      </span>
    );
  }

  if (!activeUrl) {
    return <span className={className}>{emoji}</span>;
  }

  if (preserveAdvance) {
    return (
      <span
        className={`relative inline-block align-baseline ${className}`}
        data-emoji-vendor={vendor.id}
      >
        <span className="opacity-0 select-none">{emoji}</span>
        <img
          src={activeUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="eager"
          decoding="async"
          data-emoji-vendor={vendor.id}
          onError={() => setAttemptIdx((prev) => prev + 1)}
          className="pointer-events-none absolute inset-0 m-auto h-[1.02em] w-[1.02em] select-none object-contain"
        />
      </span>
    );
  }

  return (
    <img
      src={activeUrl}
      alt={emoji}
      draggable={false}
      loading="eager"
      decoding="async"
      onError={() => setAttemptIdx((prev) => prev + 1)}
      data-emoji-vendor={vendor.id}
      className={`inline-block h-[1.12em] w-[1.12em] align-[-0.18em] select-none object-contain ${className}`}
    />
  );
}

interface EmojiTextProps {
  text: string;
  vendor: EmojiVendorOption;
}

export function EmojiText({ text, vendor }: EmojiTextProps) {
  if (vendor.id === 'native' && !vendor.urlTemplate && !vendor.fontFamily) {
    return <>{text}</>;
  }
  const parts = splitTextWithEmojis(text);
  return (
    <>
      {parts.map((part, idx) =>
        part.type === 'emoji' ? (
          <EmojiGlyph key={`${idx}-${part.value}`} emoji={part.value} vendor={vendor} />
        ) : (
          <span key={idx}>{part.value}</span>
        ),
      )}
    </>
  );
}

interface UiEmojiProps {
  emoji: string;
  enabled: boolean;
  vendor: EmojiVendorOption;
  className?: string;
}

export function UiEmoji({ emoji, enabled, vendor, className = '' }: UiEmojiProps) {
  if (!enabled) return null;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center leading-none text-[var(--neuron-text)] ${className}`}
    >
      <EmojiGlyph emoji={emoji} vendor={vendor} />
    </span>
  );
}
