/**
 * Debug/Verbose Mode Logging
 *
 * Provides configurable logging for dispatch decisions, task scheduling,
 * and worker lifecycle events. Disabled by default for production use.
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * Log levels for debug output
 */
export enum LogLevel {
  /** No logging */
  OFF = 0,
  /** Error messages only */
  ERROR = 1,
  /** Errors and warnings */
  WARN = 2,
  /** General information */
  INFO = 3,
  /** Detailed debug information */
  DEBUG = 4,
  /** Very detailed trace information */
  TRACE = 5,
}

/**
 * Log categories for filtering
 */
export enum LogCategory {
  /** Pool lifecycle events (create, terminate) */
  POOL = 'pool',
  /** Worker lifecycle events (spawn, terminate) */
  WORKER = 'worker',
  /** Task scheduling and dispatch */
  TASK = 'task',
  /** Queue operations */
  QUEUE = 'queue',
  /** WASM operations */
  WASM = 'wasm',
  /** Transfer and serialization */
  TRANSFER = 'transfer',
  /** Performance metrics */
  PERF = 'perf',
}

/**
 * Debug configuration options
 */
export interface DebugConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Categories to enable (empty = all) */
  categories: Set<LogCategory>;
  /** Custom log handler (default: console) */
  handler?: LogHandler;
  /** Include timestamps in output */
  timestamps: boolean;
  /** Include category prefix in output */
  showCategory: boolean;
  /** Include log level prefix in output */
  showLevel: boolean;
  /** Performance tracking enabled */
  perfTracking: boolean;
}

/**
 * Custom log handler function
 */
export type LogHandler = (
  level: LogLevel,
  category: LogCategory,
  message: string,
  data?: unknown
) => void;

/**
 * Performance measurement entry
 */
export interface PerfEntry {
  name: string;
  category: LogCategory;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Global State
// ============================================================================

const defaultConfig: DebugConfig = {
  level: LogLevel.OFF,
  categories: new Set(),
  timestamps: true,
  showCategory: true,
  showLevel: true,
  perfTracking: false,
};

let config: DebugConfig = { ...defaultConfig };
const perfEntries: PerfEntry[] = [];
const perfMarks: Map<string, PerfEntry> = new Map();

// ============================================================================
// Configuration API
// ============================================================================

/**
 * Enable debug mode with specified options
 *
 * @example
 * ```typescript
 * // Enable all debug logging
 * enableDebug({ level: LogLevel.DEBUG });
 *
 * // Enable only task and worker logging
 * enableDebug({
 *   level: LogLevel.INFO,
 *   categories: [LogCategory.TASK, LogCategory.WORKER]
 * });
 *
 * // Use custom log handler
 * enableDebug({
 *   level: LogLevel.DEBUG,
 *   handler: (level, cat, msg, data) => {
 *     myLogger.log({ level, category: cat, message: msg, data });
 *   }
 * });
 * ```
 */
export function enableDebug(options: Partial<DebugConfig> = {}): void {
  config = {
    ...defaultConfig,
    level: options.level ?? LogLevel.DEBUG,
    categories: options.categories
      ? new Set(options.categories)
      : new Set(),
    handler: options.handler,
    timestamps: options.timestamps ?? true,
    showCategory: options.showCategory ?? true,
    showLevel: options.showLevel ?? true,
    perfTracking: options.perfTracking ?? false,
  };
}

/**
 * Disable debug mode
 */
export function disableDebug(): void {
  config = { ...defaultConfig };
}

/**
 * Get current debug configuration
 */
export function getDebugConfig(): Readonly<DebugConfig> {
  return { ...config };
}

/**
 * Check if debug is enabled
 */
export function isDebugEnabled(): boolean {
  return config.level > LogLevel.OFF;
}

/**
 * Check if a specific category is enabled
 */
export function isCategoryEnabled(category: LogCategory): boolean {
  if (config.level === LogLevel.OFF) return false;
  if (config.categories.size === 0) return true; // Empty = all enabled
  return config.categories.has(category);
}

// ============================================================================
// Logging Functions
// ============================================================================

const levelNames: Record<LogLevel, string> = {
  [LogLevel.OFF]: 'OFF',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.TRACE]: 'TRACE',
};

function formatMessage(
  level: LogLevel,
  category: LogCategory,
  message: string
): string {
  const parts: string[] = [];

  if (config.timestamps) {
    parts.push(`[${new Date().toISOString()}]`);
  }

  if (config.showLevel) {
    parts.push(`[${levelNames[level]}]`);
  }

  if (config.showCategory) {
    parts.push(`[${category}]`);
  }

  parts.push(message);
  return parts.join(' ');
}

function log(
  level: LogLevel,
  category: LogCategory,
  message: string,
  data?: unknown
): void {
  // Check if we should log
  if (level > config.level) return;
  if (!isCategoryEnabled(category)) return;

  const formatted = formatMessage(level, category, message);

  // Use custom handler if provided
  if (config.handler) {
    config.handler(level, category, message, data);
    return;
  }

  // Default console logging
  const logData = data !== undefined ? [formatted, data] : [formatted];

  switch (level) {
    case LogLevel.ERROR:
      console.error(...logData);
      break;
    case LogLevel.WARN:
      console.warn(...logData);
      break;
    case LogLevel.INFO:
      console.info(...logData);
      break;
    case LogLevel.DEBUG:
    case LogLevel.TRACE:
    default:
      console.log(...logData);
      break;
  }
}

// ============================================================================
// Category-Specific Loggers
// ============================================================================

/**
 * Create a logger for a specific category
 */
