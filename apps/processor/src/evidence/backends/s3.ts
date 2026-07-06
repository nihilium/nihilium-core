import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import type { HeadResult, PutReceipt, StorageBackend } from '../types';
import type { S3BackendConfig } from '../types';

const PROBE_KEY = '.evidence-probe';

export class S3StorageBackend implements StorageBackend {
  readonly id: string;
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(config: S3BackendConfig) {
    this.id = config.id ?? `s3:${config.bucket}:${config.region}`;
    this.bucket = config.bucket;
    this.prefix = normalizePrefix(config.prefix ?? 'evidence/');
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
    });
  }

  private objectKey(recordId: string): string {
    return `${this.prefix}records/${recordId}.bin`;
  }

  async put(recordId: string, blob: Buffer): Promise<PutReceipt> {
    const key = this.objectKey(recordId);
    const result = (await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: blob,
        ContentLength: blob.length,
      })
    )) as { ETag?: string };
    return {
      backendId: this.id,
      recordId,
      size: blob.length,
      etag: result.ETag ?? recordId,
    };
  }

  async head(recordId: string): Promise<HeadResult> {
    const key = this.objectKey(recordId);
    try {
      const result = (await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      )) as { ContentLength?: number; ETag?: string };
      return {
        recordId,
        size: result.ContentLength ?? 0,
        etag: result.ETag,
        exists: true,
      };
    } catch (err: unknown) {
      const code = (err as { name?: string; $metadata?: { httpStatusCode?: number } }).name;
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (code === 'NotFound' || status === 404) {
        return { recordId, size: 0, exists: false };
      }
      throw err;
    }
  }

  async probe(): Promise<boolean> {
    try {
      const payload = Buffer.from(`${Date.now()}\n`);
      const key = `${this.prefix}${PROBE_KEY}`;
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: payload,
          ContentLength: payload.length,
        })
      );
      return true;
    } catch {
      return false;
    }
  }
}

function normalizePrefix(prefix: string): string {
  if (!prefix.endsWith('/')) {
    return `${prefix}/`;
  }
  return prefix;
}
