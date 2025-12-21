/**
 * Parallel Array Operations Example (TypeScript)
 *
 * Demonstrates parallel array processing methods:
 * - map: Transform elements in parallel
 * - reduce: Aggregate values across workers
 * - filter: Filter elements in parallel
 * - find/findIndex: Search in parallel
 * - some/every: Parallel predicate tests
 * - forEach: Parallel side effects
 * - count: Count matching elements
 * - partition: Split by predicate
 * - groupBy: Group by key function
 * - flatMap: Map and flatten
 * - unique: Remove duplicates
 *
 * Run with: npx tsx examples/typescript/parallelOperations.ts
 */

import {
  pool,
  type MapperFn,
  type ReducerFn,
  type CombinerFn,
  type PredicateFn,
} from '../../dist/ts/full.js';

interface Item {
  type: string;
  name: string;
}

async function main(): Promise<void> {
  console.log('Parallel Array Operations Example (TypeScript)\n');
  console.log('='.repeat(50));

  const p = pool({ maxWorkers: 4 });

  // ============================================================
  // Example 1: Parallel map
  // ============================================================
  console.log('\n1. Parallel map\n');

  const numbers: number[] = Array.from({ length: 100 }, (_, i) => i + 1);

  const squareMapper: MapperFn<number, number> = (x) => x * x;
  const squared = await p.map(numbers, squareMapper);
  console.log('  Input: [1, 2, 3, ..., 100]');
  console.log('  Squared:', squared.slice(0, 5).join(', '), '...', squared.slice(-2).join(', '));

  // ============================================================
  // Example 2: Parallel reduce
  // ============================================================
  console.log('\n2. Parallel reduce\n');

  const reducer: ReducerFn<number, number> = (acc, x) => acc + x;
  const combiner: CombinerFn<number> = (left, right) => left + right;

  const sum = await p.reduce(numbers, reducer, combiner, { initialValue: 0 });
  console.log('  Sum of 1 to 100:', sum);

  const smallNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const product = await p.reduce(
    smallNumbers,
    (acc, x) => acc * x,
    (left, right) => left * right,
    { initialValue: 1 }
  );
  console.log('  Product of 1 to 10:', product);

  // ============================================================
  // Example 3: Parallel filter
  // ============================================================
  console.log('\n3. Parallel filter\n');

  const isEven: PredicateFn<number> = (x) => x % 2 === 0;
  const evens = await p.filter(numbers, isEven);
  console.log('  Even numbers:', evens.length, 'items');
  console.log('  First 5:', evens.slice(0, 5).join(', '));

  const isPrime: PredicateFn<number> = (n) => {
    if (n < 2) return false;
    for (let i = 2; i <= Math.sqrt(n); i++) {
      if (n % i === 0) return false;
    }
    return true;
  };

  const primes = await p.filter(numbers, isPrime);
  console.log('  Prime numbers:', primes.length, 'items');
  console.log('  Primes:', primes.join(', '));

  // ============================================================
  // Example 4: Parallel find/findIndex
  // ============================================================
  console.log('\n4. Parallel find and findIndex\n');

  const largeArray: number[] = Array.from({ length: 10000 }, (_, i) => i);

  const found = await p.find(largeArray, (x) => x > 5000 && x % 777 === 0);
  console.log('  Found (>5000 and divisible by 777):', found);

  const index = await p.findIndex(largeArray, (x) => x === 7777);
  console.log('  Index of 7777:', index);

  // ============================================================
  // Example 5: Parallel some/every
  // ============================================================
  console.log('\n5. Parallel some and every\n');

  const hasNegative = await p.some(numbers, (x) => x < 0);
  console.log('  Has negative numbers:', hasNegative);

  const allPositive = await p.every(numbers, (x) => x > 0);
  console.log('  All positive:', allPositive);

  const allEven = await p.every(evens, (x) => x % 2 === 0);
  console.log('  All even (in evens array):', allEven);

  // ============================================================
  // Example 6: Parallel forEach
  // ============================================================
  console.log('\n6. Parallel forEach\n');

  await p.forEach([1, 2, 3, 4, 5], (x) => {
    return x * 2;
  });
  console.log('  forEach completed (side effects in workers are isolated)');

  // ============================================================
  // Example 7: Parallel count
  // ============================================================
  console.log('\n7. Parallel count\n');

  const evenCount = await p.count(numbers, (x) => x % 2 === 0);
  console.log('  Count of even numbers:', evenCount);

  const divisibleBy7 = await p.count(numbers, (x) => x % 7 === 0);
  console.log('  Count divisible by 7:', divisibleBy7);

  // ============================================================
  // Example 8: Parallel partition
  // ============================================================
  console.log('\n8. Parallel partition\n');

  const scores = [65, 42, 88, 55, 72, 38, 91, 47];
  const [passing, failing] = await p.partition(scores, (score) => score >= 60);
  console.log('  Scores >= 60 (passing):', passing.join(', '));
  console.log('  Scores < 60 (failing):', failing.join(', '));

  // ============================================================
  // Example 9: Parallel groupBy
  // ============================================================
  console.log('\n9. Parallel groupBy\n');

  const items: Item[] = [
    { type: 'fruit', name: 'apple' },
    { type: 'vegetable', name: 'carrot' },
    { type: 'fruit', name: 'banana' },
    { type: 'vegetable', name: 'broccoli' },
    { type: 'fruit', name: 'cherry' },
  ];

  const grouped = await p.groupBy(items, (item) => item.type);
  console.log('  Grouped by type:');
  for (const [key, values] of Object.entries(grouped)) {
    console.log(`    ${key}: ${(values as Item[]).map(v => v.name).join(', ')}`);
  }

  // ============================================================
  // Example 10: Parallel flatMap
  // ============================================================
  console.log('\n10. Parallel flatMap\n');

  const words = ['hello', 'world'];
  const chars = await p.flatMap(words, (word) => word.split(''));
  console.log('  Input:', words.join(', '));
  console.log('  Flattened chars:', chars.join(', '));

  const duplicated = await p.flatMap([1, 2, 3], (x) => [x, x]);
  console.log('  Duplicated [1,2,3]:', duplicated.join(', '));

  // ============================================================
  // Example 11: Parallel unique
  // ============================================================
  console.log('\n11. Parallel unique\n');

  const withDuplicates = [1, 2, 2, 3, 3, 3, 4, 4, 4, 4, 5];
  const unique = await p.unique(withDuplicates);
  console.log('  Input:', withDuplicates.join(', '));
  console.log('  Unique:', unique.join(', '));

  // ============================================================
  // Example 12: Parallel includes/indexOf
  // ============================================================
  console.log('\n12. Parallel includes and indexOf\n');

  const haystack: number[] = Array.from({ length: 10000 }, (_, i) => i);

  const includes5000 = await p.includes(haystack, 5000);
  console.log('  Includes 5000:', includes5000);

  const includes99999 = await p.includes(haystack, 99999);
  console.log('  Includes 99999:', includes99999);

  const indexOf7777 = await p.indexOf(haystack, 7777);
  console.log('  Index of 7777:', indexOf7777);

  // ============================================================
  // Example 13: Parallel reduceRight
  // ============================================================
  console.log('\n13. Parallel reduceRight\n');

  const letters = ['a', 'b', 'c', 'd', 'e'];
  const reversed = await p.reduceRight(
    letters,
    (acc, x) => acc + x,
    (left, right) => left + right,
    { initialValue: '' }
  );
  console.log('  Input:', letters.join(', '));
  console.log('  Reduced right-to-left:', reversed);

  await p.terminate();

  console.log('\n' + '='.repeat(50));
  console.log('Parallel Array Operations examples completed!');
}

main().catch(console.error);
