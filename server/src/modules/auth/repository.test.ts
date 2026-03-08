/**
 * Tests for auth user repository.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { CreateUserData } from './auth.types.js';

// Mock pg pool
const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockConnect = vi.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockClientRelease,
});

vi.mock('../../infra/database/index.js', () => ({
  getPool: () => ({
    query: mockQuery,
    connect: mockConnect,
  }),
}));

vi.mock('../../shared/logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Import after mocks
const {
  createUser,
  findUserByEmail,
  findUserById,
  findUserWithCredentials,
  updateUserStatus,
  userExistsByEmail,
  userExistsByUsername,
} = await import('./repository.js');

const now = new Date('2026-01-01T00:00:00.000Z');

function makeUserRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'user-uuid-1',
    email: 'test@example.com',
    username: 'testuser',
    display_name: 'TestUser',
    avatar_url: null,
    status: 'active',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('createUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create user and credentials in a transaction', async () => {
    const userRow = makeUserRow();
    mockClientQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [userRow] }) // INSERT user
      .mockResolvedValueOnce(undefined) // INSERT credentials
      .mockResolvedValueOnce(undefined); // COMMIT

    const data: CreateUserData = {
      email: 'test@example.com',
      username: 'testuser',
      displayName: 'TestUser',
      passwordHash: '$2b$12$hash',
    };

    const user = await createUser(data);

    expect(user.id).toBe('user-uuid-1');
    expect(user.email).toBe('test@example.com');
    expect(user.username).toBe('testuser');
    expect(user.displayName).toBe('TestUser');
    expect(user.status).toBe('active');
    expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    expect(mockClientRelease).toHaveBeenCalled();
  });

  it('should rollback on error', async () => {
    mockClientQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockRejectedValueOnce(new Error('unique violation')); // INSERT user fails

    const data: CreateUserData = {
      email: 'test@example.com',
      username: 'testuser',
      displayName: 'TestUser',
      passwordHash: '$2b$12$hash',
    };

    await expect(createUser(data)).rejects.toThrow('unique violation');
    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClientRelease).toHaveBeenCalled();
  });

  it('should release client even on rollback error', async () => {
    mockClientQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockRejectedValueOnce(new Error('insert failed')); // INSERT fails

    const data: CreateUserData = {
      email: 'test@example.com',
      username: 'testuser',
      displayName: 'TestUser',
      passwordHash: '$2b$12$hash',
    };

    await expect(createUser(data)).rejects.toThrow();
    expect(mockClientRelease).toHaveBeenCalled();
  });

  it('should pass hashed password to credentials insert', async () => {
    const userRow = makeUserRow();
    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [userRow] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await createUser({
      email: 'test@example.com',
      username: 'testuser',
      displayName: 'TestUser',
      passwordHash: '$2b$12$somehash',
    });

    // Third call is the credentials INSERT
    const credCall = mockClientQuery.mock.calls[2];
    expect(credCall?.[1]).toEqual(['user-uuid-1', '$2b$12$somehash']);
  });
});

describe('findUserByEmail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return user when found', async () => {
    mockQuery.mockResolvedValue({ rows: [makeUserRow()] });

    const user = await findUserByEmail('test@example.com');

    expect(user).toBeDefined();
    expect(user?.email).toBe('test@example.com');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      ['test@example.com'],
    );
  });

  it('should return undefined when not found', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const user = await findUserByEmail('nonexistent@example.com');

    expect(user).toBeUndefined();
  });

  it('should normalize email to lowercase', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await findUserByEmail('TEST@Example.COM');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      ['test@example.com'],
    );
  });
});

describe('findUserById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return user when found', async () => {
    mockQuery.mockResolvedValue({ rows: [makeUserRow()] });

    const user = await findUserById('user-uuid-1');

    expect(user).toBeDefined();
    expect(user?.id).toBe('user-uuid-1');
  });

  it('should return undefined when not found', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const user = await findUserById('nonexistent');

    expect(user).toBeUndefined();
  });
});

describe('findUserWithCredentials', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return user with password hash', async () => {
    const row = { ...makeUserRow(), password_hash: '$2b$12$hash' };
    mockQuery.mockResolvedValue({ rows: [row] });

    const user = await findUserWithCredentials('test@example.com');

    expect(user).toBeDefined();
    expect(user?.passwordHash).toBe('$2b$12$hash');
  });

  it('should return undefined when not found', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const user = await findUserWithCredentials('nonexistent@example.com');

    expect(user).toBeUndefined();
  });

  it('should use a JOIN query', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await findUserWithCredentials('test@example.com');

    const sql = mockQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain('JOIN');
    expect(sql).toContain('credentials');
  });
});

describe('updateUserStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should update user status', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await updateUserStatus('user-uuid-1', 'banned');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      ['banned', 'user-uuid-1'],
    );
  });
});

describe('userExistsByEmail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return true when email exists', async () => {
    mockQuery.mockResolvedValue({ rows: [{ exists: true }] });

    const result = await userExistsByEmail('test@example.com');

    expect(result).toBe(true);
  });

  it('should return false when email does not exist', async () => {
    mockQuery.mockResolvedValue({ rows: [{ exists: false }] });

    const result = await userExistsByEmail('new@example.com');

    expect(result).toBe(false);
  });

  it('should normalize email to lowercase', async () => {
    mockQuery.mockResolvedValue({ rows: [{ exists: false }] });

    await userExistsByEmail('TEST@Example.COM');

    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['test@example.com']);
  });
});

describe('userExistsByUsername', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return true when username exists', async () => {
    mockQuery.mockResolvedValue({ rows: [{ exists: true }] });

    const result = await userExistsByUsername('testuser');

    expect(result).toBe(true);
  });

  it('should return false when username does not exist', async () => {
    mockQuery.mockResolvedValue({ rows: [{ exists: false }] });

    const result = await userExistsByUsername('newuser');

    expect(result).toBe(false);
  });

  it('should normalize username to lowercase', async () => {
    mockQuery.mockResolvedValue({ rows: [{ exists: false }] });

    await userExistsByUsername('TestUser');

    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['testuser']);
  });
});
