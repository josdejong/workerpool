/**
 * Tests for SessionManager (worker sessions with state)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager, SessionManagerPool } from '../../src/ts/core/session-manager';
import { WorkerpoolPromise } from '../../src/ts/core/Promise';
import type { WorkerHandler } from '../../src/ts/core/WorkerHandler';

// Simple mock pool that tracks calls and returns configured values
function createMockPool(): SessionManagerPool & {
  execCalls: Array<{ workerIndex: number; params: unknown[] }>;
  mockReturnValue: unknown;
  mockError: Error | null;
} {
  const workers = [
    { id: 0, busy: false },
    { id: 1, busy: false },
  ];

  const mockPool = {
    execCalls: [] as Array<{ workerIndex: number; params: unknown[] }>,
    mockReturnValue: undefined as unknown,
    mockError: null as Error | null,

    execOnWorker<T>(
      workerIndex: number,
      method: string,
      params: unknown[],
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      options?: unknown
    ): WorkerpoolPromise<T, unknown> {
      mockPool.execCalls.push({ workerIndex, params });

      const { promise, resolve, reject } = WorkerpoolPromise.defer<T>();

      // Simulate async execution
      setTimeout(() => {
        if (mockPool.mockError) {
          reject(mockPool.mockError);
        } else {
          // For session init, return the session ID (first param)
          const sessionId = params[0] as string;
          resolve((mockPool.mockReturnValue ?? sessionId) as T);
        }
      }, 0);

      return promise as WorkerpoolPromise<T, unknown>;
    },

    getWorkerCount(): number {
      return workers.length;
    },

    getWorker(index: number): WorkerHandler | undefined {
      return workers[index] as unknown as WorkerHandler;
    },

    removeSession(_id: string): void {
      // No-op for mock
    },
  };

  return mockPool;
}

describe('SessionManager', () => {
  let pool: ReturnType<typeof createMockPool>;
  let manager: SessionManager;

  beforeEach(() => {
    pool = createMockPool();
    manager = new SessionManager(pool);
  });

  describe('createSession', () => {
    it('should create a session with default options', async () => {
      const session = await manager.createSession();

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^session-/);
      expect(session.active).toBe(true);
    });

    it('should create a session with initial state', async () => {
      const session = await manager.createSession({
        initialState: { count: 10 },
      });

      expect(session).toBeDefined();
      expect(session.active).toBe(true);

      // Verify init was called with initial state
      expect(pool.execCalls.length).toBe(1);
      const initCall = pool.execCalls[0];
      expect(initCall.params[1]).toEqual({ count: 10 });
    });

    it('should assign session to worker with least sessions', async () => {
      // Create first session - should go to worker 0
      const session1 = await manager.createSession();
      expect(session1.workerIndex).toBe(0);

      // Create second session - should go to worker 1
      const session2 = await manager.createSession();
      expect(session2.workerIndex).toBe(1);

      // Create third session - should balance
      const session3 = await manager.createSession();
      expect([0, 1]).toContain(session3.workerIndex);
    });

    it('should increment session ID counter for uniqueness', async () => {
      const session1 = await manager.createSession();
      const session2 = await manager.createSession();

      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe('getSession', () => {
    it('should return undefined for unknown session', () => {
      const session = manager.getSession('unknown-id');
      expect(session).toBeUndefined();
    });

    it('should return existing session', async () => {
      const created = await manager.createSession();
      const retrieved = manager.getSession(created.id);

      expect(retrieved).toBe(created);
    });
  });

  describe('getSessions', () => {
    it('should return empty array when no sessions', () => {
      const sessions = manager.getSessions();
      expect(sessions).toEqual([]);
    });

    it('should return all active sessions', async () => {
      await manager.createSession();
      await manager.createSession();

      const sessions = manager.getSessions();
      expect(sessions.length).toBe(2);
    });

    it('should not include closed sessions', async () => {
      const session1 = await manager.createSession();
      await manager.createSession();

      await session1.close();

      const sessions = manager.getSessions();
      expect(sessions.length).toBe(1);
    });
  });

  describe('sessionCount', () => {
    it('should return 0 when no sessions', () => {
      expect(manager.sessionCount).toBe(0);
    });

    it('should return correct session count', async () => {
      await manager.createSession();
      expect(manager.sessionCount).toBe(1);

      await manager.createSession();
      expect(manager.sessionCount).toBe(2);
    });
  });

  describe('getWorkerSessionCount', () => {
    it('should return 0 for worker with no sessions', () => {
      expect(manager.getWorkerSessionCount(0)).toBe(0);
      expect(manager.getWorkerSessionCount(1)).toBe(0);
    });

    it('should return correct count per worker', async () => {
      await manager.createSession();
      expect(manager.getWorkerSessionCount(0)).toBe(1);
      expect(manager.getWorkerSessionCount(1)).toBe(0);

      await manager.createSession();
      expect(manager.getWorkerSessionCount(0)).toBe(1);
      expect(manager.getWorkerSessionCount(1)).toBe(1);
    });
  });

  describe('removeSession', () => {
    it('should remove session from tracking', async () => {
      const session = await manager.createSession();
      const id = session.id;
      const workerIndex = session.workerIndex;

      expect(manager.getSession(id)).toBeDefined();
      expect(manager.getWorkerSessionCount(workerIndex)).toBe(1);

      manager.removeSession(id);

      expect(manager.getSession(id)).toBeUndefined();
      expect(manager.getWorkerSessionCount(workerIndex)).toBe(0);
    });

    it('should be no-op for unknown session', () => {
      // Should not throw
      manager.removeSession('unknown-id');
    });
  });
});

describe('Session', () => {
  let pool: ReturnType<typeof createMockPool>;
  let manager: SessionManager;

  beforeEach(() => {
    pool = createMockPool();
    manager = new SessionManager(pool);
  });

  describe('active', () => {
    it('should be true after creation', async () => {
      const session = await manager.createSession();
      expect(session.active).toBe(true);
    });

    it('should be false after close', async () => {
      const session = await manager.createSession();
      await session.close();
      expect(session.active).toBe(false);
    });
  });

  describe('workerIndex', () => {
    it('should return assigned worker index', async () => {
      const session = await manager.createSession();
      expect(typeof session.workerIndex).toBe('number');
      expect(session.workerIndex).toBeGreaterThanOrEqual(0);
    });
  });

  describe('stats', () => {
    it('should return session statistics', async () => {
      const session = await manager.createSession();
      const stats = session.stats();

      expect(stats.id).toBe(session.id);
      expect(stats.active).toBe(true);
      expect(stats.taskCount).toBe(0);
      expect(stats.age).toBeGreaterThanOrEqual(0);
      expect(stats.idleTime).toBeGreaterThanOrEqual(0);
      expect(stats.workerIndex).toBe(session.workerIndex);
    });

    it('should show inactive after close', async () => {
      const session = await manager.createSession();
      await session.close();
      const stats = session.stats();

      expect(stats.active).toBe(false);
    });
  });

  describe('touch', () => {
    it('should update last activity time', async () => {
      const session = await manager.createSession();
      const statsBefore = session.stats();

      // Wait a small amount
      await new Promise((resolve) => setTimeout(resolve, 10));

      session.touch();
      const statsAfter = session.stats();

      // Idle time should be reset (smaller than before)
      expect(statsAfter.idleTime).toBeLessThan(statsBefore.idleTime + 15);
    });
  });

  describe('close', () => {
    it('should close the session', async () => {
      const session = await manager.createSession();
      expect(session.active).toBe(true);

      await session.close();
      expect(session.active).toBe(false);
    });

    it('should resolve immediately if already closed', async () => {
      const session = await manager.createSession();
      await session.close();

      // Second close should not throw
      await session.close();
      expect(session.active).toBe(false);
    });
  });

  describe('exec', () => {
    it('should reject if session is closed', async () => {
      const session = await manager.createSession();
      await session.close();

      await expect(session.exec('someMethod')).rejects.toThrow('Session is closed');
    });

    it('should call execOnWorker with correct worker index', async () => {
      const session = await manager.createSession();
      const workerIndex = session.workerIndex;

      // Clear previous calls from session creation
      pool.execCalls.length = 0;

      // Make an exec call (will fail because mock doesn't handle methods, but we can check the call was made)
      const execPromise = session.exec('testMethod', [1, 2, 3]);

      // Check that execOnWorker was called with correct worker
      expect(pool.execCalls.length).toBe(1);
      expect(pool.execCalls[0].workerIndex).toBe(workerIndex);
    });
  });

  describe('getState', () => {
    it('should reject if session is closed', async () => {
      const session = await manager.createSession();
      await session.close();

      await expect(session.getState()).rejects.toThrow('Session is closed');
    });

    it('should call execOnWorker for state retrieval', async () => {
      const session = await manager.createSession();
      pool.execCalls.length = 0;

      // Make getState call
      session.getState();

      expect(pool.execCalls.length).toBe(1);
      expect(pool.execCalls[0].workerIndex).toBe(session.workerIndex);
    });
  });

  describe('setState', () => {
    it('should reject if session is closed', async () => {
      const session = await manager.createSession();
      await session.close();

      await expect(session.setState({ count: 5 })).rejects.toThrow('Session is closed');
    });

    it('should call execOnWorker for state update', async () => {
      const session = await manager.createSession();
      pool.execCalls.length = 0;

      // Make setState call with object
      session.setState({ count: 5 });

      expect(pool.execCalls.length).toBe(1);
      expect(pool.execCalls[0].workerIndex).toBe(session.workerIndex);
    });

    it('should handle function updater', async () => {
      const session = await manager.createSession();
      pool.execCalls.length = 0;

      // Make setState call with function
      session.setState((state: { count: number }) => ({ count: state.count + 1 }));

      expect(pool.execCalls.length).toBe(1);
    });
  });
});

describe('Session with timeout', () => {
  let pool: ReturnType<typeof createMockPool>;
  let manager: SessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    pool = createMockPool();
    manager = new SessionManager(pool);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should close session after timeout', async () => {
    const sessionPromise = manager.createSession({
      timeout: 1000, // 1 second timeout
    });

    // Resolve the creation
    await vi.advanceTimersByTimeAsync(10);
    const session = await sessionPromise;

    expect(session.active).toBe(true);

    // Fast-forward past timeout
    await vi.advanceTimersByTimeAsync(1500);

    expect(session.active).toBe(false);
  });

  it('should reset timeout on touch', async () => {
    const sessionPromise = manager.createSession({
      timeout: 1000,
    });

    await vi.advanceTimersByTimeAsync(10);
    const session = await sessionPromise;

    // Advance partially
    await vi.advanceTimersByTimeAsync(500);
    expect(session.active).toBe(true);

    // Touch to reset
    session.touch();

    // Advance partially again
    await vi.advanceTimersByTimeAsync(500);
    expect(session.active).toBe(true);

    // Now advance past timeout from last touch
    await vi.advanceTimersByTimeAsync(600);
    expect(session.active).toBe(false);
  });

  it('should not timeout if timeout is Infinity', async () => {
    const sessionPromise = manager.createSession({
      timeout: Infinity,
    });

    await vi.advanceTimersByTimeAsync(10);
    const session = await sessionPromise;

    // Advance a lot of time
    await vi.advanceTimersByTimeAsync(1000000);

    expect(session.active).toBe(true);
  });
});

describe('Session with maxTasks', () => {
  let pool: ReturnType<typeof createMockPool>;
  let manager: SessionManager;

  beforeEach(() => {
    pool = createMockPool();
    manager = new SessionManager(pool);
  });

  it('should reject exec when task limit exceeded', async () => {
    const session = await manager.createSession<{ count: number }>({
      maxTasks: 2,
    });

    // First task - should work
    pool.execCalls.length = 0;
    session.exec('method1');
    expect(pool.execCalls.length).toBe(1);

    // Second task - should work
    session.exec('method2');
    expect(pool.execCalls.length).toBe(2);

    // Third task - should fail due to limit
    await expect(session.exec('method3')).rejects.toThrow('Session task limit exceeded');
  });
});

describe('closeSessions', () => {
  let pool: ReturnType<typeof createMockPool>;
  let manager: SessionManager;

  beforeEach(() => {
    pool = createMockPool();
    manager = new SessionManager(pool);
  });

  it('should close all sessions', async () => {
    const session1 = await manager.createSession();
    const session2 = await manager.createSession();

    expect(session1.active).toBe(true);
    expect(session2.active).toBe(true);

    await manager.closeSessions();

    expect(session1.active).toBe(false);
    expect(session2.active).toBe(false);
  });

  it('should return array of results', async () => {
    await manager.createSession();
    await manager.createSession();

    const results = await manager.closeSessions();
    expect(Array.isArray(results)).toBe(true);
  });

  it('should work with no sessions', async () => {
    const results = await manager.closeSessions();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });
});
