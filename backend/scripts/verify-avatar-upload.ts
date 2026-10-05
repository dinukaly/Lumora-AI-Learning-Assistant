import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import sharp from 'sharp';
import app from '../src/app.js';
import { generateAccessToken } from '../src/common/utils/jwt.js';
import type { StorageProvider } from '../src/common/storage/index.js';
import { connectDB } from '../src/config/db.js';
import User from '../src/modules/users/user.model.js';
import { UsersService } from '../src/modules/users/users.service.js';

class MemoryStorageProvider implements StorageProvider {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  readonly deletedKeys: string[] = [];

  async upload(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body, contentType });
    return `https://cdn.test/${key}`;
  }

  async download(key: string) {
    const object = this.objects.get(key);
    if (!object) {
      throw new Error(`Missing object ${key}`);
    }

    return object.body;
  }

  async delete(key: string) {
    this.deletedKeys.push(key);
    this.objects.delete(key);
  }
}

async function main() {
  await connectDB();

  const storageProvider = new MemoryStorageProvider();
  UsersService.setStorageProviderForTesting(storageProvider);

  const timestamp = Date.now();
  const user = await User.create({
    name: 'Avatar Verifier',
    email: `verify-t82a-${timestamp}@example.com`,
    passwordHash: 'password123',
    role: 'USER',
  });
  const token = generateAccessToken({ userId: user.id, role: 'USER' });
  const server = app.listen(0);

  try {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine verification server port');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const firstImage = await createPng(96, 64);
    const firstUpload = await uploadAvatar(baseUrl, token, firstImage, 'avatar-one.png', 'image/png');

    assert.equal(firstUpload.status, 200);
    const firstJson = await firstUpload.response.json();
    assert.equal(firstJson.message, 'Avatar updated successfully');
    assert.match(firstJson.avatar.url, /^https:\/\/cdn\.test\/avatars\//);
    assert.equal(firstJson.user.avatar, firstJson.avatar.url);

    const firstProfile = await fetch(`${baseUrl}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(firstProfile.status, 200);
    const firstProfileJson = await firstProfile.json();
    assert.equal(firstProfileJson.avatar, firstJson.avatar.url);
    assert.equal(typeof firstProfileJson.avatarStorageKey, 'string');

    const firstObject = storageProvider.objects.get(firstProfileJson.avatarStorageKey);
    assert.ok(firstObject);
    assert.equal(firstObject.contentType, 'image/webp');
    const firstMetadata = await sharp(firstObject.body).metadata();
    assert.equal(firstMetadata.format, 'webp');
    assert.equal(firstMetadata.width, 256);
    assert.equal(firstMetadata.height, 256);

    const invalidUpload = await uploadAvatar(
      baseUrl,
      token,
      Buffer.from('not an image'),
      'avatar.txt',
      'text/plain',
    );
    assert.equal(invalidUpload.status, 400);
    const invalidJson = await invalidUpload.response.json();
    assert.equal(invalidJson.error.code, 'VALIDATION_ERROR');

    const secondImage = await createPng(120, 120);
    const secondUpload = await uploadAvatar(baseUrl, token, secondImage, 'avatar-two.png', 'image/png');
    assert.equal(secondUpload.status, 200);
    const secondJson = await secondUpload.response.json();
    assert.notEqual(secondJson.avatar.url, firstJson.avatar.url);
    assert.equal(storageProvider.deletedKeys.length, 1);
    assert.equal(storageProvider.deletedKeys[0], firstProfileJson.avatarStorageKey);

    console.log('verify:t82a passed');
  } finally {
    UsersService.resetStorageProviderForTesting();
    await User.deleteOne({ _id: user._id });
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    await mongoose.disconnect();
  }
}

async function createPng(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 28, g: 132, b: 104 },
    },
  })
    .png()
    .toBuffer();
}

async function uploadAvatar(
  baseUrl: string,
  token: string,
  body: Buffer,
  fileName: string,
  contentType: string,
) {
  const form = new FormData();
  form.append('avatar', new Blob([new Uint8Array(body)], { type: contentType }), fileName);

  const response = await fetch(`${baseUrl}/api/v1/users/me/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  return { status: response.status, response };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
