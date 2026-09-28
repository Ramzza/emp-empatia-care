import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("every root PRD requirement maps to a named behavioral test", () => {
  const root = process.cwd();
  const prdPath = join(root, "PRD.md");
  assert.ok(existsSync(prdPath), "root PRD.md must exist");
  const prd = readFileSync(prdPath, "utf8");
  const requirementIds = [...prd.matchAll(/^- \*\*(PRD-\d{3}) - /gm)]
    .map((match) => match[1])
    .filter((id): id is string => id !== undefined);
  assert.ok(requirementIds.length > 0, "PRD must define stable requirement IDs");

  const testsDirectory = join(root, "tests");
  const testSource = readdirSync(testsDirectory)
    .filter((file) => file.endsWith(".test.ts") && file !== "prd-requirements.test.ts")
    .map((file) => readFileSync(join(testsDirectory, file), "utf8"))
    .join("\n");
  for (const requirementId of requirementIds) {
    assert.ok(testSource.includes(`${requirementId}:`), `No named behavioral test maps to ${requirementId}`);
  }
});
