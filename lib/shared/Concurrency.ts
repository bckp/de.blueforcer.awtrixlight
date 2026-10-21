/**
 * Executes an array of items with a concurrency limit.
 *
 * @param items The items to process
 * @param limit Maximum number of concurrent executions
 * @param handler The async function to execute for each item
 * @returns Array of results in the same order as the input items
 */
const runWithConcurrencyLimit = async <T, R>(
  items: readonly T[],
  limit: number,
  handler: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      const item = items[index];
      nextIndex += 1;
      results[index] = await handler(item, index);
    }
  };

  const concurrency = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return results;
};

export default runWithConcurrencyLimit;
