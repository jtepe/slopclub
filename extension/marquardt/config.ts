import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { GuardConfig } from "./engine.ts";

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

export function loadGuardConfig(projectDir: string): GuardConfig {
  const user = readConfigFile(USER_CONFIG_PATH);
  const project = readConfigFile(projectConfigPath(projectDir));
  return {
    allow: [...user.allow, ...project.allow],
    humanReview: [...user.humanReview, ...project.humanReview],
    deny: [...user.deny, ...project.deny],
  };
}
