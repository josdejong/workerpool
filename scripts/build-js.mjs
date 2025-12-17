#!/usr/bin/env node
/**
 * JavaScript Build Workflow
 *
 * Builds the JavaScript/TypeScript library using Rollup.
 * This workflow handles:
 * - Rollup bundling (UMD format for browser/Node.js)
 * - TypeScript type definitions generation
 * - Embedded worker generation
 *
 * Usage:
 *   node scripts/build-js.mjs [options]
 *
 * Options:
 *   --watch     Watch mode for development
 *   --minify    Only build minified versions
 *   --types     Only build TypeScript types
 *   --no-types  Skip TypeScript types generation
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  watch: args.includes('--watch'),
  minifyOnly: args.includes('--minify'),
  typesOnly: args.includes('--types'),
  noTypes: args.includes('--no-types'),
  verbose: args.includes('--verbose') || args.includes('-v'),
};

/**
 * Run a command and return a promise
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: ROOT_DIR,
      stdio: options.silent ? 'pipe' : 'inherit',
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';

    if (options.silent) {
      proc.stdout?.on('data', (data) => { stdout += data; });
      proc.stderr?.on('data', (data) => { stderr += data; });
    }

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Command failed with code ${code}: ${command} ${args.join(' ')}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Ensure the dist directory exists
 */
function ensureDistDir() {
  const distDir = path.join(ROOT_DIR, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
}

/**
 * Build with Rollup
 */
async function buildWithRollup() {
  console.log('📦 Building JavaScript bundles with Rollup...\n');

  const rollupArgs = ['-c', 'rollup.config.mjs'];

  if (options.watch) {
    rollupArgs.push('-w');
    console.log('👀 Watching for changes...\n');
  }

  await runCommand('npx', ['rollup', ...rollupArgs]);

  console.log('✓ Rollup build complete\n');
}

/**
 * Generate TypeScript type definitions
 */
async function buildTypes() {
  console.log('📝 Generating TypeScript type definitions...\n');

  await runCommand('npx', ['tsc', '-p', 'tsconfig.build.json']);

  console.log('✓ TypeScript types generated\n');
}

/**
 * Verify build outputs
 */
function verifyOutputs() {
  console.log('🔍 Verifying build outputs...\n');

  const expectedFiles = [
    'dist/workerpool.js',
    'dist/workerpool.min.js',
    'dist/worker.js',
    'dist/worker.min.js',
  ];

  const typesFiles = [
    'types/index.d.ts',
  ];

  let allFound = true;

  for (const file of expectedFiles) {
    const filepath = path.join(ROOT_DIR, file);
    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      console.log(`  ✓ ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
    } else {
      console.log(`  ✗ ${file} NOT FOUND`);
      allFound = false;
    }
  }

  if (!options.noTypes) {
    console.log('');
    for (const file of typesFiles) {
      const filepath = path.join(ROOT_DIR, file);
      if (fs.existsSync(filepath)) {
        console.log(`  ✓ ${file}`);
      } else {
        console.log(`  ✗ ${file} NOT FOUND`);
        allFound = false;
      }
    }
  }

  console.log('');
  return allFound;
}

/**
 * Main build function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  JavaScript Build Workflow');
  console.log('═══════════════════════════════════════════════════════════\n');

  const startTime = Date.now();

  try {
    ensureDistDir();

    if (options.typesOnly) {
      // Only build types
      await buildTypes();
    } else {
      // Build JavaScript bundles
      await buildWithRollup();

      // Generate types unless disabled
      if (!options.noTypes && !options.watch) {
        await buildTypes();
      }
    }

    // Verify outputs (unless in watch mode)
    if (!options.watch) {
      const verified = verifyOutputs();

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log('═══════════════════════════════════════════════════════════');

      if (verified) {
        console.log(`✅ JavaScript build completed successfully in ${elapsed}s`);
      } else {
        console.log(`⚠️  JavaScript build completed with warnings in ${elapsed}s`);
      }

      console.log('═══════════════════════════════════════════════════════════\n');
    }
  } catch (err) {
    console.error('\n❌ Build failed:', err.message);
    if (options.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
