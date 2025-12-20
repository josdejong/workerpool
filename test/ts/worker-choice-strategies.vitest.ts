/**
 * Tests for Worker Choice Strategies
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  RoundRobinStrategy,
  LeastBusyStrategy,
  LeastUsedStrategy,
  FairShareStrategy,
  WeightedRoundRobinStrategy,
  InterleavedWeightedRoundRobinStrategy,
  WorkerChoiceStrategyManager,
  createStrategy,
} from '../../src/ts/core/worker-choice-strategies';

// Mock WorkerHandler
class MockWorkerHandler {
  private _busy = false;

  busy(): boolean {
    return this._busy;
  }

  setBusy(busy: boolean): void {
    this._busy = busy;
  }
}

function createMockWorkers(count: number): MockWorkerHandler[] {
  return Array.from({ length: count }, () => new MockWorkerHandler());
}

describe('Worker Choice Strategies', () => {
  describe('RoundRobinStrategy', () => {
    let strategy: RoundRobinStrategy;
    let workers: MockWorkerHandler[];

    beforeEach(() => {
      strategy = new RoundRobinStrategy();
      workers = createMockWorkers(4);
    });

    it('should distribute tasks evenly in rotation', () => {
      const selections = [];
      for (let i = 0; i < 8; i++) {
        const result = strategy.choose(workers as any);
        selections.push(result?.workerIndex);
      }

      // Should cycle through workers
      expect(selections).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    });

    it('should skip busy workers', () => {
      workers[0].setBusy(true);
      workers[2].setBusy(true);

      const result1 = strategy.choose(workers as any);
      const result2 = strategy.choose(workers as any);

      expect(result1?.workerIndex).toBe(1);
      expect(result2?.workerIndex).toBe(3);
    });

    it('should respect affinity hint when worker is available', () => {
      const result = strategy.choose(workers as any, { affinityWorkerIndex: 2 });
      expect(result?.workerIndex).toBe(2);
      expect(result?.metadata?.reason).toBe('affinity');
    });

    it('should fall back when affinity worker is busy', () => {
      workers[2].setBusy(true);
      const result = strategy.choose(workers as any, { affinityWorkerIndex: 2 });
      expect(result?.workerIndex).not.toBe(2);
    });

    it('should return rotation even when all busy', () => {
      workers.forEach(w => w.setBusy(true));
      const result = strategy.choose(workers as any);
      expect(result).not.toBeNull();
      expect(result?.metadata?.reason).toBe('all-busy-rotation');
    });

    it('should return null for empty workers array', () => {
      const result = strategy.choose([]);
      expect(result).toBeNull();
    });
  });

  describe('LeastBusyStrategy', () => {
    let strategy: LeastBusyStrategy;
    let workers: MockWorkerHandler[];

    beforeEach(() => {
      strategy = new LeastBusyStrategy();
      workers = createMockWorkers(4);
    });

    it('should select worker with fewest active tasks', () => {
      // Initialize all workers
      workers.forEach((_, i) => strategy.initializeWorker(i));

      // Simulate different loads
      strategy.incrementActiveTasks(0);
      strategy.incrementActiveTasks(0);
      strategy.incrementActiveTasks(1);
      strategy.incrementActiveTasks(2);
      strategy.incrementActiveTasks(2);
      strategy.incrementActiveTasks(2);

      const result = strategy.choose(workers as any);
      expect(result?.workerIndex).toBe(3); // Worker 3 has 0 tasks
    });

    it('should handle equal loads with first available', () => {
      workers.forEach((_, i) => strategy.initializeWorker(i));

      const result1 = strategy.choose(workers as any);
      expect(result1?.workerIndex).toBe(0);
    });

    it('should respect affinity when worker is idle', () => {
      workers.forEach((_, i) => strategy.initializeWorker(i));
      strategy.incrementActiveTasks(1); // Make worker 1 busy

      const result = strategy.choose(workers as any, { affinityWorkerIndex: 0 });
      expect(result?.workerIndex).toBe(0);
      expect(result?.metadata?.reason).toBe('affinity-idle');
    });
  });

  describe('LeastUsedStrategy', () => {
    let strategy: LeastUsedStrategy;
    let workers: MockWorkerHandler[];

    beforeEach(() => {
      strategy = new LeastUsedStrategy();
      workers = createMockWorkers(4);
    });

    it('should select worker with fewest total completed tasks', () => {
      workers.forEach((_, i) => strategy.initializeWorker(i));

      // Simulate different usage history
      strategy.updateStats(0, 100, true);
      strategy.updateStats(0, 100, true);
      strategy.updateStats(1, 100, true);

      const result = strategy.choose(workers as any);
      // Worker 2 and 3 have 0 completed tasks
      expect([2, 3]).toContain(result?.workerIndex);
    });
  });

  describe('FairShareStrategy', () => {
    let strategy: FairShareStrategy;
    let workers: MockWorkerHandler[];

    beforeEach(() => {
      strategy = new FairShareStrategy();
      workers = createMockWorkers(4);
    });

    it('should balance by total execution time', () => {
      workers.forEach((_, i) => strategy.initializeWorker(i));

      // Worker 0 has done lots of work
      strategy.updateStats(0, 1000, true);
      strategy.updateStats(0, 1000, true);

      // Worker 1 has done some work
      strategy.updateStats(1, 500, true);

      // Workers 2 and 3 have done no work
      const result = strategy.choose(workers as any);
      expect([2, 3]).toContain(result?.workerIndex);
    });

    it('should consider active task load', () => {
      workers.forEach((_, i) => strategy.initializeWorker(i));

      // All workers have similar history
      workers.forEach((_, i) => {
        strategy.updateStats(i, 100, true);
      });

      // But worker 0 has active tasks
      strategy.incrementActiveTasks(0);
      strategy.incrementActiveTasks(0);

      const result = strategy.choose(workers as any);
      expect(result?.workerIndex).not.toBe(0);
    });
  });

  describe('WeightedRoundRobinStrategy', () => {
    let strategy: WeightedRoundRobinStrategy;
    let workers: MockWorkerHandler[];

    beforeEach(() => {
      strategy = new WeightedRoundRobinStrategy();
      workers = createMockWorkers(3);
    });

    it('should distribute according to weights', () => {
      strategy.setWeights([3, 2, 1]); // Worker 0: weight 3, Worker 1: weight 2, Worker 2: weight 1

      const selections: number[] = [];
      for (let i = 0; i < 12; i++) {
        const result = strategy.choose(workers as any);
        if (result) {
          selections.push(result.workerIndex);
        }
      }

      // Count selections per worker
      const counts = [0, 0, 0];
      selections.forEach(i => counts[i]++);

      // Worker 0 should get ~50% (weight 3/6)
      // Worker 1 should get ~33% (weight 2/6)
      // Worker 2 should get ~17% (weight 1/6)
      expect(counts[0]).toBeGreaterThan(counts[1]);
      expect(counts[1]).toBeGreaterThan(counts[2]);
    });
  });

  describe('InterleavedWeightedRoundRobinStrategy', () => {
    let strategy: InterleavedWeightedRoundRobinStrategy;
    let workers: MockWorkerHandler[];

    beforeEach(() => {
      strategy = new InterleavedWeightedRoundRobinStrategy();
      workers = createMockWorkers(3);
    });

    it('should interleave selections based on weights', () => {
      strategy.setWeights([2, 1, 1]);

      const selections: number[] = [];
      for (let i = 0; i < 8; i++) {
        const result = strategy.choose(workers as any);
        if (result) {
          selections.push(result.workerIndex);
        }
      }

      // Count selections per worker
      const counts = [0, 0, 0];
      selections.forEach(i => counts[i]++);

      // Worker 0 should get more selections
      expect(counts[0]).toBeGreaterThanOrEqual(counts[1]);
    });
  });

  describe('WorkerChoiceStrategyManager', () => {
    let manager: WorkerChoiceStrategyManager;
    let workers: MockWorkerHandler[];

    beforeEach(() => {
      manager = new WorkerChoiceStrategyManager('least-busy');
      workers = createMockWorkers(4);
    });

    it('should use specified strategy', () => {
      expect(manager.getStrategyName()).toBe('least-busy');
    });

    it('should allow strategy switching', () => {
      manager.setStrategy('round-robin');
      expect(manager.getStrategyName()).toBe('round-robin');

      manager.setStrategy('fair-share');
      expect(manager.getStrategyName()).toBe('fair-share');
    });

    it('should share stats across strategies when using manager methods', () => {
      // Initialize worker in current strategy
      manager.initializeWorker(0);
      manager.initializeWorker(1);

      // Use manager methods which update all strategies
      manager.incrementActiveTasks(0);
      manager.updateStats(0, 100, true);

      // Get stats from current strategy
      const stats = manager.getStats();
      expect(stats.get(0)?.totalTasksCompleted).toBe(1);

      // Initialize the other strategy first, then switch
      manager.setStrategy('least-used');
      manager.initializeWorker(0);
      manager.updateStats(0, 100, true);

      // Now least-used should have stats
      const leastUsedStats = manager.getStats();
      expect(leastUsedStats.get(0)?.totalTasksCompleted).toBe(1);
    });

    it('should reset all strategies', () => {
      manager.initializeWorker(0);
      manager.updateStats(0, 100, true);

      manager.reset();

      const stats = manager.getStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('createStrategy factory', () => {
    it('should create correct strategy types', () => {
      expect(createStrategy('round-robin')).toBeInstanceOf(RoundRobinStrategy);
      expect(createStrategy('least-busy')).toBeInstanceOf(LeastBusyStrategy);
      expect(createStrategy('least-used')).toBeInstanceOf(LeastUsedStrategy);
      expect(createStrategy('fair-share')).toBeInstanceOf(FairShareStrategy);
      expect(createStrategy('weighted-round-robin')).toBeInstanceOf(WeightedRoundRobinStrategy);
      expect(createStrategy('interleaved-weighted-round-robin')).toBeInstanceOf(InterleavedWeightedRoundRobinStrategy);
    });

    it('should throw for unknown strategy', () => {
      expect(() => createStrategy('unknown' as any)).toThrow('Unknown worker choice strategy');
    });
  });
});
