import assert from "node:assert/strict";
import test from "node:test";
import { badge, OUTCOME_STYLES, reviewOutcome, type DecisionOutcome } from "./decision-ui.ts";

const outcomes = Object.keys(OUTCOME_STYLES) as DecisionOutcome[];

test("every outcome has a distinct background color", () => {
  const backgrounds = outcomes.map((o) => OUTCOME_STYLES[o].bg);
  assert.equal(new Set(backgrounds).size, outcomes.length);
});

test("every outcome has a distinct label", () => {
  const labels = outcomes.map((o) => OUTCOME_STYLES[o].label);
  assert.equal(new Set(labels).size, outcomes.length);
});

test("badge sets the outcome's background color and resets at the end", () => {
  const styled = badge("denied-policy");
  assert.ok(styled.startsWith("\x1b[48;2;220;38;38m"), "truecolor background for #dc2626");
  assert.ok(styled.includes(" DENIED · POLICY "));
  assert.ok(styled.endsWith("\x1b[0m"));
});

test("review reasons map to their outcome badges", () => {
  assert.equal(reviewOutcome("judge-critical"), "judge-critical");
  assert.equal(reviewOutcome("judge-failure"), "judge-unavailable");
  assert.equal(reviewOutcome("list-hit"), "needs-review");
  assert.equal(reviewOutcome("fallthrough"), "needs-review");
});
