import { createRequire } from "node:module";
import { Parser, Language, type Node } from "web-tree-sitter";

export type ReviewReason = "list-hit" | "fallthrough" | "judge-critical" | "judge-failure";

export type Verdict =
  | { kind: "allow" }
  | { kind: "human-review"; reason: ReviewReason; segments?: string[] }
  | { kind: "deny"; message: string };

export interface GuardConfig {
  allow: string[];
  humanReview: string[];
  deny: string[];
}

export interface EngineDeps {
  interactive: boolean;
}

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

type ParseResult = { ok: true; segments: string[] } | { ok: false };

async function parseSegments(command: string): Promise<ParseResult> {
  const tree = (await getParser()).parse(command);
  if (!tree || tree.rootNode.hasError) return { ok: false };

  const segments: string[] = [];
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
      segments.push(parent?.type === "redirected_statement" ? parent.text : node.text);
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

function classifySegment(segment: string, config: GuardConfig): Verdict {
  if (matchesAny(segment, config.deny)) {
    return { kind: "deny", message: POLICY_DENIAL_MESSAGE };
  }
  if (matchesAny(segment, config.humanReview)) {
    return { kind: "human-review", reason: "list-hit" };
  }
  if (matchesAny(segment, config.allow)) {
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
  const parsed = await parseSegments(command);

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
