import assert from "node:assert/strict";
import test from "node:test";
import { ReviewQueue } from "./review-queue.ts";

test("review queue presents concurrent reviews one at a time in FIFO order", async () => {
  const queue = new ReviewQueue();
  const started: string[] = [];
  const release: Array<() => void> = [];

  const review = (name: string) =>
    queue.run(async () => {
      started.push(name);
      await new Promise<void>((resolve) => release.push(resolve));
      return name;
    });

  const first = review("first");
  const second = review("second");
  await Promise.resolve();
  assert.deepEqual(started, ["first"]);

  release.shift()!();
  await first;
  assert.deepEqual(started, ["first", "second"]);

  release.shift()!();
  assert.equal(await second, "second");
});

test("a failed review releases the next queued review", async () => {
  const queue = new ReviewQueue();
  const failed = queue.run(async () => {
    throw new Error("cancelled");
  });
  const second = queue.run(async () => "second");

  await assert.rejects(failed);
  assert.equal(await second, "second");
});
