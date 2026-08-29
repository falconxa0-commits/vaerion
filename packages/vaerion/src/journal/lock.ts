/**
 * Vaerion — single-writer lock for journals.
 *
 * Law: one writer per journal, ever (ratified). The lock is an O_EXCL-created
 * sidecar file `<journal>.lock` containing {pid, acquired_at}. A held lock is
 * E1000. Recovery tooling may clear a lock whose owner is provably dead —
 * with the check written down here, not improvised at call sites.
 */

import { open, unlink, readFile } from "node:fs/promises";
import fs from "node:fs";
import { VaerionError } from "../kernel/errors.ts";

export interface JournalLockHandle {
  release(): Promise<void>;
  path: string;
}

interface LockBody {
  pid: number;
  acquired_at: string;
}

export async function acquireJournalLock(journalPath: string): Promise<JournalLockHandle> {
  const lockPath = journalPath + ".lock";
  const body: LockBody = { pid: process.pid, acquired_at: new Date().toISOString() };
  try {
    const fh = await open(lockPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o644);
    try {
      await fh.write(JSON.stringify(body) + "\n");
    } finally {
      await fh.close();
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "EEXIST") {
      throw new VaerionError("E1000", `journal is locked by another writer (${lockPath})`, {
        lock_path: lockPath,
      });
    }
    throw err;
  }
  return {
    path: lockPath,
    async release(): Promise<void> {
      await unlink(lockPath);
    },
  };
}

export function readLockBody(lockPath: string): Promise<LockBody | null> {
  return readFile(lockPath, "utf8")
    .then((raw) => JSON.parse(raw) as LockBody)
    .catch(() => null);
}

/** True when the recorded owner process is gone (best-effort, POSIX). */
export async function lockOwnerDead(lockPath: string): Promise<boolean> {
  const body = await readLockBody(lockPath);
  if (!body || !Number.isInteger(body.pid)) return true; // unparseable lock cannot prove ownership
  try {
    process.kill(body.pid, 0);
    return false;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    return e.code !== "EPERM"; // EPERM => alive but owned by another user
  }
}
