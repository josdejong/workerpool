#!/usr/bin/env npx tsx

/**
 * Generic Dependency Graph Generator
 *
 * Scans a TypeScript codebase and generates:
 * - docs/architecture/DEPENDENCY_GRAPH.md (human-readable)
 * - docs/architecture/dependency-graph.json (machine-readable)
 * - docs/architecture/dependency-graph.yaml (compact, ~40% smaller than JSON)
 *
 * Usage: npx tsx tools/create-dependency-graph.ts
 *
 * This tool is generic and does not depend on any codebase-specific functions.
 * It dynamically discovers the project structure from the filesystem.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, relative, basename } from 'path';
import yaml from 'js-yaml';

// Types
interface Dependency {
  file: string;
  imports: string[];
  reExport?: boolean;
  typeOnly?: boolean;  // Track type-only imports
}

interface ExternalDependency {
  package: string;
  imports: string[];
}

interface NodeDependency {
  module: string;
  imports: string[];
}

interface FileExports {
  named: string[];
  default: string | null;
  types: string[];
  interfaces: string[];
  enums: string[];
  classes: string[];
  functions: string[];
  constants: string[];
  reExported: string[];  // Track re-exported symbols
}

interface ParsedFile {
  path: string;
  name: string;
  externalDependencies: ExternalDependency[];
  nodeDependencies: NodeDependency[];
  internalDependencies: Dependency[];
  exports: FileExports;
  description: string | null;
}

interface DependencyMatrix {
  [path: string]: {
    importsFrom: string[];
    exportsTo: string[];
  };
}

interface Statistics {
  totalTypeScriptFiles: number;
  totalModules: number;
  totalLinesOfCode: number;
  totalExports: number;
  totalClasses: number;
  totalInterfaces: number;
  totalFunctions: number;
  totalTypeGuards: number;
  totalEnums: number;
  totalConstants: number;
  totalReExports: number;
  totalTypeOnlyImports: number;
  runtimeCircularDeps: number;  // Excludes type-only cycles
  typeOnlyCircularDeps: number; // Type-only cycles (not runtime issues)
  unusedFilesCount: number;
  unusedExportsCount: number;
}

interface UnusedExport {
  file: string;
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'constant' | 'enum' | 'other';
}

interface UnusedAnalysis {
  unusedFiles: string[];
  unusedExports: UnusedExport[];
}

interface ModuleMap {
  [moduleName: string]: {
    [filePath: string]: ParsedFile;
  };
}

interface PackageJson {
  name: string;
  version: string;
}

// Constants - support CLI argument or current working directory for portability
function getProjectRoot(): string {
  // Check for CLI argument: --root=/path/to/project or first positional arg
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--root=')) {
      return arg.slice(7);
    }
    if (arg === '--help' || arg === '-h') {
      console.log(`
Dependency Graph Generator

Usage:
  create-dependency-graph [options] [project-root]

Options:
  --root=<path>   Project root directory (default: current directory)
  --help, -h      Show this help

Examples:
  create-dependency-graph                     # Use current directory
  create-dependency-graph ./my-project        # Specify project path
  create-dependency-graph --root=C:/projects/my-app
`);
      process.exit(0);
    }
    // First non-flag argument is the project root
    if (!arg.startsWith('-') && existsSync(arg)) {
      return arg;
    }
  }
  // Fallback to current working directory
  return process.cwd();
}

const ROOT_DIR = getProjectRoot();
// Scan src/ts/ for TypeScript files (src/js/ contains legacy JavaScript)
const SRC_DIR = join(ROOT_DIR, 'src', 'ts');
const OUTPUT_DIR = join(ROOT_DIR, 'docs', 'architecture');

// Read package.json for version and name
let packageJson: PackageJson = { name: 'unknown', version: '0.0.0' };
try {
  packageJson = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf-8')) as PackageJson;
} catch {
  console.warn('Warning: Could not read package.json, using defaults');
}

/**
 * Recursively get all TypeScript files in a directory
 */
