/**
 * Sessions Example (TypeScript)
 *
 * Demonstrates worker sessions for stateful operations:
 * - Sessions bind tasks to a specific worker
 * - Maintain state across multiple task executions
 * - Useful for database connections, cached data, etc.
 *
 * Run with: npx tsx examples/typescript/sessions.ts
 */

import {
  pool,
  advancedPool,
  SessionManager,
  type Session,
  type SessionOptions,
  type SessionStats,
} from '../../dist/ts/full.js';

interface CounterState {
  counter: number;
  name: string;
}

interface UserState {
  user: string;
  balance: number;
}

interface ItemsState {
  items: string[];
}

async function main(): Promise<void> {
  console.log('Sessions Example (TypeScript)\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: Basic session usage
  // ============================================================
  console.log('\n1. Basic session usage\n');

  const pool1 = pool({ maxWorkers: 4 });

  const sessionOptions: SessionOptions = {
    initialState: { counter: 0, name: 'test-session' } as CounterState,
    timeout: 30000,
  };

  const session: Session = await pool1.createSession(sessionOptions);
  console.log('  Session created, ID:', session.id);

  const result1 = await session.exec((state: CounterState) => {
    state.counter++;
    return { counter: state.counter, worker: 'worker-assigned' };
  }, []);

  const result2 = await session.exec((state: CounterState) => {
    state.counter++;
    return { counter: state.counter };
  }, []);

  const result3 = await session.exec((state: CounterState) => {
    state.counter++;
    return { counter: state.counter };
  }, []);

  console.log('  After 3 increments, counter:', result3.counter);

  const state = await session.getState() as CounterState;
  console.log('  Current state:', JSON.stringify(state));

  await session.setState({ counter: 100, name: 'updated-session' } as CounterState);
  const newState = await session.getState() as CounterState;
  console.log('  Updated state:', JSON.stringify(newState));

  await session.close();
  console.log('  Session closed');

  await pool1.terminate();

  // ============================================================
  // Example 2: Multiple concurrent sessions
  // ============================================================
  console.log('\n2. Multiple concurrent sessions\n');

  const pool2 = pool({ maxWorkers: 4 });

  const sessions: Session[] = await Promise.all([
    pool2.createSession({ initialState: { user: 'alice', balance: 100 } as UserState }),
    pool2.createSession({ initialState: { user: 'bob', balance: 200 } as UserState }),
    pool2.createSession({ initialState: { user: 'charlie', balance: 150 } as UserState }),
  ]);

  console.log('  Created 3 sessions');

  await Promise.all([
    sessions[0].exec((s: UserState) => { s.balance -= 50; return s; }, []),
    sessions[1].exec((s: UserState) => { s.balance += 75; return s; }, []),
    sessions[2].exec((s: UserState) => { s.balance -= 25; return s; }, []),
  ]);

  const balances = await Promise.all(
    sessions.map(s => s.getState() as Promise<UserState>)
  );

  console.log('  Final balances:');
  balances.forEach(b => {
    console.log(`    ${b.user}: $${b.balance}`);
  });

  await pool2.closeSessions();
  console.log('  All sessions closed');

  await pool2.terminate();

  // ============================================================
  // Example 3: Session with timeout and max tasks
  // ============================================================
  console.log('\n3. Session limits\n');

  const pool3 = pool({ maxWorkers: 2 });

  const limitedSession = await pool3.createSession({
    initialState: { count: 0 },
    timeout: 5000,
    maxTasks: 5,
  });

  console.log('  Session with maxTasks=5 created');

  for (let i = 0; i < 5; i++) {
    await limitedSession.exec((s: { count: number }) => { s.count++; return s.count; }, []);
  }

  console.log('  Executed 5 tasks');

  const stats: SessionStats = limitedSession.getStats();
  console.log('  Session stats:', JSON.stringify(stats));

  try {
    await limitedSession.exec((s: { count: number }) => s.count, []);
    console.log('  Session still active');
  } catch (e) {
    console.log('  Session closed after maxTasks reached');
  }

  await pool3.terminate();

  // ============================================================
  // Example 4: Session affinity with AdvancedPool
  // ============================================================
  console.log('\n4. Sessions with AdvancedPool\n');

  const advPool = advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'least-busy',
  });

  const session4 = await advPool.createSession({
    initialState: { items: [] } as ItemsState,
  });

  for (let i = 0; i < 5; i++) {
    await session4.exec((s: ItemsState, item: string) => {
      s.items.push(item);
      return s.items.length;
    }, [`item-${i}`]);
  }

  const finalItems = await session4.getState() as ItemsState;
  console.log('  Items in session:', finalItems.items.join(', '));

  await session4.close();
  await advPool.terminate();

  // ============================================================
  // Example 5: SessionManager (low-level API)
  // ============================================================
  console.log('\n5. SessionManager (low-level API)\n');

  const pool5 = pool({ maxWorkers: 4 });

  const manager = new SessionManager({
    defaultTimeout: 60000,
    maxSessionsPerWorker: 10,
  });

  console.log('  SessionManager created');

  const sessionId = manager.createSession(0, { data: 'test' });
  console.log('  Session created with ID:', sessionId);

  const info = manager.getSession(sessionId);
  console.log('  Session worker:', info?.workerId);
  console.log('  Session state:', JSON.stringify(info?.state));

  manager.updateSession(sessionId, { data: 'updated', count: 42 });
  console.log('  Session updated');

  const workerSessions = manager.getSessionsForWorker(0);
  console.log('  Sessions for worker 0:', workerSessions.length);

  manager.closeSession(sessionId);
  console.log('  Session closed');

  const managerStats = manager.getStats();
  console.log('  Manager stats:', JSON.stringify(managerStats));

  await pool5.terminate();

  console.log('\n' + '='.repeat(50));
  console.log('Sessions examples completed!');
}

main().catch(console.error);
