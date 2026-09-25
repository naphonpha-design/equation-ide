import type { FileEncoding } from "../encoding/tis620";

export interface ModelFile {
  id: string;
  name: string;
  source: string;
  /** The encoding this file was opened from, used as the default when saving. */
  encoding: FileEncoding;
  updatedAt: number;
}

const STORAGE_KEY = "equatran-ide.files.v1";
const ACTIVE_KEY = "equatran-ide.activeFile.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing, or the quota is full. The editor still works; the
    // work simply is not remembered between visits.
  }
}

export function loadFiles(): ModelFile[] {
  return read<ModelFile[]>(STORAGE_KEY, []);
}

export function saveFiles(files: ModelFile[]): void {
  write(STORAGE_KEY, files);
}

export function loadActiveFileId(): string | undefined {
  return read<string | undefined>(ACTIVE_KEY, undefined);
}

export function saveActiveFileId(id: string): void {
  write(ACTIVE_KEY, id);
}

export function createFile(
  name: string,
  source: string,
  encoding: FileEncoding = "utf-8",
): ModelFile {
  return {
    id: crypto.randomUUID(),
    name,
    source,
    encoding,
    updatedAt: Date.now(),
  };
}

/** Makes `name` unique among `existing` by adding a numeric suffix. */
export function uniqueName(name: string, existing: readonly ModelFile[]): string {
  const taken = new Set(existing.map((file) => file.name));
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  const extension = dot === -1 ? "" : name.slice(dot);
  for (let n = 2; ; n += 1) {
    const candidate = `${stem} (${n})${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}
