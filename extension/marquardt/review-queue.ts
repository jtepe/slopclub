/**
 * A FIFO mutex for interactive review dialogs.
 *
 * Pi can preflight sibling tool calls concurrently, while its UI has only one
 * active dialog. Holding this mutex for the complete review flow prevents a
 * later call from replacing an earlier call's prompt.
 */
export class ReviewQueue {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(review: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await review();
    } finally {
      release();
    }
  }
}
