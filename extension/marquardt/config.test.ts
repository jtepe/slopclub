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
  assert.equal(loadGuardConfig(project, undefined, join(project, "absent-user-config.json")).trackJudgeCallFormat, "github-copilot");
});

test("invalid judge tracking formats warn and disable tracking without user config", (t) => {
  const project = projectWithConfig(t, { trackJudgeCallFormat: "vscode" });
  const warnings: string[] = [];
  assert.equal(
    loadGuardConfig(project, (message) => warnings.push(message), join(project, "absent-user-config.json")).trackJudgeCallFormat,
    undefined,
  );
  assert.equal(warnings.length, 1);
});

test("an invalid project tracking format falls back to valid user config", (t) => {
  const project = projectWithConfig(t, { trackJudgeCallFormat: "vscode" });
  const userConfigPath = join(project, "user-marquardt.json");
  writeFileSync(userConfigPath, JSON.stringify({ trackJudgeCallFormat: "github-copilot" }));
  const warnings: string[] = [];

  assert.equal(
    loadGuardConfig(project, (message) => warnings.push(message), userConfigPath).trackJudgeCallFormat,
    "github-copilot",
  );
  assert.equal(warnings.length, 1);
});
