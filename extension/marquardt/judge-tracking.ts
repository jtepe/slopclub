import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";

export type JudgeCallTrackingFormat = "github-copilot";

export interface TrackedJudgeCall {
  cwd: string;
  prompt: string;
  response: AssistantMessage;
  startedAt: number;
}

function githubCopilotEvents(call: TrackedJudgeCall, sessionId: string): string {
  const endedAt = Math.max(Date.now(), call.startedAt);
  const model = call.response.responseModel ?? call.response.model;
  const usage = call.response.usage;
  // Copilot's inputTokens includes cached input, while pi-ai reports fresh and
  // cached input separately.
  const totalInput = usage.input + usage.cacheRead + usage.cacheWrite;
  const events = [
    {
      type: "session.start",
      data: { sessionId, context: { cwd: call.cwd } },
      timestamp: new Date(call.startedAt).toISOString(),
    },
    {
      type: "session.model_change",
      data: { newModel: model },
      timestamp: new Date(call.startedAt).toISOString(),
    },
    {
      type: "user.message",
      data: { content: call.prompt },
      timestamp: new Date(call.startedAt).toISOString(),
    },
    {
      type: "assistant.message",
      data: {
        content: call.response.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(""),
        outputTokens: usage.output,
      },
      timestamp: new Date(endedAt).toISOString(),
    },
    {
      type: "session.shutdown",
      data: {
        modelMetrics: {
          [model]: {
            usage: {
              inputTokens: totalInput,
              outputTokens: usage.output,
              cacheReadTokens: usage.cacheRead,
              cacheWriteTokens: usage.cacheWrite,
              ...(usage.reasoning === undefined ? {} : { reasoningTokens: usage.reasoning }),
            },
          },
        },
      },
      timestamp: new Date(endedAt).toISOString(),
    },
  ];
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

function trackGithubCopilot(call: TrackedJudgeCall, home: string): void {
  const sessionId = randomUUID();
  const sessionDir = join(home, ".copilot", "session-state", sessionId);
  mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
  writeFileSync(join(sessionDir, "events.jsonl"), githubCopilotEvents(call, sessionId), {
    mode: 0o600,
  });
}

export function trackJudgeCall(
  format: JudgeCallTrackingFormat,
  call: TrackedJudgeCall,
  home = homedir(),
): void {
  switch (format) {
    case "github-copilot":
      trackGithubCopilot(call, home);
  }
}
