#!/usr/bin/env bun
/**
 * chunker - Split large files into editable sections
 *
 * Usage:
 *   chunker split <file> [options]       - Split file into chunks
 *   chunker merge <manifest.json>        - Merge chunks back together
 *   chunker status <manifest.json>       - Show chunk status
 *
 * Options:
 *   -o, --output <dir>     Output directory for chunks (default: <file>_chunks/)
 *   -l, --level <n>        Split at heading level n (default: 2 for markdown)
 *   -m, --max-lines <n>    Max lines per chunk before warning (default: 500)
 *   -t, --type <type>      File type: auto, markdown, json, typescript (default: auto)
 *   --dry-run              Show what would be done without writing files
 *   -h, --help             Show this help message
 */

import * as fs from 'fs';
import * as path from 'path';

type FileType = 'markdown' | 'json' | 'typescript';

interface ChunkInfo {
  index: number;
  filename: string;
  title: string;
  level: number;
  startLine: number;
  endLine: number;
  lineCount: number;
  hash: string;
  modified: boolean;
}

interface Manifest {
  version: string;
  sourceFile: string;
  sourceHash: string;
  createdAt: string;
  fileType: FileType;
  splitLevel: number;
  chunks: ChunkInfo[];
}

interface Section {
  title: string;
  level: number;
  content: string;
  startLine: number;
  endLine: number;
}

// Simple hash function for change detection
function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// Normalize line endings
function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Detect file type from extension
function detectFileType(filePath: string): FileType {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.md':
    case '.markdown':
      return 'markdown';
    case '.json':
      return 'json';
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'typescript';
    default:
      return 'markdown'; // Default fallback
  }
}

// Get file extension for chunks based on file type
function getChunkExtension(fileType: FileType): string {
  switch (fileType) {
    case 'markdown': return '.md';
    case 'json': return '.json';
    case 'typescript': return '.ts';
  }
}

// ============================================================================
// MARKDOWN PARSER
// ============================================================================

function parseMarkdownSections(content: string, splitLevel: number): Section[] {
  const normalizedContent = normalizeLineEndings(content);
  const lines = normalizedContent.split('\n');
  const sections: Section[] = [];

  let currentSection: { title: string; level: number; lines: string[]; startLine: number } | null = null;
  const headingRegex = new RegExp(`^(#{1,${splitLevel}})\\s+(.+)$`);

  let preambleLines: string[] = [];
  let preambleStart = 0;
  let foundFirstHeading = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(headingRegex);

    if (match) {
      foundFirstHeading = true;
      if (preambleLines.length > 0 && currentSection === null) {
        sections.push({
          title: '_preamble',
          level: 0,
          content: preambleLines.join('\n'),
          startLine: preambleStart + 1,
          endLine: i
        });
        preambleLines = [];
      }

      if (currentSection) {
        sections.push({
          title: currentSection.title,
          level: currentSection.level,
          content: currentSection.lines.join('\n'),
          startLine: currentSection.startLine,
          endLine: i
        });
      }

      const level = match[1].length;
      currentSection = {
        title: match[2].trim(),
        level: level,
        lines: [line],
        startLine: i + 1
      };
    } else {
      if (currentSection) {
        currentSection.lines.push(line);
      } else if (!foundFirstHeading) {
        if (preambleLines.length === 0) preambleStart = i;
        preambleLines.push(line);
      }
    }
  }

  if (currentSection) {
    sections.push({
      title: currentSection.title,
      level: currentSection.level,
      content: currentSection.lines.join('\n'),
      startLine: currentSection.startLine,
      endLine: lines.length
    });
  } else if (preambleLines.length > 0) {
    sections.push({
      title: '_content',
      level: 0,
      content: preambleLines.join('\n'),
      startLine: 1,
      endLine: lines.length
    });
  }

  return sections;
}

// ============================================================================
// JSON PARSER
// ============================================================================

function parseJsonSections(content: string): Section[] {
  const normalizedContent = normalizeLineEndings(content);
  const sections: Section[] = [];

  try {
    const parsed = JSON.parse(normalizedContent);

    if (Array.isArray(parsed)) {
      // Split array into chunks of elements
      const lines = normalizedContent.split('\n');
      sections.push({
        title: '_array',
        level: 0,
        content: normalizedContent,
        startLine: 1,
        endLine: lines.length
      });
    } else if (typeof parsed === 'object' && parsed !== null) {
      // Split by top-level keys
      const keys = Object.keys(parsed);

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = parsed[key];
        const chunkContent = JSON.stringify({ [key]: value }, null, 2);
        const lineCount = chunkContent.split('\n').length;

        sections.push({
          title: key,
          level: 1,
          content: chunkContent,
          startLine: i + 1, // Approximate
          endLine: i + lineCount
        });
      }
    }
  } catch (e) {
    // If JSON parsing fails, treat as single chunk
    const lines = normalizedContent.split('\n');
    sections.push({
      title: '_invalid_json',
      level: 0,
      content: normalizedContent,
      startLine: 1,
      endLine: lines.length
    });
  }

  return sections;
}

