import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { config } from '../../config/index.js';
import type { StorageProvider } from './storage-provider.interface.js';

export interface S3CompatibleStorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBaseUrl: string;
  forcePathStyle: boolean;
  autoCreateBucket: boolean;
  missingConfigLabels?: Partial<Record<'endpoint' | 'accessKeyId' | 'secretAccessKey' | 'bucketName', string>>;
}

export class S3CompatibleStorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly endpoint: string;
  private readonly storageConfig: S3CompatibleStorageConfig;
  private bucketChecked = false;

  constructor(storageConfig: S3CompatibleStorageConfig = config.storage) {
    this.storageConfig = storageConfig;
    this.client = new S3Client({
      endpoint: storageConfig.endpoint,
      region: storageConfig.region,
      credentials: {
        accessKeyId: storageConfig.accessKeyId,
        secretAccessKey: storageConfig.secretAccessKey,
      },
      forcePathStyle: storageConfig.forcePathStyle,
    });
    this.bucketName = storageConfig.bucketName;
    this.endpoint = storageConfig.endpoint.replace(/\/+$/, '');
  }

  private async ensureBucketExists() {
    if (this.bucketChecked) return;
    this.assertConfigured();

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
    } catch (error: unknown) {
      // R2 buckets should be provisioned explicitly; auto-create is only for alternate dev storage.
      if (isMissingBucketError(error) && this.storageConfig.autoCreateBucket) {
        console.log(`Bucket "${this.bucketName}" not found. Creating it...`);
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucketName }));
        console.log(`Bucket "${this.bucketName}" created successfully.`);
      } else if (isMissingBucketError(error)) {
        throw new Error(
          `Bucket "${this.bucketName}" was not found. Create it in Cloudflare R2 or configure the correct S3 bucket.`,
        );
      } else {
        throw error;
      }
    }
    this.bucketChecked = true;
  }

  private assertConfigured() {
    const missingKeys = [
      [this.storageConfig.missingConfigLabels?.endpoint || 'S3_ENDPOINT', this.storageConfig.endpoint],
      [this.storageConfig.missingConfigLabels?.accessKeyId || 'S3_ACCESS_KEY_ID', this.storageConfig.accessKeyId],
      [
        this.storageConfig.missingConfigLabels?.secretAccessKey || 'S3_SECRET_ACCESS_KEY',
        this.storageConfig.secretAccessKey,
      ],
      [this.storageConfig.missingConfigLabels?.bucketName || 'S3_BUCKET_NAME', this.storageConfig.bucketName],
    ].filter(([, value]) => !value);

    if (missingKeys.length > 0) {
      throw new Error(
        `Storage is not configured. Missing: ${missingKeys.map(([key]) => key).join(', ')}`,
      );
    }
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.ensureBucketExists();

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    return buildStorageUrl(this.storageConfig, key, this.endpoint);
  }

  async download(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error(`Storage object "${key}" has no body`);
    }

    return Buffer.from(await response.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
  }
}

function buildStorageUrl(storageConfig: S3CompatibleStorageConfig, key: string, endpoint: string) {
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  if (storageConfig.publicBaseUrl) {
    return `${storageConfig.publicBaseUrl.replace(/\/+$/, '')}/${encodedKey}`;
  }

  return `${endpoint}/${storageConfig.bucketName}/${encodedKey}`;
}

function isMissingBucketError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const metadata = (error as Error & { $metadata?: { httpStatusCode?: number } }).$metadata;
  return error.name === 'NotFound' || metadata?.httpStatusCode === 404;
}
