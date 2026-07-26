const assert = require('node:assert/strict');
const test = require('node:test');

const AwtrixNgPoll = require('../.homeybuild/lib/awtrixng/Device/Poll').default;

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
  const poll = new AwtrixNgPoll(callback, timerHost, 60000);

  assert.equal(poll.isActive(), false);

  poll.start();
  assert.equal(poll.isActive(), true);
  assert.equal(timerHost.setCalls.length, 1);
  assert.equal(timerHost.setCalls[0].callback, callback);
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