// Merge JSON chunks back together
function mergeJsonChunks(chunks: string[]): string {
  const merged: Record<string, any> = {};

  for (const chunk of chunks) {
    try {
      const parsed = JSON.parse(chunk);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        Object.assign(merged, parsed);
      }
    } catch (e) {
      // Skip invalid JSON chunks
      console.error('Warning: Skipping invalid JSON chunk');
    }
  }

  return JSON.stringify(merged, null, 2);
}

// ============================================================================
// TYPESCRIPT PARSER
// ============================================================================

function parseTypeScriptSections(content: string): Section[] {
  const normalizedContent = normalizeLineEndings(content);
  const lines = normalizedContent.split('\n');
  const sections: Section[] = [];

  // Patterns for top-level declarations
  const patterns = {
    import: /^import\s+/,
    export: /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)/,
    exportFrom: /^export\s+\{[^}]*\}\s+from/,
    exportAll: /^export\s+\*\s+from/,
    function: /^(?:async\s+)?function\s+(\w+)/,
    class: /^class\s+(\w+)/,
    interface: /^interface\s+(\w+)/,
    type: /^type\s+(\w+)/,
    const: /^(?:export\s+)?const\s+(\w+)/,
    let: /^(?:export\s+)?let\s+(\w+)/,
    var: /^(?:export\s+)?var\s+(\w+)/,
    enum: /^(?:export\s+)?enum\s+(\w+)/,
  };

  let currentSection: { title: string; level: number; lines: string[]; startLine: number; type: string } | null = null;
  let importLines: string[] = [];
  let importStart = -1;
  let bracketDepth = 0;
  let parenDepth = 0;
  let inMultilineString = false;
  let stringChar = '';

  // Helper to count brackets in a line (respecting strings)
  function countBrackets(line: string): { brackets: number; parens: number } {
    let brackets = 0;
    let parens = 0;
    let inString = false;
    let strChar = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const prevChar = i > 0 ? line[i - 1] : '';

      if (inString) {
        if (char === strChar && prevChar !== '\\') {
          inString = false;
        }
      } else {
        if (char === '"' || char === "'" || char === '`') {
          inString = true;
          strChar = char;
        } else if (char === '{') {
          brackets++;
        } else if (char === '}') {
          brackets--;
        } else if (char === '(') {
          parens++;
        } else if (char === ')') {
          parens--;
        }
      }
    }

    return { brackets, parens };
  }

  // Helper to save current section
  function saveCurrentSection(endLine: number) {
    if (currentSection && currentSection.lines.length > 0) {
      sections.push({
        title: currentSection.title,
        level: currentSection.level,
        content: currentSection.lines.join('\n'),
        startLine: currentSection.startLine,
        endLine: endLine
      });
    }
    currentSection = null;
    bracketDepth = 0;
    parenDepth = 0;
  }

  // Helper to save imports
  function saveImports(endLine: number) {
    if (importLines.length > 0) {
      sections.push({
        title: '_imports',
        level: 0,
        content: importLines.join('\n'),
        startLine: importStart + 1,
        endLine: endLine
      });
      importLines = [];
      importStart = -1;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines and comments when looking for new declarations
    if (!currentSection && (trimmedLine === '' || trimmedLine.startsWith('//'))) {
      if (importLines.length > 0) {
        importLines.push(line);
      }
      continue;
    }

    // Handle multi-line comments
    if (trimmedLine.startsWith('/*') && !trimmedLine.includes('*/')) {
      if (currentSection) {
        currentSection.lines.push(line);
      }
      continue;
    }

    // If we're inside a declaration, continue until brackets balance
    if (currentSection) {
      currentSection.lines.push(line);
      const { brackets, parens } = countBrackets(line);
      bracketDepth += brackets;
      parenDepth += parens;

      // Check if declaration is complete
      if (bracketDepth <= 0 && parenDepth <= 0) {
        // Check for semicolon or closing bracket to confirm end
        if (trimmedLine.endsWith(';') || trimmedLine.endsWith('}') || trimmedLine.endsWith(',')) {
          saveCurrentSection(i + 1);
        }
      }
      continue;
    }

    // Check for import statements - group all imports together
    if (patterns.import.test(trimmedLine)) {
      if (importStart === -1) importStart = i;
      importLines.push(line);
      continue;
    }

    // If we have imports and hit a non-import, save them as one group
    if (importLines.length > 0) {
      saveImports(i);
    }

    // Check for various declarations
    let matched = false;
    let title = '';
    let level = 1;

    // Export statements
    if (patterns.exportAll.test(trimmedLine) || patterns.exportFrom.test(trimmedLine)) {
      title = '_exports';
      level = 0;
      matched = true;
    }
    // Function declaration
    else if (patterns.function.test(trimmedLine) || /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/.test(trimmedLine)) {
      const match = trimmedLine.match(/function\s+(\w+)/);
      title = match ? `function:${match[1]}` : '_function';
      level = 1;
      matched = true;
    }
    // Class declaration
    else if (patterns.class.test(trimmedLine) || /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/.test(trimmedLine)) {
      const match = trimmedLine.match(/class\s+(\w+)/);
      title = match ? `class:${match[1]}` : '_class';
      level = 1;
      matched = true;
    }
    // Interface declaration
    else if (patterns.interface.test(trimmedLine) || /^(?:export\s+)?interface\s+(\w+)/.test(trimmedLine)) {
      const match = trimmedLine.match(/interface\s+(\w+)/);
      title = match ? `interface:${match[1]}` : '_interface';
      level = 2;
      matched = true;
    }
    // Type declaration
    else if (patterns.type.test(trimmedLine) || /^(?:export\s+)?type\s+(\w+)/.test(trimmedLine)) {
      const match = trimmedLine.match(/type\s+(\w+)/);
      title = match ? `type:${match[1]}` : '_type';
      level = 2;
      matched = true;
    }
    // Enum declaration
    else if (patterns.enum.test(trimmedLine) || /^(?:export\s+)?enum\s+(\w+)/.test(trimmedLine)) {
      const match = trimmedLine.match(/enum\s+(\w+)/);
      title = match ? `enum:${match[1]}` : '_enum';
      level = 2;
      matched = true;
    }
    // Const/let/var declaration
    else if (patterns.const.test(trimmedLine)) {
      const match = trimmedLine.match(/const\s+(\w+)/);
      title = match ? `const:${match[1]}` : '_const';
      level = 2;
      matched = true;
    }
    else if (patterns.let.test(trimmedLine)) {
      const match = trimmedLine.match(/let\s+(\w+)/);
      title = match ? `let:${match[1]}` : '_let';
      level = 2;
      matched = true;
    }
    else if (patterns.var.test(trimmedLine)) {
      const match = trimmedLine.match(/var\s+(\w+)/);
      title = match ? `var:${match[1]}` : '_var';
      level = 2;
      matched = true;
    }

    if (matched) {
      currentSection = {
        title,
        level,
        lines: [line],
        startLine: i + 1,
        type: title.split(':')[0]
      };
      const { brackets, parens } = countBrackets(line);
      bracketDepth = brackets;
      parenDepth = parens;

      // Check if single-line declaration
      if (bracketDepth <= 0 && parenDepth <= 0 && (trimmedLine.endsWith(';') || trimmedLine.endsWith('}'))) {
        saveCurrentSection(i + 1);
      }
    }
  }

  // Save any remaining sections
  saveImports(lines.length);
  saveCurrentSection(lines.length);

  // If no sections found, return entire content as one section
  if (sections.length === 0) {
    sections.push({
      title: '_content',
      level: 0,
      content: normalizedContent,
      startLine: 1,
      endLine: lines.length
    });
  }

  return sections;
}