function getAllTsFiles(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      getAllTsFiles(fullPath, files);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Parse a TypeScript file for imports and exports
 */
function parseFile(filePath: string): ParsedFile {
  const content = readFileSync(filePath, 'utf-8');
  const relativePath = relative(ROOT_DIR, filePath).replace(/\\/g, '/');

  const result: ParsedFile = {
    path: relativePath,
    name: basename(filePath, '.ts'),
    externalDependencies: [],
    nodeDependencies: [],
    internalDependencies: [],
    exports: {
      named: [],
      default: null,
      types: [],
      interfaces: [],
      enums: [],
      classes: [],
      functions: [],
      constants: [],
      reExported: []
    },
    description: extractDescription(content)
  };

  // Parse imports - enhanced to detect type-only imports
  // Matches: import type { ... }, import { type X, Y }, import X from, import * as X from
  const importRegex = /import\s+(type\s+)?(?:(?:{([^}]+)}|(\w+)|\*\s+as\s+(\w+))(?:\s*,\s*(?:{([^}]+)}|(\w+)))?)\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  const nodeBuiltins = ['fs', 'path', 'url', 'crypto', 'util', 'stream', 'events', 'buffer', 'os', 'child_process', 'http', 'https', 'net', 'dns', 'tls', 'zlib', 'readline', 'assert', 'cluster', 'dgram', 'domain', 'inspector', 'module', 'perf_hooks', 'process', 'punycode', 'querystring', 'repl', 'string_decoder', 'timers', 'tty', 'v8', 'vm', 'worker_threads'];

  while ((match = importRegex.exec(content)) !== null) {
    const isTypeOnlyImport = !!match[1]; // "import type" prefix
    const namedImports = match[2] || match[5] || '';
    const defaultImport = match[3] || match[6] || '';
    const namespaceImport = match[4] || '';
    const source = match[7];

    const imports: string[] = [];
    let hasRuntimeImport = !isTypeOnlyImport;

    if (namedImports) {
      const importItems = namedImports.split(',').map(s => s.trim());
      for (const item of importItems) {
        // Check for inline type imports: import { type Foo, Bar }
        const isInlineType = item.startsWith('type ');
        const name = item.replace(/^type\s+/, '').split(' as ')[0].trim();
        if (name) {
          imports.push(name);
          // If any import is NOT a type, it's a runtime import
          if (!isInlineType && !isTypeOnlyImport) {
            hasRuntimeImport = true;
          }
        }
      }
    }
    if (defaultImport) imports.push(defaultImport);
    if (namespaceImport) imports.push(`* as ${namespaceImport}`);

    const typeOnly = isTypeOnlyImport || !hasRuntimeImport;

    if (source.startsWith('.')) {
      result.internalDependencies.push({
        file: source,
        imports: imports,
        typeOnly: typeOnly
      });
    } else if (source.startsWith('node:') || nodeBuiltins.includes(source.split('/')[0])) {
      result.nodeDependencies.push({
        module: source.replace('node:', ''),
        imports: imports
      });
    } else {
      result.externalDependencies.push({
        package: source,
        imports: imports
      });
    }
  }

  // Parse exports
  // Named exports: export { foo, bar }
  const namedExportRegex = /export\s*{\s*([^}]+)\s*}/g;
  while ((match = namedExportRegex.exec(content)) !== null) {
    const exports = match[1].split(',').map(s => s.trim().split(' as ')[0]).filter(Boolean);
    result.exports.named.push(...exports);
  }

  // Export declarations
  // export const/let/var
  const constExportRegex = /export\s+(?:const|let|var)\s+(\w+)/g;
  while ((match = constExportRegex.exec(content)) !== null) {
    result.exports.constants.push(match[1]);
    result.exports.named.push(match[1]);
  }

  // export function
  const funcExportRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
  while ((match = funcExportRegex.exec(content)) !== null) {
    result.exports.functions.push(match[1]);
    result.exports.named.push(match[1]);
  }

  // export class
  const classExportRegex = /export\s+class\s+(\w+)/g;
  while ((match = classExportRegex.exec(content)) !== null) {
    result.exports.classes.push(match[1]);
    result.exports.named.push(match[1]);
  }

  // export interface
  const interfaceExportRegex = /export\s+interface\s+(\w+)/g;
  while ((match = interfaceExportRegex.exec(content)) !== null) {
    result.exports.interfaces.push(match[1]);
    result.exports.types.push(match[1]);
  }

  // export type
  const typeExportRegex = /export\s+type\s+(\w+)/g;
  while ((match = typeExportRegex.exec(content)) !== null) {
    result.exports.types.push(match[1]);
  }

  // export enum
  const enumExportRegex = /export\s+enum\s+(\w+)/g;
  while ((match = enumExportRegex.exec(content)) !== null) {
    result.exports.enums.push(match[1]);
    result.exports.named.push(match[1]);
  }

  // export default
  const defaultExportRegex = /export\s+default\s+(?:class|function|const|let|var)?\s*(\w+)?/;
  const defaultMatch = content.match(defaultExportRegex);
  if (defaultMatch) {
    result.exports.default = defaultMatch[1] || 'default';
  }

  // Re-exports: export * from
  const reExportAllRegex = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = reExportAllRegex.exec(content)) !== null) {
    result.internalDependencies.push({
      file: match[1],
      imports: ['*'],
      reExport: true
    });
    result.exports.reExported.push(`* from ${match[1]}`);
  }

  // Re-exports: export { foo } from
  const reExportNamedRegex = /export\s*{\s*([^}]+)\s*}\s*from\s+['"]([^'"]+)['"]/g;
  while ((match = reExportNamedRegex.exec(content)) !== null) {
    const exports = match[1].split(',').map(s => s.trim().split(' as ')[0]).filter(Boolean);
    result.internalDependencies.push({
      file: match[2],
      imports: exports,
      reExport: true
    });
    result.exports.named.push(...exports);
    result.exports.reExported.push(...exports);
  }

  // Re-exports: export type * from (type-only re-exports)
  const reExportTypeAllRegex = /export\s+type\s+\*\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = reExportTypeAllRegex.exec(content)) !== null) {
    result.internalDependencies.push({
      file: match[1],
      imports: ['*'],
      reExport: true,
      typeOnly: true
    });
    result.exports.reExported.push(`type * from ${match[1]}`);
  }

  // Dedupe exports
  result.exports.named = [...new Set(result.exports.named)];
  result.exports.types = [...new Set(result.exports.types)];
  result.exports.reExported = [...new Set(result.exports.reExported)];

  return result;
}

/**
 * Extract file description from comments
 */
function extractDescription(content: string): string | null {
  // Try to find JSDoc comment at the top
  const jsdocMatch = content.match(/\/\*\*\s*\n([^*]*(?:\*(?!\/)[^*]*)*)\*\//);
  if (jsdocMatch) {
    const lines = jsdocMatch[1].split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '').trim())
      .filter(line => !line.startsWith('@') && line.length > 0);
    if (lines.length > 0) {
      return lines[0];
    }
  }

  // Try single-line comment
  const singleLineMatch = content.match(/^\/\/\s*(.+)$/m);
  if (singleLineMatch) {
    return singleLineMatch[1];
  }

  return null;
}

