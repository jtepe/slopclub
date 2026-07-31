#!/usr/bin/env node
/**
 * Standalone execution-flow debugger for marquardt.
 *
 * Run from a terminal (including Helix's `:sh`) without starting pi:
 *
 *   node extension/marquardt/debug.ts "git status && python -c 'print(1)'"
 *   node extension/marquardt/debug.ts --judge critical
 */

import { homedir } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadGuardConfig } from "./config.ts";
import { decide, type JudgeFn } from "./engine.ts";

type JudgeMode = "critical" | "non-critical" | "unavailable";

interface Options {
  cwd: string;
  interactive: boolean;
  judge: JudgeMode;
  command?: string;
}

const usage = `Usage: node extension/marquardt/debug.ts [options] [command]

Print a JSON trace of marquardt's decision path. With no command, starts a REPL.

Options:
  --cwd <dir>                         Load project config from this directory
  --headless                           Simulate a non-interactive pi session
  --judge <critical|non-critical|unavailable>
                                       Simulate the ad-hoc-script judge (default: unavailable)
  -h, --help                           Show this help

REPL commands: :help, :quit`;

export function parseOptions(args: string[], cwd = process.cwd()): Options | "help" {
  let projectDir = cwd;
  let interactive = true;
  let judge: JudgeMode = "unavailable";
  const command: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "-h" || arg === "--help") return "help";
    if (arg === "--headless") {
      interactive = false;
    } else if (arg === "--cwd" || arg === "--judge") {
      const value = args[++index];
      if (!value) throw new Error(`${arg} requires a value`);
      if (arg === "--cwd") projectDir = resolve(value);
      else if (value === "critical" || value === "non-critical" || value === "unavailable") judge = value;
      else throw new Error(`invalid judge mode: ${value}`);
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      command.push(arg);
    }
  }
  return { cwd: projectDir, interactive, judge, command: command.length ? command.join(" ") : undefined };
}

function simulatedJudge(mode: JudgeMode): JudgeFn {
  return async () => {
    if (mode === "unavailable") throw new Error("simulated unavailable judge");
    return {
      verdict: mode,
      explanation: `simulated ${mode} judge verdict`,
    };
  };
}

export async function inspect(command: string, options: Omit<Options, "command">) {
  const config = loadGuardConfig(options.cwd);
  const decision = await decide(command, config, {
    interactive: options.interactive,
    judge: simulatedJudge(options.judge),
    env: { cwd: options.cwd, home: homedir() },
  });

  return {
    command,
    session: { cwd: options.cwd, interactive: options.interactive, judge: options.judge },
    config: {
      allow: config.allow,
      humanReview: config.humanReview,
      deny: config.deny,
      interpreters: Object.keys(config.interpreters),
      protectedPaths: config.protectedPaths,
    },
    ...decision,
  };
}

async function main(): Promise<void> {
  let options: Options | "help";
  try {
    options = parseOptions(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exitCode = 2;
    return;
  }
  if (options === "help") {
    console.log(usage);
    return;
  }

  const print = async (command: string) => console.log(JSON.stringify(
    await inspect(command, options),
    null,
    2,
  ));
  if (options.command) {
    await print(options.command);
    return;
  }

  console.log("marquardt debug REPL; enter a bash command, or :help / :quit");
  const readline = createInterface({ input, output, prompt: "marquardt> " });
  const prompt = () => {
    // Piped input reaches EOF while the previous command is being printed;
    // readline is then already closed, so only prompt on an actual terminal.
    if (output.isTTY) readline.prompt();
  };
  prompt();
  for await (const line of readline) {
    const command = line.trim();
    if (command === ":quit" || command === ":q") break;
    if (command === ":help") console.log(usage);
    else if (command) await print(command);
    prompt();
  }
  readline.close();
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
