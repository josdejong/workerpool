#!/usr/bin/env node
/**
 * CTON Context Compressor
 * Compresses files for LLM context windows using format-specific strategies.
 *
 * Usage: npx tsx compress-for-context.ts <input> [options]
 *
 * Self-contained - no external dependencies beyond Node.js built-ins.
 *
 * @version 2.0.0
 * @license MIT
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface CompressionResult {
  compressed: string;
  legend: Record<string, string>;
  stats: CompressionStats;
}

interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  tokenSavings: number;
  tokenSavingsPercent: number;
}

interface BatchResult {
  file: string;
  success: boolean;
  stats?: CompressionStats;
  error?: string;
  outputFile?: string;
}

interface CLIOptions {
  input: string;
  inputs: string[];  // For batch mode
  output: string;
  format: FileFormat | 'auto';
  level: CompressionLevel;
  includeLegend: boolean;
  showStats: boolean;
  dryRun: boolean;
  help: boolean;
  batch: boolean;
  decompress: boolean;
  recursive: boolean;
  pattern: string;  // Glob pattern for batch
}

type FileFormat = 'json' | 'yaml' | 'markdown' | 'csv' | 'tsv' | 'text' | 'log' | 'typescript' | 'javascript' | 'xml' | 'html';
type CompressionLevel = 'light' | 'medium' | 'aggressive';

// ============================================================================
// Common Patterns for Aggressive Compression
// ============================================================================

/**
 * Common programming patterns that can be safely abbreviated.
 */
const COMMON_PATTERNS: Record<string, string> = {
  // JavaScript/TypeScript keywords and patterns
  'function ': 'ƒ ',
  'return ': 'ʀ ',
  'const ': 'ᴄ ',
  'export ': 'ᴇ ',
  'import ': 'ɪ ',
  'interface ': 'ɪɴᴛ ',
  'class ': 'ᴄʟs ',
  'async ': 'ᴀ ',
  'await ': 'ᴀᴡ ',
  'undefined': 'ᴜɴᴅ',
  'null': 'ɴᴜʟ',
  'true': 'ᴛ',
  'false': 'ꜰ',

  // Common markdown patterns
  '```typescript': '```ts',
  '```javascript': '```js',
  '## ': '⸫ ',
  '### ': '⸬ ',
  '#### ': '⸭ ',

  // Common JSON patterns
  '"description"': '"desc"',
  '"dependencies"': '"deps"',
  '"devDependencies"': '"devDeps"',
  '"repository"': '"repo"',
  '"homepage"': '"home"',
  '"keywords"': '"keys"',
  '"license"': '"lic"',
  '"version"': '"ver"',
  '"required"': '"req"',
  '"optional"': '"opt"',
  '"default"': '"def"',
  '"example"': '"ex"',
  '"properties"': '"props"',
  '"additionalProperties"': '"addProps"',

  // Common path patterns
  'node_modules/': 'nm/',
  'src/': 's/',
  'dist/': 'd/',
  'test/': 't/',
  'tests/': 't/',
  '.typescript': '.ts',
  '.javascript': '.js',
};

