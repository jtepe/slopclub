/**
 * marquardt — bash-tool guard.
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
 * During human review, the user can consult a judge LLM about the complete
 * command chain. A non-critical verdict allows the call immediately; a
 * critical verdict displays its explanation and leaves the final decision to
 * the user without offering another judge invocation for that chain.
 *
 * Writes targeting the protected-path set are refused from every tool, so
 * the agent cannot disarm the guard that constrains it: the guard's own
 * config files, shell rc/profile files, git hook directories, and
 * user-writable PATH-shim directories. File-write tools (`write`, `edit`)
 * are checked against the set, and bash redirects into a protected path are
 * denied; a redirect whose destination the engine cannot read statically
 * fails closed to review. Writes anywhere else pass through untouched.
 *
 * Guard config loads from `.pi/marquardt.json` in the project and
 * `~/.pi/agent/marquardt.json` for the user: `{ "allow": [],
 * "humanReview": [], "deny": [], "protectedPaths": [], "judgeModel":
 * "provider/model-id" }`. List entries are anchored full-segment regexes;
 * `protectedPaths` extends the built-in protected set and can never shrink it.
 */

import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
  consultJudge,
  giveVerdict,
  decideWrite,
  patternsForSegments,
  POLICY_DENIAL_MESSAGE,
} from "./engine.ts";
import { createJudge } from "./judge.ts";
import { loadGuardConfig, persistPatterns, type ConfigScope, type TeachableList } from "./config.ts";
import { badge, reviewOutcome, type DecisionOutcome } from "./decision-ui.ts";
import { ReviewQueue } from "./review-queue.ts";

const CHOICE_ACCEPT = "accept (run once)";
const CHOICE_REJECT = "reject";
const CHOICE_ALLOW = "add to allow list (always run)";
const CHOICE_DENY = "add to deny list (always refuse)";
const CHOICE_JUDGE = "consult judge";
const DECISION_ENTRY = "marquardt-decision";

interface DecisionEntry {
  outcome: DecisionOutcome;
  command: string;
}

export default function (pi: ExtensionAPI) {
  // Tool calls in a batch can reach this handler concurrently, but Pi's UI
  // supports one dialog at a time. Keep each command's complete review flow
  // atomic so no prompt is replaced by a later sibling.
  const reviews = new ReviewQueue();

  pi.registerEntryRenderer<DecisionEntry>(DECISION_ENTRY, (entry, _options, theme) => {
    const data = entry.data;
    return new Text(
      `${badge(data.outcome)} ${data.command}`,
      0,
      0,
    );
  });

  pi.on("tool_call", async (event, ctx) => {
    const env = { cwd: ctx.cwd, home: homedir() };

    if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
      const verdict = decideWrite(event.input.path, loadGuardConfig(env.cwd), env);
      if (verdict.kind === "deny") {
        return { block: true, reason: verdict.message };
      }
      return;
    }

    if (!isToolCallEventType("bash", event)) return;

    const config = loadGuardConfig(env.cwd);
    const verdict = await giveVerdict(event.input.command, config, {
      interactive: ctx.hasUI,
      env,
    });

    // Persist exactly one decision per call. `ui.notify()` retains its own
    // latest notification, which would duplicate the last custom entry.
    const show = (outcome: DecisionOutcome) => {
      pi.appendEntry<DecisionEntry>(DECISION_ENTRY, { outcome, command: event.input.command });
    };

    if (verdict.kind === "allow") return;
    if (verdict.kind === "deny") {
      show("denied-policy");
      return { block: true, reason: verdict.message };
    }

    return reviews.run(async () => {
      const segments = verdict.segments ?? [];
      const segmentLines = segments.length
        ? `\n\nsegments:\n${segments.map((s) => `  ${s}`).join("\n")}`
        : "\n\nsegments: (could not parse — failing closed)";
      let judgeNote = "";
      let judgeWasCritical = false;
      const detail = () =>
        `${event.input.command}${segmentLines}\n\nverdict path: ${verdict.reason}${judgeNote}`;
      const reviewTitle = () =>
        `${badge(judgeWasCritical ? "judge-critical" : reviewOutcome(verdict.reason))} review bash command`;

      // Without parsed segments there is no anchored pattern to persist, so
      // the prompt degrades to plain accept/reject.
      if (segments.length === 0) {
        const accepted = await ctx.ui.confirm(reviewTitle(), detail());
        if (!accepted) {
          show("rejected-human");
          return { block: true, reason: POLICY_DENIAL_MESSAGE };
        }
        show("approved-human");
        return;
      }

      let choice: string | undefined;
      while (true) {
        choice = await ctx.ui.select(`${reviewTitle()}\n\n${detail()}`, [
          CHOICE_ACCEPT,
          CHOICE_REJECT,
          CHOICE_ALLOW,
          CHOICE_DENY,
          ...(judgeWasCritical ? [] : [CHOICE_JUDGE]),
        ]);
        if (choice !== CHOICE_JUDGE) break;

        try {
          const judge = await consultJudge(segments.join("\n"), createJudge(ctx, config.judgeModel));
          if (judge.kind === "non-critical") {
            show("allowed-judge");
            return;
          }
          judgeWasCritical = true;
          judgeNote = `\n\njudge: ${judge.explanation}`;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          judgeNote = `\n\njudge unavailable: ${message}`;
        }
      }

      if (choice === CHOICE_ACCEPT) {
        show("approved-human");
        return;
      }
      if (choice !== CHOICE_ALLOW && choice !== CHOICE_DENY) {
        show("rejected-human");
        return { block: true, reason: POLICY_DENIAL_MESSAGE };
      }

      const list: TeachableList = choice === CHOICE_ALLOW ? "allow" : "deny";
      const scope = await ctx.ui.select(`Add to ${list} list at which scope?`, [
        "project",
        "user",
      ]);
      if (scope !== "project" && scope !== "user") {
        show("rejected-human");
        return { block: true, reason: POLICY_DENIAL_MESSAGE };
      }

      try {
        persistPatterns(scope as ConfigScope, env.cwd, list, patternsForSegments(segments));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { block: true, reason: `guard config update failed: ${message}` };
      }

      if (list === "deny") {
        show("rejected-human");
        return { block: true, reason: POLICY_DENIAL_MESSAGE };
      }
      show("approved-human");
    });
  });
}
