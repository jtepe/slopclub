import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { trackJudgeCall } from "./judge-tracking.ts";

function response(): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: '{"verdict":"non-critical"}' }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    usage: {
      input: 100,
      output: 20,
      cacheRead: 40,
      cacheWrite: 10,
      reasoning: 5,
      totalTokens: 170,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

test("GitHub Copilot tracking writes an Agentsview-compatible session", (t) => {
  const tempHome = mkdtempSync(join(tmpdir(), "marquardt-judge-tracking-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(tempHome, { recursive: true, force: true });
  });

  trackJudgeCall("github-copilot", {
    cwd: "/work/project",
    prompt: "judge this command",
    response: response(),
    startedAt: Date.now() - 10,
  }, tempHome);

  const stateDir = join(tempHome, ".copilot", "session-state");
  const [sessionId] = readdirSync(stateDir);
  const eventsPath = join(stateDir, sessionId, "events.jsonl");
  assert.equal(statSync(eventsPath).mode & 0o777, 0o600);

  const events = readFileSync(eventsPath, "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(events.map((event) => event.type), [
    "session.start",
    "session.model_change",
    "user.message",
    "assistant.message",
    "session.shutdown",
  ]);
  assert.equal(events[0].data.sessionId, sessionId);
  assert.equal(events[0].data.context.cwd, "/work/project");
  assert.equal(events[2].data.content, "judge this command");
  assert.deepEqual(
    events[4].data.modelMetrics["claude-sonnet-4-6"].usage,
    {
      inputTokens: 150,
      outputTokens: 20,
      cacheReadTokens: 40,
      cacheWriteTokens: 10,
      reasoningTokens: 5,
    },
  );
});