interface Compressor {
  compress(content: string, level: CompressionLevel): CompressionResult;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Estimate token count using GPT-style tokenization heuristic.
 * Roughly 1 token per 4 characters for English text.
 */
function estimateTokens(text: string): number {
  // More accurate: count words and punctuation
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  const punctuation = (text.match(/[^\w\s]/g) || []).length;
  const numbers = (text.match(/\d+/g) || []).length;

  // Tokens ≈ words + punctuation/2 + some overhead for special chars
  return Math.ceil(words + punctuation * 0.5 + numbers * 0.5);
}

/**
 * Generate abbreviation for a key based on its structure.
 */
function generateAbbreviation(key: string, existingAbbrevs: Set<string>): string {
  // Strategy 1: First letter of each camelCase/snake_case word
  const words = key.split(/(?=[A-Z])|[_\-\s]+/);
  let abbrev = words.map(w => w[0]?.toLowerCase() || '').join('');

  if (abbrev.length >= 1 && !existingAbbrevs.has(abbrev)) {
    return abbrev;
  }

  // Strategy 2: First 2 chars
  abbrev = key.slice(0, 2).toLowerCase();
  if (!existingAbbrevs.has(abbrev)) {
    return abbrev;
  }

  // Strategy 3: First char + last char
  abbrev = (key[0] + key[key.length - 1]).toLowerCase();
  if (!existingAbbrevs.has(abbrev)) {
    return abbrev;
  }

  // Strategy 4: First 3 chars
  abbrev = key.slice(0, 3).toLowerCase();
  if (!existingAbbrevs.has(abbrev)) {
    return abbrev;
  }

  // Strategy 5: Add number suffix
  let counter = 1;
  const base = key.slice(0, 2).toLowerCase();
  while (existingAbbrevs.has(`${base}${counter}`)) {
    counter++;
  }
  return `${base}${counter}`;
}

/**
 * Find repeated substrings and calculate compression potential.
 * Returns substrings sorted by net savings (highest first).
 */
function findRepeatedSubstrings(
  text: string,
  minLength: number,
  minOccurrences: number,
  maxSubstrings: number = 50
): Array<{ substring: string; count: number; savings: number }> {
  const substringCounts = new Map<string, number>();

  // Find substrings at natural boundaries (words, punctuation, etc.)
  // Split text into tokens at natural break points
  const tokens = text.split(/(\s+|[{}()\[\]<>:;,."'`|=])/);

  // Build n-grams of consecutive tokens
  for (let n = 1; n <= 6; n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      const ngram = tokens.slice(i, i + n).join('');

      // Skip if too short, too long, or mostly whitespace
      if (ngram.length < minLength || ngram.length > 50) continue;
      if (/^\s*$/.test(ngram)) continue;
      if ((ngram.match(/\s/g) || []).length > ngram.length * 0.5) continue;

      // Skip substrings with unbalanced brackets or quotes
      const opens = (ngram.match(/[{(\[<]/g) || []).length;
      const closes = (ngram.match(/[})\]>]/g) || []).length;
      if (opens !== closes) continue;

      substringCounts.set(ngram, (substringCounts.get(ngram) || 0) + 1);
    }
  }

  // Also find common path patterns
  const pathPattern = /[a-zA-Z0-9_\-./]+\/[a-zA-Z0-9_\-./]+/g;
  let match;
  while ((match = pathPattern.exec(text)) !== null) {
    const path = match[0];
    if (path.length >= minLength) {
      substringCounts.set(path, (substringCounts.get(path) || 0) + 1);
    }
  }

  // Calculate savings for each substring
  const candidates: Array<{ substring: string; count: number; savings: number }> = [];

  for (const [substring, count] of substringCounts.entries()) {
    if (count >= minOccurrences) {
      // Abbreviation will be §X (2 chars for first 36, then §XX for more)
      const abbrevLength = 2;
      const legendCost = abbrevLength + substring.length + 4; // "§X=substring | "
      const savingsPerOccurrence = substring.length - abbrevLength;
      const netSavings = (savingsPerOccurrence * count) - legendCost;

      if (netSavings > 5) {
        candidates.push({ substring, count, savings: netSavings });
      }
    }
  }

  // Sort by savings (highest first)
  candidates.sort((a, b) => b.savings - a.savings);

  // Filter out substrings that overlap significantly with higher-value ones
  const selected: Array<{ substring: string; count: number; savings: number }> = [];
  const usedSubstrings: string[] = [];

  for (const candidate of candidates) {
    // Check similarity with already selected substrings
    let isTooSimilar = false;
    const candidateTrimmed = candidate.substring.trim();

    // Skip patterns that are just whitespace variations
    if (candidateTrimmed.length < 3) {
      continue;
    }

    for (const used of usedSubstrings) {
      const usedTrimmed = used.trim();

      // Check if one contains the other or they share 70%+ content
      if (used.includes(candidate.substring) || candidate.substring.includes(used)) {
        isTooSimilar = true;
        break;
      }

      // Check if trimmed versions are same or similar (space-padded variations)
      if (candidateTrimmed === usedTrimmed ||
          candidateTrimmed.includes(usedTrimmed) ||
          usedTrimmed.includes(candidateTrimmed)) {
        isTooSimilar = true;
        break;
      }

      // Check character overlap on trimmed content
      const shorter = candidateTrimmed.length < usedTrimmed.length ? candidateTrimmed : usedTrimmed;
      const longer = candidateTrimmed.length >= usedTrimmed.length ? candidateTrimmed : usedTrimmed;
      if (longer.includes(shorter.slice(0, Math.floor(shorter.length * 0.7)))) {
        isTooSimilar = true;
        break;
      }
    }

    if (!isTooSimilar) {
      selected.push(candidate);
      usedSubstrings.push(candidate.substring);

      if (selected.length >= maxSubstrings) break;
    }
  }

  return selected;
}

/**
 * Apply substring replacements to text.
 */
function applySubstringCompression(
  text: string,
  substrings: Array<{ substring: string; count: number; savings: number }>
): { compressed: string; legend: Record<string, string> } {
  const legend: Record<string, string> = {};
  let compressed = text;

  // Sort by length descending to replace longer substrings first
  const sorted = [...substrings].sort((a, b) => b.substring.length - a.substring.length);

  sorted.forEach((item, index) => {
    const abbrev = `§${index.toString(36)}`; // §0, §1, ... §a, §b, etc.
    legend[abbrev] = item.substring;

    // Replace all occurrences
    compressed = compressed.split(item.substring).join(abbrev);
  });

  return { compressed, legend };
}

/**
 * Calculate compression statistics.
 */
function calculateStats(original: string, compressed: string): CompressionStats {
  const originalSize = Buffer.byteLength(original, 'utf8');
  const compressedSize = Buffer.byteLength(compressed, 'utf8');
  const estimatedTokensBefore = estimateTokens(original);
  const estimatedTokensAfter = estimateTokens(compressed);

  return {
    originalSize,
    compressedSize,
    compressionRatio: compressedSize / originalSize,
    estimatedTokensBefore,
    estimatedTokensAfter,
    tokenSavings: estimatedTokensBefore - estimatedTokensAfter,
    tokenSavingsPercent: ((estimatedTokensBefore - estimatedTokensAfter) / estimatedTokensBefore) * 100
  };
}

/**
 * Apply common pattern replacements for aggressive compression.
 */
function applyCommonPatterns(text: string, level: CompressionLevel): { text: string; legend: Record<string, string> } {
  if (level !== 'aggressive') {
    return { text, legend: {} };
  }

  let result = text;
  const legend: Record<string, string> = {};

  // Apply patterns that provide savings
  for (const [pattern, replacement] of Object.entries(COMMON_PATTERNS)) {
    const count = (result.match(new RegExp(escapeRegex(pattern), 'g')) || []).length;
    const savings = (pattern.length - replacement.length) * count;

    if (savings > pattern.length + replacement.length + 5) { // Only if net positive
      legend[replacement] = pattern;
      result = result.split(pattern).join(replacement);
    }
  }

  return { text: result, legend };
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Decompress a CTON-compressed file back to original.
 */
function decompress(content: string, format: FileFormat): string {
  let result = content;
  let legend: Record<string, string> = {};

  // Extract legend based on format
  if (format === 'json') {
    try {
      const data = JSON.parse(content);
      if (data._legend) {
        legend = data._legend;
        delete data._legend;
        result = JSON.stringify(data, null, 2);
      }
    } catch {
      return content; // Return as-is if not valid JSON
    }
  } else if (format === 'markdown' || format === 'html' || format === 'xml') {
    // Extract legend from HTML comment: <!-- §: §0=value | §1=value -->
    const legendMatch = result.match(/<!--\s*§:\s*([^>]+)\s*-->\n?/);
    if (legendMatch) {
      result = result.replace(legendMatch[0], '');
      // Split on | but be careful not to trim values (spaces matter!)
      const entries = legendMatch[1].split(' | ');
      for (const entry of entries) {
        const eqIndex = entry.indexOf('=');
        if (eqIndex > 0) {
          const abbrev = entry.slice(0, eqIndex).trim();
          const value = entry.slice(eqIndex + 1); // Don't trim - spaces matter!
          if (abbrev && value) {
            legend[abbrev] = value;
          }
        }
      }
    }
  } else if (format === 'yaml') {
    // Extract legend from YAML comments
    const lines = result.split('\n');
    const legendLines: string[] = [];
    let i = 0;
    while (i < lines.length && lines[i].startsWith('#')) {
      const match = lines[i].match(/^#\s*(\S+):\s*(.+)$/);
      if (match) {
        legend[match[1]] = match[2];
      }
      legendLines.push(lines[i]);
      i++;
    }
    if (lines[i] === '---') i++;
    result = lines.slice(i).join('\n');
  } else if (format === 'text' || format === 'log') {
    // Extract legend from text block
    const legendMatch = result.match(/=== Legend ===\n([\s\S]*?)\n=+\n\n?/);
    if (legendMatch) {
      result = result.replace(legendMatch[0], '');
      const entries = legendMatch[1].split('\n');
      for (const entry of entries) {
        const [abbrev, ...valueParts] = entry.split(' = ');
        if (abbrev && valueParts.length > 0) {
          legend[abbrev.trim()] = valueParts.join(' = ').trim();
        }
      }
    }
  } else if (format === 'csv' || format === 'tsv') {
    // Extract legend from CSV comments
    const lines = result.split('\n');
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('#')) {
        const match = line.match(/^#\s*(\S+)=(.+)$/);
        if (match) {
          legend[match[1]] = match[2];
        }
      } else {
        dataLines.push(line);
      }
    }
    result = dataLines.join('\n');
  }

  // Apply legend replacements (reverse substring compression)
  // Sort by abbrev length descending to handle §10 before §1
  const sortedLegend = Object.entries(legend).sort((a, b) => b[0].length - a[0].length);
  for (const [abbrev, original] of sortedLegend) {
    result = result.split(abbrev).join(original);
  }

  // Note: COMMON_PATTERNS reversal is skipped as those patterns
  // are not currently applied during compression. The patterns exist
  // for potential future use with code compression.

  return result;
}

/**
 * Find files matching a pattern (simple glob support).
 */
function findFiles(dir: string, pattern: string, recursive: boolean): string[] {
  const results: string[] = [];

  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${regexPattern}$`, 'i');

  function scan(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (recursive && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          scan(fullPath);
        }
      } else if (entry.isFile()) {
        if (regex.test(entry.name)) {
          results.push(fullPath);
        }
      }
    }
  }

  scan(dir);
  return results;
}

/**
 * Process multiple files in batch mode.
 */
function processBatch(
  files: string[],
  options: CLIOptions
): BatchResult[] {
  const results: BatchResult[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const format = options.format === 'auto' ? detectFormat(file) : options.format;

      if (options.decompress) {
        const decompressed = decompress(content, format);
        const outputFile = file.replace('.compact', '');

        if (!options.dryRun) {
          fs.writeFileSync(outputFile, decompressed, 'utf8');
        }

        results.push({
          file,
          success: true,
          outputFile,
          stats: calculateStats(content, decompressed)
        });
      } else {
        const compressor = getCompressor(format);
        const result = compressor.compress(content, options.level);

        const ext = path.extname(file);
        const base = path.basename(file, ext);
        const dir = path.dirname(file);
        const outputFile = path.join(dir, `${base}.compact${ext}`);

        if (!options.dryRun) {
          fs.writeFileSync(outputFile, result.compressed, 'utf8');
        }

        results.push({
          file,
          success: true,
          outputFile,
          stats: result.stats
        });
      }
    } catch (error) {
      results.push({
        file,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return results;
}

// ============================================================================
// JSON Compressor
// ============================================================================

class JSONCompressor implements Compressor {
  compress(content: string, level: CompressionLevel): CompressionResult {
    const data = JSON.parse(content);
    const legend: Record<string, string> = {};
    const existingAbbrevs = new Set<string>();

    // Collect all keys and their frequencies
    const keyFrequency = new Map<string, number>();
    this.collectKeys(data, keyFrequency);

    // Sort by frequency * length (prioritize high-impact keys)
    const sortedKeys = [...keyFrequency.entries()]
      .filter(([key]) => this.shouldAbbreviate(key, level))
      .sort((a, b) => (b[1] * b[0].length) - (a[1] * a[0].length));

    // Generate abbreviations
    const keyMap = new Map<string, string>();
    for (const [key] of sortedKeys) {
      const abbrev = generateAbbreviation(key, existingAbbrevs);
      keyMap.set(key, abbrev);
      legend[abbrev] = key;
      existingAbbrevs.add(abbrev);
    }

    // Apply abbreviations
    const compressed = this.transformKeys(data, keyMap);

    // Add legend to output
    const output = typeof compressed === 'object' && compressed !== null
      ? { _legend: legend, ...(compressed as Record<string, unknown>) }
      : { _legend: legend, data: compressed };
    const compressedStr = JSON.stringify(output);

    return {
      compressed: compressedStr,
      legend,
      stats: calculateStats(content, compressedStr)
    };
  }

  private collectKeys(obj: unknown, freq: Map<string, number>): void {
    if (Array.isArray(obj)) {
      obj.forEach(item => this.collectKeys(item, freq));
    } else if (obj !== null && typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        freq.set(key, (freq.get(key) || 0) + 1);
        this.collectKeys((obj as Record<string, unknown>)[key], freq);
      }
    }
  }

  private shouldAbbreviate(key: string, level: CompressionLevel): boolean {
    const minLength = level === 'light' ? 6 : level === 'medium' ? 4 : 3;
    return key.length >= minLength;
  }

  private transformKeys(obj: unknown, keyMap: Map<string, string>): unknown {
    if (Array.isArray(obj)) {
      return obj.map(item => this.transformKeys(item, keyMap));
    } else if (obj !== null && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        const newKey = keyMap.get(key) || key;
        result[newKey] = this.transformKeys(value, keyMap);
      }
      return result;
    }
    return obj;
  }
}

// ============================================================================
// YAML Compressor (Simple YAML-like handling)
// ============================================================================

class YAMLCompressor implements Compressor {
  compress(content: string, level: CompressionLevel): CompressionResult {
    const lines = content.split('\n');
    const legend: Record<string, string> = {};
    const existingAbbrevs = new Set<string>();
    const keyFrequency = new Map<string, number>();

    // Collect keys (lines that end with : or have : followed by value)
    const keyPattern = /^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/;

    for (const line of lines) {
      const match = line.match(keyPattern);
      if (match) {
        const key = match[2];
        keyFrequency.set(key, (keyFrequency.get(key) || 0) + 1);
      }
    }

    // Generate abbreviations
    const minLength = level === 'light' ? 6 : level === 'medium' ? 4 : 3;
    const keyMap = new Map<string, string>();

    for (const [key, freq] of keyFrequency.entries()) {
      if (key.length >= minLength) {
        const abbrev = generateAbbreviation(key, existingAbbrevs);
        keyMap.set(key, abbrev);
        legend[abbrev] = key;
        existingAbbrevs.add(abbrev);
      }
    }

    // Apply abbreviations
    const compressedLines = lines.map(line => {
      const match = line.match(keyPattern);
      if (match) {
        const [fullMatch, indent, key] = match;
        const newKey = keyMap.get(key) || key;
        return line.replace(fullMatch, `${indent}${newKey}:`);
      }
      return line;
    });

    // Build output with legend as YAML comment
    const legendComment = Object.entries(legend)
      .map(([abbrev, full]) => `# ${abbrev}: ${full}`)
      .join('\n');

    const compressed = legendComment + '\n---\n' + compressedLines.join('\n');

    return {
      compressed,
      legend,
      stats: calculateStats(content, compressed)
    };
  }
}

// ============================================================================
// Markdown Compressor
// ============================================================================

class MarkdownCompressor implements Compressor {
  compress(content: string, level: CompressionLevel): CompressionResult {
    let compressed = content;
    let legend: Record<string, string> = {};

    // Level-based transformations
    if (level === 'aggressive' || level === 'medium') {
      // Remove excessive blank lines (keep max 1)
      compressed = compressed.replace(/\n{3,}/g, '\n\n');

      // Compress horizontal rules
      compressed = compressed.replace(/^[-*_]{3,}$/gm, '---');

      // Remove trailing whitespace
      compressed = compressed.replace(/[ \t]+$/gm, '');
    }

    if (level === 'aggressive') {
      // Remove HTML comments
      compressed = compressed.replace(/<!--[\s\S]*?-->/g, '');
    }

    // Use substring compression for repeated patterns
    const minLength = level === 'light' ? 8 : level === 'medium' ? 6 : 5;
    const minOccurrences = level === 'light' ? 5 : level === 'medium' ? 4 : 3;
    const maxSubstrings = level === 'light' ? 10 : level === 'medium' ? 25 : 50;

    const substrings = findRepeatedSubstrings(compressed, minLength, minOccurrences, maxSubstrings);

    if (substrings.length > 0) {
      const totalSavings = substrings.reduce((sum, s) => sum + s.savings, 0);

      // Only apply if we save at least 50 characters
      if (totalSavings > 50) {
        const result = applySubstringCompression(compressed, substrings);
        compressed = result.compressed;
        legend = result.legend;

        // Add legend at top as HTML comment
        const legendStr = '<!-- §: ' +
          Object.entries(legend).map(([a, f]) => `${a}=${f}`).join(' | ') +
          ' -->\n';
        compressed = legendStr + compressed;
      }
    }

    return {
      compressed,
      legend,
      stats: calculateStats(content, compressed)
    };
  }
}

// ============================================================================
// CSV Compressor
// ============================================================================

class CSVCompressor implements Compressor {
  private delimiter: string;

  constructor(delimiter: string = ',') {
    this.delimiter = delimiter;
  }

  compress(content: string, level: CompressionLevel): CompressionResult {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) {
      return { compressed: content, legend: {}, stats: calculateStats(content, content) };
    }

    const legend: Record<string, string> = {};
    const existingAbbrevs = new Set<string>();

    // Parse header
    const header = this.parseLine(lines[0]);
    const headerMap = new Map<number, string>();

    // Abbreviate headers
    const minLength = level === 'light' ? 6 : level === 'medium' ? 4 : 3;
    const newHeader = header.map((col, idx) => {
      if (col.length >= minLength) {
        const abbrev = generateAbbreviation(col, existingAbbrevs);
        legend[abbrev] = col;
        existingAbbrevs.add(abbrev);
        headerMap.set(idx, abbrev);
        return abbrev;
      }
      return col;
    });

    // Find repeated values in columns (for aggressive mode)
    const columnValues = new Map<number, Map<string, number>>();

    if (level === 'aggressive') {
      for (let i = 1; i < lines.length; i++) {
        const row = this.parseLine(lines[i]);
        row.forEach((val, idx) => {
          if (!columnValues.has(idx)) {
            columnValues.set(idx, new Map());
          }
          const valMap = columnValues.get(idx)!;
          valMap.set(val, (valMap.get(val) || 0) + 1);
        });
      }
    }

    // Create value abbreviations for frequently repeated values
    const valueMap = new Map<string, string>();

    if (level === 'aggressive') {
      for (const [, valMap] of columnValues.entries()) {
        for (const [val, count] of valMap.entries()) {
          if (count >= 3 && val.length > 5 && !valueMap.has(val)) {
            const abbrev = generateAbbreviation(val, existingAbbrevs);
            valueMap.set(val, abbrev);
            legend[abbrev] = val;
            existingAbbrevs.add(abbrev);
          }
        }
      }
    }

    // Rebuild CSV
    const compressedLines = [newHeader.join(this.delimiter)];

    for (let i = 1; i < lines.length; i++) {
      const row = this.parseLine(lines[i]);
      const newRow = row.map(val => valueMap.get(val) || val);
      compressedLines.push(newRow.join(this.delimiter));
    }

    // Add legend as comment at top
    const legendComment = Object.entries(legend)
      .map(([abbrev, full]) => `# ${abbrev}=${full}`)
      .join('\n');

    const compressed = legendComment + '\n' + compressedLines.join('\n');

    return {
      compressed,
      legend,
      stats: calculateStats(content, compressed)
    };
  }

  private parseLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === this.delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());

    return result;
  }
}

