export interface StorageProvider {
  upload(key: string, body: Buffer, contentType: string): Promise<string>;
  delete(key: string): Promise<void>;
}