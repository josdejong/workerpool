/**
 * Binary Serialization
 *
 * Efficient binary serialization for TypedArrays and numeric data.
 * Alternative to JSON for large numeric datasets.
 */

// ============================================================================
// Type Codes
// ============================================================================

var TypeCode = {
  NULL: 0,
  UNDEFINED: 1,
  BOOLEAN: 2,
  NUMBER: 3,
  STRING: 4,
  ARRAY: 5,
  OBJECT: 6,
  INT8_ARRAY: 10,
  UINT8_ARRAY: 11,
  UINT8_CLAMPED_ARRAY: 12,
  INT16_ARRAY: 13,
  UINT16_ARRAY: 14,
  INT32_ARRAY: 15,
  UINT32_ARRAY: 16,
  FLOAT32_ARRAY: 17,
  FLOAT64_ARRAY: 18,
  BIGINT64_ARRAY: 19,
  BIGUINT64_ARRAY: 20,
  ARRAY_BUFFER: 30,
  SHARED_ARRAY_BUFFER: 31,
  DATA_VIEW: 32,
};

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize data to binary format
 * @param {*} data - Data to serialize
 * @returns {object} Serialized result with buffer and metadata
 */
function serializeBinary(data) {
  var buffers = [];
  var metadata = serializeValue(data, { buffers: buffers, offset: 0 });

  return {
    metadata: metadata,
    buffers: buffers,
  };
}

/**
 * Serialize a single value
 * @private
 */
function serializeValue(value, ctx) {
  if (value === null) {
    return { type: TypeCode.NULL };
  }

  if (value === undefined) {
    return { type: TypeCode.UNDEFINED };
  }

  if (typeof value === 'boolean') {
    return { type: TypeCode.BOOLEAN, value: value };
  }

  if (typeof value === 'number') {
    return { type: TypeCode.NUMBER, value: value };
  }

  if (typeof value === 'string') {
    return { type: TypeCode.STRING, value: value };
  }

  // TypedArrays
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return serializeTypedArray(value, ctx);
  }

  // DataView
  if (value instanceof DataView) {
    var dvBuffer = new ArrayBuffer(value.byteLength);
    new Uint8Array(dvBuffer).set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    ctx.buffers.push(dvBuffer);
    return {
      type: TypeCode.DATA_VIEW,
      bufferIndex: ctx.buffers.length - 1,
      byteLength: value.byteLength,
    };
  }

  // ArrayBuffer
  if (value instanceof ArrayBuffer) {
    var copy = value.slice(0);
    ctx.buffers.push(copy);
    return {
      type: TypeCode.ARRAY_BUFFER,
      bufferIndex: ctx.buffers.length - 1,
      byteLength: value.byteLength,
    };
  }

  // SharedArrayBuffer
  if (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer) {
    // SharedArrayBuffer can be shared directly, no need to copy
    ctx.buffers.push(value);
    return {
      type: TypeCode.SHARED_ARRAY_BUFFER,
      bufferIndex: ctx.buffers.length - 1,
      byteLength: value.byteLength,
    };
  }

  // Array
  if (Array.isArray(value)) {
    var items = value.map(function(item) {
      return serializeValue(item, ctx);
    });
    return { type: TypeCode.ARRAY, items: items };
  }

  // Object
  if (typeof value === 'object') {
    var props = {};
    for (var key in value) {
      if (value.hasOwnProperty(key)) {
        props[key] = serializeValue(value[key], ctx);
      }
    }
    return { type: TypeCode.OBJECT, properties: props };
  }

  // Fallback to JSON-like representation
  return { type: TypeCode.STRING, value: String(value) };
}

/**
 * Serialize a TypedArray
 * @private
 */
function serializeTypedArray(typedArray, ctx) {
  var typeCode;
  var constructor = typedArray.constructor.name;

  switch (constructor) {
    case 'Int8Array': typeCode = TypeCode.INT8_ARRAY; break;
    case 'Uint8Array': typeCode = TypeCode.UINT8_ARRAY; break;
    case 'Uint8ClampedArray': typeCode = TypeCode.UINT8_CLAMPED_ARRAY; break;
    case 'Int16Array': typeCode = TypeCode.INT16_ARRAY; break;
    case 'Uint16Array': typeCode = TypeCode.UINT16_ARRAY; break;
    case 'Int32Array': typeCode = TypeCode.INT32_ARRAY; break;
    case 'Uint32Array': typeCode = TypeCode.UINT32_ARRAY; break;
    case 'Float32Array': typeCode = TypeCode.FLOAT32_ARRAY; break;
    case 'Float64Array': typeCode = TypeCode.FLOAT64_ARRAY; break;
    case 'BigInt64Array': typeCode = TypeCode.BIGINT64_ARRAY; break;
    case 'BigUint64Array': typeCode = TypeCode.BIGUINT64_ARRAY; break;
    default:
      // Unknown typed array, serialize as regular array
      return serializeValue(Array.from(typedArray), ctx);
  }

  // Copy the buffer data
  var sourceView = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
  var copy = new ArrayBuffer(typedArray.byteLength);
  new Uint8Array(copy).set(sourceView);
  ctx.buffers.push(copy);

  return {
    type: typeCode,
    bufferIndex: ctx.buffers.length - 1,
    byteLength: typedArray.byteLength,
    length: typedArray.length,
  };
}

