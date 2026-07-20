import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { GuardConfig } from "./engine.ts";

export type ConfigScope = "project" | "user";
export type TeachableList = "allow" | "deny";

export const USER_CONFIG_PATH = join(homedir(), ".pi", "marquardt.json");

export function projectConfigPath(projectDir: string): string {
  return join(projectDir, ".pi", "marquardt.json");
}

function emptyConfig(): GuardConfig {
  return { allow: [], humanReview: [], deny: [] };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

// A missing or malformed file contributes empty lists, which is the most
// restrictive reading: every command falls through to review.
function readConfigFile(path: string): GuardConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return emptyConfig();
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return emptyConfig();
    const record = parsed as Record<string, unknown>;
    return {
      allow: stringList(record.allow),
      humanReview: stringList(record.humanReview),
      deny: stringList(record.deny),
    };
  } catch {
    return emptyConfig();
  }
}

// Appends review-time additions to the chosen scope's config file. Unknown
// keys in an existing file are preserved; a file that exists but does not
// parse is left untouched so a human edit is never clobbered.
export function persistPatterns(
  scope: ConfigScope,
  projectDir: string,
  list: TeachableList,
  patterns: string[],
): void {
  const path = scope === "user" ? USER_CONFIG_PATH : projectConfigPath(projectDir);

  let record: Record<string, unknown> = {};
  if (existsSync(path)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      throw new Error(`refusing to update malformed guard config at ${path}`);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`refusing to update malformed guard config at ${path}`);
    }
    record = parsed as Record<string, unknown>;
  }

  const existing = stringList(record[list]);
  record[list] = [...existing, ...patterns.filter((p) => !existing.includes(p))];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
}

export function loadGuardConfig(projectDir: string): GuardConfig {
  const user = readConfigFile(USER_CONFIG_PATH);
  const project = readConfigFile(projectConfigPath(projectDir));
  return {
    allow: [...user.allow, ...project.allow],
    humanReview: [...user.humanReview, ...project.humanReview],
    deny: [...user.deny, ...project.deny],
  };
}
