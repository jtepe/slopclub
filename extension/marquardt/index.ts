/**
 * Marquardt — bash-tool guard.
 *
 * Intercepts every bash tool call and produces a verdict before anything
 * executes. Allow-listed commands run silently, deny-listed commands are
 * refused with "tool call denied by policy", and everything else shows a
 * review prompt: accepting runs the command and returns its full result to
 * the LLM, rejecting returns "tool call denied by policy" without
 * executing. In non-interactive sessions anything needing review is
 * denied. Non-bash tool calls pass through untouched.
 *
 * Guard lists load from `.pi/marquardt.json` in the project and in the
 * user's home directory: `{ "allow": [], "humanReview": [], "deny": [] }`,
 * each entry an anchored full-segment regex.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { decide, POLICY_DENIAL_MESSAGE } from "./engine.ts";
import { loadGuardConfig } from "./config.ts";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const config = loadGuardConfig(process.cwd());
    const verdict = await decide(event.input.command, config, { interactive: ctx.hasUI });

    if (verdict.kind === "allow") return;
    if (verdict.kind === "deny") {
      return { block: true, reason: verdict.message };
    }

    const segmentLines = verdict.segments?.length
      ? `\n\nsegments:\n${verdict.segments.map((s) => `  ${s}`).join("\n")}`
      : "\n\nsegments: (could not parse — failing closed)";
    const accepted = await ctx.ui.confirm(
      "Marquardt: review bash command",
      `${event.input.command}${segmentLines}\n\nverdict path: ${verdict.reason}`,
    );
    if (!accepted) {
      return { block: true, reason: POLICY_DENIAL_MESSAGE };
    }
  });
}
