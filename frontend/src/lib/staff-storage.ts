import type { OfflineCheckInRecord } from '@/types/staff';

const DB_NAME = 'unihub-staff';
const DB_VERSION = 1;
const STORE_NAME = 'offline-check-ins';

function openStaffDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available in this browser'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'client_id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open staff database'));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openStaffDb().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = operation(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Staff storage request failed'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('Staff storage transaction failed'));
    };
  }));
}

export function listPendingCheckIns(): Promise<OfflineCheckInRecord[]> {
  return withStore<OfflineCheckInRecord[]>('readonly', store => store.getAll());
}

export function savePendingCheckIn(record: OfflineCheckInRecord): Promise<OfflineCheckInRecord> {
  return withStore<IDBValidKey>('readwrite', store => store.put(record)).then(() => record);
}

export function removePendingCheckIns(clientIds: string[]): Promise<void> {
  if (clientIds.length === 0) return Promise.resolve();

  return openStaffDb().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    clientIds.forEach(clientId => store.delete(clientId));

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('Unable to remove staff records'));
    };
  }));
}

export function clearStaffQueue(): Promise<void> {
  return withStore<undefined>('readwrite', store => store.clear()).then(() => undefined);
}
