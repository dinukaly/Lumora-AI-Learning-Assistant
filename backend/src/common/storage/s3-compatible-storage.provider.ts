import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../../config/index.js';
import type { StorageProvider } from './storage-provider.interface.js';

export class S3CompatibleStorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly endpoint: string;

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

  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
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

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
  }
}