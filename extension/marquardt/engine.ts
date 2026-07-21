import { createRequire } from "node:module";
import { join, resolve } from "node:path/posix";
import { Parser, Language, type Node } from "web-tree-sitter";

export type ReviewReason = "list-hit" | "fallthrough" | "judge-critical" | "judge-failure";

export type Verdict =
  | { kind: "allow"; via?: "judge" }
  | { kind: "human-review"; reason: ReviewReason; explanation?: string; segments?: string[] }
  | { kind: "deny"; message: string };

export type InterpreterTable = Record<string, string[]>;

export interface GuardConfig {
  allow: string[];
  humanReview: string[];
  deny: string[];
  interpreters: InterpreterTable;
  protectedPaths: string[];
}

export interface PathEnv {
  cwd: string;
  home: string;
}

export interface JudgeInput {
  script: string;
  commandLine: string;
}

export type JudgeFn = (input: JudgeInput) => Promise<unknown>;

export interface EngineDeps {
  interactive: boolean;
  judge: JudgeFn;
  env: PathEnv;
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

export const DEFAULT_PROTECTED_PATHS: string[] = [
  ".pi/marquardt.json",
  ".git/hooks",
  "~/.bashrc",
  "~/.bash_profile",
  "~/.bash_login",
  "~/.bash_logout",
  "~/.bash_aliases",
  "~/.profile",
  "~/.zshrc",
  "~/.zshenv",
  "~/.zprofile",
  "~/.zlogin",
  "~/.zlogout",
  "~/.config/fish/config.fish",
  "~/.config/fish/conf.d",
  "~/.local/bin",
  "~/bin",
];

export const JUDGE_UNAVAILABLE_EXPLANATION = "judge unavailable";

export const PROTECTED_PATH_DENIAL_MESSAGE = "write to protected path denied by policy";

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

function expandTilde(path: string, home: string): string {
  if (path === "~") return home;
  return path.startsWith("~/") ? join(home, path.slice(2)) : path;
}

function pathSegments(path: string): string[] {
  return path.split("/").filter((part) => part.length > 0);
}

// A pattern names a file or a directory root; the named path and everything
// below it are protected. Patterns starting with `~` or `/` anchor at that
// absolute location, while bare patterns match at any depth, so `.git/hooks`
// covers the hook directory of every repository the target could reach.
function isProtectedPath(target: string, config: GuardConfig, env: PathEnv): boolean {
  const path = pathSegments(resolve(env.cwd, expandTilde(target, env.home)));
  return config.protectedPaths.some((pattern) => {
    const anchored = pattern.startsWith("~") || pattern.startsWith("/");
    const wanted = pathSegments(
      anchored ? resolve(expandTilde(pattern, env.home)) : pattern,
    );
    if (wanted.length === 0 || wanted.length > path.length) return false;
    const lastStart = anchored ? 0 : path.length - wanted.length;
    for (let start = 0; start <= lastStart; start++) {
      if (wanted.every((segment, i) => path[start + i] === segment)) return true;
    }
    return false;
  });
}

export function decideWrite(target: string, config: GuardConfig, env: PathEnv): Verdict {
  if (isProtectedPath(target, config, env)) {
    return { kind: "deny", message: PROTECTED_PATH_DENIAL_MESSAGE };
  }
  return { kind: "allow" };
}

interface Segment {
  text: string;
  adHoc?: { script: string };
}

type ParseResult =
  | { ok: true; segments: Segment[]; protectedWrite: boolean }
  | { ok: false };

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

const WRITE_REDIRECT_OPERATORS = new Set([">", ">>", ">|", "&>", "&>>", ">&", "<>"]);

// The literal text a redirect destination resolves to, or null when it
// contains anything the engine cannot evaluate statically (expansions,
// substitutions). Quotes are stripped so `> "out"` and `> out` agree.
function literalPathText(node: Node): string | null {
  switch (node.type) {
    case "word":
    case "number":
      return node.text;
    case "raw_string":
      return node.text.slice(1, -1);
    case "ansi_c_string":
      return node.text.slice(2, -1);
    case "string":
      if (node.namedChildren.some((child) => child !== null && child.type !== "string_content")) {
        return null;
      }
      return node.text.slice(1, -1);
    case "concatenation": {
      let text = "";
      for (const child of node.namedChildren) {
        const part = child === null ? null : literalPathText(child);
        if (part === null) return null;
        text += part;
      }
      return text;
    }
    default:
      return null;
  }
}

type RedirectScan = "none" | "protected" | "opaque";

// A write-redirect with a destination the engine cannot read is opaque; the
// caller fails the whole command closed rather than risk a protected target
// hiding behind a variable. Dup targets like `2>&1` resolve to a bare
// numeral, which no protected pattern can match.
function classifyFileRedirect(node: Node, config: GuardConfig, env: PathEnv): RedirectScan {
  const operator = node.children.find((token) => token !== null && !token.isNamed);
  if (!operator || !WRITE_REDIRECT_OPERATORS.has(operator.type)) return "none";
  const destination = node.childForFieldName("destination");
  const literal = destination ? literalPathText(destination) : null;
  if (literal === null) return "opaque";
  return isProtectedPath(literal, config, env) ? "protected" : "none";
}

async function parseSegments(
  command: string,
  config: GuardConfig,
  env: PathEnv,
): Promise<ParseResult> {
  const tree = (await getParser()).parse(command);
  if (!tree || tree.rootNode.hasError) return { ok: false };

  const segments: Segment[] = [];
  let covered = true;
  let protectedWrite = false;
  const visit = (node: Node) => {
    if (!COVERED_NODE_TYPES.has(node.type)) {
      covered = false;
      return;
    }
    if (node.type === "redirected_statement" && !node.childForFieldName("body")) {
      covered = false;
      return;
    }
    if (node.type === "file_redirect") {
      const redirect = classifyFileRedirect(node, config, env);
      if (redirect === "opaque") {
        covered = false;
        return;
      }
      if (redirect === "protected") protectedWrite = true;
    }
    if (node.type === "command") {
      const parent = node.parent;
      const container = parent?.type === "redirected_statement" ? parent : node;
      segments.push({
        text: container.text,
        adHoc: detectAdHocScript(node, container, config.interpreters),
      });
    }
    for (const child of node.namedChildren) {
      if (child) visit(child);
    }
  };
  visit(tree.rootNode);

  if (!covered || segments.length === 0) return { ok: false };
  return { ok: true, segments, protectedWrite };
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
    if (answer.verdict === "non-critical") return { kind: "allow", via: "judge" };
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
  const parsed = await parseSegments(command, config, deps.env);

  let verdict: Verdict;
  if (!parsed.ok) {
    verdict = { kind: "human-review", reason: "fallthrough" };
  } else if (parsed.protectedWrite) {
    verdict = { kind: "deny", message: PROTECTED_PATH_DENIAL_MESSAGE };
  } else {
    const verdicts = await Promise.all(
      parsed.segments.map((s) => classifySegment(s, config, deps)),
    );
    verdict = mostRestrictive(verdicts);
    if (verdict.kind === "human-review") {
      verdict = { ...verdict, segments: parsed.segments.map((s) => s.text) };
    } else if (verdict.kind === "allow") {
      // An allow that involved the judge is a distinct outcome ("approved
      // by judge") from a pure list allow, so provenance survives merging.
      const judged = verdicts.some((v) => v.kind === "allow" && v.via === "judge");
      verdict = judged ? { kind: "allow", via: "judge" } : { kind: "allow" };
    }
  }

  if (verdict.kind === "human-review" && !deps.interactive) {
    return { kind: "deny", message: NON_INTERACTIVE_DENIAL_MESSAGE };
  }
  return verdict;
}
