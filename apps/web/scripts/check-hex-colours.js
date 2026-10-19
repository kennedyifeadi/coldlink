import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Skips HTML entities (&#123;) and IDs such as "#882-991A".
const HEX_COLOUR = /(?<![0-9a-z&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z-])/gi;

export function findHexColours(source) {
  return source.split('\n').flatMap((text, index) =>
    [...text.matchAll(HEX_COLOUR)].map((match) => ({
      line: index + 1,
      column: match.index + 1,
      value: match[0],
    })),
  );
}

async function listTsxFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
    .map((entry) => join(entry.parentPath, entry.name));
}

async function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = await listTsxFiles(join(root, 'src'));
  let count = 0;

  for (const file of files) {
    for (const { line, column, value } of findHexColours(await readFile(file, 'utf8'))) {
      console.error(`${relative(root, file)}:${line}:${column}  ${value}`);
      count += 1;
    }
  }

  if (count > 0) {
    console.error(`\n${count} raw hex colour(s) found. Use a colour token from src/index.css.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
