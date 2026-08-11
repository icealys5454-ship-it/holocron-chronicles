// IndexedDB-backed save-state store (port of @holocron/storage).

export interface StateRecord {
  id: string;
  romName: string;
  createdAt: number;
  bytes: Uint8Array;
}

export class StateStore {
  private db: IDBDatabase | null = null;

  constructor(private name = "holocron-states") {}

  async open(): Promise<StateStore> {
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(this.name, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains("states"))
          r.result.createObjectStore("states", { keyPath: "id" });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return this;
  }

  private require(): IDBDatabase {
    if (!this.db) throw new Error("State store not opened.");
    return this.db;
  }

  async put(record: StateRecord): Promise<void> {
    const db = this.require();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("states", "readwrite");
      tx.objectStore("states").put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async get(id: string): Promise<StateRecord | undefined> {
    const db = this.require();
    return await new Promise((resolve, reject) => {
      const r = db.transaction("states").objectStore("states").get(id);
      r.onsuccess = () => resolve(r.result as StateRecord | undefined);
      r.onerror = () => reject(r.error);
    });
  }

  async list(): Promise<StateRecord[]> {
    const db = this.require();
    return await new Promise((resolve, reject) => {
      const r = db.transaction("states").objectStore("states").getAll();
      r.onsuccess = () => resolve((r.result as StateRecord[]) ?? []);
      r.onerror = () => reject(r.error);
    });
  }
}
