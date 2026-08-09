import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { loadGuardConfig, projectConfigPath } from "./config.ts";

function projectWithConfig(t: TestContext, config: unknown): string {
  const project = mkdtempSync(join(tmpdir(), "marquardt-config-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(project, { recursive: true, force: true });
  });
  const path = projectConfigPath(project);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config));
  return project;
}

test("GitHub Copilot judge tracking can be enabled in project config", (t) => {
  const project = projectWithConfig(t, { trackJudgeCallFormat: "github-copilot" });
  assert.equal(loadGuardConfig(project).trackJudgeCallFormat, "github-copilot");
});

test("invalid judge tracking formats warn and disable tracking", (t) => {
  const project = projectWithConfig(t, { trackJudgeCallFormat: "vscode" });
  const warnings: string[] = [];
  assert.equal(loadGuardConfig(project, (message) => warnings.push(message)).trackJudgeCallFormat, undefined);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /invalid trackJudgeCallFormat/);
  assert.match(warnings[0], /tracking disabled/);
});
