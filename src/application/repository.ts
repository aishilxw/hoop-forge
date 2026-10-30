import type { Catalog, CareerState } from '../contracts';
import { validateSave } from './save';
const DB_NAME = 'hoop-forge-careers-v2';
const STORE = 'snapshots';
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('无法打开生涯数据库，请检查浏览器存储权限。'));
  });
}
export async function loadStoredCareer(catalog: Catalog): Promise<CareerState | null> {
  const db = await openDatabase();
  try {
    const raw = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get('active');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return raw ? validateSave(raw, catalog) : null;
  } finally {
    db.close();
  }
}
/** Active and backup commit in one IndexedDB transaction; failure changes neither. */
export async function storeCareer(state: CareerState): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const object = tx.objectStore(STORE);
      const get = object.get('active');
      get.onsuccess = () => {
        if (get.result) object.put(get.result, 'backup');
        object.put(structuredClone(state), 'active');
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('保存失败，原存档已保留。请检查可用空间。'));
      tx.onabort = () => reject(new Error('保存事务中止，原存档未改变。'));
    });
  } finally {
    db.close();
  }
}
