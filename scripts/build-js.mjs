#!/usr/bin/env node
/**
 * JavaScript/TypeScript Build Workflow
 *
 * Builds the JavaScript and/or TypeScript library.
 * This workflow handles:
 * - Rollup bundling for JavaScript (UMD format for browser/Node.js)
 * - TypeScript compilation to dist/ts/
 * - TypeScript type definitions generation
 * - Embedded worker generation
 *
 * Usage:
 *   node scripts/build-js.mjs [options]
 *
 * Options:
 *   --watch     Watch mode for development
 *   --ts        Build TypeScript to dist/ts/ (compile TS files)
 *   --types     Only build TypeScript types (declarations)
 *   --no-types  Skip TypeScript types generation
 *   --all       Build both JS bundle and TS compilation
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
  ts: args.includes('--ts'),
  typesOnly: args.includes('--types'),
  noTypes: args.includes('--no-types'),
  all: args.includes('--all'),
  verbose: args.includes('--verbose') || args.includes('-v'),
};

/**
 * Run a command and return a promise
 */
function runCommand(command, cmdArgs, cmdOptions = {}) {
  return new Promise((resolve, reject) => {
    if (options.verbose) {
      console.log(`  $ ${command} ${cmdArgs.join(' ')}\n`);
    }

    const proc = spawn(command, cmdArgs, {
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
        reject(new Error(`Command failed with code ${code}: ${command} ${cmdArgs.join(' ')}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Ensure directories exist
 */
function ensureDirectories() {
  const dirs = [
    path.join(ROOT_DIR, 'dist'),
    path.join(ROOT_DIR, 'dist', 'ts'),
    path.join(ROOT_DIR, 'types'),
    path.join(ROOT_DIR, 'types', 'ts'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Build JavaScript with Rollup (legacy bundle)
 */
async function buildJavaScript() {
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
 * Compile TypeScript to dist/ts/
 */
async function buildTypeScript() {
  console.log('🔷 Compiling TypeScript to dist/ts/...\n');

  // Create a temporary tsconfig for compilation (not just declarations)
  const tsconfigCompile = {
    extends: './tsconfig.json',
    compilerOptions: {
      noEmit: false,
      declaration: true,
      declarationMap: true,
      declarationDir: './types/ts',
      outDir: './dist/ts',
      sourceMap: true,
    },
    include: ['src/ts/**/*.ts'],
    exclude: ['node_modules', 'dist', 'test', 'src/ts/generated', 'src/ts/assembly'],
  };

  const tempConfigPath = path.join(ROOT_DIR, 'tsconfig.compile.json');
  fs.writeFileSync(tempConfigPath, JSON.stringify(tsconfigCompile, null, 2));

  try {
    await runCommand('npx', ['tsc', '-p', 'tsconfig.compile.json']);
    console.log('✓ TypeScript compilation complete\n');
  } finally {
    // Clean up temporary config
    if (fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }
  }
}

/**
 * Generate TypeScript type definitions only
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

  const jsFiles = [
    'dist/workerpool.js',
    'dist/workerpool.min.js',
    'dist/worker.js',
    'dist/worker.min.js',
  ];

  const tsFiles = [
    'dist/ts/index.js',
    'dist/ts/full.js',
    'dist/ts/minimal.js',
  ];

  const typesFiles = [
    'types/ts/index.d.ts',
  ];

  let allFound = true;

  // Check JS files (if not TS-only build)
  if (!options.ts || options.all) {
    console.log('  JavaScript bundles:');
    for (const file of jsFiles) {
      const filepath = path.join(ROOT_DIR, file);
      if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        console.log(`    ✓ ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
      } else {
        console.log(`    ✗ ${file} NOT FOUND`);
        allFound = false;
      }
    }
    console.log('');
  }

  // Check TS files (if TS build)
  if (options.ts || options.all) {
    console.log('  TypeScript compiled:');
    for (const file of tsFiles) {
      const filepath = path.join(ROOT_DIR, file);
      if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        console.log(`    ✓ ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
      } else {
        console.log(`    ✗ ${file} NOT FOUND`);
        allFound = false;
      }
    }
    console.log('');
  }

  // Check types
  if (!options.noTypes) {
    console.log('  Type definitions:');
    for (const file of typesFiles) {
      const filepath = path.join(ROOT_DIR, file);
      if (fs.existsSync(filepath)) {
        console.log(`    ✓ ${file}`);
      } else {
        console.log(`    ✗ ${file} NOT FOUND`);
        allFound = false;
      }
    }
    console.log('');
  }

  return allFound;
}

/**
 * Main build function
 */
async function main() {
  const buildMode = options.all ? 'Full (JS + TS)' :
                    options.ts ? 'TypeScript' :
                    options.typesOnly ? 'Types Only' : 'JavaScript';

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Build Workflow - ${buildMode}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const startTime = Date.now();

  try {
    ensureDirectories();

    if (options.typesOnly) {
      // Only build types
      await buildTypes();
    } else if (options.ts && !options.all) {
      // TypeScript only
      await buildTypeScript();
    } else if (options.all) {
      // Build everything
      await buildJavaScript();
      await buildTypeScript();
    } else {
      // Default: JavaScript bundles only
      await buildJavaScript();

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
        console.log(`✅ Build completed successfully in ${elapsed}s`);
      } else {
        console.log(`⚠️  Build completed with warnings in ${elapsed}s`);
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
