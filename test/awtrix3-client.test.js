const assert = require('node:assert/strict');
const FormData = require('form-data');
const Module = require('node:module');
const test = require('node:test');

const { Status } = require('../.homeybuild/lib/awtrix3/Api/Response');

const loadClientWithAxios = (axiosMock) => {
  const originalLoad = Module._load;

  Module._load = function load(request, parent, isMain) {
    if (request === 'axios') {
      return axiosMock;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../.homeybuild/lib/awtrix3/Api/Client');
    delete require.cache[modulePath];
    // eslint-disable-next-line global-require
    return require('../.homeybuild/lib/awtrix3/Api/Client').default;
  } finally {
    Module._load = originalLoad;
  }
};

const createRecordingAxios = () => {
  const calls = [];
  const response = {
    status: 200,
    statusText: 'OK',
    data: { ok: true },
    headers: { 'content-type': 'application/json' },
  };

  return {
    calls,
    error: undefined,
    response,
    async get(url, config) {
      calls.push({ method: 'GET', url, config });
      if (this.error) throw this.error;
      return this.response;
    },
    async post(url, data, config) {
      calls.push({
        method: 'POST', url, data, config,
      });
      if (this.error) throw this.error;
      return this.response;
    },
    isAxiosError(error) {
      return error?.isAxiosError === true;
    },
  };
};

test('AWTRIX 3 client disables redirects and uses only the axios timeout for every request type', async () => {
  const axiosMock = createRecordingAxios();
  const Client = loadClientWithAxios(axiosMock);
  const client = new Client({ ip: '192.0.2.10', user: 'homey', pass: 'secret' });
  const originalSetTimeout = global.setTimeout;
  let timerCount = 0;

  global.setTimeout = () => {
    timerCount += 1;
  };

  try {
    await client.get('stats');
    await client.getDirect('api/stats');
    await client.post('power', { power: true });
    await client.upload('edit', new FormData());
  } finally {
    global.setTimeout = originalSetTimeout;
  }

  assert.equal(axiosMock.calls.length, 4);
  const expectedAuthorization = `Basic ${Buffer.from('homey:secret').toString('base64')}`;
  for (const call of axiosMock.calls) {
    assert.equal(call.config.timeout, 10000);
    assert.equal(call.config.maxRedirects, 0);
    assert.equal(Object.hasOwn(call.config, 'signal'), false);
    assert.equal(call.config.headers.Authorization, expectedAuthorization);
  }
  assert.equal(timerCount, 0);
});

test('AWTRIX 3 client maps a mocked 302 response to Status.Error', async () => {
  const axiosMock = createRecordingAxios();
  const redirectError = new Error('Request failed with status code 302');
  redirectError.isAxiosError = true;
  redirectError.response = { status: 302 };
  axiosMock.error = redirectError;
  const Client = loadClientWithAxios(axiosMock);
  const client = new Client({ ip: '192.0.2.10' });

  const response = await client.get('stats');

  assert.equal(response.status, Status.Error);
  assert.equal(axiosMock.calls[0].config.maxRedirects, 0);
});

test('AWTRIX 3 debug logs redact authorization while axios receives the real token', async () => {
  const axiosMock = createRecordingAxios();
  axiosMock.response.headers = {
    Authorization: 'response-secret',
    'Content-Type': 'application/json',
  };
  const Client = loadClientWithAxios(axiosMock);
  const logs = [];
  const client = new Client({
    ip: '192.0.2.10',
    user: 'homey',
    pass: 'secret',
    log(entry) {
      logs.push(entry);
    },
  });
  client.setDebug(true);

  await client.post('power', { power: true });

  const expectedAuthorization = `Basic ${Buffer.from('homey:secret').toString('base64')}`;
  assert.equal(axiosMock.calls[0].config.headers.Authorization, expectedAuthorization);
  assert.equal(logs[0].headers.Authorization, '<redacted>');
  assert.equal(logs[1].dump.headers.Authorization, '<redacted>');
  assert.equal(JSON.stringify(logs).includes(expectedAuthorization), false);
  assert.equal(JSON.stringify(logs).includes('response-secret'), false);
});
