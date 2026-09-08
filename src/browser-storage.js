// Some browsers deny even reading window.localStorage. Probe inside the catch
// boundary and keep the entire demo in memory if either store is unavailable.
export function createBrowserStorage(host = window) {
  try {
    const storage = host.localStorage;
    const session = host.sessionStorage;
    for (const store of [storage, session]) {
      const key = `pit-detail-storage-check-${Date.now()}`;
      store.setItem(key, '1');
      if (store.getItem(key) !== '1') throw new Error('Storage unavailable');
      store.removeItem(key);
    }
    return { storage, session, temporary: false };
  } catch {
    const memory = () => {
      const values = new Map();
      return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
      };
    };
    return { storage: memory(), session: memory(), temporary: true };
  }
}
