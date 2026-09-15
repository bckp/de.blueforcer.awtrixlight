const assert = require('node:assert/strict');
const test = require('node:test');

const FetchTransport = require('../.homeybuild/lib/awtrixng/Http/FetchTransport').default;

test('system callback URL is never exposed by the NG transport debug logger', async () => {
  const originalFetch = global.fetch;
  const secretUrl = 'http://192.0.2.1/api/app/de.blueforcer.awtrixlight/awtrixng/button/aabb/secret-token';
  const logs = [];
  const requests = [];
  global.fetch = async (url, config) => {
    requests.push({ url, config });
    return new Response(JSON.stringify({ buttonCallback: secretUrl, hostname: 'panel' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const transport = new FetchTransport({
      baseUrl: 'http://panel.local',
      debug: true,
      log: (entry) => logs.push(entry),
    });

    const written = await transport.request({
      method: 'PUT',
      path: '/api/v1/system',
      body: { buttonCallback: secretUrl },
    });
    const read = await transport.request({
      method: 'GET',
      path: '/api/v1/system',
    });

    assert.equal(written.data.buttonCallback, secretUrl, 'redaction must not change API data');
    assert.equal(read.data.buttonCallback, secretUrl);
    assert.equal(JSON.parse(requests[0].config.body).buttonCallback, secretUrl);
    assert.equal(JSON.stringify(logs).includes(secretUrl), false);
    assert.equal(logs[0].data, '<redacted>');
    assert.equal(logs[1].dump.data, '<redacted>');
    assert.equal(logs[3].dump.data, '<redacted>');
  } finally {
    global.fetch = originalFetch;
  }
});

test('system debug logger redacts a callback URL echoed inside an API error body', async () => {
  const originalFetch = global.fetch;
  const secretUrl = 'http://192.0.2.1/api/app/de.blueforcer.awtrixlight/awtrixng/button/aabb/secret-token';
  const logs = [];
  global.fetch = async () => new Response(JSON.stringify({
    error: { code: 'validationFailed', message: secretUrl, field: 'buttonCallback' },
  }), { status: 422, headers: { 'content-type': 'application/json' } });

  try {
    const transport = new FetchTransport({
      baseUrl: 'http://panel.local', debug: true, log: (entry) => logs.push(entry),
    });
    await assert.rejects(() => transport.request({
      method: 'PUT', path: '/api/v1/system', body: { buttonCallback: secretUrl },
    }), (error) => {
      assert.equal(error.status, 422);
      assert.equal(error.rawBody.error.message, secretUrl, 'API error must remain unchanged');
      return true;
    });
    assert.equal(JSON.stringify(logs).includes(secretUrl), false);
    assert.equal(logs[0].data, '<redacted>');
    assert.equal(logs[1].dump.data, '<redacted>');
    assert.equal(logs[2].arg, '<redacted>');
  } finally {
    global.fetch = originalFetch;
  }
});
