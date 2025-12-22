/**
 * Heartbeat Mechanism Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HeartbeatMonitor,
  createHeartbeatRequest,
  createHeartbeatResponse,
  handleHeartbeatInWorker,
  type HeartbeatConfig,
} from '../../src/ts/core/heartbeat';
import { HEARTBEAT_METHOD_ID, PROTOCOL_VERSION, MessagePriority } from '../../src/ts/types/messages';

describe('HeartbeatMonitor', () => {
  let monitor: HeartbeatMonitor;
  let sendHeartbeat: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    sendHeartbeat = vi.fn();
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      monitor = new HeartbeatMonitor(sendHeartbeat);
      const config = monitor.getConfig();

      expect(config.interval).toBe(5000);
      expect(config.timeout).toBe(3000);
      expect(config.maxMissed).toBe(3);
      expect(config.autoRecover).toBe(true);
    });

    it('should accept custom config', () => {
      const customConfig: HeartbeatConfig = {
        interval: 1000,
        timeout: 500,
        maxMissed: 5,
        autoRecover: false,
      };

      monitor = new HeartbeatMonitor(sendHeartbeat, customConfig);
      const config = monitor.getConfig();

      expect(config.interval).toBe(1000);
      expect(config.timeout).toBe(500);
      expect(config.maxMissed).toBe(5);
      expect(config.autoRecover).toBe(false);
    });
  });

  describe('worker registration', () => {
    it('should register workers', () => {
      monitor = new HeartbeatMonitor(sendHeartbeat);

      monitor.registerWorker('worker-1');
      monitor.registerWorker('worker-2');

      expect(monitor.isResponsive('worker-1')).toBe(true);
      expect(monitor.isResponsive('worker-2')).toBe(true);
    });

    it('should not duplicate workers', () => {
      monitor = new HeartbeatMonitor(sendHeartbeat);

      monitor.registerWorker('worker-1');
      monitor.registerWorker('worker-1');

      const stats = monitor.getAllStats();
      expect(stats.length).toBe(1);
    });

    it('should unregister workers', () => {
      monitor = new HeartbeatMonitor(sendHeartbeat);

      monitor.registerWorker('worker-1');
      monitor.unregisterWorker('worker-1');

      expect(monitor.isResponsive('worker-1')).toBe(false);
      expect(monitor.getStats('worker-1')).toBeNull();
    });
  });

  describe('start/stop', () => {
    it('should start monitoring', () => {
      monitor = new HeartbeatMonitor(sendHeartbeat);
      monitor.registerWorker('worker-1');

      monitor.start();

      expect(monitor.isMonitoring()).toBe(true);
      expect(sendHeartbeat).toHaveBeenCalledTimes(1);
    });

    it('should send heartbeats at interval', () => {
      monitor = new HeartbeatMonitor(sendHeartbeat, { interval: 1000, timeout: 500 });
      monitor.registerWorker('worker-1');

      monitor.start();
      expect(sendHeartbeat).toHaveBeenCalledTimes(1);

      // Respond to first heartbeat to clear pending state
      monitor.handleResponse('worker-1', createHeartbeatResponse(0, 'alive'));

      vi.advanceTimersByTime(1000);
      expect(sendHeartbeat).toHaveBeenCalledTimes(2);

      // Respond to second heartbeat to clear pending state
      monitor.handleResponse('worker-1', createHeartbeatResponse(1, 'alive'));

      vi.advanceTimersByTime(1000);
      expect(sendHeartbeat).toHaveBeenCalledTimes(3);
    });

    it('should stop monitoring', () => {
      monitor = new HeartbeatMonitor(sendHeartbeat, { interval: 1000 });
      monitor.registerWorker('worker-1');

      monitor.start();
      monitor.stop();

      expect(monitor.isMonitoring()).toBe(false);

      // Should not send more heartbeats after stop
      const callCount = sendHeartbeat.mock.calls.length;
      vi.advanceTimersByTime(5000);
      expect(sendHeartbeat).toHaveBeenCalledTimes(callCount);
    });

    it('should be idempotent', () => {
      monitor = new HeartbeatMonitor(sendHeartbeat);
      monitor.registerWorker('worker-1');

      monitor.start();
      monitor.start();
      monitor.start();

      // Should only have one interval
      expect(sendHeartbeat).toHaveBeenCalledTimes(1);

      monitor.stop();
      monitor.stop();
      monitor.stop();

      expect(monitor.isMonitoring()).toBe(false);
    });
  });

  describe('handleResponse', () => {
    it('should update stats on response', () => {
      monitor = new HeartbeatMonitor(sendHeartbeat, { interval: 1000 });
      monitor.registerWorker('worker-1');

      monitor.start();

      // Simulate response after 50ms
      vi.advanceTimersByTime(50);
      monitor.handleResponse('worker-1', createHeartbeatResponse(0, 'alive'));

      const stats = monitor.getStats('worker-1');
      expect(stats?.isResponsive).toBe(true);
      expect(stats?.successCount).toBe(1);
      expect(stats?.missedCount).toBe(0);
    });

    it('should track latency', () => {
      monitor = new HeartbeatMonitor(sendHeartbeat, { interval: 1000 });
      monitor.registerWorker('worker-1');

      monitor.start();

      // Simulate responses with different latencies
      vi.advanceTimersByTime(100);
      monitor.handleResponse('worker-1', createHeartbeatResponse(0, 'alive'));

      vi.advanceTimersByTime(900); // Next heartbeat at 1000ms
      vi.advanceTimersByTime(50);
      monitor.handleResponse('worker-1', createHeartbeatResponse(1, 'busy'));

      const stats = monitor.getStats('worker-1');
      expect(stats?.avgLatency).toBeGreaterThan(0);
    });
  });

  describe('timeout handling', () => {
    it('should mark worker as unresponsive after max missed', () => {
      const onUnresponsive = vi.fn();
      monitor = new HeartbeatMonitor(sendHeartbeat, {
        interval: 1000,
        timeout: 500,
        maxMissed: 2,
        onUnresponsive,
      });
      monitor.registerWorker('worker-1');

      monitor.start();

      // First timeout
      vi.advanceTimersByTime(500);
      expect(onUnresponsive).not.toHaveBeenCalled();

      // Second timeout
      vi.advanceTimersByTime(1000);
      expect(onUnresponsive).toHaveBeenCalledWith('worker-1', 2);

      expect(monitor.isResponsive('worker-1')).toBe(false);
    });

    it('should recover after successful heartbeat', () => {
      const onUnresponsive = vi.fn();
      const onRecovered = vi.fn();
      monitor = new HeartbeatMonitor(sendHeartbeat, {
        interval: 1000,
        timeout: 500,
        maxMissed: 1,
        onUnresponsive,
        onRecovered,
      });
      monitor.registerWorker('worker-1');

      monitor.start();

      // First timeout - marked unresponsive
      vi.advanceTimersByTime(500);
      expect(onUnresponsive).toHaveBeenCalled();

      // Next heartbeat interval
      vi.advanceTimersByTime(500);

      // Respond - should recover
      monitor.handleResponse('worker-1', createHeartbeatResponse(1, 'alive'));
      expect(onRecovered).toHaveBeenCalledWith('worker-1');
      expect(monitor.isResponsive('worker-1')).toBe(true);
    });
  });

  describe('getUnresponsiveWorkers', () => {
    it('should return list of unresponsive workers', () => {
      monitor = new HeartbeatMonitor(sendHeartbeat, {
        interval: 1000,
        timeout: 500,
        maxMissed: 1,
      });
      monitor.registerWorker('worker-1');
      monitor.registerWorker('worker-2');

      monitor.start();

      // Timeout for worker-1
      vi.advanceTimersByTime(500);

      // Respond for worker-2
      monitor.handleResponse('worker-2', createHeartbeatResponse(1, 'alive'));

      const unresponsive = monitor.getUnresponsiveWorkers();
      expect(unresponsive).toContain('worker-1');
      expect(unresponsive).not.toContain('worker-2');
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      monitor = new HeartbeatMonitor(sendHeartbeat, { interval: 1000 });

      monitor.updateConfig({ interval: 2000, maxMissed: 5 });

      const config = monitor.getConfig();
      expect(config.interval).toBe(2000);
      expect(config.maxMissed).toBe(5);
    });

    it('should restart monitoring when interval changes', () => {
      monitor = new HeartbeatMonitor(sendHeartbeat, { interval: 1000 });
      monitor.registerWorker('worker-1');

      monitor.start();
      const initialCalls = sendHeartbeat.mock.calls.length;

      monitor.updateConfig({ interval: 500 });

      // Should have restarted and sent immediate heartbeat
      expect(sendHeartbeat.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });

  describe('heartbeat callbacks', () => {
    it('should call onHeartbeat callback', () => {
      const onHeartbeat = vi.fn();
      monitor = new HeartbeatMonitor(sendHeartbeat, {
        interval: 1000,
        onHeartbeat,
      });
      monitor.registerWorker('worker-1');

      monitor.start();
      vi.advanceTimersByTime(50);
      monitor.handleResponse('worker-1', createHeartbeatResponse(0, 'busy', { taskCount: 3 }));

      expect(onHeartbeat).toHaveBeenCalledWith('worker-1', expect.any(Number), 'busy');
    });
  });
});

describe('createHeartbeatRequest', () => {
  it('should create valid heartbeat request', () => {
    const request = createHeartbeatRequest(42, 'worker-1');

    expect(request.id).toBe(42);
    expect(request.method).toBe(HEARTBEAT_METHOD_ID);
    expect(request.workerId).toBe('worker-1');
    expect(request.v).toBe(PROTOCOL_VERSION);
    expect(request.priority).toBe(MessagePriority.HIGH);
    expect(request.ts).toBeDefined();
  });
});

describe('createHeartbeatResponse', () => {
  it('should create valid heartbeat response', () => {
    const response = createHeartbeatResponse(42, 'alive', {
      taskCount: 5,
      memoryUsage: 1024 * 1024,
      uptime: 60000,
    });

    expect(response.id).toBe(42);
    expect(response.method).toBe(HEARTBEAT_METHOD_ID);
    expect(response.status).toBe('alive');
    expect(response.taskCount).toBe(5);
    expect(response.memoryUsage).toBe(1024 * 1024);
    expect(response.uptime).toBe(60000);
    expect(response.v).toBe(PROTOCOL_VERSION);
  });

  it('should handle minimal response', () => {
    const response = createHeartbeatResponse(1, 'idle');

    expect(response.status).toBe('idle');
    expect(response.taskCount).toBeUndefined();
    expect(response.memoryUsage).toBeUndefined();
    expect(response.uptime).toBeUndefined();
  });
});

describe('handleHeartbeatInWorker', () => {
  it('should create response from worker status', () => {
    const request = createHeartbeatRequest(42, 'worker-1');
    const getStatus = () => ({
      status: 'busy' as const,
      taskCount: 3,
      memoryUsage: 2048,
      uptime: 5000,
    });

    const response = handleHeartbeatInWorker(request, getStatus);

    expect(response.id).toBe(42);
    expect(response.status).toBe('busy');
    expect(response.taskCount).toBe(3);
    expect(response.memoryUsage).toBe(2048);
    expect(response.uptime).toBe(5000);
  });
});
