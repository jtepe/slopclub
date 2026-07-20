/**
 * Marquardt — bash-tool guard.
 *
 * Intercepts every bash tool call and produces a verdict before anything
 * executes. Allow-listed commands run silently, deny-listed commands are
 * refused with "tool call denied by policy", and everything else shows a
 * review prompt. Alongside accept and reject, the prompt can add the
 * command's segment patterns to the allow or deny list at project or user
 * scope; the addition persists to that scope's guard config file and takes
 * effect immediately, so the same command never asks again. In
 * non-interactive sessions anything needing review is denied. Non-bash
 * tool calls pass through untouched.
 *
 * Guard lists load from `.pi/marquardt.json` in the project and in the
 * user's home directory: `{ "allow": [], "humanReview": [], "deny": [] }`,
 * each entry an anchored full-segment regex.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { decide, patternsForSegments, POLICY_DENIAL_MESSAGE } from "./engine.ts";
import { loadGuardConfig, persistPatterns, type ConfigScope, type TeachableList } from "./config.ts";

const CHOICE_ACCEPT = "accept (run once)";
const CHOICE_REJECT = "reject";
const CHOICE_ALLOW = "add to allow list (always run)";
const CHOICE_DENY = "add to deny list (always refuse)";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const config = loadGuardConfig(process.cwd());
    const verdict = await decide(event.input.command, config, { interactive: ctx.hasUI });

    if (verdict.kind === "allow") return;
    if (verdict.kind === "deny") {
      return { block: true, reason: verdict.message };
    }

    const segments = verdict.segments ?? [];
    const segmentLines = segments.length
      ? `\n\nsegments:\n${segments.map((s) => `  ${s}`).join("\n")}`
      : "\n\nsegments: (could not parse — failing closed)";
    const detail = `${event.input.command}${segmentLines}\n\nverdict path: ${verdict.reason}`;

    // Without parsed segments there is no anchored pattern to persist, so
    // the prompt degrades to plain accept/reject.
    if (segments.length === 0) {
      const accepted = await ctx.ui.confirm("Marquardt: review bash command", detail);
      if (!accepted) {
        return { block: true, reason: POLICY_DENIAL_MESSAGE };
      }
      return;
    }

    const choice = await ctx.ui.select(`Marquardt: review bash command\n\n${detail}`, [
      CHOICE_ACCEPT,
      CHOICE_REJECT,
      CHOICE_ALLOW,
      CHOICE_DENY,
    ]);

    if (choice === CHOICE_ACCEPT) return;
    if (choice !== CHOICE_ALLOW && choice !== CHOICE_DENY) {
      return { block: true, reason: POLICY_DENIAL_MESSAGE };
    }

    const list: TeachableList = choice === CHOICE_ALLOW ? "allow" : "deny";
    const scope = await ctx.ui.select(`Add to ${list} list at which scope?`, [
      "project",
      "user",
    ]);
    if (scope !== "project" && scope !== "user") {
      return { block: true, reason: POLICY_DENIAL_MESSAGE };
    }

    try {
      persistPatterns(scope as ConfigScope, process.cwd(), list, patternsForSegments(segments));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { block: true, reason: `guard config update failed: ${message}` };
    }

    if (list === "deny") {
      return { block: true, reason: POLICY_DENIAL_MESSAGE };
    }
  });
}
