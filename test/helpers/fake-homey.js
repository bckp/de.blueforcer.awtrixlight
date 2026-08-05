const createFakeHomey = () => {
  let now = 0;
  let nextTimerId = 1;
  const timers = new Map();
  const setIntervalCalls = [];
  const clearIntervalCalls = [];

  const homey = {
    __: (key) => key,
    setIntervalCalls,
    clearIntervalCalls,
    setInterval(callback, intervalMs) {
      const timer = {
        id: nextTimerId,
        callback,
        intervalMs,
        nextRunAt: now + intervalMs,
      };
      nextTimerId += 1;
      timers.set(timer.id, timer);
      setIntervalCalls.push(timer);
      return timer.id;
    },
    clearInterval(timerId) {
      clearIntervalCalls.push(timerId);
      timers.delete(timerId);
    },
  };

  homey.tick = async (durationMs) => {
    const targetTime = now + durationMs;
    let nextRunAt = Math.min(
      ...[...timers.values()]
        .map((timer) => timer.nextRunAt)
        .filter((runAt) => runAt <= targetTime),
    );

    while (Number.isFinite(nextRunAt)) {
      const dueTime = nextRunAt;
      now = dueTime;
      const dueTimers = [...timers.values()]
        .filter((timer) => timer.nextRunAt === dueTime)
        .sort((left, right) => left.id - right.id);

      for (const timer of dueTimers) {
        if (!timers.has(timer.id)) {
          continue;
        }
        timer.nextRunAt += timer.intervalMs;
        await timer.callback();
      }

      nextRunAt = Math.min(
        ...[...timers.values()]
          .map((timer) => timer.nextRunAt)
          .filter((runAt) => runAt <= targetTime),
      );
    }

    now = targetTime;
  };

  return homey;
};

const createFakeAwtrix3Device = ({ homey: suppliedHomey, available = true } = {}) => {
  const homey = suppliedHomey || createFakeHomey();
  const store = new Map();
  const capabilityValues = new Map();
  const calls = {
    log: [],
    error: [],
    setCapabilityValue: [],
    setSettings: [],
    setAvailable: [],
    setUnavailable: [],
    setStoreValue: [],
    pollStart: [],
    pollStop: [],
    pollExtend: [],
  };

  const device = {
    homey,
    available,
    failCritical: false,
    failCount: 0,
    failThreshold: 3,
    calls,
    capabilityValues,
    store,
    poll: {
      extended: false,
      start() {
        calls.pollStart.push(undefined);
        this.extended = false;
      },
      stop() {
        calls.pollStop.push(undefined);
        this.extended = false;
      },
      extend() {
        calls.pollExtend.push(undefined);
        this.extended = true;
      },
      isExtended() {
        return this.extended;
      },
    },
    log(...args) {
      calls.log.push(args);
    },
    error(...args) {
      calls.error.push(args);
    },
    getAvailable() {
      return this.available;
    },
    async setAvailable() {
      calls.setAvailable.push(undefined);
      this.available = true;
    },
    async setUnavailable(message) {
      calls.setUnavailable.push(message);
      this.available = false;
    },
    async setCapabilityValue(id, value) {
      calls.setCapabilityValue.push({ id, value });
      capabilityValues.set(id, value);
    },
    async setSettings(settings) {
      calls.setSettings.push(settings);
    },
    getStoreValue(key) {
      return store.get(key);
    },
    async setStoreValue(key, value) {
      calls.setStoreValue.push({ key, value });
      store.set(key, value);
    },
    failsReset() {
      this.failCount = 0;
    },
    failsAdd() {
      this.failCount += 1;
    },
    failsExceeded() {
      return this.failCritical || this.failCount >= this.failThreshold;
    },
    failsCritical(value) {
      this.failCritical = value;
    },
  };

  return device;
};

const fakeAwtrix3Client = (initialResponse = {
  status: 0,
}) => ({
  calls: [],
  response: initialResponse,
  error: undefined,
  credentials: {
    user: '',
    pass: '',
  },
  ip: '',
  debug: false,
  async request(method, endpoint, data, headers) {
    this.calls.push({
      method,
      endpoint,
      data,
      headers,
    });
    if (this.error) {
      throw this.error;
    }
    return this.response;
  },
  async get(endpoint) {
    return this.request('GET', endpoint);
  },
  async getDirect(endpoint) {
    return this.request('GET_DIRECT', endpoint);
  },
  async post(endpoint, data, headers) {
    return this.request('POST', endpoint, data, headers);
  },
  async upload(endpoint, data) {
    return this.request('UPLOAD', endpoint, data);
  },
  setCredentials(user, pass) {
    this.credentials = { user, pass };
  },
  setIp(ip) {
    this.ip = ip;
  },
  setDebug(debug) {
    this.debug = debug;
  },
});

const fakeAwtrixNgTransport = (initialResponse = {
  status: 200,
  headers: { 'content-type': 'application/json' },
  data: {},
}) => ({
  calls: [],
  response: initialResponse,
  error: undefined,
  async request(request) {
    this.calls.push(request);
    if (this.error) {
      throw this.error;
    }
    return this.response;
  },
});

module.exports = {
  createFakeHomey,
  createFakeAwtrix3Device,
  fakeAwtrix3Client,
  fakeAwtrixNgTransport,
};
