/**
 * Option validation utilities for workerpool
 *
 * Validates that configuration objects only contain known option names
 * and don't have inherited properties that could cause issues.
 */

/**
 * Validate that an object only contains allowed option names
 *
 * @param options - The options object to validate
 * @param allowedOptionNames - Array of allowed property names
 * @param objectName - Name of the object for error messages
 * @returns The original options object
 * @throws Error if unknown or inherited options are detected
 *
 * @example
 * validateOptions(
 *   { maxWorkers: 4, unknownOpt: true },
 *   ['maxWorkers', 'minWorkers'],
 *   'poolOptions'
 * );
 * // Throws: Object "poolOptions" contains an unknown option "unknownOpt"
 */
export function validateOptions<T extends Record<string, unknown>>(
  options: T | undefined,
  allowedOptionNames: readonly string[],
  objectName: string
): T | undefined {
  if (!options) {
    return undefined;
  }

  const optionNames = Object.keys(options);

  // Check for unknown properties
  const unknownOptionName = optionNames.find(
    (optionName) => !allowedOptionNames.includes(optionName)
  );

  if (unknownOptionName) {
    throw new Error(
      `Object "${objectName}" contains an unknown option "${unknownOptionName}"`
    );
  }

  // Check for inherited properties that are not defined on the object itself
  // This catches cases where someone passes an object with a polluted prototype
  const illegalOptionName = allowedOptionNames.find((allowedOptionName) => {
    return (
      Object.prototype.hasOwnProperty.call(Object.prototype, allowedOptionName) &&
      !optionNames.includes(allowedOptionName)
    );
  });

  if (illegalOptionName) {
    throw new Error(
      `Object "${objectName}" contains an inherited option "${illegalOptionName}" which is ` +
        'not defined in the object itself but in its prototype. Only plain objects are allowed. ' +
        'Please remove the option from the prototype or override it with a value "undefined".'
    );
  }

  return options;
}

/**
 * Allowed option names for Web Worker constructor
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker
 */
export const workerOptsNames = ['credentials', 'name', 'type'] as const;

/**
 * Allowed option names for child_process.fork()
 * @see https://nodejs.org/api/child_process.html#child_processforkmodulepath-args-options
 */
export const forkOptsNames = [
  'cwd',
  'detached',
  'env',
  'execPath',
  'execArgv',
  'gid',
  'serialization',
  'signal',
  'killSignal',
  'silent',
  'stdio',
  'uid',
  'windowsVerbatimArguments',
  'timeout',
] as const;

/**
 * Allowed option names for worker_threads Worker constructor
 * @see https://nodejs.org/api/worker_threads.html#new-workerfilename-options
 */
export const workerThreadOptsNames = [
  'argv',
  'env',
  'eval',
  'execArgv',
  'stdin',
  'stdout',
  'stderr',
  'workerData',
  'trackUnmanagedFds',
  'transferList',
  'resourceLimits',
  'name',
] as const;

/**
 * Allowed option names for Pool constructor
 */
export const poolOptsNames = [
  'minWorkers',
  'maxWorkers',
  'maxQueueSize',
  'workerType',
  'queueStrategy',
  'script',
  'workerTerminateTimeout',
  'forkArgs',
  'forkOpts',
  'workerOpts',
  'workerThreadOpts',
  'emitStdStreams',
  'onCreateWorker',
  'onTerminateWorker',
] as const;

/**
 * Allowed option names for exec() method
 */
export const execOptsNames = ['on', 'transfer', 'metadata'] as const;

/**
 * Type for worker options
 */
export type WorkerOptsName = (typeof workerOptsNames)[number];

/**
 * Type for fork options
 */
export type ForkOptsName = (typeof forkOptsNames)[number];

/**
 * Type for worker thread options
 */
export type WorkerThreadOptsName = (typeof workerThreadOptsNames)[number];

/**
 * Type for pool options
 */
export type PoolOptsName = (typeof poolOptsNames)[number];

/**
 * Type for exec options
 */
export type ExecOptsName = (typeof execOptsNames)[number];

/**
 * Validate pool options
 */
export function validatePoolOptions<T extends Record<string, unknown>>(
  options: T | undefined
): T | undefined {
  return validateOptions(options, poolOptsNames, 'poolOptions');
}

/**
 * Validate fork options
 */
export function validateForkOptions<T extends Record<string, unknown>>(
  options: T | undefined
): T | undefined {
  return validateOptions(options, forkOptsNames, 'forkOpts');
}

/**
 * Validate worker thread options
 */
export function validateWorkerThreadOptions<T extends Record<string, unknown>>(
  options: T | undefined
): T | undefined {
  return validateOptions(options, workerThreadOptsNames, 'workerThreadOpts');
}

/**
 * Validate web worker options
 */
export function validateWorkerOptions<T extends Record<string, unknown>>(
  options: T | undefined
): T | undefined {
  return validateOptions(options, workerOptsNames, 'workerOpts');
}

/**
 * Validate exec options
 */
export function validateExecOptions<T extends Record<string, unknown>>(
  options: T | undefined
): T | undefined {
  return validateOptions(options, execOptsNames, 'execOptions');
}

/**
 * Default export for backward compatibility
 */
export default {
  validateOptions,
  workerOptsNames,
  forkOptsNames,
  workerThreadOptsNames,
  poolOptsNames,
  execOptsNames,
  validatePoolOptions,
  validateForkOptions,
  validateWorkerThreadOptions,
  validateWorkerOptions,
  validateExecOptions,
};
