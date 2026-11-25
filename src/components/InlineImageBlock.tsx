import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import type { StoredImage } from '../utils/images';

interface InlineImageBlockProps {
  imageId: string;
  alt: string;
  image?: StoredImage;
  onInspect: (image: StoredImage) => void;
  onRename: (imageId: string, nextName: string) => void;
  onRemove: () => void;
  onMediaLoad?: () => void;
}

export function InlineImageBlock({
  imageId,
  alt,
  image,
  onInspect,
  onRename,
  onRemove,
  onMediaLoad,
}: InlineImageBlockProps) {
  const initialName = image?.name && image.name !== 'image' ? image.name : alt !== 'image' ? alt : '';
  const [draftName, setDraftName] = useState(initialName);

  useEffect(() => {
    const synced =
      image?.name && image.name !== 'image'
        ? image.name
        : alt !== 'image'
          ? alt
          : '';
    setDraftName(synced);
  }, [image?.name, alt]);

  if (!image) {
    return (
      <div
        data-testid={`note-image-missing-${imageId}`}
        className="group relative my-3 inline-flex items-center gap-2 rounded border px-3 py-2 text-xs"
        style={{
          borderColor: 'var(--neuron-border)',
          color: 'var(--neuron-muted)',
        }}
      >
        <span>missing photo ({alt || imageId})</span>
        <button
          type="button"
          aria-label="Remove missing image"
          onClick={onRemove}
          className="cursor-pointer opacity-70 hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <motion.figure
      layout="position"
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30, mass: 0.65 }}
      data-testid={`note-image-block-${imageId}`}
      className="group relative my-3 inline-flex min-h-[84px] min-w-[120px] max-w-full items-center justify-center self-start overflow-hidden align-top select-none"
    >
      <img
        src={image.dataUrl}
        alt={draftName || 'note photo'}
        onClick={() => onInspect(image)}
        onLoad={onMediaLoad}
        style={
          image.width > 0 && image.height > 0
            ? { aspectRatio: `${image.width} / ${image.height}` }
            : undefined
        }
        className="block max-h-[28rem] w-auto max-w-full cursor-pointer object-contain"
      />

      {/* Subtle remove button on hover */}
      <button
        type="button"
        aria-label={`Remove ${draftName || image.name} from note`}
        data-testid={`note-image-remove-${imageId}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-2 right-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-black/65 text-white opacity-0 backdrop-blur-xs transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {/* Hover bottom translucent bar with inline editable name input */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-center bg-black/65 px-3 py-2 opacity-0 backdrop-blur-xs transition-all duration-180 group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          value={draftName}
          placeholder="name"
          aria-label="Image name"
          data-testid={`note-image-name-${imageId}`}
          onChange={(e) => {
            const val = e.target.value;
            setDraftName(val);
            onRename(imageId, val);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          className="w-full bg-transparent text-sm text-white placeholder:text-white/60 focus:outline-none"
        />
      </div>
    </motion.figure>
  );
}
