/**
 * WorkerpoolPromise Tests
 *
 * Tests for the TypeScript Promise implementation with cancel and timeout support.
 * Mirrors the functionality of test/Promise.test.js
 */

import { describe, it, expect, vi } from 'vitest';
import {
  WorkerpoolPromise,
  CancellationError,
  TimeoutError,
} from '../../src/ts/core/Promise';

describe('WorkerpoolPromise', () => {
  describe('construction', () => {
    it('should throw an error when constructed without handler', () => {
      expect(() => new (WorkerpoolPromise as any)()).toThrow(SyntaxError);
    });

    it('should construct a promise with handler and resolve it', async () => {
      const result = await new WorkerpoolPromise<number, Error>((resolve) => {
        resolve(2);
      });
      expect(result).toBe(2);
    });

    it('should construct a promise with handler and reject it', async () => {
      await expect(
        new WorkerpoolPromise<number, number>((_, reject) => {
          reject(2);
        })
      ).rejects.toBe(2);
    });
  });

  describe('then', () => {
    it('should call onSuccess when resolved', async () => {
      const result = await new WorkerpoolPromise<string, Error>((resolve) => {
        setTimeout(() => resolve('foo'), 0);
      });
      expect(result).toBe('foo');
    });

    it('should call onSuccess when resolved before then is attached', async () => {
      const promise = new WorkerpoolPromise<string, Error>((resolve) => {
        resolve('foo');
      });
      const result = await promise;
      expect(result).toBe('foo');
    });

    it('should NOT throw an error when resolving a promise twice', () => {
      new WorkerpoolPromise<string, Error>((resolve) => {
        resolve('foo');
        resolve('bar'); // Second resolve should be ignored
      });
    });

    it('should not call onFail when resolved', async () => {
      const onFail = vi.fn();
      const promise = new WorkerpoolPromise<string, Error>((resolve) => {
        setTimeout(() => resolve('foo'), 0);
      });

      const result = await promise.then(
        (value) => value,
        onFail
      );
      expect(result).toBe('foo');
      expect(onFail).not.toHaveBeenCalled();
    });

    it('should not call onSuccess when rejected', async () => {
      const onSuccess = vi.fn();
      const promise = new WorkerpoolPromise<string, string>((_, reject) => {
        setTimeout(() => reject('err'), 0);
      });

      await expect(
        promise.then(onSuccess, (err) => {
          throw err;
        })
      ).rejects.toBe('err');
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe('catch', () => {
    it('should call onFail when rejected', async () => {
      const promise = new WorkerpoolPromise<string, string>((_, reject) => {
        setTimeout(() => reject('err'), 0);
      });

      const caught = await promise.catch((err) => err);
      expect(caught).toBe('err');
    });

    it('should NOT throw an error when rejecting a promise twice', () => {
      new WorkerpoolPromise<string, string>((_, reject) => {
        reject('foo');
        reject('bar'); // Second reject should be ignored
      }).catch(() => {}); // Prevent unhandled rejection
    });

    it('should not propagate an error when caught', async () => {
      const log: string[] = [];

      await new WorkerpoolPromise<void, Error>((_, reject) => {
        setTimeout(() => reject(new Error('My Error')), 0);
      })
        .catch((err) => {
          expect(err.toString()).toBe('Error: My Error');
          log.push('catch');
        })
        .then(() => {
          log.push('then');
        })
        .catch(() => {
          log.push('catch2');
        });

      expect(log).toEqual(['catch', 'then']);
    });

    it('should rethrow an error', async () => {
      const promise = new WorkerpoolPromise<void, Error>((_, reject) => {
        setTimeout(() => reject(new Error('My Error')), 0);
      });

      await expect(
        promise
          .catch((err) => {
            expect(err.toString()).toBe('Error: My Error');
            throw new Error('My Error 2');
          })
      ).rejects.toThrow('My Error 2');
    });

    it('should pass onFail to chained promises', async () => {
      await expect(
        new WorkerpoolPromise<void, Error>((_, reject) => {
          setTimeout(() => reject(new Error('My Error')), 0);
        })
          .then(() => {
            throw new Error('should not resolve');
          })
      ).rejects.toThrow('My Error');
    });
  });

  describe('always', () => {
    it('should call always when resolved', async () => {
      const promise = new WorkerpoolPromise<string, Error>((resolve) => {
        setTimeout(() => resolve('foo'), 0);
      });

      const result = await promise.always(() => 'always called');
      expect(result).toBe('always called');
    });

    it('should call always when rejected', async () => {
      const promise = new WorkerpoolPromise<string, string>((_, reject) => {
        setTimeout(() => reject('err'), 0);
      });

      const result = await promise.always(() => 'always called');
      expect(result).toBe('always called');
    });
  });

  describe('finally', () => {
    it('should call finally when resolved', async () => {
      let finallyCalled = false;

      await new WorkerpoolPromise<number, Error>((resolve) => {
        resolve(1);
      })
        .finally(() => {
          finallyCalled = true;
        });

      expect(finallyCalled).toBe(true);
    });

    it('should call finally when rejected', async () => {
      let finallyCalled = false;

      await new WorkerpoolPromise<number, Error>((_, reject) => {
        reject(new Error('error'));
      })
        .catch(() => {}) // Catch the error
        .finally(() => {
          finallyCalled = true;
        });

      expect(finallyCalled).toBe(true);
    });

    it('should not pass arguments to finally', async () => {
      await new WorkerpoolPromise<number, Error>((resolve) => {
        resolve(42);
      }).finally((arg: any) => {
        expect(arg).toBeUndefined();
      });
    });
  });

  describe('status', () => {
    it('should have correct status before and after being resolved', async () => {
      let resolvePromise: (value: number) => void;
      const p = new WorkerpoolPromise<number, Error>((resolve) => {
        resolvePromise = resolve;
      });

      expect(p.resolved).toBe(false);
      expect(p.rejected).toBe(false);
      expect(p.pending).toBe(true);

      resolvePromise!(1);

      expect(p.resolved).toBe(true);
      expect(p.rejected).toBe(false);
      expect(p.pending).toBe(false);
    });

    it('should have correct status before and after being rejected', async () => {
      let rejectPromise: (error: Error) => void;
      const p = new WorkerpoolPromise<number, Error>((_, reject) => {
        rejectPromise = reject;
      });

      expect(p.resolved).toBe(false);
      expect(p.rejected).toBe(false);
      expect(p.pending).toBe(true);

      rejectPromise!(new Error('test'));

      expect(p.resolved).toBe(false);
      expect(p.rejected).toBe(true);
      expect(p.pending).toBe(false);

      // Catch to prevent unhandled rejection
      await p.catch(() => {});
    });
  });

  it('should resolve a promise returned by an onSuccess callback', async () => {
    const result = await new WorkerpoolPromise<number, Error>((resolve) => {
      resolve(1);
    })
      .then((result) => {
        expect(result).toBe(1);
        return new WorkerpoolPromise<number, Error>((resolve) => {
          resolve(2);
        });
      });

    expect(result).toBe(2);
  });

  it('should resolve a promise returned by an onFail callback', async () => {
    const result = await new WorkerpoolPromise<number, number>((_, reject) => {
      reject(1);
    })
      .catch((err) => {
        expect(err).toBe(1);
        return new WorkerpoolPromise<number, Error>((resolve) => {
          resolve(2);
        });
      });

    expect(result).toBe(2);
  });

  it('should catch an error thrown by an onSuccess callback', async () => {
    await expect(
      new WorkerpoolPromise<number, Error>((resolve) => {
        resolve(1);
      }).then((result) => {
        expect(result).toBe(1);
        throw new Error('2');
      })
    ).rejects.toThrow('2');
  });

  it('should catch an error thrown by an onFail callback', async () => {
    await expect(
      new WorkerpoolPromise<number, Error>((_, reject) => {
        reject(new Error('1'));
      })
        .catch((err) => {
          expect(err.toString()).toBe('Error: 1');
          throw new Error('2');
        })
    ).rejects.toThrow('2');
  });

  describe('cancel', () => {
    it('should cancel a promise', async () => {
      const p = new WorkerpoolPromise<void, Error>(() => {});

      setTimeout(() => {
        p.cancel();
      }, 10);

      await expect(p).rejects.toBeInstanceOf(CancellationError);
    });

    it('should cancel a promise and catch afterwards', async () => {
      const p = new WorkerpoolPromise<void, Error>(() => {}).cancel();

      await expect(p).rejects.toBeInstanceOf(CancellationError);
    });

    it('should propagate cancellation of a promise to the promise parent', async () => {
      const p = new WorkerpoolPromise<void, Error>(() => {});
      let catchCount = 0;

      const p1 = p.catch((err) => {
        expect(err).toBeInstanceOf(CancellationError);
        catchCount++;
      });

      const p2 = p.catch((err) => {
        expect(err).toBeInstanceOf(CancellationError);
        catchCount++;
      });

      p1.cancel();

      await Promise.all([p1, p2]);
      expect(catchCount).toBe(2);
    });
  });

  describe('timeout', () => {
    it('should timeout a promise', async () => {
      await expect(
        new WorkerpoolPromise<void, Error>(() => {}).timeout(30)
      ).rejects.toBeInstanceOf(TimeoutError);
    });

    it('should timeout a promise afterwards', async () => {
      const p = new WorkerpoolPromise<void, Error>(() => {});
      p.timeout(30);

      await expect(p).rejects.toBeInstanceOf(TimeoutError);
    });

    it('timeout should be stopped when promise resolves', async () => {
      const result = await new WorkerpoolPromise<number, Error>((resolve) => {
        setTimeout(() => resolve(1), 0);
      }).timeout(100);

      expect(result).toBe(1);
    });

    it('timeout should be stopped when promise rejects', async () => {
      await expect(
        new WorkerpoolPromise<void, Error>((_, reject) => {
          setTimeout(() => reject(new Error('My Error')), 0);
        }).timeout(100)
      ).rejects.toThrow('My Error');
    });

    it('timeout should be propagated to parent promise', async () => {
      await expect(
        new WorkerpoolPromise<void, Error>(() => {})
          .then() // force creation of a child promise
          .timeout(30)
      ).rejects.toBeInstanceOf(TimeoutError);
    });
  });

  describe('defer', () => {
    it('should create a resolver and resolve it', async () => {
      const resolver = WorkerpoolPromise.defer<number>();

      resolver.resolve(3);

      const result = await resolver.promise;
      expect(result).toBe(3);
    });

    it('should create a resolver and reject it', async () => {
      const resolver = WorkerpoolPromise.defer<number>();

      resolver.reject(new Error('My Error'));

      await expect(resolver.promise).rejects.toThrow('My Error');
    });
  });

  describe('all', () => {
    it('should resolve "all" when all promises are resolved', async () => {
      const foo = new WorkerpoolPromise<string, Error>((resolve) => {
        setTimeout(() => resolve('foo'), 25);
      });
      const bar = new WorkerpoolPromise<string, Error>((resolve) => {
        resolve('bar');
      });
      const baz = new WorkerpoolPromise<string, Error>((resolve) => {
        setTimeout(() => resolve('baz'), 40);
      });
      const qux = new WorkerpoolPromise<string, Error>((resolve) => {
        resolve('qux');
      });

      const results = await WorkerpoolPromise.all([foo, bar, baz, qux]);
      expect(results).toEqual(['foo', 'bar', 'baz', 'qux']);
    });

    it('should reject "all" when any of the promises failed', async () => {
      const foo = new WorkerpoolPromise<string, Error>((resolve) => {
        setTimeout(() => resolve('foo'), 40);
      });
      const bar = new WorkerpoolPromise<string, Error>((resolve) => {
        resolve('bar');
      });
      const baz = new WorkerpoolPromise<string, string>((_, reject) => {
        setTimeout(() => reject('The Error'), 25);
      });
      const qux = new WorkerpoolPromise<string, Error>((resolve) => {
        resolve('qux');
      });

      await expect(
        WorkerpoolPromise.all([foo, bar, baz as any, qux])
      ).rejects.toBe('The Error');
    });

    it('should resolve "all" when all of the promises are already resolved', async () => {
      const foo = new WorkerpoolPromise<string, Error>((resolve) => {
        resolve('foo');
      });
      const bar = new WorkerpoolPromise<string, Error>((resolve) => {
        resolve('bar');
      });
      const baz = new WorkerpoolPromise<string, Error>((resolve) => {
        resolve('baz');
      });
      const qux = new WorkerpoolPromise<string, Error>((resolve) => {
        resolve('qux');
      });

      const results = await WorkerpoolPromise.all([foo, bar, baz, qux]);
      expect(results).toEqual(['foo', 'bar', 'baz', 'qux']);
    });

    it('should resolve "all" when empty', async () => {
      const results = await WorkerpoolPromise.all([]);
      expect(results).toEqual([]);
    });
  });

  describe('static error classes', () => {
    it('should have CancellationError on class', () => {
      expect(WorkerpoolPromise.CancellationError).toBe(CancellationError);
    });

    it('should have TimeoutError on class', () => {
      expect(WorkerpoolPromise.TimeoutError).toBe(TimeoutError);
    });

    it('CancellationError should have correct name', () => {
      const error = new CancellationError();
      expect(error.name).toBe('CancellationError');
      expect(error.message).toBe('promise cancelled');
    });

    it('TimeoutError should have correct name', () => {
      const error = new TimeoutError();
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('timeout exceeded');
    });
  });

  describe('static resolve/reject', () => {
    it('should create resolved promise with static resolve', async () => {
      const result = await WorkerpoolPromise.resolve(42);
      expect(result).toBe(42);
    });

    it('should create rejected promise with static reject', async () => {
      await expect(
        WorkerpoolPromise.reject(new Error('test'))
      ).rejects.toThrow('test');
    });
  });
});
