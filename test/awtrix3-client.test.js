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

test('AWTRIX 3 client keeps caller headers immutable and preserves multipart content type', async () => {
  const axiosMock = createRecordingAxios();
  const Client = loadClientWithAxios(axiosMock);
  const client = new Client({ ip: '192.0.2.10' });
  const headers = {
    'Content-Type': 'text/plain',
    'X-Request-Id': 'request-1',
  };

  await client.post('rtttl', 'melody', headers);
  const form = new FormData();
  form.append('image', Buffer.from('icon'), { filename: 'icon.jpg' });
  await client.upload('edit', form);

  assert.deepEqual(headers, {
    'Content-Type': 'text/plain',
    'X-Request-Id': 'request-1',
  });
  assert.notEqual(axiosMock.calls[0].config.headers, headers);
  assert.equal(axiosMock.calls[0].config.headers['Content-Type'], 'text/plain');
  assert.match(axiosMock.calls[1].config.headers['content-type'], /^multipart\/form-data; boundary=/);
  assert.equal(axiosMock.calls[1].config.headers['Content-Type'], undefined);
});

test('AWTRIX 3 client brackets IPv6 URLs without treating host ports as IPv6', async () => {
  const axiosMock = createRecordingAxios();
  const Client = loadClientWithAxios(axiosMock);
  const client = new Client({ ip: '2001:db8::10' });

  await client.get('stats');
  client.setIp('[2001:db8::11]');
  await client.getDirect('/api/stats');
  client.setIp('awtrix.local:8080');
  await client.post('power', { power: true });

  assert.deepEqual(axiosMock.calls.map((call) => call.url), [
    'http://[2001:db8::10]/api/stats',
    'http://[2001:db8::11]/api/stats',
    'http://awtrix.local:8080/api/power',
  ]);
});
