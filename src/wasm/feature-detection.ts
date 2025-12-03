/**
 * WASM Feature Detection
 *
 * Detects availability of WASM features required for high-performance queues.
 * Provides fallback recommendations when features are unavailable.
 */

/**
 * Feature availability status
 */
export interface WASMFeatureStatus {
  /** WebAssembly is available */
  webAssembly: boolean;
  /** SharedArrayBuffer is available and usable */
  sharedArrayBuffer: boolean;
  /** Atomics API is available */
  atomics: boolean;
  /** All features required for WASM queues are available */
  allFeaturesAvailable: boolean;
  /** Reason why features are unavailable (if any) */
  unavailableReason?: string;
}

/**
 * Check if WebAssembly is available
 */
export function hasWebAssembly(): boolean {
  return (
    typeof WebAssembly !== 'undefined' &&
    typeof WebAssembly.instantiate === 'function'
  );
}

/**
 * Check if SharedArrayBuffer is available and usable
 *
 * Note: SharedArrayBuffer may exist but be restricted due to
 * Cross-Origin-Opener-Policy (COOP) and Cross-Origin-Embedder-Policy (COEP) headers.
 */
export function hasSharedArrayBuffer(): boolean {
  try {
    if (typeof SharedArrayBuffer === 'undefined') {
      return false;
    }

    // Try to create a SharedArrayBuffer to verify it's usable
    // This may fail due to security policies
    const buffer = new SharedArrayBuffer(1);
    return buffer.byteLength === 1;
  } catch {
    return false;
  }
}

/**
 * Check if Atomics API is available
 */
export function hasAtomics(): boolean {
  return (
    typeof Atomics !== 'undefined' &&
    typeof Atomics.load === 'function' &&
    typeof Atomics.store === 'function' &&
    typeof Atomics.compareExchange === 'function'
  );
}

/**
 * Check if WebAssembly threading/shared memory is supported
 */
export function hasWASMThreads(): boolean {
  if (!hasWebAssembly()) {
    return false;
  }

  try {
    // Check if WASM shared memory is supported
    const memory = new WebAssembly.Memory({
      initial: 1,
      maximum: 1,
      shared: true,
    });
    return memory.buffer instanceof SharedArrayBuffer;
  } catch {
    return false;
  }
}

/**
 * Detect all WASM features and return status
 */
export function detectWASMFeatures(): WASMFeatureStatus {
  const webAssembly = hasWebAssembly();
  const sharedArrayBuffer = hasSharedArrayBuffer();
  const atomics = hasAtomics();

  const allFeaturesAvailable = webAssembly && sharedArrayBuffer && atomics;

  let unavailableReason: string | undefined;

  if (!webAssembly) {
    unavailableReason = 'WebAssembly is not available in this environment';
  } else if (!sharedArrayBuffer) {
    unavailableReason =
      'SharedArrayBuffer is not available. This may be due to missing ' +
      'Cross-Origin-Opener-Policy (COOP) and Cross-Origin-Embedder-Policy (COEP) headers.';
  } else if (!atomics) {
    unavailableReason = 'Atomics API is not available';
  }

  return {
    webAssembly,
    sharedArrayBuffer,
    atomics,
    allFeaturesAvailable,
    unavailableReason,
  };
}

/**
 * Get recommended queue implementation based on feature availability
 */
export function getRecommendedQueueType(): 'wasm' | 'fifo' | 'lifo' {
  const features = detectWASMFeatures();

  if (features.allFeaturesAvailable) {
    return 'wasm';
  }

  // Fallback to JavaScript FIFO queue
  return 'fifo';
}

/**
 * Log warning if WASM features are not available
 */
export function warnIfWASMUnavailable(): void {
  const features = detectWASMFeatures();

  if (!features.allFeaturesAvailable && features.unavailableReason) {
    console.warn(
      `[workerpool] WASM queue unavailable: ${features.unavailableReason}. ` +
      'Falling back to JavaScript queue implementation.'
    );
  }
}

/**
 * Check if we're in a secure context (required for SharedArrayBuffer in browsers)
 */
export function isSecureContext(): boolean {
  if (typeof self !== 'undefined' && 'isSecureContext' in self) {
    return self.isSecureContext;
  }

  // Node.js is always considered secure
  if (typeof process !== 'undefined' && process.versions?.node) {
    return true;
  }

  return false;
}

/**
 * Get detailed feature report for debugging
 */
export function getFeatureReport(): string {
  const features = detectWASMFeatures();
  const lines: string[] = [
    '=== WASM Feature Report ===',
    `WebAssembly: ${features.webAssembly ? 'YES' : 'NO'}`,
    `SharedArrayBuffer: ${features.sharedArrayBuffer ? 'YES' : 'NO'}`,
    `Atomics: ${features.atomics ? 'YES' : 'NO'}`,
    `WASM Threads: ${hasWASMThreads() ? 'YES' : 'NO'}`,
    `Secure Context: ${isSecureContext() ? 'YES' : 'NO'}`,
    `All Features Available: ${features.allFeaturesAvailable ? 'YES' : 'NO'}`,
  ];

  if (features.unavailableReason) {
    lines.push(`Unavailable Reason: ${features.unavailableReason}`);
  }

  lines.push(`Recommended Queue Type: ${getRecommendedQueueType()}`);
  lines.push('===========================');

  return lines.join('\n');
}
