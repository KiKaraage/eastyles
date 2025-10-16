declare module "wxt/utils/storage" {
  export interface StorageItem<T> {
    getValue: () => Promise<T>;
    setValue: (value: T) => Promise<void>;
    getMeta: () => Promise<{ readonly: boolean }>;
    watch: (callback: (newValue: T, oldValue: T) => void) => () => void;
  }

  export interface Storage {
    defineItem: <T>(
      key: string,
      options?: { fallback?: T; version?: number },
    ) => StorageItem<T>;
    getItem: <T>(key: string, options?: { fallback?: T }) => Promise<T>;
    setItem: <T>(key: string, value: T) => Promise<void>;
  }

  export const storage: Storage;
}
