/**
 * Marquardt — bash-tool guard.
 *
 * Intercepts every bash tool call and produces a verdict before anything
 * executes. A human-review verdict shows a review prompt: accepting runs
 * the command and returns its full result to the LLM, rejecting returns
 * "tool call denied by policy" without executing. In non-interactive
 * sessions anything needing review is denied. Non-bash tool calls pass
 * through untouched.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { decide, POLICY_DENIAL_MESSAGE, type GuardConfig } from "./engine.ts";

export default function (pi: ExtensionAPI) {
  const config: GuardConfig = {};

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const verdict = decide(event.input.command, config, { interactive: ctx.hasUI });

    if (verdict.kind === "allow") return;
    if (verdict.kind === "deny") {
      return { block: true, reason: verdict.message };
    }

    const accepted = await ctx.ui.confirm(
      "Marquardt: review bash command",
      `${event.input.command}\n\nverdict path: ${verdict.reason}`,
    );
    if (!accepted) {
      return { block: true, reason: POLICY_DENIAL_MESSAGE };
    }
  });
}
