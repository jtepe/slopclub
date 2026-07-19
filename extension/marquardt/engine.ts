export type ReviewReason = "list-hit" | "fallthrough" | "judge-critical" | "judge-failure";

export type Verdict =
  | { kind: "allow" }
  | { kind: "human-review"; reason: ReviewReason }
  | { kind: "deny"; message: string };

export interface GuardConfig {}

export interface EngineDeps {
  interactive: boolean;
}

export const POLICY_DENIAL_MESSAGE = "tool call denied by policy";

export const NON_INTERACTIVE_DENIAL_MESSAGE =
  "requires human review; rerun interactively or extend the allow list";

export function decide(_command: string, _config: GuardConfig, deps: EngineDeps): Verdict {
  if (!deps.interactive) {
    return { kind: "deny", message: NON_INTERACTIVE_DENIAL_MESSAGE };
  }
  return { kind: "human-review", reason: "fallthrough" };
}
