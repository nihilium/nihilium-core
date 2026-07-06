import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { LocalStorageBackend } from './backends/local';
import { QuorumEvidenceStore } from './quorum-store';
import { QuorumNotMetError } from './types';
import type { HeadResult, PutReceipt, StorageBackend } from './types';

class FailingBackend implements StorageBackend {
  readonly id = 'fail:mock';
  async put(): Promise<PutReceipt> {
    throw new Error('backend unavailable');
  }
  async head(): Promise<HeadResult> {
    return { recordId: '', size: 0, exists: false };
  }
  async probe(): Promise<boolean> {
    return false;
  }
}

describe('QuorumEvidenceStore', () => {
  let tempRoots: string[] = [];

  after(async () => {
    for (const root of tempRoots) {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  async function makeLocalBackend(): Promise<LocalStorageBackend> {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'evidence-'));
    tempRoots.push(root);
    const backend = new LocalStorageBackend(root);
    await backend.ensureReady();
    return backend;
  }

  it('persists when W-of-N quorum is met (3/3)', async () => {
    const b1 = await makeLocalBackend();
    const b2 = await makeLocalBackend();
    const b3 = await makeLocalBackend();
    const store = new QuorumEvidenceStore(
      { quorum: { requiredAcks: 3, totalBackends: 3 }, backends: [] },
      [b1, b2, b3]
    );
    const record = await store.persist({
      op: 'seal',
      request: { test: true },
      response: { ok: 1 },
      meta: {},
    });
    assert.ok(record.id.length === 64);
    const h1 = await b1.head(record.id);
    assert.equal(h1.exists, true);
  });

  it('throws QuorumNotMetError when acks < W (2/3)', async () => {
    const b1 = await makeLocalBackend();
    const b2 = await makeLocalBackend();
    const store = new QuorumEvidenceStore(
      { quorum: { requiredAcks: 3, totalBackends: 3 }, backends: [] },
      [b1, b2, new FailingBackend()]
    );
    await assert.rejects(
      () =>
        store.persist({
          op: 'unseal',
          request: {},
          response: { unpacked_private_scalar: '1' },
          meta: {},
        }),
      (err: unknown) => {
        assert.ok(err instanceof QuorumNotMetError);
        assert.equal((err as QuorumNotMetError).acked, 2);
        assert.equal((err as QuorumNotMetError).requiredAcks, 3);
        return true;
      }
    );
  });

  it('persists with 3/5 quorum when three backends succeed', async () => {
    const backends: StorageBackend[] = [];
    for (let i = 0; i < 3; i++) {
      backends.push(await makeLocalBackend());
    }
    backends.push(new FailingBackend(), new FailingBackend());
    const store = new QuorumEvidenceStore(
      { quorum: { requiredAcks: 3, totalBackends: 5 }, backends: [] },
      backends
    );
    const record = await store.persist({
      op: 'unseal',
      request: { proofs: [] },
      response: { unpacked_private_scalar: '42' },
      meta: { chainId: '43113' },
    });
    assert.ok(record.id);
  });
});
