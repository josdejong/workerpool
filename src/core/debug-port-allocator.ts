/**
 * Debug Port Allocator for workerpool
 *
 * Manages debug port allocation for worker processes to avoid conflicts
 * when running multiple workers with debugging enabled.
 */

/** Maximum valid port number */
const MAX_PORTS = 65535;

/**
 * Allocator for debug ports across worker processes
 *
 * Ensures each worker gets a unique debug port when running with
 * Node.js inspector enabled (--inspect flag).
 */
export class DebugPortAllocator {
  /** Map of allocated ports */
  private ports: Record<number, boolean> = Object.create(null);

  /** Number of currently allocated ports */
  private _length = 0;

  /**
   * Get the number of allocated ports
   */
  get length(): number {
    return this._length;
  }

  /**
   * Get the next available port starting at the given number
   *
   * @param starting - Port number to start searching from
   * @returns The allocated port number
   * @throws Error if no ports available (all ports >= starting are taken up to MAX_PORTS)
   */
  nextAvailableStartingAt(starting: number): number {
    while (this.ports[starting] === true) {
      starting++;
    }

    if (starting >= MAX_PORTS) {
      throw new Error(
        `WorkerPool debug port limit reached: ${starting} >= ${MAX_PORTS}`
      );
    }

    this.ports[starting] = true;
    this._length++;
    return starting;
  }

  /**
   * Release a previously allocated port
   *
   * @param port - Port number to release
   */
  releasePort(port: number): void {
    if (this.ports[port]) {
      delete this.ports[port];
      this._length--;
    }
  }

  /**
   * Check if a port is currently allocated
   *
   * @param port - Port number to check
   * @returns True if port is allocated
   */
  isAllocated(port: number): boolean {
    return this.ports[port] === true;
  }

  /**
   * Release all allocated ports
   */
  releaseAll(): void {
    this.ports = Object.create(null);
    this._length = 0;
  }
}

/**
 * Default export for backward compatibility
 */
export default DebugPortAllocator;
