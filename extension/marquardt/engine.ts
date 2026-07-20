import { createRequire } from "node:module";
import { Parser, Language, type Node } from "web-tree-sitter";

export type ReviewReason = "list-hit" | "fallthrough" | "judge-critical" | "judge-failure";

export type Verdict =
  | { kind: "allow" }
  | { kind: "human-review"; reason: ReviewReason; explanation?: string; segments?: string[] }
  | { kind: "deny"; message: string };

export type InterpreterTable = Record<string, string[]>;

export interface GuardConfig {
  allow: string[];
  humanReview: string[];
  deny: string[];
  interpreters: InterpreterTable;
}

export interface JudgeInput {
  script: string;
  commandLine: string;
}

export type JudgeFn = (input: JudgeInput) => Promise<unknown>;

export interface EngineDeps {
  interactive: boolean;
  judge: JudgeFn;
}

export const DEFAULT_INTERPRETERS: InterpreterTable = {
  sh: ["-c"],
  bash: ["-c"],
  zsh: ["-c"],
  dash: ["-c"],
  ksh: ["-c"],
  python: ["-c"],
  python2: ["-c"],
  python3: ["-c"],
  node: ["-e", "--eval", "-p", "--print"],
  ruby: ["-e"],
  perl: ["-e", "-E"],
  php: ["-r"],
};

export const JUDGE_UNAVAILABLE_EXPLANATION = "judge unavailable";

export const POLICY_DENIAL_MESSAGE = "tool call denied by policy";

export const NON_INTERACTIVE_DENIAL_MESSAGE =
  "requires human review; rerun interactively or extend the allow list";

// Every node type the engine confidently understands. Tree-sitter parses
// leniently, so fail-closed means an explicit whitelist: any node outside
// this set (loops, conditionals, heredocs, assignments, arithmetic, ...)
// routes the whole command to review.
const COVERED_NODE_TYPES = new Set([
  "program",
  "command",
  "command_name",
  "redirected_statement",
  "list",
  "pipeline",
  "subshell",
  "compound_statement",
  "command_substitution",
  "process_substitution",
  "file_redirect",
  "file_descriptor",
  "word",
  "string",
  "string_content",
  "raw_string",
  "ansi_c_string",
  "number",
  "concatenation",
  "simple_expansion",
  "expansion",
  "variable_name",
  "special_variable_name",
  "comment",
  "heredoc_redirect",
  "heredoc_start",
  "heredoc_body",
  "simple_heredoc_body",
  "heredoc_content",
  "heredoc_end",
]);

const requireFromHere = createRequire(import.meta.url);

let parserPromise: Promise<Parser> | null = null;

function getParser(): Promise<Parser> {
  parserPromise ??= (async () => {
    await Parser.init();
    const language = await Language.load(
      requireFromHere.resolve("tree-sitter-bash/tree-sitter-bash.wasm"),
    );
    const parser = new Parser();
    parser.setLanguage(language);
    return parser;
  })();
  return parserPromise;
}

interface Segment {
  text: string;
  adHoc?: { script: string };
}

type ParseResult = { ok: true; segments: Segment[] } | { ok: false };

function literalText(node: Node): string {
  if (node.type === "raw_string" || node.type === "string") return node.text.slice(1, -1);
  if (node.type === "ansi_c_string") return node.text.slice(2, -1);
  return node.text;
}

// A segment is an ad-hoc script iff a known interpreter receives inline code:
// a code flag with a payload, a heredoc, or a stdin pipe. An interpreter given
// a script file stays a plain command; the heredoc and pipe branches therefore
// require every argument to be an option, so the interpreter must be reading
// the payload itself.
function detectAdHocScript(
  command: Node,
  container: Node,
  interpreters: InterpreterTable,
): Segment["adHoc"] {
  const name = command.childForFieldName("name")?.text ?? "";
  const codeFlags = interpreters[name.split("/").pop() ?? ""];
  if (!codeFlags?.length) return undefined;

  const args = command.namedChildren.filter(
    (child): child is Node => child !== null && child.type !== "command_name",
  );
  for (let i = 0; i < args.length; i++) {
    for (const flag of codeFlags) {
      if (args[i].text === flag && i + 1 < args.length) {
        return { script: literalText(args[i + 1]) };
      }
      if (args[i].text.startsWith(`${flag}=`)) {
        return { script: args[i].text.slice(flag.length + 1) };
      }
    }
  }

  const onlyOptions = args.every((arg) => arg.text.startsWith("-"));
  if (!onlyOptions) return undefined;

  if (container.type === "redirected_statement") {
    const heredoc = container.namedChildren.find((child) => child?.type === "heredoc_redirect");
    const body = heredoc?.namedChildren.find(
      (child) => child?.type === "heredoc_body" || child?.type === "simple_heredoc_body",
    );
    if (body) return { script: body.text };
  }

  const pipeline = container.parent;
  if (pipeline?.type === "pipeline" && pipeline.namedChildren[0]?.id !== container.id) {
    return { script: pipeline.text };
  }

  return undefined;
}