/**
 * Dynamically discover and categorize files into modules based on directory structure
 */
function categorizeFiles(files: ParsedFile[]): ModuleMap {
  const modules: ModuleMap = {};

  for (const file of files) {
    const relativePath = file.path;

    // Handle entry point (src/index.ts)
    if (relativePath === 'src/index.ts') {
      if (!modules.entry) modules.entry = {};
      modules.entry[relativePath] = file;
      continue;
    }

    // Extract the module name from path (first directory after src/)
    const parts = relativePath.split('/');
    if (parts.length >= 2 && parts[0] === 'src') {
      const moduleName = parts[1].replace('.ts', '');

      // If it's a file directly in src/, categorize by filename
      if (parts.length === 2) {
        if (!modules.root) modules.root = {};
        modules.root[relativePath] = file;
      } else {
        // It's in a subdirectory
        if (!modules[moduleName]) modules[moduleName] = {};
        modules[moduleName][relativePath] = file;
      }
    }
  }

  // Remove empty modules
  for (const key of Object.keys(modules)) {
    if (Object.keys(modules[key]).length === 0) {
      delete modules[key];
    }
  }

  return modules;
}

/**
 * Build dependency matrix
 */
function buildDependencyMatrix(files: ParsedFile[]): DependencyMatrix {
  const matrix: DependencyMatrix = {};

  for (const file of files) {
    const importedFrom = new Set<string>();
    const exportsTo = new Set<string>();

    // Find what this file imports from
    for (const dep of file.internalDependencies) {
      importedFrom.add(dep.file);
    }

    // Find what files export to this file
    for (const other of files) {
      if (other.path === file.path) continue;
      for (const dep of other.internalDependencies) {
        const resolvedPath = resolvePath(other.path, dep.file);
        if (resolvedPath === file.path || resolvedPath === file.path.replace('.ts', '')) {
          exportsTo.add(other.path);
        }
      }
    }

    matrix[file.path] = {
      importsFrom: [...importedFrom],
      exportsTo: [...exportsTo]
    };
  }

  return matrix;
}

/**
 * Resolve relative path
 */
function resolvePath(fromPath: string, relativePath: string): string {
  const dir = dirname(fromPath);
  let resolved = join(dir, relativePath);

  // Remove .js extension if present
  resolved = resolved.replace(/\.js$/, '');

  // Add .ts extension if not present
  if (!resolved.endsWith('.ts')) {
    resolved = resolved + '.ts';
  }

  // Normalize path separators
  resolved = resolved.replace(/\\/g, '/');

  return resolved;
}

interface CircularDependencyResult {
  all: string[][];
  runtime: string[][];   // Non-type-only cycles (real runtime issues)
  typeOnly: string[][];  // Type-only cycles (safe, no runtime impact)
}

/**
 * Detect circular dependencies, distinguishing runtime from type-only cycles
 */
function detectCircularDependencies(files: ParsedFile[]): CircularDependencyResult {
  const filePaths = new Set(files.map(f => f.path));

  // Build both runtime-only and all-dependencies graphs
  const runtimeGraph = new Map<string, string[]>();
  const allGraph = new Map<string, string[]>();

  for (const file of files) {
    const runtimeDeps: string[] = [];
    const allDeps: string[] = [];

    for (const d of file.internalDependencies) {
      const resolved = resolvePath(file.path, d.file);
      if (filePaths.has(resolved)) {
        allDeps.push(resolved);
        // Only add to runtime graph if NOT type-only
        if (!d.typeOnly) {
          runtimeDeps.push(resolved);
        }
      }
    }
    runtimeGraph.set(file.path, runtimeDeps);
    allGraph.set(file.path, allDeps);
  }

  function findCycles(graph: Map<string, string[]>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();

    function dfs(node: string, path: string[]): void {
      if (inStack.has(node)) {
        const cycleStart = path.indexOf(node);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart);
          cycle.push(node);
          const cycleKey = [...cycle].sort().join('->');
          if (!cycles.some(c => [...c].sort().join('->') === cycleKey)) {
            cycles.push(cycle);
          }
        }
        return;
      }

      if (visited.has(node)) return;

      visited.add(node);
      inStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        dfs(neighbor, path);
      }

      path.pop();
      inStack.delete(node);
    }

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
  }

  const allCycles = findCycles(allGraph);
  const runtimeCycles = findCycles(runtimeGraph);

  // Type-only cycles = cycles in all but not in runtime
  const runtimeCycleKeys = new Set(runtimeCycles.map(c => [...c].sort().join('->')));
  const typeOnlyCycles = allCycles.filter(c => !runtimeCycleKeys.has([...c].sort().join('->')));

  return {
    all: allCycles,
    runtime: runtimeCycles,
    typeOnly: typeOnlyCycles
  };
}

/**
 * Get entry points from package.json exports field
 */
