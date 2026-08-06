const assert = require('node:assert/strict');
const test = require('node:test');

const Icons = require('../.homeybuild/lib/awtrix3/List/Icons').default;

const deferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createHarness = (getImages) => {
  let nextTimer = 1;
  const timerCalls = [];
  const clearTimerCalls = [];
  const api = {
    getImagesCalls: 0,
    async getImages() {
      this.getImagesCalls += 1;
      return getImages(this.getImagesCalls);
    },
  };
  const device = {
    homey: {
      __(key) {
        return key;
      },
      setTimeout(callback, ms) {
        const timer = nextTimer;
        nextTimer += 1;
        timerCalls.push({ callback, ms, timer });
        return timer;
      },
      clearTimeout(timer) {
        clearTimerCalls.push(timer);
      },
    },
  };

  return {
    api,
    clearTimerCalls,
    icons: new Icons(api, device),
    timerCalls,
  };
};

test('AWTRIX 3 icon list coalesces concurrent HTML provider loads and keeps its 120 second TTL', async () => {
  const load = deferred();
  const harness = createHarness(() => load.promise);

  const first = harness.icons.all();
  const second = harness.icons.all();
  await Promise.resolve();

  assert.equal(harness.api.getImagesCalls, 1);

  load.resolve([{ name: 'homey.jpg' }]);
  const expected = [
    {
      name: 'list.icons.empty.name',
      id: '-',
      description: 'list.icons.empty.description',
    },
    { name: 'homey', id: 'homey' },
  ];
  assert.deepEqual(await first, expected);
  assert.deepEqual(await second, expected);
  assert.equal(harness.timerCalls.at(-1).ms, 120000);
});

test('AWTRIX 3 icon list propagates a failed load and retries instead of caching an empty list', async () => {
  const sourceError = new Error('HTML provider failed');
  const harness = createHarness(async (callNumber) => {
    if (callNumber === 1) {
      throw sourceError;
    }
    return [{ name: 'retry.gif' }];
  });

  const results = await Promise.allSettled([harness.icons.all(), harness.icons.all()]);
  assert.equal(harness.api.getImagesCalls, 1);
  assert.deepEqual(results.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(results[0].reason, sourceError);
  assert.equal(results[1].reason, sourceError);

  assert.deepEqual(await harness.icons.all(), [
    {
      name: 'list.icons.empty.name',
      id: '-',
      description: 'list.icons.empty.description',
    },
    { name: 'retry', id: 'retry' },
  ]);
  assert.equal(harness.api.getImagesCalls, 2);
});

test('AWTRIX 3 icon cache can be invalidated explicitly', async () => {
  const harness = createHarness(async (callNumber) => [{ name: `icon-${callNumber}.gif` }]);

  await harness.icons.all();
  harness.icons.invalidate();

  assert.deepEqual(harness.clearTimerCalls, [1]);
  assert.deepEqual(await harness.icons.all(), [
    {
      name: 'list.icons.empty.name',
      id: '-',
      description: 'list.icons.empty.description',
    },
    { name: 'icon-2', id: 'icon-2' },
  ]);
  assert.equal(harness.api.getImagesCalls, 2);
});