async function parseSegments(
  command: string,
  interpreters: InterpreterTable,
): Promise<ParseResult> {
  const tree = (await getParser()).parse(command);
  if (!tree || tree.rootNode.hasError) return { ok: false };

  const segments: Segment[] = [];
  let covered = true;
  const visit = (node: Node) => {
    if (!COVERED_NODE_TYPES.has(node.type)) {
      covered = false;
      return;
    }
    if (node.type === "redirected_statement" && !node.childForFieldName("body")) {
      covered = false;
      return;
    }
    if (node.type === "command") {
      const parent = node.parent;
      const container = parent?.type === "redirected_statement" ? parent : node;
      segments.push({
        text: container.text,
        adHoc: detectAdHocScript(node, container, interpreters),
      });
    }
    for (const child of node.namedChildren) {
      if (child) visit(child);
    }
  };
  visit(tree.rootNode);

  if (!covered || segments.length === 0) return { ok: false };
  return { ok: true, segments };
}

// Review-time list additions persist one pattern per segment. Escaping every
// regex metacharacter makes the pattern match exactly the reviewed segment,
// so teaching the guard never widens policy beyond what the human saw.
export function patternsForSegments(segments: string[]): string[] {
  const patterns = segments.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return [...new Set(patterns)];
}

const compiledPatterns = new Map<string, RegExp | null>();

// List entries match as anchored full-segment regexes; a pattern that fails
// to compile matches nothing, so a broken entry can only tighten policy.
function anchoredRegex(pattern: string): RegExp | null {
  let compiled = compiledPatterns.get(pattern);
  if (compiled === undefined) {
    try {
      compiled = new RegExp(`^(?:${pattern})$`);
    } catch {
      compiled = null;
    }
    compiledPatterns.set(pattern, compiled);
  }
  return compiled;
}

function matchesAny(segment: string, patterns: string[]): boolean {
  return patterns.some((pattern) => anchoredRegex(pattern)?.test(segment));
}

interface JudgeAnswer {
  verdict: "critical" | "non-critical";
  explanation: string;
}

// The schema gate: whatever the judge call produced, only this exact shape
// counts as an answer. Anything else — prose, a bare "safe", a smuggled
// "allow" verdict — is a judge failure.
function parseJudgeAnswer(output: unknown): JudgeAnswer | undefined {
  if (typeof output !== "object" || output === null) return undefined;
  const record = output as Record<string, unknown>;
  if (record.verdict !== "critical" && record.verdict !== "non-critical") return undefined;
  if (typeof record.explanation !== "string") return undefined;
  return { verdict: record.verdict, explanation: record.explanation };
}

async function judgeSegment(segment: Segment, script: string, deps: EngineDeps): Promise<Verdict> {
  const input: JudgeInput = { script, commandLine: segment.text };
  for (let attempt = 0; attempt < 2; attempt++) {
    let output: unknown;
    try {
      output = await deps.judge(input);
    } catch {
      continue;
    }
    const answer = parseJudgeAnswer(output);
    if (!answer) continue;
    if (answer.verdict === "non-critical") return { kind: "allow" };
    return { kind: "human-review", reason: "judge-critical", explanation: answer.explanation };
  }
  return {
    kind: "human-review",
    reason: "judge-failure",
    explanation: JUDGE_UNAVAILABLE_EXPLANATION,
  };
}

// Deny and review lists outrank the judge; the allow list does not, so a
// broad allow pattern can never exempt inline code from triage.
async function classifySegment(
  segment: Segment,
  config: GuardConfig,
  deps: EngineDeps,
): Promise<Verdict> {
  if (matchesAny(segment.text, config.deny)) {
    return { kind: "deny", message: POLICY_DENIAL_MESSAGE };
  }
  if (matchesAny(segment.text, config.humanReview)) {
    return { kind: "human-review", reason: "list-hit" };
  }
  if (segment.adHoc) {
    return judgeSegment(segment, segment.adHoc.script, deps);
  }
  if (matchesAny(segment.text, config.allow)) {
    return { kind: "allow" };
  }
  return { kind: "human-review", reason: "fallthrough" };
}

// Among equally restrictive review verdicts, a deliberate list hit outranks a
// fallthrough so the prompt labels the more informative path.
function restrictiveness(verdict: Verdict): number {
  switch (verdict.kind) {
    case "deny":
      return 3;
    case "human-review":
      return verdict.reason === "fallthrough" ? 1 : 2;
    case "allow":
      return 0;
  }
}

function mostRestrictive(verdicts: Verdict[]): Verdict {
  return verdicts.reduce((worst, v) => (restrictiveness(v) > restrictiveness(worst) ? v : worst));
}

export async function decide(
  command: string,
  config: GuardConfig,
  deps: EngineDeps,
): Promise<Verdict> {
  const parsed = await parseSegments(command, config.interpreters);

  let verdict: Verdict;
  if (!parsed.ok) {
    verdict = { kind: "human-review", reason: "fallthrough" };
  } else {
    verdict = mostRestrictive(
      await Promise.all(parsed.segments.map((s) => classifySegment(s, config, deps))),
    );
    if (verdict.kind === "human-review") {
      verdict = { ...verdict, segments: parsed.segments.map((s) => s.text) };
    }
  }

  if (verdict.kind === "human-review" && !deps.interactive) {
    return { kind: "deny", message: NON_INTERACTIVE_DENIAL_MESSAGE };
  }
  return verdict;
}
