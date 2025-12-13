# Browser Support

workerpool v11.0.0 supports modern browsers with Web Worker capabilities.

## Support Matrix

| Browser | Version | Web Workers | SharedArrayBuffer | WASM SIMD |
|---------|---------|-------------|-------------------|-----------|
| Chrome | 80+ | Full | With headers | 91+ |
| Firefox | 79+ | Full | With headers | 89+ |
| Safari | 14.1+ | Full | 15.2+ with headers | 16.4+ |
| Edge | 80+ | Full | With headers | 91+ |

## Feature Requirements

### Core Features (Required)

- **Web Workers**: All supported browsers
- **ES2020+**: async/await, BigInt, optional chaining
- **Structured Clone**: For message passing

### Optional Features

#### SharedArrayBuffer

Enables zero-copy data transfer and lock-free queues.

**Requirements:**
1. Secure context (HTTPS or localhost)
2. Cross-Origin-Opener-Policy: `same-origin`
3. Cross-Origin-Embedder-Policy: `require-corp`

**Server Configuration:**

```nginx
# Nginx
add_header Cross-Origin-Opener-Policy same-origin;
add_header Cross-Origin-Embedder-Policy require-corp;
```

```apache
# Apache
Header set Cross-Origin-Opener-Policy "same-origin"
Header set Cross-Origin-Embedder-Policy "require-corp"
```

```javascript
// Express.js
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});
```

**Detection:**

```javascript
import { canUseSharedMemory } from '@danielsimonjr/workerpool/wasm';

if (canUseSharedMemory()) {
  console.log('SharedArrayBuffer available');
}
```

#### WASM SIMD

Enables SIMD-accelerated batch operations for numeric data.

**Browser Support:**
- Chrome 91+
- Firefox 89+
- Safari 16.4+
- Edge 91+

**Detection:**

```javascript
import { canUseSIMD } from '@danielsimonjr/workerpool/wasm';

if (canUseSIMD()) {
  console.log('WASM SIMD available');
}
```

## Bundle Size

| Entry Point | Minified | Gzipped |
|-------------|----------|---------|
| `workerpool` (legacy) | ~50KB | ~15KB |
| `workerpool/minimal` | ~5KB | ~2KB |
| `workerpool/full` | ~15KB | ~5KB |

## Polyfills

workerpool v11 does not require polyfills for modern browsers. If supporting older browsers:

### For IE11 (Not Recommended)

IE11 is not supported. Web Workers have limited functionality and SharedArrayBuffer is unavailable.

### For Older Mobile Browsers

Some older mobile browsers may need polyfills for:
- `Promise.finally()`
- `BigInt` (only if using WASM features)

## Testing Browser Support

### Feature Detection

```javascript
import workerpool from '@danielsimonjr/workerpool';

// Check Web Worker support
if (typeof Worker === 'undefined') {
  console.error('Web Workers not supported');
}

// Check SharedArrayBuffer support
if (typeof SharedArrayBuffer !== 'undefined') {
  console.log('SharedArrayBuffer available');
}

// Check Atomics support
if (typeof Atomics !== 'undefined') {
  console.log('Atomics available');
}

// Check WebAssembly support
if (typeof WebAssembly !== 'undefined') {
  console.log('WebAssembly available');
}
```

### Runtime Feature Detection

```javascript
import {
  canUseWasm,
  canUseSharedMemory,
  getFeatureReport,
} from '@danielsimonjr/workerpool/wasm';

console.log(getFeatureReport());
// Output:
// WebAssembly: supported
// SharedArrayBuffer: supported
// Atomics: supported
// WASM Threads: supported (with headers)
```

## Known Issues

### Safari

1. **SharedArrayBuffer**: Requires Safari 15.2+ AND proper COOP/COEP headers
2. **WASM SIMD**: Requires Safari 16.4+

### Firefox

1. **SharedArrayBuffer in Private Browsing**: May be disabled in private/incognito mode

### Chrome

1. **Site Isolation**: SharedArrayBuffer requires site isolation to be enabled (default since Chrome 92)

## Mobile Browser Support

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome Mobile | 80+ | Full support |
| Safari iOS | 14.5+ | Full support |
| Firefox Mobile | 79+ | Full support |
| Samsung Internet | 13.0+ | Full support |

## Recommendations

1. **Use feature detection** rather than browser sniffing
2. **Provide fallbacks** for environments without SharedArrayBuffer
3. **Test on real devices** for accurate performance metrics
4. **Consider bundle size** for mobile users

## Degraded Mode

When advanced features are unavailable, workerpool automatically falls back to:

| Missing Feature | Fallback |
|----------------|----------|
| SharedArrayBuffer | postMessage (copy) |
| WASM | JavaScript queues |
| WASM SIMD | Scalar operations |

The API remains the same; only performance differs.
