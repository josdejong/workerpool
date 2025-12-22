/**
 * Heartbeat Mechanism Example (TypeScript)
 *
 * Demonstrates the worker health monitoring system using
 * heartbeat requests and responses.
 *
 * The heartbeat mechanism:
 * - Sends periodic health check requests to workers
 * - Tracks response times and missed heartbeats
 * - Detects unresponsive workers
 * - Enables automatic worker replacement
 *
 * Run with: npx tsx examples/typescript/heartbeat.ts
 */

import {
  // Heartbeat types and functions
  HeartbeatMonitor,
  createHeartbeatRequest,
  createHeartbeatResponse,
  handleHeartbeatInWorker,

  // Type imports
  type HeartbeatRequest,
  type HeartbeatResponse,
  type HeartbeatConfig,
  type HeartbeatStats,

  // Constants
  HEARTBEAT_METHOD_ID,
} from '../../dist/ts/full.js';

async function main(): Promise<void> {
  console.log('Heartbeat Mechanism Example (TypeScript)\n');
  console.log('='.repeat(60));

  // ============================================================
  // Example 1: Creating Heartbeat Requests
  // ============================================================
  console.log('\n1. Creating Heartbeat Requests\n');

  const request1 = createHeartbeatRequest(1);
  console.log('  Basic heartbeat request:');
  console.log(`    ID: ${request1.id}`);
  console.log(`    Method: ${request1.method}`);
  console.log(`    Protocol Version: ${request1.v}`);

  const request2 = createHeartbeatRequest(2, 'worker-123');
  console.log('\n  Heartbeat request with worker ID:');
  console.log(`    ID: ${request2.id}`);
  console.log(`    Worker ID: ${request2.workerId}`);

  // ============================================================
  // Example 2: Creating Heartbeat Responses
  // ============================================================
  console.log('\n2. Creating Heartbeat Responses\n');

  const responseAlive = createHeartbeatResponse(1, 'alive');
  console.log('  Alive response:');
  console.log(`    ID: ${responseAlive.id}`);
  console.log(`    Status: ${responseAlive.status}`);
  console.log(`    Method: ${responseAlive.method}`);

  const responseBusy = createHeartbeatResponse(2, 'busy', {
    taskCount: 5,
    memoryUsage: 128 * 1024 * 1024, // 128 MB
    uptime: 60000, // 1 minute
  });
  console.log('\n  Busy response with details:');
  console.log(`    ID: ${responseBusy.id}`);
  console.log(`    Status: ${responseBusy.status}`);
  console.log(`    Task Count: ${responseBusy.taskCount}`);
  console.log(`    Memory Usage: ${(responseBusy.memoryUsage! / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`    Uptime: ${responseBusy.uptime! / 1000}s`);

  const responseIdle = createHeartbeatResponse(3, 'idle', {
    taskCount: 0,
    memoryUsage: 50 * 1024 * 1024, // 50 MB
    uptime: 120000, // 2 minutes
  });
  console.log('\n  Idle response:');
  console.log(`    ID: ${responseIdle.id}`);
  console.log(`    Status: ${responseIdle.status}`);
  console.log(`    Task Count: ${responseIdle.taskCount}`);

  // ============================================================
  // Example 3: Worker-Side Heartbeat Handling
  // ============================================================
  console.log('\n3. Worker-Side Heartbeat Handling\n');

  // Simulate worker state
  let currentTaskCount = 3;
  let isProcessing = true;

  const getWorkerStatus = () => ({
    status: (isProcessing ? 'busy' : 'idle') as 'busy' | 'idle',
    taskCount: currentTaskCount,
    memoryUsage: process.memoryUsage().heapUsed,
    uptime: process.uptime() * 1000,
  });

  const incomingRequest = createHeartbeatRequest(100, 'worker-abc');
  console.log('  Incoming request:');
  console.log(`    ${JSON.stringify(incomingRequest)}`);

  const workerResponse = handleHeartbeatInWorker(incomingRequest, getWorkerStatus);
  console.log('\n  Worker response:');
  console.log(`    Status: ${workerResponse.status}`);
  console.log(`    Task Count: ${workerResponse.taskCount}`);
  console.log(`    Memory: ${((workerResponse.memoryUsage || 0) / (1024 * 1024)).toFixed(2)} MB`);

  // ============================================================
  // Example 4: HeartbeatMonitor Basic Usage
  // ============================================================
  console.log('\n4. HeartbeatMonitor Basic Usage\n');

  // Track sent heartbeats
  const sentHeartbeats: Map<string, HeartbeatRequest[]> = new Map();

  const sendHeartbeat = (workerId: string, request: HeartbeatRequest) => {
    if (!sentHeartbeats.has(workerId)) {
      sentHeartbeats.set(workerId, []);
    }
    sentHeartbeats.get(workerId)!.push(request);
    console.log(`    [SEND] Heartbeat to ${workerId}: id=${request.id}`);
  };

  const config: HeartbeatConfig = {
    interval: 5000,       // 5 seconds between heartbeats
    timeout: 3000,        // 3 seconds to wait for response
    maxMissed: 3,         // 3 missed = unresponsive
    onUnresponsive: (workerId) => {
      console.log(`    [ALERT] Worker ${workerId} is unresponsive!`);
    },
    onRecovered: (workerId) => {
      console.log(`    [RECOVERED] Worker ${workerId} is responding again!`);
    },
  };

  const monitor = new HeartbeatMonitor(sendHeartbeat, config);

  console.log('  Monitor configuration:');
  console.log(`    Interval: ${config.interval}ms`);
  console.log(`    Timeout: ${config.timeout}ms`);
  console.log(`    Max Missed: ${config.maxMissed}`);

  // Register workers
  monitor.registerWorker('worker-1');
  monitor.registerWorker('worker-2');
  console.log('\n  Registered workers: worker-1, worker-2');

  // ============================================================
  // Example 5: Simulating Heartbeat Exchange
  // ============================================================
  console.log('\n5. Simulating Heartbeat Exchange\n');

  // Simulate sending heartbeats and receiving responses
  console.log('  Simulating heartbeat-response cycle:');

  // Manually trigger heartbeat sends
  sentHeartbeats.clear();

  // Start monitoring (in real use, this runs on intervals)
  // For demo, we'll manually send heartbeats
  const heartbeat1 = createHeartbeatRequest(1, 'worker-1');
  sendHeartbeat('worker-1', heartbeat1);

  // Simulate response after 50ms
  await new Promise((r) => setTimeout(r, 50));
  const response1 = createHeartbeatResponse(heartbeat1.id, 'alive', { taskCount: 2 });
  monitor.handleResponse('worker-1', response1);
  console.log(`    [RECV] Response from worker-1: status=${response1.status}`);

  const heartbeat2 = createHeartbeatRequest(2, 'worker-2');
  sendHeartbeat('worker-2', heartbeat2);

  // Simulate slower response (100ms)
  await new Promise((r) => setTimeout(r, 100));
  const response2 = createHeartbeatResponse(heartbeat2.id, 'busy', { taskCount: 5 });
  monitor.handleResponse('worker-2', response2);
  console.log(`    [RECV] Response from worker-2: status=${response2.status}`);

  // ============================================================
  // Example 6: Checking Worker Health
  // ============================================================
  console.log('\n6. Checking Worker Health\n');

  console.log('  Worker responsiveness:');
  console.log(`    worker-1: ${monitor.isResponsive('worker-1') ? 'RESPONSIVE' : 'UNRESPONSIVE'}`);
  console.log(`    worker-2: ${monitor.isResponsive('worker-2') ? 'RESPONSIVE' : 'UNRESPONSIVE'}`);

  // Get detailed stats
  const stats1 = monitor.getStats('worker-1');
  const stats2 = monitor.getStats('worker-2');

  console.log('\n  Worker statistics:');
  if (stats1) {
    console.log('    worker-1:');
    console.log(`      Last Seen: ${stats1.lastSeen ? new Date(stats1.lastSeen).toISOString() : 'never'}`);
    console.log(`      Missed: ${stats1.missedCount}`);
    console.log(`      Total Sent: ${stats1.totalSent}`);
    console.log(`      Total Received: ${stats1.totalReceived}`);
    console.log(`      Avg Latency: ${stats1.avgLatency.toFixed(2)}ms`);
  }

  if (stats2) {
    console.log('    worker-2:');
    console.log(`      Last Seen: ${stats2.lastSeen ? new Date(stats2.lastSeen).toISOString() : 'never'}`);
    console.log(`      Missed: ${stats2.missedCount}`);
    console.log(`      Total Sent: ${stats2.totalSent}`);
    console.log(`      Total Received: ${stats2.totalReceived}`);
    console.log(`      Avg Latency: ${stats2.avgLatency.toFixed(2)}ms`);
  }

  // ============================================================
  // Example 7: Detecting Unresponsive Workers
  // ============================================================
  console.log('\n7. Detecting Unresponsive Workers\n');

  // Register a new worker that won't respond
  monitor.registerWorker('worker-3');
  console.log('  Registered worker-3 (will not respond)');

  // Simulate missed heartbeats
  console.log('  Simulating missed heartbeats for worker-3...');

  // In real implementation, this happens via timeout
  // For demo, we manually update missed count
  const stats3 = monitor.getStats('worker-3');
  console.log(`    Initial missed count: ${stats3?.missedCount || 0}`);

  // Check unresponsive workers
  const unresponsive = monitor.getUnresponsiveWorkers();
  console.log(`\n  Unresponsive workers: ${unresponsive.length > 0 ? unresponsive.join(', ') : 'none'}`);

  // ============================================================
  // Example 8: Custom Health Checks
  // ============================================================
  console.log('\n8. Custom Health Checks\n');

  interface ExtendedHealthCheck {
    cpuUsage: number;
    activeConnections: number;
    queueDepth: number;
    lastError?: string;
  }

  function performHealthCheck(workerId: string): ExtendedHealthCheck {
    // Simulate health check data
    return {
      cpuUsage: Math.random() * 100,
      activeConnections: Math.floor(Math.random() * 50),
      queueDepth: Math.floor(Math.random() * 20),
      lastError: Math.random() > 0.8 ? 'Connection timeout' : undefined,
    };
  }

  function evaluateHealth(check: ExtendedHealthCheck): 'healthy' | 'warning' | 'critical' {
    if (check.cpuUsage > 90 || check.queueDepth > 15) {
      return 'critical';
    }
    if (check.cpuUsage > 70 || check.queueDepth > 10 || check.lastError) {
      return 'warning';
    }
    return 'healthy';
  }

  console.log('  Extended health checks:');
  for (const workerId of ['worker-1', 'worker-2', 'worker-3']) {
    const check = performHealthCheck(workerId);
    const health = evaluateHealth(check);

    console.log(`    ${workerId}:`);
    console.log(`      CPU: ${check.cpuUsage.toFixed(1)}%`);
    console.log(`      Connections: ${check.activeConnections}`);
    console.log(`      Queue: ${check.queueDepth}`);
    console.log(`      Status: ${health.toUpperCase()}`);
    if (check.lastError) {
      console.log(`      Error: ${check.lastError}`);
    }
  }

  // ============================================================
  // Example 9: Heartbeat-Based Load Balancing
  // ============================================================
  console.log('\n9. Heartbeat-Based Load Balancing\n');

  interface WorkerLoad {
    workerId: string;
    taskCount: number;
    memoryUsage: number;
    responseTime: number;
  }

  const workerLoads: WorkerLoad[] = [
    { workerId: 'worker-1', taskCount: 2, memoryUsage: 50 * 1024 * 1024, responseTime: 50 },
    { workerId: 'worker-2', taskCount: 5, memoryUsage: 100 * 1024 * 1024, responseTime: 100 },
    { workerId: 'worker-3', taskCount: 1, memoryUsage: 30 * 1024 * 1024, responseTime: 30 },
  ];

  function calculateScore(load: WorkerLoad): number {
    // Lower is better
    const taskWeight = 10;
    const memoryWeight = 0.00001;
    const responseWeight = 1;

    return (
      load.taskCount * taskWeight +
      load.memoryUsage * memoryWeight +
      load.responseTime * responseWeight
    );
  }

  function selectBestWorker(loads: WorkerLoad[]): string {
    let best = loads[0];
    let bestScore = calculateScore(best);

    for (const load of loads) {
      const score = calculateScore(load);
      if (score < bestScore) {
        bestScore = score;
        best = load;
      }
    }

    return best.workerId;
  }

  console.log('  Worker scores (lower is better):');
  for (const load of workerLoads) {
    const score = calculateScore(load);
    console.log(`    ${load.workerId}: score=${score.toFixed(2)} (tasks=${load.taskCount}, latency=${load.responseTime}ms)`);
  }

  const bestWorker = selectBestWorker(workerLoads);
  console.log(`\n  Best worker for next task: ${bestWorker}`);

  // ============================================================
  // Example 10: Cleanup
  // ============================================================
  console.log('\n10. Cleanup\n');

  // Unregister workers
  monitor.unregisterWorker('worker-1');
  monitor.unregisterWorker('worker-2');
  monitor.unregisterWorker('worker-3');
  console.log('  Unregistered all workers');

  // Stop monitor
  monitor.stop();
  console.log('  Stopped heartbeat monitor');

  console.log('\n' + '='.repeat(60));
  console.log('Heartbeat example completed!');
}

main().catch(console.error);
