/**
 * Decision-outcome badges for the guard's UI (POC).
 *
 * Every decision the guard surfaces gets a badge — the outcome label on a
 * solid, outcome-specific background color — so the outcomes are
 * distinguishable at a glance in the review prompt and in notifications.
 *
 * The pi TUI renders ANSI-styled strings verbatim, so badges are plain
 * strings carrying truecolor SGR sequences. The trailing full reset also
 * clears any styling the host UI wrapped around the string (e.g. the
 * selector title's accent color), which is why badges go at the start of a
 * line: text after the badge falls back to the default text color.
 *
 * Suggested palette — one hue per outcome, dark enough that white text
 * reads on both light and dark terminal themes:
 *
 * | outcome           | color  | hex     | rationale                          |
 * | ----------------- | ------ | ------- | ---------------------------------- |
 * | allowed-list      | green  | #15803d | conventional "go"                  |
 * | allowed-judge     | teal   | #0d9488 | approval, but by machine judgment  |
 * | approved-human    | blue   | #2563eb | approval by a person               |
 * | needs-review      | yellow | #a16207 | caution, decision pending          |
 * | judge-critical    | orange | #c2410c | escalated caution (judge flagged)  |
 * | judge-unavailable | gray   | #52525b | degraded, no judgment available    |
 * | denied-policy     | red    | #dc2626 | conventional "stop"                |
 * | rejected-human    | purple | #7c3aed | refusal by a person, not by policy |
 *
 * The weakest pair is yellow vs orange, deliberately so: both are "stopped
 * at review" states and differ only in how the command got there.
 */

import type { ReviewReason } from "./engine.ts";

export type DecisionOutcome =
  | "allowed-list"
  | "allowed-judge"
  | "approved-human"
  | "needs-review"
  | "judge-critical"
  | "judge-unavailable"
  | "denied-policy"
  | "rejected-human";

export interface OutcomeStyle {
  label: string;
  /** Background hex color, the outcome's identity. */
  bg: string;
  /** Text hex color on that background. */
  fg: string;
}

export const OUTCOME_STYLES: Record<DecisionOutcome, OutcomeStyle> = {
  "allowed-list": { label: "ALLOWED · LIST", bg: "#15803d", fg: "#ffffff" },
  "allowed-judge": { label: "ALLOWED · JUDGE", bg: "#0d9488", fg: "#ffffff" },
  "approved-human": { label: "APPROVED · HUMAN", bg: "#2563eb", fg: "#ffffff" },
  "needs-review": { label: "NEEDS REVIEW", bg: "#a16207", fg: "#ffffff" },
  "judge-critical": { label: "JUDGE · CRITICAL", bg: "#c2410c", fg: "#ffffff" },
  "judge-unavailable": { label: "JUDGE UNAVAILABLE", bg: "#52525b", fg: "#ffffff" },
  "denied-policy": { label: "DENIED · POLICY", bg: "#dc2626", fg: "#ffffff" },
  "rejected-human": { label: "REJECTED · HUMAN", bg: "#7c3aed", fg: "#ffffff" },
};

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** ` LABEL ` on the outcome's background color, bold, reset at the end. */
export function badge(outcome: DecisionOutcome): string {
  const style = OUTCOME_STYLES[outcome];
  const [br, bg, bb] = rgb(style.bg);
  const [fr, fg, fb] = rgb(style.fg);
  return `\x1b[48;2;${br};${bg};${bb}m\x1b[38;2;${fr};${fg};${fb}m\x1b[1m ${style.label} \x1b[0m`;
}

/** The badge shown while a command sits at human review, by how it got there. */
export function reviewOutcome(reason: ReviewReason): DecisionOutcome {
  switch (reason) {
    case "judge-critical":
      return "judge-critical";
    case "judge-failure":
      return "judge-unavailable";
    default:
      return "needs-review";
  }
}