function getPackageEntryPoints(): Set<string> {
  const entryPoints = new Set<string>();

  try {
    const pkgPath = join(ROOT_DIR, 'package.json');
    if (!existsSync(pkgPath)) return entryPoints;

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    // Add main entry point
    if (pkg.main) {
      const mainPath = pkg.main.replace(/^\.\//, '').replace(/\.js$/, '.ts');
      entryPoints.add(mainPath);
      // Also add .js version in case TypeScript file has same name
      entryPoints.add(pkg.main.replace(/^\.\//, ''));
    }

    // Parse exports field
    if (pkg.exports) {
      function extractPaths(obj: unknown): void {
        if (typeof obj === 'string') {
          const normalized = obj.replace(/^\.\//, '');
          entryPoints.add(normalized);

          // Map dist/ paths to src/ts/ equivalents
          // e.g., dist/ts/index.js -> src/ts/index.ts
          if (normalized.startsWith('dist/ts/')) {
            const srcPath = normalized.replace('dist/ts/', 'src/ts/').replace(/\.js$/, '.ts');
            entryPoints.add(srcPath);
          }

          // Also add TypeScript equivalent for .js files
          if (normalized.endsWith('.js')) {
            entryPoints.add(normalized.replace(/\.js$/, '.ts'));
          }
        } else if (typeof obj === 'object' && obj !== null) {
          for (const value of Object.values(obj)) {
            extractPaths(value);
          }
        }
      }
      extractPaths(pkg.exports);
    }
  } catch {
    // Ignore errors reading package.json
  }

  return entryPoints;
}

/**
 * Detect unused files and exports
 */
function detectUnused(files: ParsedFile[]): UnusedAnalysis {
  const filePaths = new Set(files.map(f => f.path));
  const entryPoints = getPackageEntryPoints();

  // Build a set of all imported files
  const importedFiles = new Set<string>();
  // Build a map of all imported symbols per file
  const importedSymbols = new Map<string, Set<string>>();

  for (const file of files) {
    for (const dep of file.internalDependencies) {
      const resolved = resolvePath(file.path, dep.file);
      if (filePaths.has(resolved)) {
        importedFiles.add(resolved);

        // Track which symbols are imported
        if (!importedSymbols.has(resolved)) {
          importedSymbols.set(resolved, new Set());
        }
        const symbols = importedSymbols.get(resolved)!;
        for (const imp of dep.imports) {
          if (imp === '*') {
            // Wildcard import - mark all exports as used
            symbols.add('*');
          } else {
            symbols.add(imp.replace(/^\* as /, ''));
          }
        }
      }
    }
  }

  // Find unused files (excluding entry points and index files which are re-export hubs)
  const unusedFiles: string[] = [];
  for (const file of files) {
    // Skip package.json entry points (main, exports)
    if (entryPoints.has(file.path)) continue;
    // Skip main entry point
    if (file.path === 'src/index.ts' || file.path === 'src/index.js') continue;
    // Skip re-export hub index files
    if (file.name === 'index' && file.exports.reExported.length > 0) continue;
    // Skip if file is imported by another file
    if (!importedFiles.has(file.path)) {
      unusedFiles.push(file.path);
    }
  }

  // Find unused exports
  const unusedExports: UnusedExport[] = [];
  for (const file of files) {
    const usedSymbols = importedSymbols.get(file.path);
    const isWildcardImported = usedSymbols?.has('*');

    // Skip if file is not imported at all (already reported as unused file)
    // or if it's wildcard imported (all exports considered used)
    if (!usedSymbols || isWildcardImported) continue;

    // Check each export
    for (const fn of file.exports.functions) {
      if (!usedSymbols.has(fn)) {
        unusedExports.push({ file: file.path, name: fn, type: 'function' });
      }
    }
    for (const cls of file.exports.classes) {
      if (!usedSymbols.has(cls)) {
        unusedExports.push({ file: file.path, name: cls, type: 'class' });
      }
    }
    for (const iface of file.exports.interfaces) {
      if (!usedSymbols.has(iface)) {
        unusedExports.push({ file: file.path, name: iface, type: 'interface' });
      }
    }
    for (const type of file.exports.types) {
      if (!usedSymbols.has(type) && !file.exports.interfaces.includes(type)) {
        unusedExports.push({ file: file.path, name: type, type: 'type' });
      }
    }
    for (const en of file.exports.enums) {
      if (!usedSymbols.has(en)) {
        unusedExports.push({ file: file.path, name: en, type: 'enum' });
      }
    }
    for (const constant of file.exports.constants) {
      if (!usedSymbols.has(constant)) {
        unusedExports.push({ file: file.path, name: constant, type: 'constant' });
      }
    }
  }

  return { unusedFiles, unusedExports };
}

/**
 * Generate statistics from parsed files
 */
function generateStatistics(files: ParsedFile[], modules: ModuleMap, circularDeps: CircularDependencyResult, unusedAnalysis: UnusedAnalysis): Statistics {
  let totalExports = 0;
  let totalClasses = 0;
  let totalInterfaces = 0;
  let totalFunctions = 0;
  let totalTypeGuards = 0;
  let totalEnums = 0;
  let totalConstants = 0;
  let totalLines = 0;
  let totalReExports = 0;
  let totalTypeOnlyImports = 0;

  for (const file of files) {
    totalExports += file.exports.named.length;
    totalClasses += file.exports.classes.length;
    totalInterfaces += file.exports.interfaces.length;
    totalFunctions += file.exports.functions.length;
    totalEnums += file.exports.enums.length;
    totalConstants += file.exports.constants.length;
    totalReExports += file.exports.reExported.length;

    // Count type-only imports
    totalTypeOnlyImports += file.internalDependencies.filter(d => d.typeOnly).length;

    // Count type guards (functions starting with 'is')
    totalTypeGuards += file.exports.functions.filter(f => f.startsWith('is')).length;

    // Count lines
    try {
      const content = readFileSync(join(ROOT_DIR, file.path), 'utf-8');
      totalLines += content.split('\n').length;
    } catch {
      // Ignore
    }
  }

  return {
    totalTypeScriptFiles: files.length,
    totalModules: Object.keys(modules).length,
    totalLinesOfCode: totalLines,
    totalExports,
    totalClasses,
    totalInterfaces,
    totalFunctions,
    totalTypeGuards,
    totalEnums,
    totalConstants,
    totalReExports,
    totalTypeOnlyImports,
    runtimeCircularDeps: circularDeps.runtime.length,
    typeOnlyCircularDeps: circularDeps.typeOnly.length,
    unusedFilesCount: unusedAnalysis.unusedFiles.length,
    unusedExportsCount: unusedAnalysis.unusedExports.length
  };
}

/**
 * Generate JSON output
 */
function generateJSON(files: ParsedFile[], modules: ModuleMap, stats: Statistics, circularDeps: CircularDependencyResult): object {
  const today = new Date().toISOString().split('T')[0];

  // Convert modules to JSON-friendly format
  const modulesJson: Record<string, Record<string, object>> = {};
  for (const [category, categoryFiles] of Object.entries(modules)) {
    modulesJson[category] = {};
    for (const [path, file] of Object.entries(categoryFiles)) {
      const fileData: Record<string, unknown> = {
        description: file.description || `${file.name} module`,
        externalDependencies: file.externalDependencies,
        nodeDependencies: file.nodeDependencies,
        internalDependencies: file.internalDependencies.map(d => ({
          file: d.file,
          imports: d.imports,
          ...(d.reExport ? { reExport: true } : {}),
          ...(d.typeOnly ? { typeOnly: true } : {})
        })),
        exports: file.exports.named,
        reExported: file.exports.reExported.length > 0 ? file.exports.reExported : undefined,
        classes: file.exports.classes.length > 0 ? file.exports.classes : undefined,
        interfaces: file.exports.interfaces.length > 0 ? file.exports.interfaces : undefined,
        functions: file.exports.functions.length > 0 ? file.exports.functions : undefined,
        enums: file.exports.enums.length > 0 ? file.exports.enums : undefined,
        constants: file.exports.constants.length > 0 ? file.exports.constants : undefined
      };

      // Clean up undefined values
      Object.keys(fileData).forEach(key => {
        if (fileData[key] === undefined) {
          delete fileData[key];
        }
      });

      modulesJson[category][path] = fileData;
    }
  }

  // Build layers from modules
  const layers = Object.keys(modules).map(name => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    files: Object.keys(modules[name])
  })).filter(l => l.files.length > 0);

  return {
    metadata: {
      name: packageJson.name,
      version: packageJson.version,
      lastUpdated: today,
      totalFiles: stats.totalTypeScriptFiles,
      totalModules: stats.totalModules,
      totalExports: stats.totalExports
    },
    entryPoints: files
      .filter(f => f.path === 'src/index.ts')
      .map(f => ({
        file: f.path,
        type: 'main',
        description: f.description || 'Entry Point'
      })),
    modules: modulesJson,
    dependencyGraph: {
      circularDependencies: {
        runtime: circularDeps.runtime,
        typeOnly: circularDeps.typeOnly,
        total: circularDeps.all.length,
        runtimeCount: circularDeps.runtime.length,
        typeOnlyCount: circularDeps.typeOnly.length
      },
      layers
    },
    statistics: stats
  };
}

/**
 * Generate a dynamic Mermaid diagram from actual dependencies
 */
function generateMermaidDiagram(modules: ModuleMap, files: ParsedFile[]): string {
  const lines: string[] = [];
  lines.push('```mermaid');
  lines.push('graph TD');

  // Create subgraphs for each module
  const moduleNames = Object.keys(modules);
  const nodeIds = new Map<string, string>();
  let nodeCounter = 0;

  for (const moduleName of moduleNames) {
    const title = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
    lines.push(`    subgraph ${title}`);

    const moduleFiles = Object.keys(modules[moduleName]);
    for (const filePath of moduleFiles.slice(0, 5)) { // Limit to 5 files per module for readability
      const name = basename(filePath, '.ts');
      const nodeId = `N${nodeCounter++}`;
      nodeIds.set(filePath, nodeId);
      lines.push(`        ${nodeId}[${name}]`);
    }

    if (moduleFiles.length > 5) {
      const nodeId = `N${nodeCounter++}`;
      lines.push(`        ${nodeId}[...${moduleFiles.length - 5} more]`);
    }

    lines.push('    end');
    lines.push('');
  }

  // Add edges for dependencies (limited for readability)
  const addedEdges = new Set<string>();
  let edgeCount = 0;
  const maxEdges = 30;

  for (const file of files) {
    const sourceId = nodeIds.get(file.path);
    if (!sourceId) continue;

    for (const dep of file.internalDependencies) {
      if (edgeCount >= maxEdges) break;

      const resolved = resolvePath(file.path, dep.file);
      const targetId = nodeIds.get(resolved);

      if (targetId && sourceId !== targetId) {
        const edgeKey = `${sourceId}-${targetId}`;
        if (!addedEdges.has(edgeKey)) {
          lines.push(`    ${sourceId} --> ${targetId}`);
          addedEdges.add(edgeKey);
          edgeCount++;
        }
      }
    }
  }

  lines.push('```');
  return lines.join('\n');
}

/**
 * Generate Markdown output
 */
function generateMarkdown(files: ParsedFile[], modules: ModuleMap, stats: Statistics, circularDeps: CircularDependencyResult, matrix: DependencyMatrix): string {
  const today = new Date().toISOString().split('T')[0];
  const lines: string[] = [];
  const projectName = packageJson.name || 'Project';

  lines.push(`# ${projectName} - Dependency Graph`);
  lines.push('');
  lines.push(`**Version**: ${packageJson.version} | **Last Updated**: ${today}`);
  lines.push('');
  lines.push('This document provides a comprehensive dependency graph of all files, components, imports, functions, and variables in the codebase.');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Table of Contents
  lines.push('## Table of Contents');
  lines.push('');
  lines.push('1. [Overview](#overview)');
  let tocIndex = 2;
  for (const category of Object.keys(modules)) {
    const title = category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ');
    lines.push(`${tocIndex}. [${title} Dependencies](#${category.toLowerCase().replace(/\s+/g, '-')}-dependencies)`);
    tocIndex++;
  }
  lines.push(`${tocIndex}. [Dependency Matrix](#dependency-matrix)`);
  lines.push(`${tocIndex + 1}. [Circular Dependency Analysis](#circular-dependency-analysis)`);
  lines.push(`${tocIndex + 2}. [Visual Dependency Graph](#visual-dependency-graph)`);
  lines.push(`${tocIndex + 3}. [Summary Statistics](#summary-statistics)`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Overview
  lines.push('## Overview');
  lines.push('');
  lines.push('The codebase is organized into the following modules:');
  lines.push('');
  for (const [moduleName, moduleFiles] of Object.entries(modules)) {
    const fileCount = Object.keys(moduleFiles).length;
    lines.push(`- **${moduleName}**: ${fileCount} file${fileCount !== 1 ? 's' : ''}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Generate sections for each module category
  for (const [category, categoryFiles] of Object.entries(modules)) {
    const title = category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ');
    lines.push(`## ${title} Dependencies`);
    lines.push('');

    for (const [path, file] of Object.entries(categoryFiles)) {
      const fileName = basename(path, '.ts');
      lines.push(`### \`${path}\` - ${file.description || `${fileName} module`}`);
      lines.push('');

      // External dependencies
      if (file.externalDependencies.length > 0) {
        lines.push('**External Dependencies:**');
        lines.push('| Package | Import |');
        lines.push('|---------|--------|');
        for (const dep of file.externalDependencies) {
          lines.push(`| \`${dep.package}\` | \`${dep.imports.join(', ')}\` |`);
        }
        lines.push('');
      }

      // Node dependencies
      if (file.nodeDependencies.length > 0) {
        lines.push('**Node.js Built-in Dependencies:**');
        lines.push('| Module | Import |');
        lines.push('|--------|--------|');
        for (const dep of file.nodeDependencies) {
          lines.push(`| \`${dep.module}\` | \`${dep.imports.join(', ')}\` |`);
        }
        lines.push('');
      }

      // Internal dependencies
      if (file.internalDependencies.length > 0) {
        lines.push('**Internal Dependencies:**');
        lines.push('| File | Imports | Type |');
        lines.push('|------|---------|------|');
        for (const dep of file.internalDependencies) {
          let usage = dep.reExport ? 'Re-export' : 'Import';
          if (dep.typeOnly) usage += ' (type-only)';
          lines.push(`| \`${dep.file}\` | \`${dep.imports.join(', ')}\` | ${usage} |`);
        }
        lines.push('');
      }

      // Exports
      if (file.exports.named.length > 0 || file.exports.default || file.exports.reExported.length > 0) {
        lines.push('**Exports:**');
        if (file.exports.classes.length > 0) {
          lines.push(`- Classes: \`${file.exports.classes.join('`, `')}\``);
        }
        if (file.exports.interfaces.length > 0) {
          lines.push(`- Interfaces: \`${file.exports.interfaces.join('`, `')}\``);
        }
        if (file.exports.enums.length > 0) {
          lines.push(`- Enums: \`${file.exports.enums.join('`, `')}\``);
        }
        if (file.exports.functions.length > 0) {
          lines.push(`- Functions: \`${file.exports.functions.join('`, `')}\``);
        }
        if (file.exports.constants.length > 0) {
          lines.push(`- Constants: \`${file.exports.constants.join('`, `')}\``);
        }
        if (file.exports.reExported.length > 0) {
          lines.push(`- Re-exports: \`${file.exports.reExported.join('`, `')}\``);
        }
        if (file.exports.default) {
          lines.push(`- Default: \`${file.exports.default}\``);
        }
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }
  }

  // Dependency Matrix
  lines.push('## Dependency Matrix');
  lines.push('');
  lines.push('### File Import/Export Matrix');
  lines.push('');
  lines.push('| File | Imports From | Exports To |');
  lines.push('|------|--------------|------------|');

  const matrixEntries = Object.entries(matrix).slice(0, 30); // Limit for readability
  for (const [path, deps] of matrixEntries) {
    const shortPath = basename(path, '.ts');
    const importsCount = deps.importsFrom.length;
    const exportsCount = deps.exportsTo.length;
    lines.push(`| \`${shortPath}\` | ${importsCount} files | ${exportsCount} files |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Circular Dependencies
  lines.push('## Circular Dependency Analysis');
  lines.push('');
  if (circularDeps.all.length === 0) {
    lines.push('**No circular dependencies detected.**');
  } else {
    lines.push(`**${circularDeps.all.length} circular dependencies detected:**`);
    lines.push('');
    lines.push(`- **Runtime cycles**: ${circularDeps.runtime.length} (require attention)`);
    lines.push(`- **Type-only cycles**: ${circularDeps.typeOnly.length} (safe, no runtime impact)`);
    lines.push('');

    if (circularDeps.runtime.length > 0) {
      lines.push('### Runtime Circular Dependencies');
      lines.push('');
      lines.push('These cycles involve runtime imports and may cause issues:');
      lines.push('');
      for (const cycle of circularDeps.runtime.slice(0, 10)) {
        lines.push(`- ${cycle.join(' -> ')}`);
      }
      if (circularDeps.runtime.length > 10) {
        lines.push(`- ... and ${circularDeps.runtime.length - 10} more`);
      }
      lines.push('');
    }

    if (circularDeps.typeOnly.length > 0) {
      lines.push('### Type-Only Circular Dependencies');
      lines.push('');
      lines.push('These cycles only involve type imports and are safe (erased at runtime):');
      lines.push('');
      for (const cycle of circularDeps.typeOnly.slice(0, 10)) {
        lines.push(`- ${cycle.join(' -> ')}`);
      }
      if (circularDeps.typeOnly.length > 10) {
        lines.push(`- ... and ${circularDeps.typeOnly.length - 10} more`);
      }
      lines.push('');
    }
  }
  lines.push('---');
  lines.push('');

  // Visual Dependency Graph
  lines.push('## Visual Dependency Graph');
  lines.push('');
  lines.push(generateMermaidDiagram(modules, files));
  lines.push('');
  lines.push('---');
  lines.push('');

  // Summary Statistics
  lines.push('## Summary Statistics');
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('|----------|-------|');
  lines.push(`| Total TypeScript Files | ${stats.totalTypeScriptFiles} |`);
  lines.push(`| Total Modules | ${stats.totalModules} |`);
  lines.push(`| Total Lines of Code | ${stats.totalLinesOfCode} |`);
  lines.push(`| Total Exports | ${stats.totalExports} |`);
  lines.push(`| Total Re-exports | ${stats.totalReExports} |`);
  lines.push(`| Total Classes | ${stats.totalClasses} |`);
  lines.push(`| Total Interfaces | ${stats.totalInterfaces} |`);
  lines.push(`| Total Functions | ${stats.totalFunctions} |`);
  lines.push(`| Total Type Guards | ${stats.totalTypeGuards} |`);
  lines.push(`| Total Enums | ${stats.totalEnums} |`);
  lines.push(`| Type-only Imports | ${stats.totalTypeOnlyImports} |`);
  lines.push(`| Runtime Circular Deps | ${stats.runtimeCircularDeps} |`);
  lines.push(`| Type-only Circular Deps | ${stats.typeOnlyCircularDeps} |`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`*Last Updated*: ${today}`);
  lines.push(`*Version*: ${packageJson.version}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate compact summary for LLM consumption (~10KB target)
 * Uses CTON-style compression: no whitespace, abbreviated keys
 */
function generateCompactSummary(files: ParsedFile[], modules: ModuleMap, stats: Statistics, circularDeps: CircularDependencyResult): string {
  // Abbreviate module names and create compact structure
  const summary = {
    m: { // metadata
      n: packageJson.name,
      v: packageJson.version,
      d: new Date().toISOString().split('T')[0],
      f: stats.totalTypeScriptFiles,
      e: stats.totalExports,
      re: stats.totalReExports
    },
    s: { // statistics
      loc: stats.totalLinesOfCode,
      cls: stats.totalClasses,
      int: stats.totalInterfaces,
      fn: stats.totalFunctions,
      tg: stats.totalTypeGuards,
      en: stats.totalEnums,
      co: stats.totalConstants,
      toi: stats.totalTypeOnlyImports
    },
    c: { // circular deps
      rt: circularDeps.runtime.length,
      to: circularDeps.typeOnly.length,
      // Only include first 5 runtime cycles (if any) for context
      rtp: circularDeps.runtime.slice(0, 5).map(c => c.map(p => p.split('/').pop()?.replace('.ts', '')).join('→'))
    },
    mod: {} as Record<string, { f: number; exp: string[]; cls?: string[]; int?: string[] }>,
    // Hot paths: files with most dependencies
    hp: [] as { p: string; i: number; o: number }[]
  };

  // Compact module summary
  for (const [modName, modFiles] of Object.entries(modules)) {
    const fileList = Object.values(modFiles);
    const exports = fileList.flatMap(f => f.exports.named).slice(0, 20);
    const classes = fileList.flatMap(f => f.exports.classes);
    const interfaces = fileList.flatMap(f => f.exports.interfaces).slice(0, 10);

    summary.mod[modName] = {
      f: Object.keys(modFiles).length,
      exp: [...new Set(exports)]
    };
    if (classes.length > 0) summary.mod[modName].cls = [...new Set(classes)];
    if (interfaces.length > 0) summary.mod[modName].int = [...new Set(interfaces)];
  }

  // Find hot paths (files with highest connectivity)
  const connectivity = files.map(f => ({
    p: f.path.split('/').slice(-2).join('/'),
    i: f.internalDependencies.length,
    o: files.filter(other =>
      other.internalDependencies.some(d => {
        const resolved = resolvePath(other.path, d.file);
        return resolved === f.path;
      })
    ).length
  })).sort((a, b) => (b.i + b.o) - (a.i + a.o));

  summary.hp = connectivity.slice(0, 15);

  // Output as minified JSON (CTON-style: no whitespace)
  return JSON.stringify(summary);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('Scanning codebase for dependencies...');

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_DIR}`);
  }

  // Get all TypeScript files
  const tsFiles = getAllTsFiles(SRC_DIR);
  console.log(`Found ${tsFiles.length} TypeScript files`);

  if (tsFiles.length === 0) {
    console.error('No TypeScript files found in src/');
    process.exit(1);
  }

  // Parse all files
  const parsedFiles = tsFiles.map(parseFile);
  console.log('Parsed all files');

  // Categorize into modules
  const modules = categorizeFiles(parsedFiles);
  console.log(`Categorized into ${Object.keys(modules).length} modules`);

  // Detect circular dependencies
  const circularDeps = detectCircularDependencies(parsedFiles);
  console.log(`Found ${circularDeps.all.length} circular dependencies (${circularDeps.runtime.length} runtime, ${circularDeps.typeOnly.length} type-only)`);

  // Detect unused files and exports
  const unusedAnalysis = detectUnused(parsedFiles);

  // Generate statistics
  const stats = generateStatistics(parsedFiles, modules, circularDeps, unusedAnalysis);
  console.log('Generated statistics');

  // Build dependency matrix
  const matrix = buildDependencyMatrix(parsedFiles);
  console.log('Built dependency matrix');

  // Generate outputs
  const json = generateJSON(parsedFiles, modules, stats, circularDeps);
  const markdown = generateMarkdown(parsedFiles, modules, stats, circularDeps, matrix);

  // Write outputs
  writeFileSync(join(OUTPUT_DIR, 'dependency-graph.json'), JSON.stringify(json, null, 2));
  console.log('Written: docs/architecture/dependency-graph.json');

  // Write YAML output (more compact, ~40% smaller than JSON)
  const yamlOutput = yaml.dump(json, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });
  writeFileSync(join(OUTPUT_DIR, 'dependency-graph.yaml'), yamlOutput);
  console.log('Written: docs/architecture/dependency-graph.yaml');

  writeFileSync(join(OUTPUT_DIR, 'DEPENDENCY_GRAPH.md'), markdown);
  console.log('Written: docs/architecture/DEPENDENCY_GRAPH.md');

  // Write compact summary for LLM consumption (CTON-style, ~10KB)
  const compactSummary = generateCompactSummary(parsedFiles, modules, stats, circularDeps);
  writeFileSync(join(OUTPUT_DIR, 'dependency-summary.compact.json'), compactSummary);
  const compactSize = Buffer.byteLength(compactSummary, 'utf8');
  console.log(`Written: docs/architecture/dependency-summary.compact.json (${(compactSize / 1024).toFixed(1)}KB)`);

  console.log('\nDependency graph generation complete!');
  console.log(`  - ${stats.totalTypeScriptFiles} files analyzed`);
  console.log(`  - ${stats.totalExports} exports found (${stats.totalReExports} re-exports)`);
  console.log(`  - ${stats.totalTypeOnlyImports} type-only imports detected`);
  console.log(`  - ${circularDeps.all.length} circular dependencies:`);
  console.log(`      ${circularDeps.runtime.length} runtime (require attention)`);
  console.log(`      ${circularDeps.typeOnly.length} type-only (safe)`);
  console.log(`  - ${unusedAnalysis.unusedFiles.length} potentially unused files`);
  console.log(`  - ${unusedAnalysis.unusedExports.length} potentially unused exports`);

  // Print unused files if any
  if (unusedAnalysis.unusedFiles.length > 0) {
    console.log('\nPotentially unused files:');
    for (const file of unusedAnalysis.unusedFiles.slice(0, 20)) {
      console.log(`  - ${file}`);
    }
    if (unusedAnalysis.unusedFiles.length > 20) {
      console.log(`  ... and ${unusedAnalysis.unusedFiles.length - 20} more`);
    }
  }

  // Print unused exports if any (grouped by file)
  if (unusedAnalysis.unusedExports.length > 0) {
    console.log('\nPotentially unused exports:');
    const byFile = new Map<string, UnusedExport[]>();
    for (const exp of unusedAnalysis.unusedExports) {
      if (!byFile.has(exp.file)) byFile.set(exp.file, []);
      byFile.get(exp.file)!.push(exp);
    }
    let shown = 0;
    for (const [file, exports] of byFile) {
      if (shown >= 10) {
        console.log(`  ... and ${byFile.size - 10} more files with unused exports`);
        break;
      }
      console.log(`  ${file}:`);
      for (const exp of exports.slice(0, 5)) {
        console.log(`    - ${exp.name} (${exp.type})`);
      }
      if (exports.length > 5) {
        console.log(`    ... and ${exports.length - 5} more`);
      }
      shown++;
    }
  }

  // Write full unused analysis to a separate file
  const unusedReportPath = join(OUTPUT_DIR, 'unused-analysis.md');
  let unusedReport = '# Unused Files and Exports Analysis\n\n';
  unusedReport += `**Generated**: ${new Date().toISOString().split('T')[0]}\n\n`;
  unusedReport += `## Summary\n\n`;
  unusedReport += `- **Potentially unused files**: ${unusedAnalysis.unusedFiles.length}\n`;
  unusedReport += `- **Potentially unused exports**: ${unusedAnalysis.unusedExports.length}\n\n`;

  unusedReport += `## Potentially Unused Files\n\n`;
  unusedReport += `These files are not imported by any other file in the codebase:\n\n`;
  for (const file of unusedAnalysis.unusedFiles) {
    unusedReport += `- \`${file}\`\n`;
  }

  unusedReport += `\n## Potentially Unused Exports\n\n`;
  unusedReport += `These exports are not imported by any other file in the codebase:\n\n`;
  const byFileForReport = new Map<string, UnusedExport[]>();
  for (const exp of unusedAnalysis.unusedExports) {
    if (!byFileForReport.has(exp.file)) byFileForReport.set(exp.file, []);
    byFileForReport.get(exp.file)!.push(exp);
  }
  for (const [file, exports] of byFileForReport) {
    unusedReport += `### \`${file}\`\n\n`;
    for (const exp of exports) {
      unusedReport += `- \`${exp.name}\` (${exp.type})\n`;
    }
    unusedReport += '\n';
  }

  writeFileSync(unusedReportPath, unusedReport);
  console.log(`\nWritten: ${unusedReportPath}`);
}

main().catch(console.error);
