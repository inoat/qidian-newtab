const DATABASE = 'qidian-snapshots';
const STORE = 'history';
let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

async function requestInStore(mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = callback(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listSnapshots() {
  const entries = await requestInStore('readonly', store => store.getAll());
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveSnapshot(state, reason = '手动快照') {
  const entry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    reason,
    state: structuredClone(state)
  };
  await requestInStore('readwrite', store => store.put(entry));
  const entries = await listSnapshots();
  for (const old of entries.slice(20)) await requestInStore('readwrite', store => store.delete(old.id));
  return entry;
}

export function getSnapshot(id) {
  return requestInStore('readonly', store => store.get(id));
}
