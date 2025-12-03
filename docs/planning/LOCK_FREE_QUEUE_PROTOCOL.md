# Lock-Free Queue Protocol Specification

This document specifies the lock-free concurrent queue protocol used by the workerpool WASM implementation.

## Overview

The lock-free queue uses a ring buffer with atomic operations to provide thread-safe push and pop operations without locks. This enables high-performance task scheduling across multiple workers.

## Memory Layout

### Shared Memory Structure

```
+-------------------+
| Header (64 bytes) |
+-------------------+
| Ring Buffer       |
| (capacity × 8)    |
+-------------------+
| Task Slots        |
| (capacity × 64)   |
+-------------------+
```

### Header Layout

| Offset | Size | Type | Description |
|--------|------|------|-------------|
| 0 | 4 | u32 | Magic number (0x57504F4C = "WPOL") |
| 4 | 4 | u32 | Version number |
| 8 | 8 | u64 | Head pointer (monotonically increasing) |
| 16 | 8 | u64 | Tail pointer (monotonically increasing) |
| 24 | 4 | u32 | Capacity (power of 2) |
| 28 | 4 | u32 | Mask (capacity - 1, for fast modulo) |
| 32 | 4 | u32 | Allocated slot count |
| 40 | 4 | u32 | Slots base address |
| 48 | 4 | u32 | Free list head |

### Ring Buffer Entry Format

Each entry is 8 bytes (u64):
- Upper 32 bits: Priority (higher = more important)
- Lower 32 bits: Task slot index

Entry value 0 indicates an empty slot.

### Task Slot Layout (64 bytes each)

| Offset | Size | Type | Description |
|--------|------|------|-------------|
| 0 | 4 | u32 | State (0=free, 1=allocated) |
| 4 | 4 | u32 | Next free slot index / Task ID |
| 8 | 4 | u32 | Priority |
| 16 | 8 | u64 | Timestamp |
| 24 | 4 | u32 | Method ID |
| 28 | 4 | u32 | Reference count |

## Atomic Operation Sequences

### Push Operation (Producer)

```
1. Load current tail (atomic)
2. Load current head (atomic)
3. Check if buffer full: (tail - head) >= capacity
   - If full, return false
4. Calculate entry address: base + (tail & mask) * 8
5. Load current entry value (atomic)
6. If entry != 0, buffer not yet consumed, return false
7. Create new entry = (priority << 32) | slotIndex
8. CAS(entry_addr, 0, new_entry)
   - If failed (another thread wrote), retry from step 1
9. Atomic increment tail
10. Return true
```

### Pop Operation (Consumer)

```
1. Load current head (atomic)
2. Load current tail (atomic)
3. Check if buffer empty: head >= tail
   - If empty, return 0 (empty entry)
4. Calculate entry address: base + (head & mask) * 8
5. Load entry value (atomic)
6. If entry == 0, entry not yet written, return 0
7. CAS(head_addr, head, head + 1)
   - If failed (another consumer won), retry from step 1
8. Clear entry to 0 (atomic store)
9. Return entry value
```

### Slot Allocation (Free List)

```
1. Load free list head (atomic)
2. If head == 0xFFFFFFFF, no free slots available
3. Load next pointer from slot at head
4. CAS(free_list_head, head, next)
   - If failed, retry from step 1
5. Mark slot as allocated (atomic store)
6. Set reference count to 1 (atomic store)
7. Increment allocated count (atomic add)
8. Return slot index
```

### Slot Deallocation

```
1. Load current free list head (atomic)
2. Store current head as slot's next pointer (atomic)
3. Mark slot as free (atomic store)
4. CAS(free_list_head, head, slot_index)
   - If failed (head changed), retry from step 1
5. Decrement allocated count (atomic sub)
```

## Memory Ordering Requirements

All atomic operations use sequentially consistent (SeqCst) ordering for simplicity. This may be relaxed in future optimizations:

| Operation | Minimum Required Ordering |
|-----------|--------------------------|
| Head/Tail load | Acquire |
| Head/Tail store | Release |
| Entry load | Acquire |
| Entry store | Release |
| CAS operations | AcqRel |
| Counter updates | Relaxed (with fence) |

## ABA Problem Prevention

The ABA problem is prevented through:

1. **Monotonic counters**: Head and tail pointers never wrap, they continuously increase (u64 provides ~600 years at 1 billion ops/sec)

2. **Slot states**: Slots explicitly track free/allocated state, preventing reuse confusion

3. **Reference counting**: Slots use reference counting to prevent premature reuse

## Contention Handling

Under high contention, operations may need to retry. The implementation uses:

1. **Spin retry**: Simple retry loop without backoff for short-lived contention
2. **Busy-wait detection**: If retries exceed threshold, operation fails rather than spinning indefinitely

## Thread Safety Guarantees

1. **Lock-freedom**: At least one thread makes progress in finite steps
2. **Linearizability**: Operations appear atomic at some point during execution
3. **No starvation**: FIFO ordering ensures eventual service (not guaranteed under extreme contention)

## Initialization Protocol

Memory must be initialized before use:

```
1. Check magic number
2. If already initialized (magic matches), skip
3. Write header fields (non-atomic, single-writer)
4. Build free list linking all slots
5. Clear all ring buffer entries to 0
6. Write magic number last (memory barrier)
```

## Cross-Thread Sharing

To share memory across threads:

1. Main thread creates SharedArrayBuffer
2. Main thread initializes via WASM
3. Main thread passes buffer to workers
4. Workers attach to existing buffer (skip initialization)
5. All threads use same memory for queue operations

## Error Conditions

| Condition | Detection | Response |
|-----------|-----------|----------|
| Buffer full | tail - head >= capacity | Return false/null |
| Buffer empty | head >= tail | Return false/null |
| No free slots | free_list_head == 0xFFFFFFFF | Return -1 |
| Invalid memory | magic != 0x57504F4C | Throw error |
| Version mismatch | version != 1 | Throw error |

## Performance Characteristics

| Operation | Time Complexity | Space Complexity |
|-----------|----------------|------------------|
| Push | O(1) amortized | O(1) |
| Pop | O(1) amortized | O(1) |
| Allocate slot | O(1) | O(1) |
| Free slot | O(1) | O(1) |
| Size query | O(1) | O(1) |

## Future Optimizations

1. **Batch operations**: Push/pop multiple items atomically
2. **NUMA awareness**: Partition buffer by NUMA node
3. **Backoff strategies**: Exponential backoff under contention
4. **False sharing mitigation**: Pad head/tail to separate cache lines
