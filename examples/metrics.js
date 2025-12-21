/**
 * Metrics Example
 *
 * Demonstrates performance metrics collection:
 * - MetricsCollector: Collects pool performance data
 * - Latency histograms
 * - Worker utilization
 * - Queue depth tracking
 * - Error rates
 *
 * Run with: node examples/metrics.js
 */

const workerpool = require('../dist/ts/index.js');

/**
 * Simulated task with variable duration
 */
function simulateWork(duration) {
  const start = Date.now();
  while (Date.now() - start < duration) {
    // Busy wait
  }
  return { duration, completedAt: Date.now() };
}

/**
 * Task that sometimes fails
 */
function unreliableTask(failRate) {
  if (Math.random() < failRate) {
    throw new Error('Random failure');
  }
  return 'success';
}

async function main() {
  console.log('Metrics Example\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: Basic MetricsCollector
  // ============================================================
  console.log('\n1. Basic MetricsCollector usage\n');

  // Create metrics collector
  const collector = new workerpool.MetricsCollector({
    histogramBuckets: [10, 25, 50, 100, 250, 500, 1000], // ms buckets
    sampleRate: 1.0, // Collect all samples
  });

  console.log('  Created MetricsCollector');

  // Record some task executions
  collector.recordTaskStart('task-1');
  await new Promise(r => setTimeout(r, 50));
  collector.recordTaskComplete('task-1', true);

  collector.recordTaskStart('task-2');
  await new Promise(r => setTimeout(r, 120));
  collector.recordTaskComplete('task-2', true);

  collector.recordTaskStart('task-3');
  await new Promise(r => setTimeout(r, 30));
  collector.recordTaskComplete('task-3', false); // Failed

  // Get metrics snapshot
  const snapshot = collector.getSnapshot();
  console.log('  Tasks completed:', snapshot.tasksCompleted);
  console.log('  Tasks failed:', snapshot.tasksFailed);
  console.log('  Success rate:', ((snapshot.tasksCompleted / (snapshot.tasksCompleted + snapshot.tasksFailed)) * 100).toFixed(1) + '%');

  // ============================================================
  // Example 2: Latency histogram
  // ============================================================
  console.log('\n2. Latency histogram\n');

  const collector2 = new workerpool.MetricsCollector({
    histogramBuckets: [10, 25, 50, 100, 250, 500],
  });

  // Simulate various response times
  const latencies = [5, 15, 30, 45, 60, 80, 150, 200, 350];

  for (const latency of latencies) {
    const taskId = `task-${latency}`;
    collector2.recordTaskStart(taskId);
    // Simulate latency
    const start = Date.now();
    while (Date.now() - start < latency) {}
    collector2.recordTaskComplete(taskId, true);
  }

  const histogram = collector2.getLatencyHistogram();
  console.log('  Latency distribution:');
  console.log('    <=10ms:', histogram.buckets['10'] || 0);
  console.log('    <=25ms:', histogram.buckets['25'] || 0);
  console.log('    <=50ms:', histogram.buckets['50'] || 0);
  console.log('    <=100ms:', histogram.buckets['100'] || 0);
  console.log('    <=250ms:', histogram.buckets['250'] || 0);
  console.log('    <=500ms:', histogram.buckets['500'] || 0);
  console.log('  Percentiles:');
  console.log('    p50:', histogram.p50?.toFixed(1) + 'ms');
  console.log('    p95:', histogram.p95?.toFixed(1) + 'ms');
  console.log('    p99:', histogram.p99?.toFixed(1) + 'ms');

  // ============================================================
  // Example 3: Worker utilization
  // ============================================================
  console.log('\n3. Worker utilization tracking\n');

  const collector3 = new workerpool.MetricsCollector();

  // Simulate worker activity
  collector3.recordWorkerBusy(0);
  collector3.recordWorkerBusy(1);
  await new Promise(r => setTimeout(r, 100));
  collector3.recordWorkerIdle(0);
  await new Promise(r => setTimeout(r, 50));
  collector3.recordWorkerIdle(1);

  const utilization = collector3.getWorkerUtilization();
  console.log('  Worker 0 utilization:', (utilization[0] * 100).toFixed(1) + '%');
  console.log('  Worker 1 utilization:', (utilization[1] * 100).toFixed(1) + '%');

  // ============================================================
  // Example 4: Queue metrics
  // ============================================================
  console.log('\n4. Queue depth tracking\n');

  const collector4 = new workerpool.MetricsCollector();

  // Simulate queue depth changes
  collector4.recordQueueDepth(0);
  collector4.recordQueueDepth(5);
  collector4.recordQueueDepth(12);
  collector4.recordQueueDepth(8);
  collector4.recordQueueDepth(3);
  collector4.recordQueueDepth(0);

  const queueMetrics = collector4.getQueueMetrics();
  console.log('  Max queue depth:', queueMetrics.maxDepth);
  console.log('  Avg queue depth:', queueMetrics.avgDepth?.toFixed(1));
  console.log('  Current depth:', queueMetrics.currentDepth);

  // ============================================================
  // Example 5: Error tracking
  // ============================================================
  console.log('\n5. Error rate tracking\n');

  const collector5 = new workerpool.MetricsCollector();

  // Simulate tasks with errors
  for (let i = 0; i < 100; i++) {
    const taskId = `task-${i}`;
    collector5.recordTaskStart(taskId);

    // 15% failure rate
    const success = Math.random() > 0.15;
    collector5.recordTaskComplete(taskId, success);

    if (!success) {
      collector5.recordError('RandomError', `Task ${i} failed`);
    }
  }

  const errorMetrics = collector5.getErrorMetrics();
  console.log('  Total errors:', errorMetrics.totalErrors);
  console.log('  Error rate:', (errorMetrics.errorRate * 100).toFixed(1) + '%');
  console.log('  Errors by type:', JSON.stringify(errorMetrics.errorsByType));

  // ============================================================
  // Example 6: Integration with Pool
  // ============================================================
  console.log('\n6. Metrics with real Pool\n');

  const pool = workerpool.pool({ maxWorkers: 4 });
  const poolMetrics = new workerpool.MetricsCollector();

  // Execute tasks and collect metrics
  const tasks = [];
  for (let i = 0; i < 20; i++) {
    const taskId = `pool-task-${i}`;
    poolMetrics.recordTaskStart(taskId);

    const promise = pool.exec(simulateWork, [10 + Math.random() * 40])
      .then(() => {
        poolMetrics.recordTaskComplete(taskId, true);
      })
      .catch(() => {
        poolMetrics.recordTaskComplete(taskId, false);
      });

    tasks.push(promise);
  }

  await Promise.all(tasks);

  const poolSnapshot = poolMetrics.getSnapshot();
  console.log('  Tasks completed:', poolSnapshot.tasksCompleted);
  console.log('  Avg latency:', poolSnapshot.avgLatency?.toFixed(1) + 'ms');

  await pool.terminate();

  // ============================================================
  // Example 7: Periodic metrics reporting
  // ============================================================
  console.log('\n7. Periodic metrics reporting pattern\n');

  const reporter = new workerpool.MetricsCollector();

  // Simulate collecting metrics and reporting periodically
  function reportMetrics() {
    const snapshot = reporter.getSnapshot();
    console.log('  [Report]', {
      completed: snapshot.tasksCompleted,
      failed: snapshot.tasksFailed,
      avgLatency: snapshot.avgLatency?.toFixed(1) + 'ms',
    });
  }

  // Simulate some activity
  for (let i = 0; i < 5; i++) {
    reporter.recordTaskStart(`t-${i}`);
    await new Promise(r => setTimeout(r, 20));
    reporter.recordTaskComplete(`t-${i}`, true);
  }

  reportMetrics();

  // Reset for next reporting period
  reporter.reset();
  console.log('  Metrics reset for next period');

  // More activity
  for (let i = 5; i < 10; i++) {
    reporter.recordTaskStart(`t-${i}`);
    await new Promise(r => setTimeout(r, 15));
    reporter.recordTaskComplete(`t-${i}`, i !== 7); // One failure
  }

  reportMetrics();

  console.log('\n' + '='.repeat(50));
  console.log('Metrics examples completed!');
}

main().catch(console.error);
