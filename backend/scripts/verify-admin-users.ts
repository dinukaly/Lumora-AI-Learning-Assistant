import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { generateAccessToken } from '../src/common/utils/jwt.js';
import { connectDB } from '../src/config/db.js';
import User from '../src/modules/users/user.model.js';

async function main() {
  await connectDB();

  const timestamp = Date.now();
  const [adminUser, targetUser, searchUser, regularUser] = await Promise.all([
    User.create({
      name: 'Admin Verifier',
      email: `verify-t71-admin-${timestamp}@example.com`,
      passwordHash: 'password123',
      role: 'ADMIN',
    }),
    User.create({
      name: 'Target User',
      email: `verify-t71-target-${timestamp}@example.com`,
      passwordHash: 'password123',
      role: 'USER',
    }),
    User.create({
      name: 'Searchable Analyst',
      email: `verify-t71-search-${timestamp}@example.com`,
      passwordHash: 'password123',
      role: 'USER',
    }),
    User.create({
      name: 'Regular Verifier',
      email: `verify-t71-regular-${timestamp}@example.com`,
      passwordHash: 'password123',
      role: 'USER',
    }),
  ]);

  const adminToken = generateAccessToken({ userId: adminUser.id, role: 'ADMIN' });
  const regularToken = generateAccessToken({ userId: regularUser.id, role: 'USER' });
  const targetToken = generateAccessToken({ userId: targetUser.id, role: 'USER' });

  const server = app.listen(0);

  try {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine verification server port');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;

    const forbiddenListResponse = await fetch(`${baseUrl}/api/v1/admin/users`, {
      headers: {
        Authorization: `Bearer ${regularToken}`,
      },
    });
    assert.equal(forbiddenListResponse.status, 403);

    const listResponse = await fetch(
      `${baseUrl}/api/v1/admin/users?search=searchable&role=USER&page=1&limit=10`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    );
    assert.equal(listResponse.status, 200);
    const listJson = await listResponse.json();
    assert.equal(listJson.total, 1);
    assert.equal(listJson.users[0].email, searchUser.email);

    const roleResponse = await fetch(`${baseUrl}/api/v1/admin/users/${targetUser.id}/role`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    assert.equal(roleResponse.status, 200);
    const roleJson = await roleResponse.json();
    assert.equal(roleJson.role, 'ADMIN');

    const adminRoleFilterResponse = await fetch(`${baseUrl}/api/v1/admin/users?role=ADMIN&page=1&limit=20`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    assert.equal(adminRoleFilterResponse.status, 200);
    const adminRoleFilterJson = await adminRoleFilterResponse.json();
    assert.equal(
      adminRoleFilterJson.users.some((user: { email: string }) => user.email === targetUser.email),
      true,
    );

    const disableResponse = await fetch(`${baseUrl}/api/v1/admin/users/${targetUser.id}/disable`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ disabled: true }),
    });
    assert.equal(disableResponse.status, 200);
    const disableJson = await disableResponse.json();
    assert.equal(typeof disableJson.disabledAt, 'string');

    const disabledUserProfileResponse = await fetch(`${baseUrl}/api/v1/users/me`, {
      headers: {
        Authorization: `Bearer ${targetToken}`,
      },
    });
    assert.equal(disabledUserProfileResponse.status, 403);

    const disabledLoginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: targetUser.email,
        password: 'password123',
      }),
    });
    assert.equal(disabledLoginResponse.status, 403);

    console.log(JSON.stringify({
      listedUserEmail: listJson.users[0].email,
      promotedRole: roleJson.role,
      disabledAt: disableJson.disabledAt,
      disabledProfileStatus: disabledUserProfileResponse.status,
      disabledLoginStatus: disabledLoginResponse.status,
    }, null, 2));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await User.deleteMany({
      _id: { $in: [adminUser._id, targetUser._id, searchUser._id, regularUser._id] },
    });

    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
