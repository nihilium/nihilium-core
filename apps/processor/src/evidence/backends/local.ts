import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import type { HeadResult, PutReceipt, StorageBackend } from '../types';

const RECORDS_DIR = 'records';
const INDEX_FILE = 'index.jsonl';
const PROBE_FILE = '.probe';

async function fsyncFile(filePath: string): Promise<void> {
  const handle = await fsp.open(filePath, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function fsyncParentDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  const handle = await fsp.open(dir, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class LocalStorageBackend implements StorageBackend {
  readonly id: string;
  private readonly rootPath: string;
  private readonly recordsPath: string;
  private readonly indexPath: string;

  constructor(rootPath: string, id?: string) {
    this.rootPath = path.resolve(rootPath);
    this.id = id ?? `local:${this.rootPath}`;
    this.recordsPath = path.join(this.rootPath, RECORDS_DIR);
    this.indexPath = path.join(this.rootPath, INDEX_FILE);
  }

  async ensureReady(): Promise<void> {
    await fsp.mkdir(this.recordsPath, { recursive: true, mode: 0o700 });
  }

  private recordPath(recordId: string): string {
    return path.join(this.recordsPath, `${recordId}.json`);
  }

  async put(recordId: string, blob: Buffer): Promise<PutReceipt> {
    await this.ensureReady();
    const finalPath = this.recordPath(recordId);
    const tmpPath = `${finalPath}.tmp`;

    await fsp.writeFile(tmpPath, blob, { mode: 0o600 });
    await fsyncFile(tmpPath);
    await fsp.rename(tmpPath, finalPath);
    await fsyncParentDir(finalPath);

    const indexLine =
      JSON.stringify({
        id: recordId,
        size: blob.length,
        at: new Date().toISOString(),
      }) + '\n';
    await fsp.appendFile(this.indexPath, indexLine, { mode: 0o600 });
    await fsyncFile(this.indexPath);

    return {
      backendId: this.id,
      recordId,
      size: blob.length,
      etag: recordId,
    };
  }

  async head(recordId: string): Promise<HeadResult> {
    const finalPath = this.recordPath(recordId);
    try {
      const stat = await fsp.stat(finalPath);
      return {
        recordId,
        size: stat.size,
        etag: recordId,
        exists: true,
      };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { recordId, size: 0, exists: false };
      }
      throw err;
    }
  }

  async probe(): Promise<boolean> {
    try {
      await this.ensureReady();
      const probePath = path.join(this.rootPath, PROBE_FILE);
      const payload = Buffer.from(`${Date.now()}\n`);
      await fsp.writeFile(probePath, payload, { mode: 0o600 });
      await fsyncFile(probePath);
      await fsp.unlink(probePath);
      return true;
    } catch {
      return false;
    }
  }
}
