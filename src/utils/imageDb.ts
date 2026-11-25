import type { StoredImage } from './images';

const DB_NAME = 'neuron.media.v1';
const STORE_NAME = 'images';
const FALLBACK_KEY = 'neuron.images.fallback.v1';

function openMediaDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function loadFallbackImages(): StoredImage[] {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredImage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFallbackImages(images: StoredImage[]): void {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(images));
  } catch {
    // Ignore storage quota errors
  }
}

export async function loadStoredImages(): Promise<StoredImage[]> {
  const db = await openMediaDb();
  if (!db) {
    return loadFallbackImages();
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const result = (req.result as StoredImage[]) ?? [];
        resolve(result);
      };
      req.onerror = () => resolve(loadFallbackImages());
    } catch {
      resolve(loadFallbackImages());
    }
  });
}

export async function saveStoredImage(image: StoredImage): Promise<void> {
  const db = await openMediaDb();
  if (!db) {
    const current = loadFallbackImages().filter((i) => i.id !== image.id);
    saveFallbackImages([image, ...current]);
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(image);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function deleteStoredImage(imageId: string): Promise<void> {
  const db = await openMediaDb();
  if (!db) {
    const current = loadFallbackImages().filter((i) => i.id !== imageId);
    saveFallbackImages(current);
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(imageId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function readImageFileAsStoredImage(
  file: File,
): Promise<StoredImage> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read image data'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });

  const dims = await new Promise<{
    width: number;
    height: number;
    dataUrl: string;
    mimeType: string;
  }>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      const maxDim = 1920;
      if (w > maxDim || h > maxDim) {
        const scale = Math.min(maxDim / w, maxDim / h);
        const targetW = Math.round(w * scale);
        const targetH = Math.round(h * scale);
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const outMime =
            file.type === 'image/png' ? 'image/png' : 'image/webp';
          try {
            const compressed = canvas.toDataURL(outMime, 0.88);
            resolve({
              width: targetW,
              height: targetH,
              dataUrl: compressed,
              mimeType: outMime,
            });
            return;
          } catch {
            // Fall through to rawDataUrl
          }
        }
      }
      resolve({
        width: w,
        height: h,
        dataUrl: rawDataUrl,
        mimeType: file.type || 'image/png',
      });
    };
    img.onerror = () =>
      resolve({
        width: 0,
        height: 0,
        dataUrl: rawDataUrl,
        mimeType: file.type || 'image/png',
      });
    img.src = rawDataUrl;
  });

  const shortRand = Math.random().toString(36).slice(2, 6);
  const shortTime = (Date.now() % 1679616).toString(36).padStart(3, '0');
  const id = `${shortTime}${shortRand}`;

  return {
    id,
    name: file.name || `image-${id}.png`,
    mimeType: dims.mimeType,
    dataUrl: dims.dataUrl,
    width: dims.width,
    height: dims.height,
    sizeBytes: file.size || dims.dataUrl.length,
    createdAt: Date.now(),
  };
}
