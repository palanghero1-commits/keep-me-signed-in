const ADMIN_PERSISTENCE_KEY = "kitchen_admin_persistence";
const KITCHEN_USER_LOCAL_KEY = "kitchen_user";
const KITCHEN_USER_SESSION_KEY = "kitchen_user_session";

type BrowserStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function hasWindow() {
  return typeof window !== "undefined";
}

function getLocalStore(): BrowserStore {
  if (!hasWindow()) return memoryStore;
  return window.localStorage;
}

function getSessionStore(): BrowserStore {
  if (!hasWindow()) return memoryStore;
  return window.sessionStorage;
}

function getAdminPersistenceMode() {
  return getLocalStore().getItem(ADMIN_PERSISTENCE_KEY) === "session" ? "session" : "local";
}

const memoryValues = new Map<string, string>();
const memoryStore: BrowserStore = {
  getItem: (key) => memoryValues.get(key) ?? null,
  setItem: (key, value) => {
    memoryValues.set(key, value);
  },
  removeItem: (key) => {
    memoryValues.delete(key);
  },
};

export function setAdminSessionPersistence(keepSignedIn: boolean) {
  getLocalStore().setItem(ADMIN_PERSISTENCE_KEY, keepSignedIn ? "local" : "session");
}

export const adminSessionStorage: Storage = {
  get length() {
    const keys = new Set<string>();
    if (hasWindow()) {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key) keys.add(key);
      }
      for (let index = 0; index < window.sessionStorage.length; index += 1) {
        const key = window.sessionStorage.key(index);
        if (key) keys.add(key);
      }
    }
    return keys.size;
  },
  clear() {
    if (!hasWindow()) return;
    for (const store of [window.localStorage, window.sessionStorage]) {
      const keys = Object.keys(store).filter((key) => key.startsWith("sb-"));
      keys.forEach((key) => store.removeItem(key));
    }
  },
  getItem(key: string) {
    return getLocalStore().getItem(key) ?? getSessionStore().getItem(key);
  },
  key(index: number) {
    if (!hasWindow()) return null;
    const keys = Array.from(
      new Set([
        ...Object.keys(window.localStorage),
        ...Object.keys(window.sessionStorage),
      ]),
    );
    return keys[index] ?? null;
  },
  removeItem(key: string) {
    getLocalStore().removeItem(key);
    getSessionStore().removeItem(key);
  },
  setItem(key: string, value: string) {
    const targetStore = getAdminPersistenceMode() === "local" ? getLocalStore() : getSessionStore();
    const otherStore = targetStore === getLocalStore() ? getSessionStore() : getLocalStore();
    targetStore.setItem(key, value);
    otherStore.removeItem(key);
  },
};

export interface StoredKitchenUser {
  id: string;
  username: string;
}

export function readStoredKitchenUser() {
  const rawValue =
    getLocalStore().getItem(KITCHEN_USER_LOCAL_KEY) ??
    getSessionStore().getItem(KITCHEN_USER_SESSION_KEY);

  if (!rawValue) return null;

  try {
    return JSON.parse(rawValue) as StoredKitchenUser;
  } catch {
    clearStoredKitchenUser();
    return null;
  }
}

export function storeKitchenUser(user: StoredKitchenUser, keepSignedIn: boolean) {
  const serialized = JSON.stringify(user);
  if (keepSignedIn) {
    getLocalStore().setItem(KITCHEN_USER_LOCAL_KEY, serialized);
    getSessionStore().removeItem(KITCHEN_USER_SESSION_KEY);
    return;
  }

  getSessionStore().setItem(KITCHEN_USER_SESSION_KEY, serialized);
  getLocalStore().removeItem(KITCHEN_USER_LOCAL_KEY);
}

export function clearStoredKitchenUser() {
  getLocalStore().removeItem(KITCHEN_USER_LOCAL_KEY);
  getSessionStore().removeItem(KITCHEN_USER_SESSION_KEY);
}
