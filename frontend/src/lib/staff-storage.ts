import type { OfflineCheckInRecord, StaffRosterCache, StaffWorkshopCache } from '@/types/staff';

const DB_NAME = 'unihub-staff';
const DB_VERSION = 3;
const CHECK_IN_STORE_NAME = 'offline-check-ins';
const ROSTER_STORE_NAME = 'workshop-rosters';
const WORKSHOP_STORE_NAME = 'staff-workshops';

function openStaffDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available in this browser'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHECK_IN_STORE_NAME)) {
        db.createObjectStore(CHECK_IN_STORE_NAME, { keyPath: 'client_id' });
      }
      if (!db.objectStoreNames.contains(ROSTER_STORE_NAME)) {
        db.createObjectStore(ROSTER_STORE_NAME, { keyPath: 'workshop_id' });
      }
      if (!db.objectStoreNames.contains(WORKSHOP_STORE_NAME)) {
        db.createObjectStore(WORKSHOP_STORE_NAME, { keyPath: 'date_key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open staff database'));
  });
}

function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openStaffDb().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = operation(store);
    let result: T | undefined;

    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error ?? new Error('Staff storage request failed'));
    transaction.oncomplete = () => {
      db.close();
      resolve(result as T);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('Staff storage transaction failed'));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error('Staff storage transaction was aborted'));
    };
  }));
}

export function listPendingCheckIns(): Promise<OfflineCheckInRecord[]> {
  return withStore<OfflineCheckInRecord[]>(CHECK_IN_STORE_NAME, 'readonly', store => store.getAll());
}

export function savePendingCheckIn(record: OfflineCheckInRecord): Promise<OfflineCheckInRecord> {
  return withStore<IDBValidKey>(CHECK_IN_STORE_NAME, 'readwrite', store => store.put(record)).then(() => record);
}

export function removePendingCheckIns(clientIds: string[]): Promise<void> {
  if (clientIds.length === 0) return Promise.resolve();

  return openStaffDb().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(CHECK_IN_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(CHECK_IN_STORE_NAME);

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
  return withStore<undefined>(CHECK_IN_STORE_NAME, 'readwrite', store => store.clear()).then(() => undefined);
}

export function getWorkshopRoster(workshopId: string): Promise<StaffRosterCache | null> {
  return withStore<StaffRosterCache | undefined>(
    ROSTER_STORE_NAME,
    'readonly',
    store => store.get(workshopId),
  ).then(cache => cache ?? null);
}

export function saveWorkshopRoster(cache: StaffRosterCache): Promise<StaffRosterCache> {
  return withStore<IDBValidKey>(ROSTER_STORE_NAME, 'readwrite', store => store.put(cache)).then(() => cache);
}

export function getStaffWorkshopCache(dateKey: string): Promise<StaffWorkshopCache | null> {
  return withStore<StaffWorkshopCache | undefined>(
    WORKSHOP_STORE_NAME,
    'readonly',
    store => store.get(dateKey),
  ).then(cache => cache ?? null);
}

export function saveStaffWorkshopCache(cache: StaffWorkshopCache): Promise<StaffWorkshopCache> {
  return withStore<IDBValidKey>(WORKSHOP_STORE_NAME, 'readwrite', store => store.put(cache)).then(() => cache);
}
