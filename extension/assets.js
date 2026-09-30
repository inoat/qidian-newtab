const DATABASE = 'qidian-assets';
const STORE = 'images';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
let databasePromise;
const objectUrls = new Map();

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

async function transact(mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    let request;
    try { request = callback(transaction.objectStore(STORE)); }
    catch (error) { reject(error); return; }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putImage(file, id = crypto.randomUUID()) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type)) {
    throw new Error('请选择 PNG、JPG、WebP 或 AVIF 图片');
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error('图片不能超过 12 MB');
  await transact('readwrite', store => store.put(file, id));
  const oldUrl = objectUrls.get(id);
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  objectUrls.delete(id);
  return id;
}

export async function getImage(id) {
  return id ? transact('readonly', store => store.get(id)) : null;
}

export async function getImageUrl(id) {
  if (!id) return '';
  if (objectUrls.has(id)) return objectUrls.get(id);
  const blob = await getImage(id);
  if (!blob) return '';
  const url = URL.createObjectURL(blob);
  objectUrls.set(id, url);
  return url;
}

export async function allImages() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readonly');
    const store = transaction.objectStore(STORE);
    const result = {};
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (item) { result[item.key] = item.value; item.continue(); }
      else resolve(result);
    };
    cursor.onerror = () => reject(cursor.error);
  });
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp|avif));base64,([A-Za-z\d+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('备份中包含无效图片');
  const binary = atob(match[2]);
  if (binary.length > MAX_IMAGE_BYTES) throw new Error('备份中的图片过大');
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}