// ============================================================================
// Text/Log Compressor
// ============================================================================

class TextCompressor implements Compressor {
  compress(content: string, level: CompressionLevel): CompressionResult {
    let compressed = content;
    const legend: Record<string, string> = {};
    const existingAbbrevs = new Set<string>();

    // Normalize line endings
    compressed = compressed.replace(/\r\n/g, '\n');

    // Remove excessive whitespace
    if (level !== 'light') {
      compressed = compressed.replace(/[ \t]+/g, ' ');
      compressed = compressed.replace(/\n{3,}/g, '\n\n');
    }

    // Compress timestamps (common log formats)
    if (level === 'aggressive') {
      // ISO timestamps: 2025-12-15T10:30:45.123Z -> @ts1
      const timestamps = compressed.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g) || [];
      const uniqueTimestamps = [...new Set(timestamps)];

      uniqueTimestamps.forEach((ts, idx) => {
        const abbrev = `@t${idx}`;
        legend[abbrev] = ts;
        compressed = compressed.split(ts).join(abbrev);
      });

      // Common log levels
      const logLevels: Record<string, string> = {
        'ERROR': '@E',
        'WARNING': '@W',
        'WARN': '@W',
        'INFO': '@I',
        'DEBUG': '@D',
        'TRACE': '@T'
      };

      for (const [full, abbrev] of Object.entries(logLevels)) {
        if (compressed.includes(full)) {
          legend[abbrev] = full;
          compressed = compressed.replace(new RegExp(`\\b${full}\\b`, 'g'), abbrev);
        }
      }
    }

