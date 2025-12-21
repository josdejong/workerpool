/**
 * Parallel Array Operations Example
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
 * Run with: node examples/parallelOperations.js
 */

const workerpool = require('../dist/ts/index.js');

async function main() {
  console.log('Parallel Array Operations Example\n');
  console.log('='.repeat(50));

  const pool = workerpool.pool({ maxWorkers: 4 });

  // ============================================================
  // Example 1: Parallel map
  // ============================================================
  console.log('\n1. Parallel map\n');

  const numbers = Array.from({ length: 100 }, (_, i) => i + 1);

  const squared = await pool.map(numbers, (x) => x * x);
  console.log('  Input: [1, 2, 3, ..., 100]');
  console.log('  Squared:', squared.slice(0, 5).join(', '), '...', squared.slice(-2).join(', '));

  // ============================================================
  // Example 2: Parallel reduce
  // ============================================================
  console.log('\n2. Parallel reduce\n');

  const sum = await pool.reduce(
    numbers,
    (acc, x) => acc + x,        // Reducer for each chunk
    (left, right) => left + right, // Combiner for chunk results
    { initialValue: 0 }
  );
  console.log('  Sum of 1 to 100:', sum);

  // Product example
  const smallNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const product = await pool.reduce(
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

  const evens = await pool.filter(numbers, (x) => x % 2 === 0);
  console.log('  Even numbers:', evens.length, 'items');
  console.log('  First 5:', evens.slice(0, 5).join(', '));

  // Filter with complex predicate
  const primes = await pool.filter(numbers, (n) => {
    if (n < 2) return false;
    for (let i = 2; i <= Math.sqrt(n); i++) {
      if (n % i === 0) return false;
    }
    return true;
  });
  console.log('  Prime numbers:', primes.length, 'items');
  console.log('  Primes:', primes.join(', '));

  // ============================================================
  // Example 4: Parallel find/findIndex
  // ============================================================
  console.log('\n4. Parallel find and findIndex\n');

  const largeArray = Array.from({ length: 10000 }, (_, i) => i);

  const found = await pool.find(largeArray, (x) => x > 5000 && x % 777 === 0);
  console.log('  Found (>5000 and divisible by 777):', found);

  const index = await pool.findIndex(largeArray, (x) => x === 7777);
  console.log('  Index of 7777:', index);

  // ============================================================
  // Example 5: Parallel some/every
  // ============================================================
  console.log('\n5. Parallel some and every\n');

  const hasNegative = await pool.some(numbers, (x) => x < 0);
  console.log('  Has negative numbers:', hasNegative);

  const allPositive = await pool.every(numbers, (x) => x > 0);
  console.log('  All positive:', allPositive);

  const allEven = await pool.every(evens, (x) => x % 2 === 0);
  console.log('  All even (in evens array):', allEven);

  // ============================================================
  // Example 6: Parallel forEach
  // ============================================================
  console.log('\n6. Parallel forEach\n');

  let sideEffectCount = 0;
  await pool.forEach([1, 2, 3, 4, 5], (x) => {
    // This runs in workers - side effects are isolated
    return x * 2; // Return value is ignored
  });
  console.log('  forEach completed (side effects in workers are isolated)');

  // ============================================================
  // Example 7: Parallel count
  // ============================================================
  console.log('\n7. Parallel count\n');

  const evenCount = await pool.count(numbers, (x) => x % 2 === 0);
  console.log('  Count of even numbers:', evenCount);

  const divisibleBy7 = await pool.count(numbers, (x) => x % 7 === 0);
  console.log('  Count divisible by 7:', divisibleBy7);

  // ============================================================
  // Example 8: Parallel partition
  // ============================================================
  console.log('\n8. Parallel partition\n');

  const [passing, failing] = await pool.partition(
    [65, 42, 88, 55, 72, 38, 91, 47],
    (score) => score >= 60
  );
  console.log('  Scores >= 60 (passing):', passing.join(', '));
  console.log('  Scores < 60 (failing):', failing.join(', '));

  // ============================================================
  // Example 9: Parallel groupBy
  // ============================================================
  console.log('\n9. Parallel groupBy\n');

  const items = [
    { type: 'fruit', name: 'apple' },
    { type: 'vegetable', name: 'carrot' },
    { type: 'fruit', name: 'banana' },
    { type: 'vegetable', name: 'broccoli' },
    { type: 'fruit', name: 'cherry' },
  ];

  const grouped = await pool.groupBy(items, (item) => item.type);
  console.log('  Grouped by type:');
  for (const [key, values] of Object.entries(grouped)) {
    console.log(`    ${key}: ${values.map(v => v.name).join(', ')}`);
  }

  // ============================================================
  // Example 10: Parallel flatMap
  // ============================================================
  console.log('\n10. Parallel flatMap\n');

  const words = ['hello', 'world'];
  const chars = await pool.flatMap(words, (word) => word.split(''));
  console.log('  Input:', words.join(', '));
  console.log('  Flattened chars:', chars.join(', '));

  // Duplicate each number
  const duplicated = await pool.flatMap([1, 2, 3], (x) => [x, x]);
  console.log('  Duplicated [1,2,3]:', duplicated.join(', '));

  // ============================================================
  // Example 11: Parallel unique
  // ============================================================
  console.log('\n11. Parallel unique\n');

  const withDuplicates = [1, 2, 2, 3, 3, 3, 4, 4, 4, 4, 5];
  const unique = await pool.unique(withDuplicates);
  console.log('  Input:', withDuplicates.join(', '));
  console.log('  Unique:', unique.join(', '));

  // ============================================================
  // Example 12: Parallel includes/indexOf
  // ============================================================
  console.log('\n12. Parallel includes and indexOf\n');

  const haystack = Array.from({ length: 10000 }, (_, i) => i);

  const includes5000 = await pool.includes(haystack, 5000);
  console.log('  Includes 5000:', includes5000);

  const includes99999 = await pool.includes(haystack, 99999);
  console.log('  Includes 99999:', includes99999);

  const indexOf7777 = await pool.indexOf(haystack, 7777);
  console.log('  Index of 7777:', indexOf7777);

  // ============================================================
  // Example 13: Parallel reduceRight
  // ============================================================
  console.log('\n13. Parallel reduceRight\n');

  const letters = ['a', 'b', 'c', 'd', 'e'];
  const reversed = await pool.reduceRight(
    letters,
    (acc, x) => acc + x,
    (left, right) => left + right,
    { initialValue: '' }
  );
  console.log('  Input:', letters.join(', '));
  console.log('  Reduced right-to-left:', reversed);

  await pool.terminate();

  console.log('\n' + '='.repeat(50));
  console.log('Parallel Array Operations examples completed!');
}

main().catch(console.error);
