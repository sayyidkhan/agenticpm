// --- Session Lock ---

interface SessionLock {
  sessionId: string;
  username: string;
  lockedAt: number;
}

const SESSION_LOCK_TIMEOUT = 5 * 1000; // 5 seconds - short timeout so locks expire quickly after logout
const sessionLocks = new Map<string, SessionLock>();

export function acquireSessionLock(fileName: string, sessionId: string, username?: string): { success: boolean; lockedBy?: string; lockedByUser?: string } {
  const existing = sessionLocks.get(fileName);
  if (existing) {
    // Same session — allow
    if (existing.sessionId === sessionId) {
      existing.lockedAt = Date.now();
      if (username) existing.username = username;
      return { success: true };
    }
    // Stale lock — override
    if (Date.now() - existing.lockedAt > SESSION_LOCK_TIMEOUT) {
      sessionLocks.set(fileName, { sessionId, username: username || "Unknown", lockedAt: Date.now() });
      return { success: true };
    }
    // Locked by another session
    return { success: false, lockedBy: existing.sessionId, lockedByUser: existing.username };
  }
  sessionLocks.set(fileName, { sessionId, username: username || "Unknown", lockedAt: Date.now() });
  return { success: true };
}

export function releaseSessionLock(fileName: string, sessionId: string): void {
  const existing = sessionLocks.get(fileName);
  if (existing && existing.sessionId === sessionId) {
    sessionLocks.delete(fileName);
  }
}

export function refreshSessionLock(fileName: string, sessionId: string, username?: string): boolean {
  const existing = sessionLocks.get(fileName);
  if (existing && existing.sessionId === sessionId) {
    existing.lockedAt = Date.now();
    if (username) existing.username = username;
    return true;
  }
  return false;
}

export function deleteSessionLock(fileName: string): void {
  sessionLocks.delete(fileName);
}

export function transferSessionLock(oldFileName: string, newFileName: string): void {
  const lock = sessionLocks.get(oldFileName);
  if (lock) {
    sessionLocks.delete(oldFileName);
    sessionLocks.set(newFileName, lock);
  }
}
