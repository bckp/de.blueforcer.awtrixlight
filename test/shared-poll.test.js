const assert = require('node:assert/strict');
const test = require('node:test');

const Poll = require('../.homeybuild/lib/shared/Poll').default;

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

test('shared poll starts, restarts and stops one interval', () => {
  const timerHost = new FakeTimerHost();
  const callback = () => undefined;
  const poll = new Poll(callback, timerHost, { intervalMs: 60000, onError: () => {} });

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
});

test('shared poll skips a tick while its callback is still running', async () => {
  const timerHost = new FakeTimerHost();
  const firstRun = deferred();
  let callbackCalls = 0;
  const poll = new Poll(async () => {
    callbackCalls += 1;
    if (callbackCalls === 1) {
      await firstRun.promise;
    }
  }, timerHost, { intervalMs: 60000, onError: () => {} });

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

test('shared poll reports callback rejection and remains usable', async () => {
  const timerHost = new FakeTimerHost();
  const callbackError = new Error('poll failed');
  const errors = [];
  let callbackCalls = 0;
  const poll = new Poll(async () => {
    callbackCalls += 1;
    if (callbackCalls === 1) {
      throw callbackError;
    }
  }, timerHost, { intervalMs: 60000, onError: (error) => errors.push(error) });

  poll.start();
  const intervalCallback = timerHost.setCalls[0].callback;
  await intervalCallback();
  await flushTasks();

  assert.deepEqual(errors, [callbackError]);
  assert.equal(poll.isActive(), true);

  await intervalCallback();
  assert.equal(callbackCalls, 2);
});

test('shared poll extend switches to the failsafe interval until stopped', () => {
  const timerHost = new FakeTimerHost();
  const poll = new Poll(() => {}, timerHost, { intervalMs: 10, failsafeMs: 50, onError: () => {} });

  poll.start();
  assert.equal(poll.isActive(), true);
  assert.equal(poll.isExtended(), false);
  assert.equal(timerHost.setCalls[0].intervalMs, 10);

  poll.extend();
  assert.equal(poll.isExtended(), true);
  assert.equal(timerHost.setCalls[1].intervalMs, 50);
  assert.deepEqual(timerHost.clearCalls, [1]);

  poll.stop();
  assert.equal(poll.isActive(), false);
  assert.equal(poll.isExtended(), false);
  assert.deepEqual(timerHost.clearCalls, [1, 2]);
});

test('shared poll start resets the extended mode back to the regular interval', () => {
  const timerHost = new FakeTimerHost();
  const poll = new Poll(() => {}, timerHost, { intervalMs: 10, failsafeMs: 50, onError: () => {} });

  poll.extend();
  assert.equal(poll.isExtended(), true);

  poll.start();
  assert.equal(poll.isExtended(), false);
  assert.equal(timerHost.setCalls[1].intervalMs, 10);
});

test('shared poll extend without failsafeMs throws instead of silently doing nothing', () => {
  const timerHost = new FakeTimerHost();
  const poll = new Poll(() => {}, timerHost, { intervalMs: 10, onError: () => {} });

  poll.start();
  assert.throws(() => poll.extend(), /failsafeMs/);
  assert.equal(poll.isActive(), true, 'the regular interval keeps running');
  assert.equal(poll.isExtended(), false);
});
