import type { CustomSoundPack } from '../types/neuron';

const DB_NAME = 'neuron-sounds-db';
const DB_VERSION = 1;
const STORE_NAME = 'sounds';

function openSoundDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open sound DB'));
  });
}

export async function loadCustomSoundPacks(): Promise<CustomSoundPack[]> {
  try {
    const db = await openSoundDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = Array.isArray(req.result) ? (req.result as CustomSoundPack[]) : [];
        resolve(items.sort((a, b) => a.createdAt - b.createdAt));
      };
      req.onerror = () => reject(req.error ?? new Error('Failed to load sounds'));
    });
  } catch {
    return [];
  }
}

export async function saveCustomSoundPack(pack: CustomSoundPack): Promise<void> {
  try {
    const db = await openSoundDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(pack);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save sound'));
    });
  } catch {
    // Ignore IndexedDB write failures
  }
}

export async function deleteCustomSoundPack(id: string): Promise<void> {
  try {
    const db = await openSoundDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to delete sound'));
    });
  } catch {
    // Ignore IndexedDB delete failures
  }
}

export function sanitizeSoundPackLabel(fileName: string): string {
  const stem = fileName.replace(/\.[a-z0-9]+$/i, '').trim().toLowerCase();
  const clean = stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').slice(0, 22);
  return clean || 'custom sound';
}

export function readAudioFileAsCustomSound(file: File): Promise<CustomSoundPack> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        reject(new Error('Could not read audio file'));
        return;
      }
      const now = Date.now();
      resolve({
        id: `custom-sound-${now}-${Math.random().toString(36).slice(2, 6)}`,
        label: sanitizeSoundPackLabel(file.name),
        fileName: file.name,
        mimeType: file.type || 'audio/mpeg',
        dataUrl,
        createdAt: now,
      });
    };
    reader.onerror = () => reject(new Error('Could not read audio file'));
    reader.readAsDataURL(file);
  });
}
