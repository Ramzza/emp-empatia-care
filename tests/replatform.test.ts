import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const root = process.cwd();
const ignored = new Set([".git", ".next", "coverage", "dist", "node_modules", "build"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return ignored.has(entry.name) ? [] : sourceFiles(path);
    return /\.(?:ts|tsx|js|jsx|mjs|cjs|css)$/.test(entry.name) ? [path] : [];
  });
}

test("PRD-006: the application uses React, Next.js, TypeScript, and Tailwind", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  };
  assert.match(manifest.scripts.dev ?? "", /next dev/);
  assert.match(manifest.scripts.build ?? "", /next build/);
  assert.match(manifest.scripts.start ?? "", /next start/);
  for (const dependency of ["next", "react", "react-dom"]) {
    assert.ok(manifest.dependencies[dependency], `Missing runtime dependency ${dependency}`);
  }
  assert.ok(manifest.devDependencies.typescript);
  assert.ok(manifest.devDependencies["@tailwindcss/postcss"]);
  assert.ok(existsSync(join(root, "app/page.tsx")));
  assert.ok(existsSync(join(root, "app/layout.tsx")));
  assert.match(readFileSync(join(root, "app/globals.css"), "utf8"), /@import\s+["']tailwindcss["']/);
});

test("PRD-006: source files have at most 100 non-import lines", () => {
  const violations = sourceFiles(root).flatMap((path) => {
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    const count = lines.filter((line) => !/^\s*import\b/.test(line)).length;
    return count > 100 ? [`${relative(root, path)}: ${count}`] : [];
  });
  assert.deepEqual(violations, []);
});
