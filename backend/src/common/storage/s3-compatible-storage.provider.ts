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

export class S3CompatibleStorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly endpoint: string;
  private bucketChecked = false;

  constructor() {
    this.client = new S3Client({
      endpoint: config.storage.endpoint,
      region: config.storage.region,
      credentials: {
        accessKeyId: config.storage.accessKeyId,
        secretAccessKey: config.storage.secretAccessKey,
      },
      forcePathStyle: config.storage.forcePathStyle,
    });
    this.bucketName = config.storage.bucketName;
    this.endpoint = config.storage.endpoint.replace(/\/+$/, '');
  }

  private async ensureBucketExists() {
    if (this.bucketChecked) return;

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
    } catch (error: any) {
      const bucketMissing = error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404;

      // Auto-create is useful for local MinIO, but production buckets should already exist.
      if (bucketMissing && config.storage.autoCreateBucket) {
        console.log(`Bucket "${this.bucketName}" not found. Creating it...`);
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucketName }));
        console.log(`Bucket "${this.bucketName}" created successfully.`);
      } else if (bucketMissing) {
        throw new Error(
          `Bucket "${this.bucketName}" was not found. Create it in your storage provider or enable S3_AUTO_CREATE_BUCKET for local development.`,
        );
      } else {
        throw error;
      }
    }
    this.bucketChecked = true;
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

    return buildStorageUrl(this.bucketName, key, this.endpoint);
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

function buildStorageUrl(bucketName: string, key: string, endpoint: string) {
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  if (config.storage.publicBaseUrl) {
    return `${config.storage.publicBaseUrl.replace(/\/+$/, '')}/${encodedKey}`;
  }

  return `${endpoint}/${bucketName}/${encodedKey}`;
}
