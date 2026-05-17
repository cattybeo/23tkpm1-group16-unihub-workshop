import { openDB } from 'idb';

const DB_NAME = 'unihub-offline-storage';
const STORE_NAME = 'checkins';

export const initDB = async () => {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'client_id' });
      }
    },
  });
};

export const saveOfflineData = async (qrToken: string, workshopId: string) => {
  const db = await initDB();
  const clientId = self.crypto.randomUUID();
  await db.add(STORE_NAME, {
    client_id: clientId,
    qr_token: qrToken,
    workshop_id: workshopId,
    scanned_at: new Date().toISOString()
  });
};