    // Use substring compression for repeated patterns
    const minLength = level === 'medium' ? 6 : 5;
    const minOccurrences = level === 'medium' ? 4 : 3;
    const maxSubstrings = level === 'medium' ? 30 : 50;

    const substrings = findRepeatedSubstrings(compressed, minLength, minOccurrences, maxSubstrings);

    if (substrings.length > 0) {
      const totalSavings = substrings.reduce((sum, s) => sum + s.savings, 0);

      if (totalSavings > 30) {
        const result = applySubstringCompression(compressed, substrings);
        // Merge with existing legend (timestamps, log levels)
        Object.assign(legend, result.legend);
        compressed = result.compressed;
      }
    }

    // Add legend at top
    if (Object.keys(legend).length > 0) {
      const legendStr = '=== Legend ===\n' +
        Object.entries(legend).map(([a, f]) => `${a} = ${f}`).join('\n') +
        '\n=============\n\n';
      compressed = legendStr + compressed;
    }

    return {
      compressed,
      legend,
      stats: calculateStats(content, compressed)
    };
  }
}

// ============================================================================
// Code Compressor (TypeScript/JavaScript)
// ============================================================================

class CodeCompressor implements Compressor {
  compress(content: string, level: CompressionLevel): CompressionResult {
    let compressed = content;
    const legend: Record<string, string> = {};

    // Remove single-line comments (but not URLs with //)
    if (level !== 'light') {
      compressed = compressed.replace(/(?<!:)\/\/(?!\/)[^\n]*/g, '');
    }

    // Remove multi-line comments
    if (level !== 'light') {
      compressed = compressed.replace(/\/\*[\s\S]*?\*\//g, '');
    }

    // Remove JSDoc comments in aggressive mode
    if (level === 'aggressive') {
      compressed = compressed.replace(/\/\*\*[\s\S]*?\*\//g, '');
    }

    // Normalize whitespace
    if (level !== 'light') {
      // Remove trailing whitespace
      compressed = compressed.replace(/[ \t]+$/gm, '');

      // Reduce multiple blank lines to one
      compressed = compressed.replace(/\n{3,}/g, '\n\n');

      // Remove blank lines at start/end
      compressed = compressed.trim();
    }

    // Aggressive: collapse some whitespace
    if (level === 'aggressive') {
      // Remove space before/after braces where safe
      compressed = compressed.replace(/\s*{\s*/g, '{');
      compressed = compressed.replace(/\s*}\s*/g, '}');
      compressed = compressed.replace(/;\s+/g, ';');
    }

    return {
      compressed,
      legend,
      stats: calculateStats(content, compressed)
    };
  }
}

// ============================================================================
// XML/HTML Compressor
// ============================================================================

class XMLCompressor implements Compressor {
  compress(content: string, level: CompressionLevel): CompressionResult {
    let compressed = content;
    const legend: Record<string, string> = {};
    const existingAbbrevs = new Set<string>();

    // Remove XML comments
    if (level !== 'light') {
      compressed = compressed.replace(/<!--[\s\S]*?-->/g, '');
    }

    // Normalize whitespace between tags
    if (level !== 'light') {
      compressed = compressed.replace(/>\s+</g, '><');
    }

    // Abbreviate long tag names
    if (level === 'aggressive') {
      const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9_-]*)/g;
      const tags = new Map<string, number>();

      let match;
      while ((match = tagPattern.exec(content)) !== null) {
        const tag = match[1];
        tags.set(tag, (tags.get(tag) || 0) + 1);
      }

      for (const [tag, count] of tags.entries()) {
        if (tag.length > 6 && count >= 2) {
          const abbrev = generateAbbreviation(tag, existingAbbrevs);
          legend[abbrev] = tag;
          existingAbbrevs.add(abbrev);

          // Replace opening and closing tags
          compressed = compressed.replace(new RegExp(`<${tag}([ >])`, 'g'), `<${abbrev}$1`);
          compressed = compressed.replace(new RegExp(`</${tag}>`, 'g'), `</${abbrev}>`);
        }
      }
    }

    // Add legend as XML comment
    if (Object.keys(legend).length > 0) {
      const legendStr = '<!-- Legend: ' +
        Object.entries(legend).map(([a, f]) => `${a}=${f}`).join(', ') +
        ' -->\n';
      compressed = legendStr + compressed;
    }

    return {
      compressed,
      legend,
      stats: calculateStats(content, compressed)
    };
  }
}

