const assert = require('node:assert/strict');
const test = require('node:test');

const { Status } = require('../.homeybuild/lib/awtrix3/Api/Response');
const Client = require('../.homeybuild/lib/awtrix3/Api/Client').default;

const createRecordingFetch = () => {
  const calls = [];
  const responseObj = {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify({ ok: true }),
  };

  const fetchMock = async (url, config) => {
    calls.push({ method: config?.method || 'GET', url, config });
    if (fetchMock.error) throw fetchMock.error;
    return fetchMock.response;
  };

  fetchMock.calls = calls;
  fetchMock.response = responseObj;
  fetchMock.error = undefined;

  return fetchMock;
};

test('AWTRIX 3 client disables redirects and uses only the manual redirect for every request type', async () => {
  const originalFetch = global.fetch;
  const fetchMock = createRecordingFetch();
  global.fetch = fetchMock;

  const client = new Client({ ip: '192.0.2.10', user: 'homey', pass: 'secret' });
  const originalSetTimeout = global.setTimeout;
  let timerCount = 0;

  global.setTimeout = (cb, time) => {
    timerCount += 1;
    return originalSetTimeout(cb, time);
  };

  try {
    await client.get('stats');
    await client.getDirect('api/stats');
    await client.post('power', { power: true });
    await client.upload('edit', new FormData());
  } finally {
    global.setTimeout = originalSetTimeout;
    global.fetch = originalFetch;
  }

  assert.equal(fetchMock.calls.length, 4);
  const expectedAuthorization = `Basic ${Buffer.from('homey:secret').toString('base64')}`;
  for (const call of fetchMock.calls) {
    assert.equal(call.config.redirect, 'manual');
    assert.equal(Object.hasOwn(call.config, 'signal'), true);
    assert.equal(call.config.headers.Authorization, expectedAuthorization);
  }
  assert.equal(timerCount, 4);
});

test('AWTRIX 3 client maps a mocked 302 response to Status.Error', async () => {
  const originalFetch = global.fetch;
  const fetchMock = createRecordingFetch();
  fetchMock.response = {
    ok: false,
    status: 302,
    statusText: 'Found',
    headers: new Headers(),
    text: async () => 'Found',
  };
  global.fetch = fetchMock;

  const client = new Client({ ip: '192.0.2.10' });

  try {
    const response = await client.get('stats');
    assert.equal(response.status, Status.Error);
    assert.equal(fetchMock.calls[0].config.redirect, 'manual');
  } finally {
    global.fetch = originalFetch;
  }
});

test('AWTRIX 3 debug logs redact authorization while fetch receives the real token', async () => {
  const originalFetch = global.fetch;
  const fetchMock = createRecordingFetch();
  fetchMock.response.headers = new Headers({
    Authorization: 'response-secret',
    'Content-Type': 'application/json',
  });
  global.fetch = fetchMock;

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

  try {
    await client.post('power', { power: true });

    const expectedAuthorization = `Basic ${Buffer.from('homey:secret').toString('base64')}`;
    assert.equal(fetchMock.calls[0].config.headers.Authorization, expectedAuthorization);
    assert.equal(logs[0].headers.Authorization, '<redacted>');
    assert.equal(logs[1].dump.headers.authorization, '<redacted>');
    assert.equal(JSON.stringify(logs).includes(expectedAuthorization), false);
    assert.equal(JSON.stringify(logs).includes('response-secret'), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('AWTRIX 3 client keeps caller headers immutable and preserves multipart content type', async () => {
  const originalFetch = global.fetch;
  const fetchMock = createRecordingFetch();
  global.fetch = fetchMock;

  const client = new Client({ ip: '192.0.2.10' });
  const headers = {
    'Content-Type': 'text/plain',
    'X-Request-Id': 'request-1',
  };

  try {
    await client.post('rtttl', 'melody', headers);
    const form = new FormData();
    form.append('image', new Blob(['icon']), 'icon.jpg');
    await client.upload('edit', form);

    assert.deepEqual(headers, {
      'Content-Type': 'text/plain',
      'X-Request-Id': 'request-1',
    });
    assert.notEqual(fetchMock.calls[0].config.headers, headers);
    assert.equal(fetchMock.calls[0].config.headers['Content-Type'], 'text/plain');
    assert.equal(fetchMock.calls[1].config.headers['Content-Type'], undefined);
  } finally {
    global.fetch = originalFetch;
  }
});

test('AWTRIX 3 client brackets IPv6 URLs without treating host ports as IPv6', async () => {
  const originalFetch = global.fetch;
  const fetchMock = createRecordingFetch();
  global.fetch = fetchMock;

  const client = new Client({ ip: '2001:db8::10' });

  try {
    await client.get('stats');
    client.setIp('[2001:db8::11]');
    await client.getDirect('/api/stats');
    client.setIp('awtrix.local:8080');
    await client.post('power', { power: true });

    assert.deepEqual(fetchMock.calls.map((call) => call.url), [
      'http://[2001:db8::10]/api/stats',
      'http://[2001:db8::11]/api/stats',
      'http://awtrix.local:8080/api/power',
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});
