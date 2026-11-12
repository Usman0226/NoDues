import test from 'node:test';
import assert from 'node:assert/strict';
import cache from '../../src/config/cache.js';
import { withCache, invalidateKeys } from '../../src/utils/withCache.js';
import { invalidateEntityCache } from '../../src/utils/cacheHooks.js';
import { invalidateStudentStatusCache } from '../../src/Controllers/studentPortalController.js';

test('withCache coalesces concurrent in-flight misses (singleflight)', async () => {
  cache.flushAll();
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 20));
    return { ok: true, calls };
  };

  const results = await Promise.all(
    Array.from({ length: 10 }, () => withCache('test:singleflight', 30, fetchFn))
  );

  assert.equal(calls, 1);
  for (const res of results) {
    assert.deepEqual(res, { ok: true, calls: 1 });
  }
});

test('withCache does not write stale data if invalidated while in-flight', async () => {
  cache.flushAll();
  let version = 0;

  const p1 = withCache('test:race', 30, async () => {
    const v = ++version;
    await new Promise((r) => setTimeout(r, 30));
    return { version: v };
  });

  // Invalidate while p1 is still fetching
  await new Promise((r) => setTimeout(r, 10));
  invalidateKeys('test:race');

  const first = await p1;
  assert.deepEqual(first, { version: 1 });
  assert.equal(cache.get('test:race'), undefined);

  const second = await withCache('test:race', 30, async () => ({ version: ++version }));
  assert.deepEqual(second, { version: 2 });
});

test('withCache gracefully bypasses caching when cache.set throws ECACHEFULL', async () => {
  cache.flushAll();
  const originalSet = cache.set.bind(cache);
  cache.set = () => {
    const err = new Error('Cache max keys amount exceeded');
    err.errorcode = 'ECACHEFULL';
    throw err;
  };

  try {
    const result = await withCache('test:full', 30, async () => ({ status: 'cleared' }));
    assert.deepEqual(result, { status: 'cleared' });
  } finally {
    cache.set = originalSet;
  }
});

test('invalidateStudentStatusCache clears both active and specific requestId keys', () => {
  cache.flushAll();
  cache.set('student_status:stu1:active', { a: 1 }, 30);
  cache.set('student_status:stu1:req99', { b: 2 }, 30);
  cache.set('student_status:stu2:active', { c: 3 }, 30);

  invalidateStudentStatusCache('stu1', 'req99');

  assert.equal(cache.get('student_status:stu1:active'), undefined);
  assert.equal(cache.get('student_status:stu1:req99'), undefined);
  assert.deepEqual(cache.get('student_status:stu2:active'), { c: 3 });
});

test('invalidateEntityCache("student", "all") clears all student_status keys', () => {
  cache.flushAll();
  cache.set('student_status:stu1:active', { a: 1 }, 30);
  cache.set('student_status:stu2:req5', { b: 2 }, 30);

  invalidateEntityCache('student', 'all');

  assert.equal(cache.get('student_status:stu1:active'), undefined);
  assert.equal(cache.get('student_status:stu2:req5'), undefined);
});

