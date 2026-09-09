import assert from "node:assert/strict";
import test from "node:test";
import { rejectWithAdvice } from "./reject-advice.ts";
import { ReviewQueue } from "./review-queue.ts";

test("rejection waits for Pi's editor and preserves multiline advice", async () => {
  const queue = new ReviewQueue();
  let submit!: (text: string) => void;
  let opened!: () => void;
  const editorOpened = new Promise<void>((resolve) => { opened = resolve; });
  let settled = false;
  let siblingStarted = false;
  const result = queue.run(() => rejectWithAdvice({
    editor: async (title) => {
      assert.ok(title.includes("npm publish"));
      opened();
      return new Promise<string>((resolve) => { submit = resolve; });
    },
  }, "npm publish"));
  void result.then(() => { settled = true; });
  const sibling = queue.run(async () => { siblingStarted = true; });
  await editorOpened;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  assert.equal(siblingStarted, false);
  const advice = "Do not publish yet.\nRun the tests first.";
  submit(advice);
  assert.deepEqual(await result, {
    block: true,
    reason: `Tool call rejected with advice:\n${advice}`,
  });
  await sibling;
  assert.equal(siblingStarted, true);
});

for (const advice of [undefined, "", " \n\t"]) {
  test(`empty or cancelled advice fails closed (${JSON.stringify(advice)})`, async () => {
    assert.deepEqual(await rejectWithAdvice({ editor: async () => advice }, "npm publish"), {
      block: true,
      reason: "Tool call rejected by user (no advice provided).",
    });
  });
}