// ============================================================================
// FILENAME GENERATION
// ============================================================================

function sanitizeFilename(title: string, index: number, fileType: FileType): string {
  const ext = getChunkExtension(fileType);
  const safe = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  return `${String(index).padStart(3, '0')}-${safe || 'section'}${ext}`;
}

// ============================================================================
// SPLIT COMMAND
// ============================================================================

function splitFile(inputFile: string, options: { output?: string; level?: number; maxLines?: number; type?: string; dryRun?: boolean }) {
  const maxLines = options.maxLines ?? 500;
  const dryRun = options.dryRun ?? false;

  // Resolve paths
  const absoluteInput = path.resolve(inputFile);
  if (!fs.existsSync(absoluteInput)) {
    console.error(`Error: File not found: ${absoluteInput}`);
    process.exit(1);
  }

  // Detect or use specified file type
  const fileType: FileType = (options.type && options.type !== 'auto')
    ? options.type as FileType
    : detectFileType(absoluteInput);

  const splitLevel = options.level ?? (fileType === 'markdown' ? 2 : 1);

  const content = fs.readFileSync(absoluteInput, 'utf-8');
  const sourceHash = simpleHash(content);

  // Determine output directory
  const ext = path.extname(inputFile);
  const baseName = path.basename(inputFile, ext);
  const outputDir = options.output
    ? path.resolve(options.output)
    : path.join(path.dirname(absoluteInput), `${baseName}_chunks`);

  console.log(`\nchunker - Splitting File`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Source:      ${absoluteInput}`);
  console.log(`Output:      ${outputDir}`);
  console.log(`File Type:   ${fileType}`);
  if (fileType === 'markdown') {
    console.log(`Split Level: h${splitLevel} (${'#'.repeat(splitLevel)})`);
  }
  console.log(`Max Lines:   ${maxLines}`);
  console.log(`Dry Run:     ${dryRun}`);
  console.log();

  // Parse sections based on file type
  let sections: Section[];
  switch (fileType) {
    case 'markdown':
      sections = parseMarkdownSections(content, splitLevel);
      break;
    case 'json':
      sections = parseJsonSections(content);
      break;
    case 'typescript':
      sections = parseTypeScriptSections(content);
      break;
    default:
      sections = parseMarkdownSections(content, splitLevel);
  }

  if (sections.length === 0) {
    console.log('No sections found to split.');
    return;
  }

  console.log(`Found ${sections.length} section(s):\n`);

  // Build chunks
  const chunks: ChunkInfo[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const filename = sanitizeFilename(section.title, i + 1, fileType);
    const lineCount = section.content.split('\n').length;

    const chunk: ChunkInfo = {
      index: i + 1,
      filename: filename,
      title: section.title,
      level: section.level,
      startLine: section.startLine,
      endLine: section.endLine,
      lineCount: lineCount,
      hash: simpleHash(section.content),
      modified: false
    };

    chunks.push(chunk);

    const levelIndicator = fileType === 'markdown'
      ? (section.level > 0 ? `h${section.level}` : 'pre')
      : (section.level === 0 ? 'meta' : section.level === 1 ? 'decl' : 'type');
    const sizeWarning = lineCount > maxLines ? ' [LARGE]' : '';
    console.log(`  ${String(i + 1).padStart(2)}. [${levelIndicator.padEnd(4)}] ${section.title.substring(0, 40).padEnd(40)} ${String(lineCount).padStart(4)} lines${sizeWarning}`);

    // Write chunk file
    if (!dryRun) {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const chunkPath = path.join(outputDir, filename);
      fs.writeFileSync(chunkPath, section.content, 'utf-8');
    }
  }

  // Create manifest
  const manifest: Manifest = {
    version: '1.1.0',
    sourceFile: absoluteInput,
    sourceHash: sourceHash,
    createdAt: new Date().toISOString(),
    fileType: fileType,
    splitLevel: splitLevel,
    chunks: chunks
  };

  if (!dryRun) {
    const manifestPath = path.join(outputDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(`\nManifest written: ${manifestPath}`);
  }

  // Summary
  const totalLines = chunks.reduce((sum, c) => sum + c.lineCount, 0);
  const largeChunks = chunks.filter(c => c.lineCount > maxLines).length;

  console.log(`\nSummary:`);
  console.log(`  Total chunks:  ${chunks.length}`);
  console.log(`  Total lines:   ${totalLines}`);
  if (largeChunks > 0) {
    console.log(`  Large chunks:  ${largeChunks} (>${maxLines} lines)`);
  }

  if (dryRun) {
    console.log(`\n[DRY RUN] No files were written.`);
  } else {
    console.log(`\nChunks written to: ${outputDir}`);
    console.log(`\nTo edit: Modify individual chunk files in the directory`);
    console.log(`To merge: chunker merge "${path.join(outputDir, 'manifest.json')}"`);
  }
}

// ============================================================================
// MERGE COMMAND
// ============================================================================

function mergeChunks(manifestPath: string, options: { output?: string; dryRun?: boolean }) {
  const dryRun = options.dryRun ?? false;

  const absoluteManifest = path.resolve(manifestPath);
  if (!fs.existsSync(absoluteManifest)) {
    console.error(`Error: Manifest not found: ${absoluteManifest}`);
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(absoluteManifest, 'utf-8'));
  const chunksDir = path.dirname(absoluteManifest);
  const fileType = manifest.fileType || 'markdown'; // Backwards compatibility

  console.log(`\nchunker - Merging Chunks`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Manifest:    ${absoluteManifest}`);
  console.log(`Source:      ${manifest.sourceFile}`);
  console.log(`File Type:   ${fileType}`);
  console.log(`Created:     ${manifest.createdAt}`);
  console.log(`Chunks:      ${manifest.chunks.length}`);
  console.log();

  // Read and validate chunks
  const chunkContents: string[] = [];
  let modifiedCount = 0;

  for (const chunk of manifest.chunks) {
    const chunkPath = path.join(chunksDir, chunk.filename);

    if (!fs.existsSync(chunkPath)) {
      console.error(`Error: Missing chunk file: ${chunkPath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(chunkPath, 'utf-8');
    const currentHash = simpleHash(content);
    const modified = currentHash !== chunk.hash;

    if (modified) modifiedCount++;

    const status = modified ? '[MODIFIED]' : '[unchanged]';
    console.log(`  ${String(chunk.index).padStart(2)}. ${chunk.filename.padEnd(45)} ${status}`);

    chunkContents.push(content);
  }

  console.log(`\nModified chunks: ${modifiedCount} of ${manifest.chunks.length}`);

  // Merge content based on file type
  let mergedContent: string;
  if (fileType === 'json') {
    mergedContent = mergeJsonChunks(chunkContents);
  } else {
    // Markdown and TypeScript: simple concatenation
    mergedContent = chunkContents.join('\n');
  }

  // Determine output path
  const outputPath = options.output
    ? path.resolve(options.output)
    : manifest.sourceFile;

  // Check if source file changed since split
  if (fs.existsSync(manifest.sourceFile)) {
    const currentSourceHash = simpleHash(fs.readFileSync(manifest.sourceFile, 'utf-8'));
    if (currentSourceHash !== manifest.sourceHash) {
      console.log(`\nWARNING: Source file has changed since split!`);
      console.log(`  Original hash: ${manifest.sourceHash}`);
      console.log(`  Current hash:  ${currentSourceHash}`);
      if (!options.output) {
        console.log(`\nUse --output to write to a different file, or confirm overwrite.`);
      }
    }
  }

  if (!dryRun) {
    // Create backup of original
    if (fs.existsSync(outputPath)) {
      const backupPath = `${outputPath}.backup-${Date.now()}`;
      fs.copyFileSync(outputPath, backupPath);
      console.log(`\nBackup created: ${backupPath}`);
    }

    fs.writeFileSync(outputPath, mergedContent, 'utf-8');
    console.log(`\nMerged file written: ${outputPath}`);
    console.log(`Total lines: ${mergedContent.split('\n').length}`);
  } else {
    console.log(`\n[DRY RUN] Would write ${mergedContent.split('\n').length} lines to: ${outputPath}`);
  }
}

// ============================================================================
// STATUS COMMAND
// ============================================================================

function showStatus(manifestPath: string) {
  const absoluteManifest = path.resolve(manifestPath);
  if (!fs.existsSync(absoluteManifest)) {
    console.error(`Error: Manifest not found: ${absoluteManifest}`);
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(absoluteManifest, 'utf-8'));
  const chunksDir = path.dirname(absoluteManifest);
  const fileType = manifest.fileType || 'markdown';

  console.log(`\nchunker - Chunk Status`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Source:    ${manifest.sourceFile}`);
  console.log(`File Type: ${fileType}`);
  console.log(`Created:   ${manifest.createdAt}`);
  if (fileType === 'markdown') {
    console.log(`Level:     h${manifest.splitLevel}`);
  }
  console.log();

  let modifiedCount = 0;
  let missingCount = 0;
  let totalLines = 0;

  console.log(`Chunks:\n`);
  console.log(`  #   Filename                                      Lines   Status`);
  console.log(`  ${'─'.repeat(70)}`);

  for (const chunk of manifest.chunks) {
    const chunkPath = path.join(chunksDir, chunk.filename);
    let status: string;
    let lines = chunk.lineCount;

    if (!fs.existsSync(chunkPath)) {
      status = 'MISSING';
      missingCount++;
    } else {
      const content = fs.readFileSync(chunkPath, 'utf-8');
      const currentHash = simpleHash(content);
      lines = content.split('\n').length;

      if (currentHash !== chunk.hash) {
        status = 'MODIFIED';
        modifiedCount++;
      } else {
        status = 'unchanged';
      }
    }

    totalLines += lines;
    const statusColor = status === 'MODIFIED' ? '\x1b[33m' : status === 'MISSING' ? '\x1b[31m' : '\x1b[90m';
    const reset = '\x1b[0m';

    console.log(`  ${String(chunk.index).padStart(2)}  ${chunk.filename.padEnd(45)} ${String(lines).padStart(5)}   ${statusColor}${status}${reset}`);
  }

  console.log();
  console.log(`Summary:`);
  console.log(`  Total chunks:    ${manifest.chunks.length}`);
  console.log(`  Modified:        ${modifiedCount}`);
  console.log(`  Missing:         ${missingCount}`);
  console.log(`  Total lines:     ${totalLines}`);

  // Check source file
  if (fs.existsSync(manifest.sourceFile)) {
    const currentSourceHash = simpleHash(fs.readFileSync(manifest.sourceFile, 'utf-8'));
    if (currentSourceHash !== manifest.sourceHash) {
      console.log(`\n\x1b[33mWARNING: Source file modified since split!\x1b[0m`);
    }
  }
}

// ============================================================================
// HELP
// ============================================================================

function showHelp() {
  console.log(`
chunker - Split and merge large files for editing

USAGE:
  chunker split <file> [options]       Split file into chunks
  chunker merge <manifest.json>        Merge chunks back together
  chunker status <manifest.json>       Show chunk status

SPLIT OPTIONS:
  -o, --output <dir>     Output directory for chunks (default: <file>_chunks/)
  -l, --level <n>        Split level (markdown: heading level, default: 2)
  -m, --max-lines <n>    Max lines per chunk for warnings (default: 500)
  -t, --type <type>      File type: auto, markdown, json, typescript (default: auto)
  --dry-run              Show what would be done without writing files

MERGE OPTIONS:
  -o, --output <file>    Output file (default: original source file)
  --dry-run              Show what would be done without writing files

EXAMPLES:
  # Split markdown by ## headings
  chunker split ARCHITECTURE.md

  # Split TypeScript by declarations
  chunker split src/index.ts

  # Split JSON by top-level keys
  chunker split package.json

  # Split with explicit type
  chunker split config.txt -t json

  # Check status and merge
  chunker status ./src_chunks/manifest.json
  chunker merge ./src_chunks/manifest.json

SUPPORTED FILE TYPES:
  - Markdown (.md)     - Splits by heading levels (##, ###, etc.)
  - JSON (.json)       - Splits by top-level object keys
  - TypeScript (.ts)   - Splits by declarations (imports, functions, classes, types)
  - JavaScript (.js)   - Same as TypeScript

WORKFLOW:
  1. Split:   chunker split large-file.ts
  2. Edit:    Modify individual chunk files
  3. Status:  chunker status large-file_chunks/manifest.json
  4. Merge:   chunker merge large-file_chunks/manifest.json
`);
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(args: string[]): { command: string; target: string; options: Record<string, any> } {
  const command = args[0] || 'help';
  const target = args[1] || '';
  const options: Record<string, any> = {};

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-o' || arg === '--output') {
      options.output = args[++i];
    } else if (arg === '-l' || arg === '--level') {
      options.level = parseInt(args[++i], 10);
    } else if (arg === '-m' || arg === '--max-lines') {
      options.maxLines = parseInt(args[++i], 10);
    } else if (arg === '-t' || arg === '--type') {
      options.type = args[++i];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    }
  }

  return { command, target, options };
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '-h' || args[0] === '--help' || args[0] === 'help') {
    showHelp();
    return;
  }

  const { command, target, options } = parseArgs(args);

  switch (command) {
    case 'split':
      if (!target) {
        console.error('Error: Please specify a file to split');
        console.error('Usage: chunker split <file> [options]');
        process.exit(1);
      }
      splitFile(target, options);
      break;

    case 'merge':
      if (!target) {
        console.error('Error: Please specify a manifest.json file');
        console.error('Usage: chunker merge <manifest.json> [options]');
        process.exit(1);
      }
      mergeChunks(target, options);
      break;

    case 'status':
      if (!target) {
        console.error('Error: Please specify a manifest.json file');
        console.error('Usage: chunker status <manifest.json>');
        process.exit(1);
      }
      showStatus(target);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main();
