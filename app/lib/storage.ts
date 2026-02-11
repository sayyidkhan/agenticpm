import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Storage abstraction layer.
 *
 * Set STORAGE_BACKEND=blob  (+ BLOB_READ_WRITE_TOKEN) to use Vercel Blob.
 * Default (STORAGE_BACKEND=local or unset) uses the local filesystem.
 */

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface StorageProvider {
  /** List all file names (not paths) in the storage root. */
  list(): Promise<string[]>;
  /** Check whether a file exists. */
  exists(fileName: string): Promise<boolean>;
  /** Read a file and return its contents as a Buffer. */
  read(fileName: string): Promise<Buffer>;
  /** Write (create or overwrite) a file from a Buffer. */
  write(fileName: string, data: Buffer): Promise<void>;
  /** Delete a file. Returns true if it existed. */
  remove(fileName: string): Promise<boolean>;
  /** Rename / move a file. */
  rename(oldName: string, newName: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Local filesystem provider
// ---------------------------------------------------------------------------

const LOCAL_STORAGE_DIR = path.resolve(process.cwd(), "storage");

function ensureLocalDir() {
  if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  }
}

const localProvider: StorageProvider = {
  async list() {
    ensureLocalDir();
    return fs.readdirSync(LOCAL_STORAGE_DIR).filter((f) => !f.startsWith("."));
  },

  async exists(fileName) {
    ensureLocalDir();
    return fs.existsSync(path.join(LOCAL_STORAGE_DIR, fileName));
  },

  async read(fileName) {
    ensureLocalDir();
    return fs.readFileSync(path.join(LOCAL_STORAGE_DIR, fileName));
  },

  async write(fileName, data) {
    ensureLocalDir();
    fs.writeFileSync(path.join(LOCAL_STORAGE_DIR, fileName), data);
  },

  async remove(fileName) {
    const filePath = path.join(LOCAL_STORAGE_DIR, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  },

  async rename(oldName, newName) {
    ensureLocalDir();
    fs.renameSync(
      path.join(LOCAL_STORAGE_DIR, oldName),
      path.join(LOCAL_STORAGE_DIR, newName),
    );
  },
};

// ---------------------------------------------------------------------------
// Vercel Blob provider
// ---------------------------------------------------------------------------

// We lazy-import @vercel/blob so the local path never requires it.
let blobMod: typeof import("@vercel/blob") | null = null;

async function getBlob() {
  if (!blobMod) {
    blobMod = await import("@vercel/blob");
  }
  return blobMod;
}

const BLOB_PREFIX = "storage/";

const blobProvider: StorageProvider = {
  async list() {
    const { list } = await getBlob();
    const allBlobs: string[] = [];
    let cursor: string | undefined;
    // Paginate through all blobs
    do {
      const res = await list({ prefix: BLOB_PREFIX, cursor, limit: 1000 });
      for (const blob of res.blobs) {
        const name = blob.pathname.replace(BLOB_PREFIX, "");
        if (name) allBlobs.push(name);
      }
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);
    return allBlobs;
  },

  async exists(fileName) {
    const { head } = await getBlob();
    try {
      // head() throws if not found — we need the url.
      // We'll list with exact prefix instead.
      const { list } = await getBlob();
      const res = await list({ prefix: BLOB_PREFIX + fileName, limit: 1 });
      return res.blobs.some((b) => b.pathname === BLOB_PREFIX + fileName);
    } catch {
      return false;
    }
  },

  async read(fileName) {
    // First get the blob URL via list, then fetch its content
    const { list: listBlobs } = await getBlob();
    const res = await listBlobs({ prefix: BLOB_PREFIX + fileName, limit: 1 });
    const blob = res.blobs.find((b) => b.pathname === BLOB_PREFIX + fileName);
    if (!blob) {
      throw new Error(`Blob not found: ${fileName}`);
    }
    const response = await fetch(blob.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  },

  async write(fileName, data) {
    const { put } = await getBlob();
    await put(BLOB_PREFIX + fileName, data, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  },

  async remove(fileName) {
    const { del, list: listBlobs } = await getBlob();
    const res = await listBlobs({ prefix: BLOB_PREFIX + fileName, limit: 1 });
    const blob = res.blobs.find((b) => b.pathname === BLOB_PREFIX + fileName);
    if (blob) {
      await del(blob.url);
      return true;
    }
    return false;
  },

  async rename(oldName, newName) {
    // Blob storage has no rename — copy then delete
    const data = await this.read(oldName);
    await this.write(newName, data);
    await this.remove(oldName);
  },
};

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

function getBackend(): "blob" | "local" {
  if (process.env.STORAGE_BACKEND) {
    return process.env.STORAGE_BACKEND === "blob" ? "blob" : "local";
  }
  // Auto-detect: use blob on Vercel, local otherwise
  return process.env.VERCEL ? "blob" : "local";
}

export function getStorage(): StorageProvider {
  return getBackend() === "blob" ? blobProvider : localProvider;
}
