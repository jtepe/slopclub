import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

/** Await Pi's editor before releasing the blocked call or the review queue. */
export async function rejectWithAdvice(ui: Pick<ExtensionUIContext, "editor">, command: string) {
  const advice = await ui.editor(`Reject bash command — explain why or suggest an alternative:\n\n${command}`);
  return {
    block: true as const,
    reason: advice?.trim()
      ? `Tool call rejected with advice:\n${advice}`
      : "Tool call rejected by user (no advice provided).",
  };
}
