#!/usr/bin/env node
/**
 * WASM Build Workflow
 *
 * Compiles TypeScript/AssemblyScript to WebAssembly.
 * This workflow handles:
 * - AssemblyScript compilation to WASM (multiple targets)
 * - WASM bindings generation (TypeScript types + embedded WASM)
 * - WASM validation and functional testing
 *
 * Usage:
 *   node scripts/build-wasm.mjs [options]
 *
 * Options:
 *   --debug       Build debug target only
 *   --release     Build release target only
 *   --esm         Build ESM target only
 *   --raw         Build raw target only
 *   --all         Build all targets (default)
 *   --embed       Generate embedded WASM bindings
 *   --validate    Run WASM validation after build
 *   --watch       Watch for AssemblyScript file changes
 *   --clean       Clean WASM build artifacts before building
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ASSEMBLY_DIR = path.join(ROOT_DIR, 'src', 'ts', 'assembly');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  debug: args.includes('--debug'),
  release: args.includes('--release'),
  esm: args.includes('--esm'),
  raw: args.includes('--raw'),
  all: args.includes('--all') || (!args.includes('--debug') && !args.includes('--release') && !args.includes('--esm') && !args.includes('--raw')),
  embed: args.includes('--embed'),
  validate: args.includes('--validate'),
  watch: args.includes('--watch'),
  clean: args.includes('--clean'),
  verbose: args.includes('--verbose') || args.includes('-v'),
};

// WASM files to manage
const WASM_TARGETS = {
  debug: {
    wasm: 'workerpool.debug.wasm',
    wat: 'workerpool.debug.wat',
    target: 'debug',
    description: 'Debug build (with source maps)',
  },
  release: {
    wasm: 'workerpool.wasm',
    wat: 'workerpool.wat',
    target: 'release',
    description: 'Optimized release build',
  },
  esm: {
    wasm: 'workerpool.esm.wasm',
    wat: 'workerpool.esm.wat',
    target: 'release-esm',
    description: 'ESM module build',
  },
  raw: {
    wasm: 'workerpool.raw.wasm',
    wat: null,
    target: 'release-raw',
    description: 'Raw WASM build (no bindings)',
  },
};

/**
 * Run a command and return a promise
 */
