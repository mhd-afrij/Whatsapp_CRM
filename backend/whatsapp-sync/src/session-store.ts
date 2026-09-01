import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type SyncSessionState = "unlinked" | "connecting" | "linked";

export interface SyncSessionRecord {
  state: SyncSessionState;
  deviceName: string | null;
  linkedAt: string | null;
  lastSeenAt: string | null;
  qrPending: boolean;
  qrCode: string | null;
  updatedAt: string;
}

const DEFAULT_SESSION: SyncSessionRecord = {
  state: "unlinked",
  deviceName: null,
  linkedAt: null,
  lastSeenAt: null,
  qrPending: false,
  qrCode: null,
  updatedAt: new Date(0).toISOString(),
};

export class SessionStore {
  constructor(private readonly filePath: string) {}

  private async ensureDirectory() {
    await mkdir(dirname(resolve(this.filePath)), { recursive: true });
  }

  async load(): Promise<SyncSessionRecord> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<SyncSessionRecord>;
      return {
        ...DEFAULT_SESSION,
        ...parsed,
        updatedAt: parsed.updatedAt ?? DEFAULT_SESSION.updatedAt,
      };
    } catch {
      return { ...DEFAULT_SESSION };
    }
  }

  async save(record: SyncSessionRecord): Promise<void> {
    await this.ensureDirectory();
    await writeFile(this.filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }
}

export function createSessionRecord(
  current: SyncSessionRecord,
  patch: Partial<SyncSessionRecord>
): SyncSessionRecord {
  return {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}