// ============================================================================
// Deserialization
// ============================================================================

/**
 * Deserialize binary data
 * @param {object} serialized - Serialized data with metadata and buffers
 * @returns {*} Deserialized value
 */
function deserializeBinary(serialized) {
  return deserializeValue(serialized.metadata, serialized.buffers);
}

/**
 * Deserialize a single value
 * @private
 */
function deserializeValue(meta, buffers) {
  switch (meta.type) {
    case TypeCode.NULL:
      return null;
    case TypeCode.UNDEFINED:
      return undefined;
    case TypeCode.BOOLEAN:
    case TypeCode.NUMBER:
    case TypeCode.STRING:
      return meta.value;
    case TypeCode.ARRAY:
      return meta.items.map(function(item) {
        return deserializeValue(item, buffers);
      });
    case TypeCode.OBJECT:
      var obj = {};
      for (var key in meta.properties) {
        if (meta.properties.hasOwnProperty(key)) {
          obj[key] = deserializeValue(meta.properties[key], buffers);
        }
      }
      return obj;
    case TypeCode.ARRAY_BUFFER:
      return buffers[meta.bufferIndex];
    case TypeCode.SHARED_ARRAY_BUFFER:
      return buffers[meta.bufferIndex];
    case TypeCode.DATA_VIEW:
      return new DataView(buffers[meta.bufferIndex]);
    default:
      return deserializeTypedArray(meta, buffers);
  }
}

/**
 * Deserialize a TypedArray
 * @private
 */
function deserializeTypedArray(meta, buffers) {
  var buffer = buffers[meta.bufferIndex];
  var Constructor;

  switch (meta.type) {
    case TypeCode.INT8_ARRAY: Constructor = Int8Array; break;
    case TypeCode.UINT8_ARRAY: Constructor = Uint8Array; break;
    case TypeCode.UINT8_CLAMPED_ARRAY: Constructor = Uint8ClampedArray; break;
    case TypeCode.INT16_ARRAY: Constructor = Int16Array; break;
    case TypeCode.UINT16_ARRAY: Constructor = Uint16Array; break;
    case TypeCode.INT32_ARRAY: Constructor = Int32Array; break;
    case TypeCode.UINT32_ARRAY: Constructor = Uint32Array; break;
    case TypeCode.FLOAT32_ARRAY: Constructor = Float32Array; break;
    case TypeCode.FLOAT64_ARRAY: Constructor = Float64Array; break;
    case TypeCode.BIGINT64_ARRAY: Constructor = BigInt64Array; break;
    case TypeCode.BIGUINT64_ARRAY: Constructor = BigUint64Array; break;
    default:
      throw new Error('Unknown type code: ' + meta.type);
  }

  return new Constructor(buffer);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if binary serialization should be used for data
 * @param {*} data - Data to check
 * @param {number} [threshold=1024] - Size threshold in bytes
 * @returns {boolean}
 */
function shouldUseBinarySerialization(data, threshold) {
  threshold = threshold || 1024;
  var size = estimateBinarySize(data);
  return size > threshold && containsTypedArrays(data);
}

/**
 * Estimate the binary size of data
 * @param {*} data - Data to estimate
 * @returns {number} Estimated size in bytes
 */
function estimateBinarySize(data) {
  if (data === null || data === undefined) {
    return 1;
  }

  if (typeof data === 'boolean') {
    return 2;
  }

  if (typeof data === 'number') {
    return 9;
  }

  if (typeof data === 'string') {
    return data.length * 2 + 4;
  }

  if (ArrayBuffer.isView(data)) {
    return data.byteLength + 16;
  }

  if (data instanceof ArrayBuffer) {
    return data.byteLength + 8;
  }

  if (typeof SharedArrayBuffer !== 'undefined' && data instanceof SharedArrayBuffer) {
    return data.byteLength + 8;
  }

  if (Array.isArray(data)) {
    var arraySize = 8;
    for (var i = 0; i < data.length; i++) {
      arraySize += estimateBinarySize(data[i]);
    }
    return arraySize;
  }

  if (typeof data === 'object') {
    var objSize = 8;
    for (var key in data) {
      if (data.hasOwnProperty(key)) {
        objSize += key.length * 2 + estimateBinarySize(data[key]);
      }
    }
    return objSize;
  }

  return 16;
}

/**
 * Check if data contains TypedArrays
 * @param {*} data - Data to check
 * @returns {boolean}
 */
function containsTypedArrays(data) {
  if (ArrayBuffer.isView(data)) {
    return true;
  }

  if (data instanceof ArrayBuffer) {
    return true;
  }

  if (typeof SharedArrayBuffer !== 'undefined' && data instanceof SharedArrayBuffer) {
    return true;
  }

  if (Array.isArray(data)) {
    for (var i = 0; i < data.length; i++) {
      if (containsTypedArrays(data[i])) {
        return true;
      }
    }
  }

  if (data && typeof data === 'object') {
    for (var key in data) {
      if (data.hasOwnProperty(key) && containsTypedArrays(data[key])) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================================
// Exports
// ============================================================================

exports.serializeBinary = serializeBinary;
exports.deserializeBinary = deserializeBinary;
exports.shouldUseBinarySerialization = shouldUseBinarySerialization;
exports.estimateBinarySize = estimateBinarySize;
exports.containsTypedArrays = containsTypedArrays;
exports.TypeCode = TypeCode;
