import mvdanSh from "mvdan-sh";

const { syntax } = mvdanSh;

export type ReviewReason = "list-hit" | "fallthrough" | "judge-critical" | "judge-failure";

export type Verdict =
  | { kind: "allow" }
  | { kind: "human-review"; reason: ReviewReason; segments?: string[] }
  | { kind: "deny"; message: string };

export interface GuardConfig {}

export interface EngineDeps {
  interactive: boolean;
}

export const POLICY_DENIAL_MESSAGE = "tool call denied by policy";

export const NON_INTERACTIVE_DENIAL_MESSAGE =
  "requires human review; rerun interactively or extend the allow list";

// Statement kinds the engine confidently decomposes. A simple command
// (CallExpr) becomes a segment; the others only group nested statements,
// which the walk visits on its own. Anything else (loops, conditionals,
// arithmetic, declarations, ...) is outside confident coverage and the
// whole command fails closed.
const CONTAINER_COMMANDS = new Set(["BinaryCmd", "Subshell", "Block"]);

type ParseResult = { ok: true; segments: string[] } | { ok: false };

function parseSegments(command: string): ParseResult {
  let file: any;
  try {
    file = syntax.NewParser().Parse(command, "command");
  } catch {
    return { ok: false };
  }

  const segments: string[] = [];
  let covered = true;
  syntax.Walk(file, (node: any) => {
    if (node === null || syntax.NodeType(node) !== "Stmt") return true;
    const cmdType = node.Cmd ? syntax.NodeType(node.Cmd) : null;
    if (cmdType === "CallExpr") {
      // The statement span includes redirections and the background
      // operator; strip trailing separators so segments are clean
      // targets for anchored list matching.
      const text = command
        .slice(node.Pos().Offset(), node.End().Offset())
        .replace(/[\s;&]+$/, "");
      segments.push(text);
    } else if (!cmdType || !CONTAINER_COMMANDS.has(cmdType)) {
      covered = false;
    }
    return true;
  });

  if (!covered || segments.length === 0) return { ok: false };
  return { ok: true, segments };
}

function classifySegment(_segment: string, _config: GuardConfig): Verdict {
  return { kind: "human-review", reason: "fallthrough" };
}

function restrictiveness(verdict: Verdict): number {
  switch (verdict.kind) {
    case "deny":
      return 2;
    case "human-review":
      return 1;
    case "allow":
      return 0;
  }
}

function mostRestrictive(verdicts: Verdict[]): Verdict {
  return verdicts.reduce((worst, v) => (restrictiveness(v) > restrictiveness(worst) ? v : worst));
}

export function decide(command: string, config: GuardConfig, deps: EngineDeps): Verdict {
  const parsed = parseSegments(command);

  let verdict: Verdict;
  if (!parsed.ok) {
    verdict = { kind: "human-review", reason: "fallthrough" };
  } else {
    verdict = mostRestrictive(parsed.segments.map((s) => classifySegment(s, config)));
    if (verdict.kind === "human-review") {
      verdict = { ...verdict, segments: parsed.segments };
    }
  }

  if (verdict.kind === "human-review" && !deps.interactive) {
    return { kind: "deny", message: NON_INTERACTIVE_DENIAL_MESSAGE };
  }
  return verdict;
}
