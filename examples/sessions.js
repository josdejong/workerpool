/**
 * Sessions Example
 *
 * Demonstrates worker sessions for stateful operations:
 * - Sessions bind tasks to a specific worker
 * - Maintain state across multiple task executions
 * - Useful for database connections, cached data, etc.
 *
 * Run with: node examples/sessions.js
 */

const path = require('path');
const workerpool = require('../dist/ts/index.js');

// Worker script path
const workerPath = path.join(__dirname, 'workers', 'sessionWorker.js');

async function main() {
  console.log('Sessions Example\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: Basic session usage
  // ============================================================
  console.log('\n1. Basic session usage\n');

  // Note: Sessions work with offloaded functions too
  const pool = workerpool.pool({ maxWorkers: 4 });

  // Create a session - tasks will be routed to the same worker
  const session = await pool.createSession({
    initialState: { counter: 0, name: 'test-session' },
    timeout: 30000, // Auto-close after 30s idle
  });

  console.log('  Session created, ID:', session.id);

  // Execute tasks within the session
  // These all go to the same worker
  const result1 = await session.exec((state) => {
    state.counter++;
    return { counter: state.counter, worker: 'worker-assigned' };
  }, []);

  const result2 = await session.exec((state) => {
    state.counter++;
    return { counter: state.counter };
  }, []);

  const result3 = await session.exec((state) => {
    state.counter++;
    return { counter: state.counter };
  }, []);

  console.log('  After 3 increments, counter:', result3.counter);

  // Get session state
  const state = await session.getState();
  console.log('  Current state:', JSON.stringify(state));

  // Update session state
  await session.setState({ counter: 100, name: 'updated-session' });
  const newState = await session.getState();
  console.log('  Updated state:', JSON.stringify(newState));

  // Close the session
  await session.close();
  console.log('  Session closed');

  await pool.terminate();

  // ============================================================
  // Example 2: Multiple concurrent sessions
  // ============================================================
  console.log('\n2. Multiple concurrent sessions\n');

  const pool2 = workerpool.pool({ maxWorkers: 4 });

  // Create multiple sessions for different users
  const sessions = await Promise.all([
    pool2.createSession({ initialState: { user: 'alice', balance: 100 } }),
    pool2.createSession({ initialState: { user: 'bob', balance: 200 } }),
    pool2.createSession({ initialState: { user: 'charlie', balance: 150 } }),
  ]);

  console.log('  Created 3 sessions');

  // Each user's transactions stay on their assigned worker
  await Promise.all([
    sessions[0].exec((s) => { s.balance -= 50; return s; }, []),
    sessions[1].exec((s) => { s.balance += 75; return s; }, []),
    sessions[2].exec((s) => { s.balance -= 25; return s; }, []),
  ]);

  // Get final balances
  const balances = await Promise.all(
    sessions.map(s => s.getState())
  );

  console.log('  Final balances:');
  balances.forEach(b => {
    console.log(`    ${b.user}: $${b.balance}`);
  });

  // Close all sessions
  await pool2.closeSessions();
  console.log('  All sessions closed');

  await pool2.terminate();

  // ============================================================
  // Example 3: Session with timeout and max tasks
  // ============================================================
  console.log('\n3. Session limits\n');

  const pool3 = workerpool.pool({ maxWorkers: 2 });

  const limitedSession = await pool3.createSession({
    initialState: { count: 0 },
    timeout: 5000,    // Close after 5s idle
    maxTasks: 5,      // Close after 5 tasks
  });

  console.log('  Session with maxTasks=5 created');

  // Execute 5 tasks
  for (let i = 0; i < 5; i++) {
    await limitedSession.exec((s) => { s.count++; return s.count; }, []);
  }

  console.log('  Executed 5 tasks');

  // Check if session is still active
  const stats = limitedSession.getStats();
  console.log('  Session stats:', JSON.stringify(stats));

  // Session may auto-close after maxTasks
  try {
    await limitedSession.exec((s) => s.count, []);
    console.log('  Session still active');
  } catch (e) {
    console.log('  Session closed after maxTasks reached');
  }

  await pool3.terminate();

  // ============================================================
  // Example 4: Session affinity with AdvancedPool
  // ============================================================
  console.log('\n4. Sessions with AdvancedPool\n');

  const advPool = workerpool.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'least-busy',
  });

  // Sessions work with AdvancedPool too
  const session4 = await advPool.createSession({
    initialState: { items: [] },
  });

  // Add items to the session
  for (let i = 0; i < 5; i++) {
    await session4.exec((s, item) => {
      s.items.push(item);
      return s.items.length;
    }, [`item-${i}`]);
  }

  const finalItems = await session4.getState();
  console.log('  Items in session:', finalItems.items.join(', '));

  await session4.close();
  await advPool.terminate();

  // ============================================================
  // Example 5: SessionManager (low-level API)
  // ============================================================
  console.log('\n5. SessionManager (low-level API)\n');

  const pool5 = workerpool.pool({ maxWorkers: 4 });

  // Create a session manager
  const manager = new workerpool.SessionManager({
    defaultTimeout: 60000,
    maxSessionsPerWorker: 10,
  });

  console.log('  SessionManager created');

  // Create sessions through the manager
  const sessionId = manager.createSession(0, { data: 'test' }); // workerId=0
  console.log('  Session created with ID:', sessionId);

  // Get session info
  const info = manager.getSession(sessionId);
  console.log('  Session worker:', info.workerId);
  console.log('  Session state:', JSON.stringify(info.state));

  // Update session
  manager.updateSession(sessionId, { data: 'updated', count: 42 });
  console.log('  Session updated');

  // Get all sessions for a worker
  const workerSessions = manager.getSessionsForWorker(0);
  console.log('  Sessions for worker 0:', workerSessions.length);

  // Close session
  manager.closeSession(sessionId);
  console.log('  Session closed');

  // Get manager stats
  const managerStats = manager.getStats();
  console.log('  Manager stats:', JSON.stringify(managerStats));

  await pool5.terminate();

  console.log('\n' + '='.repeat(50));
  console.log('Sessions examples completed!');
}

main().catch(console.error);
