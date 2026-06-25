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
      forcePathStyle: true,
    });
    this.bucketName = config.storage.bucketName;
    this.endpoint = config.storage.endpoint.replace(/\/+$/, '');
  }

  private async ensureBucketExists() {
    if (this.bucketChecked) return;

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
    } catch (error: any) {
      // If bucket doesn't exist, create it (mainly for local development/MinIO)
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        console.log(`Bucket "${this.bucketName}" not found. Creating it...`);
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucketName }));
        console.log(`Bucket "${this.bucketName}" created successfully.`);
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

    return `${this.endpoint}/${this.bucketName}/${key}`;
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
