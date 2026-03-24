/**
 * Build script for MCP server.
 *
 * 1. Bundles src/index.ts → dist/index.js (Node-compatible ESM)
 * 2. Copies manifest.json and README.md to dist/
 * 3. Optionally packages as .mcpb (requires @anthropic-ai/mcpb CLI)
 */
import { mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const DIST = './dist';

// Step 1: Bundle
await mkdir(DIST, { recursive: true });

const result = await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: DIST,
  target: 'node',
  format: 'esm',
  minify: true,
  sourcemap: 'external',
});

if (!result.success) {
  console.error('Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log('✓ Bundle: dist/index.js');

// Step 2: Copy assets
await copyFile('./manifest.json', `${DIST}/manifest.json`);
await copyFile('./README.md', `${DIST}/README.md`);
console.log('✓ Copied manifest.json and README.md to dist/');

// Step 3: Check for mcpb CLI
const pack = process.argv.includes('--pack');
if (pack) {
  console.log('\nPackaging .mcpb...');
  const proc = Bun.spawn(['npx', '@anthropic-ai/mcpb', 'pack', DIST, './options-analysis-suite.mcpb'], {
    stdout: 'inherit',
    stderr: 'inherit',
    cwd: process.cwd(),
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error('mcpb pack failed. Install with: npm install -g @anthropic-ai/mcpb');
    process.exit(1);
  }
  console.log('✓ Package: options-analysis-suite.mcpb');
} else {
  console.log('\nBuild complete. Run with --pack to create .mcpb package.');
}
