import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  DEFAULT_PROTECTED_PATHS,
  type GuardConfig,
} from "./engine.ts";
import type { JudgeCallTrackingFormat } from "./judge-tracking.ts";

export type ConfigScope = "project" | "user";
export type TeachableList = "allow" | "deny";

export const USER_CONFIG_PATH = join(homedir(), ".pi", "agent", "marquardt.json");

export function projectConfigPath(projectDir: string): string {
  return join(projectDir, ".pi", "marquardt.json");
}

interface ConfigFile {
  allow: string[];
  humanReview: string[];
  deny: string[];
  protectedPaths: string[];
  judgeModel?: string;
  // null means the key was present but invalid, so a lower-precedence value
  // must not silently enable tracking.
  trackJudgeCallFormat?: JudgeCallTrackingFormat | null;
}

function emptyConfig(): ConfigFile {
  return { allow: [], humanReview: [], deny: [], protectedPaths: [] };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

// A missing or malformed file contributes empty lists, which is the most
// restrictive reading: every command falls through to review.
function readConfigFile(path: string, warn: (message: string) => void): ConfigFile {
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
    let trackJudgeCallFormat: JudgeCallTrackingFormat | null | undefined;
    if (Object.hasOwn(record, "trackJudgeCallFormat")) {
      if (record.trackJudgeCallFormat === "github-copilot") {
        trackJudgeCallFormat = record.trackJudgeCallFormat;
      } else {
        warn(
          `invalid trackJudgeCallFormat in ${path}: expected \"github-copilot\"; judge call tracking disabled`,
        );
        trackJudgeCallFormat = null;
      }
    }
    return {
      allow: stringList(record.allow),
      humanReview: stringList(record.humanReview),
      deny: stringList(record.deny),
      protectedPaths: stringList(record.protectedPaths),
      judgeModel: typeof record.judgeModel === "string" && record.judgeModel.trim()
        ? record.judgeModel.trim()
        : undefined,
      trackJudgeCallFormat,
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

export function loadGuardConfig(
  projectDir: string,
  warn: (message: string) => void = console.warn,
): GuardConfig {
  const user = readConfigFile(USER_CONFIG_PATH, warn);
  const project = readConfigFile(projectConfigPath(projectDir), warn);
  // Config files can only extend the protected set, never shrink it: the
  // defaults are always present, so no config state disarms the guard.
  return {
    allow: [...user.allow, ...project.allow],
    humanReview: [...user.humanReview, ...project.humanReview],
    deny: [...user.deny, ...project.deny],
    protectedPaths: [
      ...DEFAULT_PROTECTED_PATHS,
      ...user.protectedPaths,
      ...project.protectedPaths,
    ],
    // Project configuration takes precedence when both scopes specify it.
    judgeModel: project.judgeModel ?? user.judgeModel,
    trackJudgeCallFormat: project.trackJudgeCallFormat === undefined
      ? user.trackJudgeCallFormat ?? undefined
      : project.trackJudgeCallFormat ?? undefined,
  };
}
