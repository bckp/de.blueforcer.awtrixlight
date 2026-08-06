const assert = require('node:assert/strict');
const test = require('node:test');

const AwtrixNgPoll = require('../.homeybuild/lib/awtrixng/Device/Poll').default;

const flushTasks = () => new Promise((resolve) => {
  setImmediate(resolve);
});

const deferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

class FakeTimerHost {

  nextTimer = 1;

  setCalls = [];

  clearCalls = [];

  setInterval(callback, intervalMs) {
    const timer = this.nextTimer;
    this.nextTimer += 1;
    this.setCalls.push({ callback, intervalMs, timer });
    return timer;
  }

  clearInterval(timer) {
    this.clearCalls.push(timer);
  }

}

test('AWTRIX NG poll starts, restarts and stops one interval', () => {
  const timerHost = new FakeTimerHost();
  const callback = () => undefined;
  const poll = new AwtrixNgPoll(callback, timerHost, 60000, () => {});

  assert.equal(poll.isActive(), false);

  poll.start();
  assert.equal(poll.isActive(), true);
  assert.equal(timerHost.setCalls.length, 1);
  assert.equal(timerHost.setCalls[0].intervalMs, 60000);
  assert.deepEqual(timerHost.clearCalls, []);

  poll.start();
  assert.equal(poll.isActive(), true);
  assert.equal(timerHost.setCalls.length, 2);
  assert.deepEqual(timerHost.clearCalls, [1]);

  poll.stop();
  assert.equal(poll.isActive(), false);
  assert.deepEqual(timerHost.clearCalls, [1, 2]);

  poll.stop();
  assert.deepEqual(timerHost.clearCalls, [1, 2]);
});

test('AWTRIX NG poll skips a tick while its callback is still running', async () => {
  const timerHost = new FakeTimerHost();
  const firstRun = deferred();
  let callbackCalls = 0;
  const poll = new AwtrixNgPoll(async () => {
    callbackCalls += 1;
    if (callbackCalls === 1) {
      await firstRun.promise;
    }
  }, timerHost, 60000, () => {});

  poll.start();
  const intervalCallback = timerHost.setCalls[0].callback;
  const pendingRun = intervalCallback();
  await Promise.resolve();

  await intervalCallback();
  assert.equal(callbackCalls, 1);

  firstRun.resolve();
  await pendingRun;
  await intervalCallback();
  assert.equal(callbackCalls, 2);
});

test('AWTRIX NG poll reports callback rejection and remains usable', async () => {
  const timerHost = new FakeTimerHost();
  const callbackError = new Error('NG poll failed');
  const errors = [];
  let callbackCalls = 0;
  const poll = new AwtrixNgPoll(async () => {
    callbackCalls += 1;
    if (callbackCalls === 1) {
      throw callbackError;
    }
  }, timerHost, 60000, (error) => errors.push(error));

  poll.start();
  const intervalCallback = timerHost.setCalls[0].callback;
  await intervalCallback();
  await flushTasks();

  assert.deepEqual(errors, [callbackError]);
  assert.equal(poll.isActive(), true);

  await intervalCallback();
  assert.equal(callbackCalls, 2);
});
