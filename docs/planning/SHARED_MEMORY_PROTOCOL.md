# Shared Memory Protocol

This document specifies the lock-free communication protocol using SharedArrayBuffer for workerpool.

## Overview

The shared memory protocol enables zero-copy data transfer between the main thread and workers using SharedArrayBuffer and Atomics operations. This provides significant performance improvements for large data transfers compared to structured clone via postMessage.

## Memory Layout

### Buffer Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                        HEADER (64 bytes)                        │
├─────────┬─────────┬─────────┬─────────┬─────────┬──────────────┤
│ Version │  Flags  │ SendIdx │ RecvIdx │ MsgSize │   Reserved   │
│ (4 byte)│ (4 byte)│ (4 byte)│ (4 byte)│ (4 byte)│  (44 bytes)  │
├─────────┴─────────┴─────────┴─────────┴─────────┴──────────────┤
│                      MESSAGE SLOTS                              │
│                    (configurable size)                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Slot 0: [Status:4][Length:4][Payload:SlotSize-8]         │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ Slot 1: [Status:4][Length:4][Payload:SlotSize-8]         │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ ...                                                      │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ Slot N: [Status:4][Length:4][Payload:SlotSize-8]         │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Header Fields

| Offset | Size | Field      | Description                                    |
|--------|------|------------|------------------------------------------------|
| 0      | 4    | Version    | Protocol version (currently 1)                 |
| 4      | 4    | Flags      | Channel state flags (see below)                |
| 8      | 4    | SendIndex  | Next slot for sender (atomic)                  |
| 12     | 4    | RecvIndex  | Next slot for receiver (atomic)                |
| 16     | 4    | SlotSize   | Size of each message slot in bytes             |
| 20     | 4    | SlotCount  | Number of message slots                        |
| 24     | 40   | Reserved   | Reserved for future use                        |

### Flag Bits

| Bit | Name          | Description                           |
|-----|---------------|---------------------------------------|
| 0   | INITIALIZED   | Channel is initialized                |
| 1   | CLOSED        | Channel is closed                     |
| 2   | ERROR         | Channel encountered error             |
| 3   | OVERFLOW      | Send buffer overflow occurred         |
| 4-31| Reserved      | Reserved for future use               |

### Slot Status Values

| Value | Name      | Description                              |
|-------|-----------|------------------------------------------|
| 0     | EMPTY     | Slot is empty, ready for write           |
| 1     | WRITING   | Slot is being written (in progress)      |
| 2     | READY     | Slot contains valid message              |
| 3     | READING   | Slot is being read (in progress)         |

## Atomic Operations

### Memory Ordering

All atomic operations use sequential consistency (Atomics.load/store) for correctness, except:
- Status checks may use `Atomics.load` (acquire semantics)
- Status updates use `Atomics.compareExchange` for state transitions

### Send Operation (Non-Blocking)

```javascript
function send(message) {
  // 1. Serialize message to bytes
  const bytes = serialize(message);

  // 2. Check if message fits in slot
  if (bytes.length > maxPayloadSize) {
    return { success: false, reason: 'MESSAGE_TOO_LARGE' };
  }

  // 3. Reserve slot atomically
  const slotIndex = Atomics.add(header, SEND_INDEX, 1) % slotCount;
  const slotOffset = HEADER_SIZE + (slotIndex * slotSize);

  // 4. Check slot status (must be EMPTY)
  const status = Atomics.load(slots, slotOffset / 4);
  if (status !== EMPTY) {
    // Buffer full - decrement and return
    Atomics.sub(header, SEND_INDEX, 1);
    return { success: false, reason: 'BUFFER_FULL' };
  }

  // 5. CAS to WRITING status
  if (Atomics.compareExchange(slots, slotOffset / 4, EMPTY, WRITING) !== EMPTY) {
    return { success: false, reason: 'SLOT_CONTENTION' };
  }

  // 6. Write length and payload
  new DataView(buffer).setUint32(slotOffset + 4, bytes.length, true);
  new Uint8Array(buffer, slotOffset + 8, bytes.length).set(bytes);

  // 7. Mark as READY
  Atomics.store(slots, slotOffset / 4, READY);

  // 8. Wake waiting receiver
  Atomics.notify(slots, slotOffset / 4);

  return { success: true };
}
```

### Receive Operation (Non-Blocking)

```javascript
function receive() {
  // 1. Get current receive index
  const slotIndex = Atomics.load(header, RECV_INDEX) % slotCount;
  const slotOffset = HEADER_SIZE + (slotIndex * slotSize);

  // 2. Check slot status
  const status = Atomics.load(slots, slotOffset / 4);
  if (status !== READY) {
    return null; // No message available
  }

  // 3. CAS to READING status
  if (Atomics.compareExchange(slots, slotOffset / 4, READY, READING) !== READY) {
    return null; // Lost race
  }

  // 4. Read length and payload
  const length = new DataView(buffer).getUint32(slotOffset + 4, true);
  const payload = new Uint8Array(buffer, slotOffset + 8, length).slice();

  // 5. Mark as EMPTY and increment recv index
  Atomics.store(slots, slotOffset / 4, EMPTY);
  Atomics.add(header, RECV_INDEX, 1);

  // 6. Deserialize and return
  return deserialize(payload);
}
```

### Receive Operation (Blocking)

```javascript
function receiveBlocking(timeout = Infinity) {
  const slotIndex = Atomics.load(header, RECV_INDEX) % slotCount;
  const slotOffset = HEADER_SIZE + (slotIndex * slotSize);

  // Wait for READY status
  let status = Atomics.load(slots, slotOffset / 4);
  if (status !== READY) {
    const result = Atomics.wait(slots, slotOffset / 4, status, timeout);
    if (result === 'timed-out') {
      return null;
    }
  }

  // Proceed with normal receive
  return receive();
}
```

## Message Serialization

### Format

Messages are serialized as JSON with special handling for binary data:

```
[TypeByte][Length:VarInt][Payload]
```

| Type | Value | Description                                      |
|------|-------|--------------------------------------------------|
| 0x00 | JSON  | JSON-encoded object                              |
| 0x01 | Binary| Raw binary data (ArrayBuffer)                    |
| 0x02 | Typed | TypedArray with type prefix                      |
| 0x03 | Mixed | JSON with embedded binary references             |

### Large Message Handling

Messages exceeding slot size are handled via chunking:

1. Send header message with total size and chunk count
2. Send subsequent chunks with sequence numbers
3. Receiver reassembles chunks in order

## Error Handling

### Recovery Strategies

1. **Slot Contention**: Retry with exponential backoff
2. **Buffer Full**: Option to block, drop, or signal overflow
3. **Corrupt Data**: Validate checksums, reset channel on corruption
4. **Stuck Slots**: Timeout-based recovery to EMPTY state

### Channel Reset

If the channel becomes corrupted:

1. Set ERROR flag
2. Notify all waiters
3. Reset all slots to EMPTY
4. Reset indices to 0
5. Clear ERROR flag

## Browser Requirements

SharedArrayBuffer requires specific HTTP headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers, SharedArrayBuffer is not available and the implementation falls back to postMessage.

## Performance Characteristics

| Operation        | Time Complexity | Contention Impact      |
|------------------|-----------------|------------------------|
| send()           | O(1)            | Low (lock-free)        |
| receive()        | O(1)            | Low (lock-free)        |
| receiveBlocking()| O(1) + wait     | None (kernel wait)     |
| Large message    | O(n) chunks     | Linear with size       |

## Version History

- **v1** (current): Initial lock-free protocol with atomic slots