// ============================================================================
// Format Detection & Compressor Factory
// ============================================================================

function detectFormat(filePath: string): FileFormat {
  const ext = path.extname(filePath).toLowerCase();

  const formatMap: Record<string, FileFormat> = {
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.csv': 'csv',
    '.tsv': 'tsv',
    '.txt': 'text',
    '.log': 'log',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.xml': 'xml',
    '.html': 'html',
    '.htm': 'html',
    '.xhtml': 'html',
    '.svg': 'xml'
  };

  return formatMap[ext] || 'text';
}

function getCompressor(format: FileFormat): Compressor {
  switch (format) {
    case 'json':
      return new JSONCompressor();
    case 'yaml':
      return new YAMLCompressor();
    case 'markdown':
      return new MarkdownCompressor();
    case 'csv':
      return new CSVCompressor(',');
    case 'tsv':
      return new CSVCompressor('\t');
    case 'text':
    case 'log':
      return new TextCompressor();
    case 'typescript':
    case 'javascript':
      return new CodeCompressor();
    case 'xml':
    case 'html':
      return new XMLCompressor();
    default:
      return new TextCompressor();
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    input: '',
    inputs: [],
    output: '',
    format: 'auto',
    level: 'medium',
    includeLegend: true,
    showStats: true,
    dryRun: false,
    help: false,
    batch: false,
    decompress: false,
    recursive: false,
    pattern: ''
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '-o' || arg === '--output') {
      options.output = args[++i] || '';
    } else if (arg === '-f' || arg === '--format') {
      options.format = (args[++i] || 'auto') as FileFormat | 'auto';
    } else if (arg === '-l' || arg === '--level') {
      options.level = (args[++i] || 'medium') as CompressionLevel;
    } else if (arg === '--no-legend') {
      options.includeLegend = false;
    } else if (arg === '--no-stats') {
      options.showStats = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '-b' || arg === '--batch') {
      options.batch = true;
    } else if (arg === '-d' || arg === '--decompress') {
      options.decompress = true;
    } else if (arg === '-r' || arg === '--recursive') {
      options.recursive = true;
    } else if (arg === '-p' || arg === '--pattern') {
      options.pattern = args[++i] || '*.json';
    } else if (!arg.startsWith('-')) {
      if (!options.input) {
        options.input = arg;
      }
      options.inputs.push(arg);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
CTON Context Compressor v2.0.0
Compresses files for LLM context windows using format-specific strategies.
Supports compression, decompression, and batch processing.

Usage:
  node compress-for-context.js <input> [options]
  node compress-for-context.js -b -p "*.json" [options]     # Batch mode

Arguments:
  <input>              Input file(s) to compress (multiple files for batch)

Options:
  -o, --output <file>  Output file (default: input.compact.ext)
  -f, --format <fmt>   Force format: json|yaml|markdown|csv|tsv|text|log|typescript|javascript|xml|html
                       (default: auto-detect from extension)
  -l, --level <lvl>    Compression level: light|medium|aggressive (default: medium)
  --no-legend          Don't include legend in output
  --no-stats           Don't show compression statistics
  --dry-run            Preview compression without writing file
  -h, --help           Show this help message

Batch Options:
  -b, --batch          Enable batch mode (process multiple files)
  -p, --pattern <pat>  File pattern for batch mode (e.g., "*.json", "*.md")
  -r, --recursive      Search directories recursively in batch mode

Decompress Options:
  -d, --decompress     Decompress/restore a .compact file to original

Compression Levels:
  light       Minimal changes, preserve readability
  medium      Balance between size and readability (default)
  aggressive  Maximum compression, may reduce readability

Examples:
  # Single file compression
  node compress-for-context.js data.json
  node compress-for-context.js README.md -l aggressive
  node compress-for-context.js log.txt -o log.min.txt --dry-run

  # Batch compression
  node compress-for-context.js -b -p "*.json" ./src        # All JSON in ./src
  node compress-for-context.js -b -r -p "*.md" ./docs      # Recursive markdown

  # Decompression
  node compress-for-context.js -d data.compact.json        # Restore original
  node compress-for-context.js -d -b -p "*.compact.json"   # Batch decompress

Supported Formats:
  JSON (.json)           Key abbreviation, minification (best: ~50% savings)
  YAML (.yaml, .yml)     Key abbreviation
  Markdown (.md)         Substring compression, whitespace normalization
  CSV/TSV (.csv, .tsv)   Header/value abbreviation
  Text/Log (.txt, .log)  Phrase compression, timestamp abbreviation
  Code (.ts, .js)        Comment removal, whitespace normalization (~25% savings)
  XML/HTML (.xml, .html) Tag abbreviation, comment removal
`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function printStats(stats: CompressionStats): void {
  console.log('\n=== Compression Statistics ===');
  console.log(`Original size:     ${formatBytes(stats.originalSize)}`);
  console.log(`Compressed size:   ${formatBytes(stats.compressedSize)}`);
  console.log(`Size reduction:    ${((1 - stats.compressionRatio) * 100).toFixed(1)}%`);
  console.log('');
  console.log(`Est. tokens before: ${stats.estimatedTokensBefore.toLocaleString()}`);
  console.log(`Est. tokens after:  ${stats.estimatedTokensAfter.toLocaleString()}`);
  console.log(`Token savings:      ${stats.tokenSavings.toLocaleString()} (${stats.tokenSavingsPercent.toFixed(1)}%)`);
  console.log('==============================\n');
}

// ============================================================================
// Main
// ============================================================================

function printBatchSummary(results: BatchResult[]): void {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log('\n=== Batch Processing Summary ===');
  console.log(`Total files:    ${results.length}`);
  console.log(`Successful:     ${successful.length}`);
  console.log(`Failed:         ${failed.length}`);

  if (successful.length > 0) {
    const totalOriginal = successful.reduce((sum, r) => sum + (r.stats?.originalSize || 0), 0);
    const totalCompressed = successful.reduce((sum, r) => sum + (r.stats?.compressedSize || 0), 0);
    const totalTokensBefore = successful.reduce((sum, r) => sum + (r.stats?.estimatedTokensBefore || 0), 0);
    const totalTokensAfter = successful.reduce((sum, r) => sum + (r.stats?.estimatedTokensAfter || 0), 0);

    console.log('');
    console.log(`Total original:   ${formatBytes(totalOriginal)}`);
    console.log(`Total compressed: ${formatBytes(totalCompressed)}`);
    console.log(`Overall savings:  ${((1 - totalCompressed / totalOriginal) * 100).toFixed(1)}%`);
    console.log('');
    console.log(`Total tokens before: ${totalTokensBefore.toLocaleString()}`);
    console.log(`Total tokens after:  ${totalTokensAfter.toLocaleString()}`);
    console.log(`Total token savings: ${(totalTokensBefore - totalTokensAfter).toLocaleString()}`);
  }

  if (failed.length > 0) {
    console.log('\nFailed files:');
    for (const f of failed) {
      console.log(`  ${f.file}: ${f.error}`);
    }
  }

  console.log('================================\n');
}

function main(): void {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // Handle batch mode
  if (options.batch) {
    let files: string[] = [];

    if (options.pattern) {
      // Find files matching pattern in the input directory (or current dir)
      const searchDir = options.input || '.';
      if (!fs.existsSync(searchDir)) {
        console.error(`Error: Directory not found: ${searchDir}`);
        process.exit(1);
      }
      files = findFiles(searchDir, options.pattern, options.recursive);
      console.log(`Found ${files.length} files matching "${options.pattern}"${options.recursive ? ' (recursive)' : ''}`);
    } else if (options.inputs.length > 0) {
      // Use explicitly provided files
      files = options.inputs.filter(f => fs.existsSync(f));
      if (files.length !== options.inputs.length) {
        const missing = options.inputs.filter(f => !fs.existsSync(f));
        console.warn(`Warning: ${missing.length} file(s) not found: ${missing.join(', ')}`);
      }
    }

    if (files.length === 0) {
      console.error('Error: No files to process. Use -p to specify a pattern or provide file arguments.');
      process.exit(1);
    }

    const mode = options.decompress ? 'Decompressing' : 'Compressing';
    console.log(`\n${mode} ${files.length} file(s)...\n`);

    const results = processBatch(files, options);

    // Print individual results
    for (const result of results) {
      if (result.success) {
        const savings = result.stats ? `(${((1 - result.stats.compressionRatio) * 100).toFixed(1)}%)` : '';
        console.log(`✓ ${result.file} → ${result.outputFile} ${savings}`);
      } else {
        console.log(`✗ ${result.file}: ${result.error}`);
      }
    }

    if (options.showStats) {
      printBatchSummary(results);
    }

    process.exit(results.some(r => !r.success) ? 1 : 0);
  }

  // Single file mode
  if (!options.input) {
    printHelp();
    process.exit(1);
  }

  // Validate input file
  if (!fs.existsSync(options.input)) {
    console.error(`Error: Input file not found: ${options.input}`);
    process.exit(1);
  }

  // Detect format
  const format = options.format === 'auto' ? detectFormat(options.input) : options.format;

  // Handle decompress mode
  if (options.decompress) {
    const content = fs.readFileSync(options.input, 'utf8');

    // Generate output filename (remove .compact)
    if (!options.output) {
      options.output = options.input.replace('.compact', '');
      if (options.output === options.input) {
        // No .compact in name, add .restored
        const ext = path.extname(options.input);
        const base = path.basename(options.input, ext);
        const dir = path.dirname(options.input);
        options.output = path.join(dir, `${base}.restored${ext}`);
      }
    }

    console.log(`Decompressing: ${options.input}`);
    console.log(`Format: ${format}`);

    const decompressed = decompress(content, format);
    const stats = calculateStats(content, decompressed);

    if (options.showStats) {
      console.log('\n=== Decompression Statistics ===');
      console.log(`Compressed size:   ${formatBytes(stats.originalSize)}`);
      console.log(`Restored size:     ${formatBytes(stats.compressedSize)}`);
      console.log(`Size increase:     ${((stats.compressionRatio - 1) * 100).toFixed(1)}%`);
      console.log('================================\n');
    }

    if (!options.dryRun) {
      fs.writeFileSync(options.output, decompressed, 'utf8');
      console.log(`Output written to: ${options.output}`);
    } else {
      console.log('Dry run - no file written');
      console.log('\n--- Preview (first 500 chars) ---');
      console.log(decompressed.slice(0, 500));
      if (decompressed.length > 500) {
        console.log('...');
      }
      console.log('--- End preview ---');
    }

    process.exit(0);
  }

  // Standard compression mode
  // Generate output filename
  if (!options.output) {
    const ext = path.extname(options.input);
    const base = path.basename(options.input, ext);
    const dir = path.dirname(options.input);
    options.output = path.join(dir, `${base}.compact${ext}`);
  }

  // Read input
  const content = fs.readFileSync(options.input, 'utf8');

  // Get compressor and compress
  const compressor = getCompressor(format);

  console.log(`Compressing: ${options.input}`);
  console.log(`Format: ${format}`);
  console.log(`Level: ${options.level}`);

  const result = compressor.compress(content, options.level);

  // Show stats
  if (options.showStats) {
    printStats(result.stats);
  }

  // Write output
  if (!options.dryRun) {
    fs.writeFileSync(options.output, result.compressed, 'utf8');
    console.log(`Output written to: ${options.output}`);
  } else {
    console.log('Dry run - no file written');
    console.log('\n--- Preview (first 500 chars) ---');
    console.log(result.compressed.slice(0, 500));
    if (result.compressed.length > 500) {
      console.log('...');
    }
    console.log('--- End preview ---');
  }
}

main();