function runCommand(command, args, cmdOptions = {}) {
  return new Promise((resolve, reject) => {
    if (options.verbose) {
      console.log(`  $ ${command} ${args.join(' ')}\n`);
    }

    const proc = spawn(command, args, {
      cwd: ROOT_DIR,
      stdio: cmdOptions.silent ? 'pipe' : 'inherit',
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';

    if (cmdOptions.silent) {
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
 * Clean WASM build artifacts
 */
function cleanWasmArtifacts() {
  console.log('🧹 Cleaning WASM build artifacts...\n');

  const patterns = [
    '*.wasm',
    '*.wat',
    '*.wasm.map',
  ];

  let cleaned = 0;

  if (fs.existsSync(DIST_DIR)) {
    for (const file of fs.readdirSync(DIST_DIR)) {
      if (patterns.some(p => {
        const regex = new RegExp('^' + p.replace('*', '.*') + '$');
        return regex.test(file);
      })) {
        fs.unlinkSync(path.join(DIST_DIR, file));
        console.log(`  Removed: dist/${file}`);
        cleaned++;
      }
    }
  }

  console.log(`  Cleaned ${cleaned} file(s)\n`);
}

/**
 * Ensure directories exist
 */
function ensureDirectories() {
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  const generatedDir = path.join(ROOT_DIR, 'src', 'generated');
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }
}

/**
 * Check AssemblyScript source files
 */
function checkSourceFiles() {
  const entryFile = path.join(ASSEMBLY_DIR, 'index.ts');

  if (!fs.existsSync(entryFile)) {
    throw new Error(`AssemblyScript entry file not found: ${entryFile}`);
  }

  // Count source files
  const files = fs.readdirSync(ASSEMBLY_DIR).filter(f => f.endsWith('.ts'));
  console.log(`📁 Found ${files.length} AssemblyScript source files in src/ts/assembly/\n`);

  return files;
}

/**
 * Build a specific WASM target
 */
async function buildTarget(targetName) {
  const target = WASM_TARGETS[targetName];
  if (!target) {
    throw new Error(`Unknown target: ${targetName}`);
  }

  console.log(`  🔧 Building ${targetName}: ${target.description}`);

  const ascArgs = [
    'src/ts/assembly/index.ts',
    '--config', 'asconfig.json',
    '--target', target.target,
  ];

  await runCommand('npx', ['asc', ...ascArgs], { silent: !options.verbose });

  // Verify output
  const wasmPath = path.join(DIST_DIR, target.wasm);
  if (fs.existsSync(wasmPath)) {
    const stats = fs.statSync(wasmPath);
    console.log(`     ✓ ${target.wasm} (${(stats.size / 1024).toFixed(2)} KB)`);
  } else {
    throw new Error(`Expected output not found: ${target.wasm}`);
  }
}

/**
 * Build WASM targets
 */
async function buildWasm() {
  console.log('🔨 Compiling AssemblyScript to WebAssembly...\n');

  const targets = [];

  if (options.all) {
    targets.push('release', 'debug', 'esm');
  } else {
    if (options.debug) targets.push('debug');
    if (options.release) targets.push('release');
    if (options.esm) targets.push('esm');
    if (options.raw) targets.push('raw');
  }

  for (const target of targets) {
    await buildTarget(target);
  }

  console.log('');
}

/**
 * Generate WASM bindings
 */
async function generateBindings() {
  console.log('📝 Generating WASM bindings...\n');

  await runCommand('node', ['scripts/generate-wasm-bindings.mjs']);

  console.log('');
}

/**
 * Validate WASM module
 */
async function validateWasm() {
  console.log('🔍 Validating WASM module...\n');

  try {
    await runCommand('node', ['scripts/validate-wasm.mjs']);
  } catch (err) {
    console.log('⚠️  WASM validation failed (non-fatal)\n');
    if (options.verbose) {
      console.error(err.message);
    }
  }
}

/**
 * Watch for changes
 */
async function watchMode() {
  console.log('👀 Watching for AssemblyScript changes...\n');
  console.log('   Press Ctrl+C to stop\n');

  // Use nodemon for watching
  await runCommand('npx', [
    'nodemon',
    '--watch', 'src/ts/assembly',
    '--ext', 'ts',
    '--exec', 'node scripts/build-wasm.mjs --debug',
  ]);
}

/**
 * Verify build outputs
 */
function verifyOutputs() {
  console.log('📊 Build Summary\n');

  const targets = options.all
    ? ['release', 'debug', 'esm']
    : [
      options.debug && 'debug',
      options.release && 'release',
      options.esm && 'esm',
      options.raw && 'raw',
    ].filter(Boolean);

  let allFound = true;
  let totalSize = 0;

  for (const targetName of targets) {
    const target = WASM_TARGETS[targetName];
    const wasmPath = path.join(DIST_DIR, target.wasm);

    if (fs.existsSync(wasmPath)) {
      const stats = fs.statSync(wasmPath);
      totalSize += stats.size;
      console.log(`  ✓ ${target.wasm} (${(stats.size / 1024).toFixed(2)} KB)`);

      if (target.wat) {
        const watPath = path.join(DIST_DIR, target.wat);
        if (fs.existsSync(watPath)) {
          console.log(`    └─ ${target.wat}`);
        }
      }
    } else {
      console.log(`  ✗ ${target.wasm} NOT FOUND`);
      allFound = false;
    }
  }

  console.log(`\n  Total WASM size: ${(totalSize / 1024).toFixed(2)} KB`);
  console.log('');

  return allFound;
}

/**
 * Main build function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  WASM Build Workflow (AssemblyScript → WebAssembly)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const startTime = Date.now();

  try {
    // Watch mode is special
    if (options.watch) {
      await watchMode();
      return;
    }

    // Clean if requested
    if (options.clean) {
      cleanWasmArtifacts();
    }

    // Setup
    ensureDirectories();
    checkSourceFiles();

    // Build WASM
    await buildWasm();

    // Generate bindings if embedding
    if (options.embed || options.all) {
      await generateBindings();
    }

    // Validate if requested
    if (options.validate) {
      await validateWasm();
    }

    // Verify outputs
    const verified = verifyOutputs();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('═══════════════════════════════════════════════════════════');

    if (verified) {
      console.log(`✅ WASM build completed successfully in ${elapsed}s`);
    } else {
      console.log(`⚠️  WASM build completed with warnings in ${elapsed}s`);
    }

    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n❌ WASM build failed:', err.message);
    if (options.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
