// @synapse-router/cli — `synapse export` and `synapse import` commands
// Minimal tar+gzip implementation using only Node.js built-ins

import {
  readFile,
  writeFile,
  readdir,
  stat,
  mkdir,
} from "node:fs/promises";
import { join, relative, dirname, basename } from "node:path";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { createGzip, createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { HELP_EXPORT, HELP_IMPORT } from "../utils/help.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYNAPSE_DIR = join(process.cwd(), ".synapse");
const TAR_BLOCK_SIZE = 512;

// Files to export in minimal mode (no raw events)
const MINIMAL_GLOBS = [
  /^\.synapse\/profiles\/[^/]+\.json$/,
  /^\.synapse\/memories\//,
  /^\.synapse\/config\.toml$/,
  /^\.synapse\/schemas\//,
];

// Files always excluded
const EXCLUDE_PATTERNS = [
  /\/export\//,
  /\/import\//,
  /\/\.DS_Store$/,
];

// ---------------------------------------------------------------------------
// Tar utilities
// ---------------------------------------------------------------------------

function formatOctal(num: number, length: number): string {
  const octal = num.toString(8);
  return octal.padStart(length - 1, "0") + "\0";
}

function checksum(header: Buffer): number {
  let sum = 0;
  for (let i = 0; i < TAR_BLOCK_SIZE; i++) {
    sum += header[i];
  }
  return sum;
}

function createTarHeader(
  name: string,
  size: number,
  isDir: boolean = false,
): Buffer {
  const header = Buffer.alloc(TAR_BLOCK_SIZE);

  // name (100 bytes)
  const nameBuf = Buffer.from(name, "utf8");
  nameBuf.copy(header, 0, 0, Math.min(nameBuf.length, 100));

  // mode (8 bytes) — 0644 for files, 0755 for dirs
  const modeStr = formatOctal(isDir ? 0o755 : 0o644, 8);
  Buffer.from(modeStr, "ascii").copy(header, 100);

  // uid (8 bytes)
  Buffer.from(formatOctal(0, 8), "ascii").copy(header, 108);

  // gid (8 bytes)
  Buffer.from(formatOctal(0, 8), "ascii").copy(header, 116);

  // size (12 bytes)
  Buffer.from(formatOctal(size, 12), "ascii").copy(header, 124);

  // mtime (12 bytes) — current time
  const now = Math.floor(Date.now() / 1000);
  Buffer.from(formatOctal(now, 12), "ascii").copy(header, 136);

  // chksum placeholder (8 spaces)
  // We'll compute checksum after filling the header, with chksum as spaces
  // But we need the typeflag and magic first, so fill them, then chksum

  // typeflag (1 byte) — '0' = file, '5' = directory
  header[156] = isDir ? 0x35 : 0x30; // '5' or '0'

  // magic (6 bytes) — "ustar\0"
  Buffer.from("ustar\0", "ascii").copy(header, 257);

  // version (2 bytes) — "00"
  Buffer.from("00", "ascii").copy(header, 263);

  // uname (32 bytes)
  Buffer.from("synapse", "ascii").copy(header, 265);

  // gname (32 bytes)
  Buffer.from("synapse", "ascii").copy(header, 297);

  // Now compute checksum with chksum field as spaces
  Buffer.from("        ", "ascii").copy(header, 148); // 8 spaces
  const sum = checksum(header);
  Buffer.from(formatOctal(sum, 8), "ascii").copy(header, 148);

  return header;
}

function padToBlockSize(data: Buffer): Buffer {
  const remainder = data.length % TAR_BLOCK_SIZE;
  if (remainder === 0) return data;
  const padded = Buffer.alloc(data.length + (TAR_BLOCK_SIZE - remainder));
  data.copy(padded);
  return padded;
}

// ---------------------------------------------------------------------------
// Tar creation
// ---------------------------------------------------------------------------

interface TarEntry {
  path: string; // relative path within archive
  content: Buffer;
  isDir: boolean;
}

async function collectFiles(
  dir: string,
  minimal: boolean,
  basePath: string,
): Promise<TarEntry[]> {
  const entries: TarEntry[] = [];
  const relDir = relative(basePath, dir);

  // Add directory entry
  if (relDir !== "") {
    entries.push({
      path: relDir + "/",
      content: Buffer.alloc(0),
      isDir: true,
    });
  }

  let dirents;
  try {
    dirents = await readdir(dir, { withFileTypes: true });
  } catch {
    return entries;
  }

  for (const d of dirents) {
    const fullPath = join(dir, d.name);
    const relPath = relative(basePath, fullPath);

    // Skip excluded patterns
    if (EXCLUDE_PATTERNS.some((p) => p.test("/" + relPath))) continue;

    if (d.isDirectory()) {
      const sub = await collectFiles(fullPath, minimal, basePath);
      entries.push(...sub);
    } else if (d.isFile()) {
      // In minimal mode, only include specific files
      if (minimal) {
        const matchPath = "/" + relPath;
        if (!MINIMAL_GLOBS.some((g) => g.test(matchPath))) continue;
      }

      try {
        const content = await readFile(fullPath);
        entries.push({ path: relPath, content, isDir: false });
      } catch {
        // skip unreadable files
      }
    }
  }

  return entries;
}

async function buildTarBuffer(entries: TarEntry[]): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for (const entry of entries) {
    const header = createTarHeader(entry.path, entry.content.length, entry.isDir);
    chunks.push(header);

    if (entry.content.length > 0) {
      chunks.push(padToBlockSize(entry.content));
    }
  }

  // End-of-archive marker: two zero blocks
  chunks.push(Buffer.alloc(TAR_BLOCK_SIZE * 2));

  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Tar extraction
// ---------------------------------------------------------------------------

interface TarExtractEntry {
  path: string;
  content: Buffer;
  isDir: boolean;
}

function parseTar(data: Buffer): TarExtractEntry[] {
  const entries: TarExtractEntry[] = [];
  let offset = 0;

  while (offset + TAR_BLOCK_SIZE <= data.length) {
    const header = data.subarray(offset, offset + TAR_BLOCK_SIZE);

    // Check for end-of-archive (all zeros)
    if (header.every((b) => b === 0)) {
      const nextBlock = data.subarray(offset + TAR_BLOCK_SIZE, offset + TAR_BLOCK_SIZE * 2);
      if (nextBlock.length >= TAR_BLOCK_SIZE && nextBlock.every((b) => b === 0)) {
        break;
      }
    }

    // Read name (100 bytes, null-terminated)
    let nameEnd = 0;
    while (nameEnd < 100 && header[nameEnd] !== 0) nameEnd++;
    const name = header.toString("utf8", 0, nameEnd);

    // Read size (12 bytes, octal, null-terminated)
    let sizeEnd = 124;
    while (sizeEnd < 136 && header[sizeEnd] !== 0) sizeEnd++;
    const sizeStr = header.toString("ascii", 124, sizeEnd).trim();
    const size = parseInt(sizeStr, 8) || 0;

    // Read typeflag
    const typeflag = header[156];
    const isDir = typeflag === 0x35; // '5'

    offset += TAR_BLOCK_SIZE;

    if (name === "" || name.startsWith("./")) {
      // skip pax headers or empty entries
      // but we still need to advance past the data
    }

    if (!isDir && size > 0 && name !== "") {
      const content = data.subarray(offset, offset + size);
      entries.push({ path: name.replace(/\/$/, ""), content: Buffer.from(content), isDir: false });
    } else if (isDir && name !== "") {
      entries.push({ path: name.replace(/\/$/, ""), content: Buffer.alloc(0), isDir: true });
    }

    // Advance past data blocks (rounded to 512)
    const dataBlocks = Math.ceil(size / TAR_BLOCK_SIZE);
    offset += dataBlocks * TAR_BLOCK_SIZE;
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Security validation
// ---------------------------------------------------------------------------

const API_KEY_PATTERN = /(?:sk-[a-zA-Z0-9]{20,}|[a-zA-Z0-9]{32,64}:[a-zA-Z0-9_-]{20,})/g;
const SUSPICIOUS_PATH = /[;|&$`]/;
const PATH_TRAVERSAL = /\.\./;

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateEntries(entries: TarExtractEntry[]): ValidationResult {
  const errors: string[] = [];

  for (const entry of entries) {
    // Path traversal check
    if (PATH_TRAVERSAL.test(entry.path)) {
      errors.push(`rejected: path traversal in "${entry.path}"`);
      continue;
    }

    // Suspicious characters
    if (SUSPICIOUS_PATH.test(entry.path)) {
      errors.push(`rejected: suspicious characters in "${entry.path}"`);
      continue;
    }

    // Only allow .synapse/ paths
    if (!entry.path.startsWith(".synapse/") && entry.path !== ".synapse") {
      errors.push(`rejected: path outside .synapse/: "${entry.path}"`);
      continue;
    }

    // Content scan for API key patterns
    if (!entry.isDir && entry.content.length > 0) {
      const content = entry.content.toString("utf8");
      if (API_KEY_PATTERN.test(content)) {
        errors.push(`rejected: API key pattern detected in "${entry.path}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Export command
// ---------------------------------------------------------------------------

interface ExportOptions {
  output?: string;
  stdout: boolean;
  minimal: boolean;
}

function parseExportArgs(argv: string[]): ExportOptions {
  const opts: ExportOptions = { stdout: false, minimal: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--output" && argv[i + 1]) {
      opts.output = argv[++i];
    } else if (arg === "--stdout") {
      opts.stdout = true;
    } else if (arg === "--minimal") {
      opts.minimal = true;
    }
  }

  return opts;
}

async function exportSynapse(options: ExportOptions): Promise<void> {
  // Check that .synapse/ exists
  if (!existsSync(SYNAPSE_DIR)) {
    console.error("Error: .synapse/ directory not found in current directory");
    console.error("Run 'synapse init' first, or ensure SDK is generating events.");
    process.exit(1);
  }

  const files = await collectFiles(SYNAPSE_DIR, options.minimal, process.cwd());

  if (files.length === 0) {
    console.error("Error: no files to export");
    process.exit(1);
  }

  const tarBuffer = await buildTarBuffer(files);

  // Compress with gzip
  const { gzipSync } = await import("node:zlib");
  const gzBuffer = gzipSync(tarBuffer);

  if (options.stdout) {
    // Write to stdout
    process.stdout.write(gzBuffer);
  } else if (options.output) {
    // Write to file
    const outPath = options.output.endsWith(".tgz") || options.output.endsWith(".tar.gz")
      ? options.output
      : options.output + ".tgz";
    await writeFile(outPath, gzBuffer);
    const sizeKB = (gzBuffer.length / 1024).toFixed(1);
    console.log(`Exported ${files.length} entries → ${outPath} (${sizeKB} KB)`);
  } else {
    // Default: write to ./synapse-data.tgz
    const outPath = join(process.cwd(), "synapse-data.tgz");
    await writeFile(outPath, gzBuffer);
    const sizeKB = (gzBuffer.length / 1024).toFixed(1);
    console.log(`Exported ${files.length} entries → ${outPath} (${sizeKB} KB)`);
  }
}

export function printExportHelp(): void {
  console.log(HELP_EXPORT);
}

// ---------------------------------------------------------------------------
// Import command
// ---------------------------------------------------------------------------

interface ImportOptions {
  stdin: boolean;
  dryRun: boolean;
  merge: boolean;
  overwrite: boolean;
  sourceFile?: string;
}

function parseImportArgs(argv: string[]): ImportOptions {
  const opts: ImportOptions = { stdin: false, dryRun: false, merge: false, overwrite: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--stdin") {
      opts.stdin = true;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--merge") {
      opts.merge = true;
    } else if (arg === "--overwrite") {
      opts.overwrite = true;
    } else if (!arg.startsWith("-") && !opts.sourceFile) {
      opts.sourceFile = arg;
    }
  }

  return opts;
}

async function importSynapse(options: ImportOptions): Promise<void> {
  let gzBuffer: Buffer;

  if (options.stdin) {
    // Read from stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    gzBuffer = Buffer.concat(chunks);
  } else if (options.sourceFile) {
    try {
      gzBuffer = await readFile(options.sourceFile);
    } catch (err: any) {
      console.error(`Error: cannot read "${options.sourceFile}": ${err?.message ?? err}`);
      process.exit(1);
    }
  } else {
    console.error("Error: source file required, or use --stdin for pipe mode");
    console.error("Usage: synapse import <file.tgz> [options]");
    console.error("       synapse import --stdin [options]");
    process.exit(1);
  }

  // Decompress
  const { gunzipSync } = await import("node:zlib");
  let tarBuffer: Buffer;
  try {
    tarBuffer = gunzipSync(gzBuffer);
  } catch {
    console.error("Error: invalid gzip data");
    process.exit(1);
  }

  // Parse tar
  const entries = parseTar(tarBuffer);

  if (entries.length === 0) {
    console.error("Error: archive is empty or invalid");
    process.exit(1);
  }

  // Security validation
  const validation = validateEntries(entries);
  if (!validation.valid) {
    console.error("Import rejected — security validation failed:");
    for (const err of validation.errors) {
      console.error(`  ${err}`);
    }
    process.exit(1);
  }

  // Dry run: preview only
  if (options.dryRun) {
    console.log(`\nImport preview — ${entries.filter((e) => !e.isDir).length} file(s):\n`);
    for (const entry of entries) {
      if (entry.isDir) continue;
      const sizeKB = (entry.content.length / 1024).toFixed(1);
      const exists = existsSync(join(process.cwd(), entry.path)) ? " [exists]" : "";
      console.log(`  ${entry.path.padEnd(50)} ${sizeKB} KB${exists}`);
    }
    console.log();
    return;
  }

  // Extract
  let imported = 0;
  let skipped = 0;
  let dirsCreated = new Set<string>();

  for (const entry of entries) {
    const targetPath = join(process.cwd(), entry.path);

    if (entry.isDir) {
      if (!dirsCreated.has(targetPath)) {
        await mkdir(targetPath, { recursive: true });
        dirsCreated.add(targetPath);
      }
      continue;
    }

    // Ensure parent directory exists
    const parent = dirname(targetPath);
    if (!dirsCreated.has(parent)) {
      await mkdir(parent, { recursive: true });
      dirsCreated.add(parent);
    }

    // Merge mode: skip if file already exists
    if (options.merge && existsSync(targetPath)) {
      skipped++;
      continue;
    }

    await writeFile(targetPath, entry.content);
    imported++;
  }

  const fileEntries = entries.filter((e) => !e.isDir).length;
  console.log(`Imported ${imported} file(s)${skipped > 0 ? `, skipped ${skipped} (already exist)` : ""}`);
  if (options.merge) {
    console.log("Merge mode: existing files preserved");
  }
}

export function printImportHelp(): void {
  console.log(HELP_IMPORT);
}

// ---------------------------------------------------------------------------
// CLI handlers
// ---------------------------------------------------------------------------

export async function handleExportCommand(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    printExportHelp();
    return;
  }
  const options = parseExportArgs(argv);
  await exportSynapse(options);
}

export async function handleImportCommand(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    printImportHelp();
    return;
  }
  const options = parseImportArgs(argv);
  await importSynapse(options);
}