function createCategoryLogger(category: LogCategory) {
  return {
    error: (message: string, data?: unknown) =>
      log(LogLevel.ERROR, category, message, data),
    warn: (message: string, data?: unknown) =>
      log(LogLevel.WARN, category, message, data),
    info: (message: string, data?: unknown) =>
      log(LogLevel.INFO, category, message, data),
    debug: (message: string, data?: unknown) =>
      log(LogLevel.DEBUG, category, message, data),
    trace: (message: string, data?: unknown) =>
      log(LogLevel.TRACE, category, message, data),
  };
}

/** Pool lifecycle logging */
export const poolLog = createCategoryLogger(LogCategory.POOL);

/** Worker lifecycle logging */
export const workerLog = createCategoryLogger(LogCategory.WORKER);

/** Task scheduling logging */
export const taskLog = createCategoryLogger(LogCategory.TASK);

/** Queue operations logging */
export const queueLog = createCategoryLogger(LogCategory.QUEUE);

/** WASM operations logging */
export const wasmLog = createCategoryLogger(LogCategory.WASM);

/** Transfer operations logging */
export const transferLog = createCategoryLogger(LogCategory.TRANSFER);

/** Performance logging */
export const perfLog = createCategoryLogger(LogCategory.PERF);

// ============================================================================
// Performance Tracking
// ============================================================================

/**
 * Start a performance measurement
 *
 * @example
 * ```typescript
 * const id = perfStart('taskExecution', LogCategory.TASK, { taskId: 123 });
 * // ... do work ...
 * perfEnd(id);
 * ```
 */
export function perfStart(
  name: string,
  category: LogCategory = LogCategory.PERF,
  metadata?: Record<string, unknown>
): string {
  if (!config.perfTracking) return '';

  const id = `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const entry: PerfEntry = {
    name,
    category,
    startTime: performance.now(),
    metadata,
  };

  perfMarks.set(id, entry);
  return id;
}

/**
 * End a performance measurement
 */
export function perfEnd(id: string): PerfEntry | null {
  if (!config.perfTracking || !id) return null;

  const entry = perfMarks.get(id);
  if (!entry) return null;

  entry.endTime = performance.now();
  entry.duration = entry.endTime - entry.startTime;

  perfMarks.delete(id);
  perfEntries.push(entry);

  perfLog.debug(`${entry.name}: ${entry.duration.toFixed(2)}ms`, entry.metadata);

  return entry;
}

/**
 * Get all recorded performance entries
 */
export function getPerfEntries(): readonly PerfEntry[] {
  return [...perfEntries];
}

/**
 * Clear performance entries
 */
export function clearPerfEntries(): void {
  perfEntries.length = 0;
  perfMarks.clear();
}

/**
 * Get performance summary statistics
 */
export function getPerfSummary(): Record<string, {
  count: number;
  total: number;
  avg: number;
  min: number;
  max: number;
}> {
  const summary: Record<string, {
    count: number;
    total: number;
    avg: number;
    min: number;
    max: number;
  }> = {};

  for (const entry of perfEntries) {
    if (entry.duration === undefined) continue;

    if (!summary[entry.name]) {
      summary[entry.name] = {
        count: 0,
        total: 0,
        avg: 0,
        min: Infinity,
        max: -Infinity,
      };
    }

    const stat = summary[entry.name];
    stat.count++;
    stat.total += entry.duration;
    stat.min = Math.min(stat.min, entry.duration);
    stat.max = Math.max(stat.max, entry.duration);
    stat.avg = stat.total / stat.count;
  }

  return summary;
}

// ============================================================================
// Debugging Utilities
// ============================================================================

/**
 * Wrap a function to log its calls
 */
export function traced<T extends (...args: any[]) => any>(
  fn: T,
  name: string,
  category: LogCategory = LogCategory.TASK
): T {
  return ((...args: Parameters<T>): ReturnType<T> => {
    const id = perfStart(name, category, { args });
    taskLog.trace(`${name} called`, { args });

    try {
      const result = fn(...args);

      // Handle promises
      if (result && typeof result.then === 'function') {
        return result.then(
          (value: unknown) => {
            perfEnd(id);
            taskLog.trace(`${name} resolved`, { result: value });
            return value;
          },
          (error: unknown) => {
            perfEnd(id);
            taskLog.error(`${name} rejected`, { error });
            throw error;
          }
        ) as ReturnType<T>;
      }

      perfEnd(id);
      taskLog.trace(`${name} returned`, { result });
      return result;
    } catch (error) {
      perfEnd(id);
      taskLog.error(`${name} threw`, { error });
      throw error;
    }
  }) as T;
}

/**
 * Log task dispatch decision
 */
export function logDispatch(
  taskId: string | number,
  workerId: string | number,
  queueSize: number,
  busyWorkers: number,
  idleWorkers: number
): void {
  taskLog.debug(`Task ${taskId} dispatched to worker ${workerId}`, {
    queueSize,
    busyWorkers,
    idleWorkers,
  });
}

/**
 * Log queue operation
 */
export function logQueueOp(
  operation: 'push' | 'pop' | 'clear',
  size: number,
  taskId?: string | number
): void {
  queueLog.debug(`Queue ${operation}`, { size, taskId });
}

/**
 * Log worker lifecycle event
 */
export function logWorkerEvent(
  event: 'spawn' | 'ready' | 'busy' | 'idle' | 'terminate' | 'error',
  workerId: string | number,
  details?: Record<string, unknown>
): void {
  const logFn = event === 'error' ? workerLog.error : workerLog.info;
  logFn(`Worker ${workerId}: ${event}`, details);
}

/**
 * Log pool lifecycle event
 */
export function logPoolEvent(
  event: 'create' | 'terminate' | 'resize',
  poolId: string,
  details?: Record<string, unknown>
): void {
  poolLog.info(`Pool ${poolId}: ${event}`, details);
}
