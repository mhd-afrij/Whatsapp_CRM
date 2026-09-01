import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * @typedef {"unlinked" | "connecting" | "linked"} SyncSessionState
 *
 * @typedef {{
 *   state: SyncSessionState,
 *   deviceName: string | null,
 *   linkedAt: string | null,
 *   lastSeenAt: string | null,
 *   qrPending: boolean,
 *   qrCode: string | null,
 *   updatedAt: string
 * }} SyncSessionRecord
 */

const DEFAULT_SESSION = {
  state: "unlinked",
  deviceName: null,
  linkedAt: null,
  lastSeenAt: null,
  qrPending: false,
  qrCode: null,
  updatedAt: new Date(0).toISOString(),
};

export class SessionStore {
  /** @param {string} filePath */
  constructor(filePath) {
    this.filePath = filePath;
  }

  async ensureDirectory() {
    await mkdir(dirname(resolve(this.filePath)), { recursive: true });
  }

  /** @returns {Promise<SyncSessionRecord>} */
  async load() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SESSION,
        ...parsed,
        updatedAt: parsed.updatedAt ?? DEFAULT_SESSION.updatedAt,
      };
    } catch {
      return { ...DEFAULT_SESSION };
    }
  }

  /** @param {SyncSessionRecord} record */
  async save(record) {
    await this.ensureDirectory();
    await writeFile(this.filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }
}

/**
 * @param {SyncSessionRecord} current
 * @param {Partial<SyncSessionRecord>} patch
 * @returns {SyncSessionRecord}
 */
export function createSessionRecord(current, patch) {
  return {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}
