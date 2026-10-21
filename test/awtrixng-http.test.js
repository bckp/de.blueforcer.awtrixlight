/* eslint-disable mocha/handle-done-callback -- node:test supplies a TestContext. */
const assert = require('node:assert/strict');
const test = require('node:test');

const http = require('../.homeybuild/lib/awtrixng/Http/Transport');
const FetchAwtrixNgHttpTransport = require('../.homeybuild/lib/awtrixng/Http/FetchTransport').default;

const { AwtrixNgHttpError } = http;

const createRecordingFetch = (responseFactory) => {
  const calls = [];

  const fetchMock = async (url, config) => {
    calls.push({ url, config });
    const mockedResponse = responseFactory(config);

    if (mockedResponse instanceof Error) {
      throw mockedResponse;
    }

    const body = mockedResponse.data === undefined ? null : new ReadableStream({
      start(controller) {
        const text = typeof mockedResponse.data === 'string' ? mockedResponse.data : JSON.stringify(mockedResponse.data);
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });
    return new Response(body, {
      status: mockedResponse.status,
      statusText: mockedResponse.statusText || 'OK',
      headers: mockedResponse.headers || {},
    });
  };

  fetchMock.calls = calls;
  return fetchMock;
};

test('AWTRIX NG HTTP contract module is importable after build', () => {
  assert.deepEqual(Object.keys(http), ['AwtrixNgHttpError']);
});

test('fake AWTRIX NG transport can round-trip a typed request shape at runtime', async () => {
  const calls = [];
  const fakeTransport = {
    async request(request) {
      calls.push(request);

      return {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
        data: {
          ok: true,
        },
      };
    },
  };

  const response = await fakeTransport.request({
    method: 'PATCH',
    path: '/api/v1/display',
    query: {
      dryRun: false,
      attempt: 1,
      empty: null,
      omitted: undefined,
    },
    headers: {
      'content-type': 'application/json',
    },
    body: {
      power: true,
    },
    responseType: 'json',
    timeoutMs: 5000,
  });

  assert.deepEqual(calls, [{
    method: 'PATCH',
    path: '/api/v1/display',
    query: {
      dryRun: false,
      attempt: 1,
      empty: null,
      omitted: undefined,
    },
    headers: {
      'content-type': 'application/json',
    },
    body: {
      power: true,
    },
    responseType: 'json',
    timeoutMs: 5000,
  }]);
  assert.deepEqual(response, {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
    data: {
      ok: true,
    },
  });
});

test('fetch AWTRIX NG transport maps GET, POST, PATCH and DELETE requests', async () => {
  const originalFetch = global.fetch;
  const recordingFetch = createRecordingFetch(() => ({
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
    data: {
      ok: true,
    },
  }));
  global.fetch = recordingFetch;

  try {
    const transport = new FetchAwtrixNgHttpTransport({
      baseUrl: 'http://192.0.2.10:8080/',
      timeoutMs: 10000,
    });

    await transport.request({ method: 'GET', path: '/api/v1/device' });
    await transport.request({ method: 'POST', path: '/api/v1/notifications', body: { text: 'hello' } });
    await transport.request({ method: 'PATCH', path: '/api/v1/display', body: { power: false } });
    await transport.request({ method: 'DELETE', path: '/api/v1/notifications/active' });

    assert.deepEqual(recordingFetch.calls.map((call) => ({
      method: call.config.method,
      url: call.url,
      data: call.config.body ? JSON.parse(call.config.body) : undefined,
    })), [{
      method: 'GET',
      url: 'http://192.0.2.10:8080/api/v1/device',
      data: undefined,
    }, {
      method: 'POST',
      url: 'http://192.0.2.10:8080/api/v1/notifications',
      data: { text: 'hello' },
    }, {
      method: 'PATCH',
      url: 'http://192.0.2.10:8080/api/v1/display',
      data: { power: false },
    }, {
      method: 'DELETE',
      url: 'http://192.0.2.10:8080/api/v1/notifications/active',
      data: undefined,
    }]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetch AWTRIX NG transport applies auth, JSON content type, query and timeout config', async () => {
  const originalFetch = global.fetch;
  const recordingFetch = createRecordingFetch(() => ({
    status: 200,
    headers: {
      'x-test': 'ok',
    },
    data: {
      power: true,
    },
  }));
  global.fetch = recordingFetch;

  try {
    const transport = new FetchAwtrixNgHttpTransport({
      baseUrl: 'http://awtrix-ng.local:8081',
      timeoutMs: 10000,
      auth: {
        username: 'homey',
        password: 'secret',
      },
    });

    const response = await transport.request({
      method: 'PATCH',
      path: 'api/v1/display',
      query: {
        dryRun: false,
        retry: 1,
      },
      body: {
        power: true,
      },
      timeoutMs: 2500,
    });

    assert.equal(recordingFetch.calls.length, 1);
    assert.equal(recordingFetch.calls[0].url, 'http://awtrix-ng.local:8081/api/v1/display?dryRun=false&retry=1');
    assert.equal(recordingFetch.calls[0].config.headers.Authorization, `Basic ${Buffer.from('homey:secret').toString('base64')}`);
    assert.equal(recordingFetch.calls[0].config.headers['Content-Type'], 'application/json');
    assert.equal(recordingFetch.calls[0].config.headers.Accept, '*/*');
    assert.equal(recordingFetch.calls[0].config.headers['User-Agent'], 'Homey/1.0');
    assert.deepEqual(response, {
      status: 200,
      headers: {
        'x-test': 'ok',
      },
      data: {
        power: true,
      },
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetch AWTRIX NG transport does not log requests by default', async () => {
  const originalFetch = global.fetch;
  const logs = [];
  const recordingFetch = createRecordingFetch(() => ({
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': 'application/json',
    },
    data: {
      ok: true,
    },
  }));
  global.fetch = recordingFetch;

  try {
    const transport = new FetchAwtrixNgHttpTransport({
      baseUrl: 'http://awtrix-ng.local',
      log: (entry) => logs.push(entry),
    });

    await transport.request({
      method: 'GET',
      path: '/api/v1/device',
    });

    assert.deepEqual(logs, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetch AWTRIX NG transport logs request and response in debug mode with redacted auth header', async () => {
  const originalFetch = global.fetch;
  const logs = [];
  const recordingFetch = createRecordingFetch(() => ({
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': 'application/json',
    },
    data: {
      ok: true,
    },
  }));
  global.fetch = recordingFetch;

  try {
    const transport = new FetchAwtrixNgHttpTransport({
      baseUrl: 'http://awtrix-ng.local',
      auth: {
        username: 'homey',
        password: 'secret',
      },
      debug: true,
      log: (entry) => logs.push(entry),
    });

    await transport.request({
      method: 'POST',
      path: '/api/v1/notifications',
      query: {
        dryRun: false,
      },
      body: {
        text: 'hello',
      },
    });

    assert.equal(recordingFetch.calls[0].config.headers.Authorization, `Basic ${Buffer.from('homey:secret').toString('base64')}`);
    assert.deepEqual(logs, [{
      message: 'POST',
      url: 'http://awtrix-ng.local/api/v1/notifications?dryRun=false',
      headers: {
        Accept: '*/*',
        'User-Agent': 'Homey/1.0',
        Authorization: '<redacted>',
        'Content-Type': 'application/json',
      },
      query: {
        dryRun: false,
      },
      data: {
        text: 'hello',
      },
    }, {
      message: 'POST(response)',
      url: 'http://awtrix-ng.local/api/v1/notifications?dryRun=false',
      dump: {
        status: 200,
        statusText: 'OK',
        data: {
          ok: true,
        },
        headers: {
          'content-type': 'application/json',
        },
      },
    }]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('audio and notification debug logs hide Soundboard file URLs without changing the request', async () => {
  const originalFetch = global.fetch;
  const logs = [];
  const locator = 'http://192.0.2.40/app/com.athom.soundboard/userdata/0123456789abcdef01234567.mp3';
  const recordingFetch = createRecordingFetch((config) => ({
    status: 200,
    data: JSON.parse(config.body).file ? { alert: { name: locator } } : { ok: true },
  }));
  global.fetch = recordingFetch;
  try {
    const transport = new FetchAwtrixNgHttpTransport({ baseUrl: 'http://192.0.2.41', debug: true, log: (entry) => logs.push(entry) });
    await transport.request({ method: 'POST', path: '/api/v1/audio/play', body: { file: locator } });
    await transport.request({ method: 'POST', path: '/api/v1/notifications', body: { text: 'Door', sound: { file: locator } } });
    assert.equal(JSON.parse(recordingFetch.calls[0].config.body).file, locator);
    assert.equal(JSON.parse(recordingFetch.calls[1].config.body).sound.file, locator);
    assert.equal(JSON.stringify(logs).includes(locator), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetch AWTRIX NG transport logs error response body in debug mode', async () => {
  const originalFetch = global.fetch;
  const logs = [];
  const rawBody = {
    error: {
      code: 'validationFailed',
      message: 'unknown field',
      field: 'duration',
    },
  };
  const recordingFetch = createRecordingFetch(() => {
    return {
      status: 422,
      statusText: 'Unprocessable Content',
      headers: {
        'content-type': 'application/json',
      },
      data: rawBody,
    };
  });
  global.fetch = recordingFetch;

  try {
    const transport = new FetchAwtrixNgHttpTransport({
      baseUrl: 'http://awtrix-ng.local',
      debug: true,
      log: (entry) => logs.push(entry),
    });

    await assert.rejects(
      () => transport.request({
        method: 'PATCH',
        path: '/api/v1/settings',
        body: {
          duration: 5,
        },
      }),
      AwtrixNgHttpError,
    );

    assert.deepEqual(logs, [{
      message: 'PATCH',
      url: 'http://awtrix-ng.local/api/v1/settings',
      headers: {
        Accept: '*/*',
        'User-Agent': 'Homey/1.0',
        'Content-Type': 'application/json',
      },
      query: undefined,
      data: {
        duration: 5,
      },
    }, {
      message: 'PATCH(response)',
      url: 'http://awtrix-ng.local/api/v1/settings',
      dump: {
        status: 422,
        statusText: 'Unprocessable Content',
        data: rawBody,
        headers: {
          'content-type': 'application/json',
        },
      },
    }, {
      message: 'PATCH(error)',
      url: 'http://awtrix-ng.local/api/v1/settings',
      arg: 'Request failed with status code 422',
    }]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetch AWTRIX NG transport supports text responses', async () => {
  const originalFetch = global.fetch;
  const recordingFetch = createRecordingFetch(() => ({
    status: 200,
    headers: {
      'content-type': 'text/plain',
    },
    data: '1.0.0',
  }));
  global.fetch = recordingFetch;

  try {
    const transport = new FetchAwtrixNgHttpTransport({
      baseUrl: 'http://awtrix-ng.local',
    });

    const response = await transport.request({
      method: 'GET',
      path: '/version',
      responseType: 'text',
    });

    assert.deepEqual(response, {
      status: 200,
      headers: {
        'content-type': 'text/plain',
      },
      data: '1.0.0',
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetch AWTRIX NG transport preserves non-2xx status, headers and raw body', async () => {
  const originalFetch = global.fetch;
  const rawBody = {
    error: {
      code: 'validationFailed',
      message: 'out of range',
      field: 'brightness',
    },
  };
  const recordingFetch = createRecordingFetch(() => {
    return {
      status: 422,
      headers: {
        'content-type': 'application/json',
      },
      data: rawBody,
    };
  });
  global.fetch = recordingFetch;

  try {
    const transport = new FetchAwtrixNgHttpTransport({
      baseUrl: 'http://awtrix-ng.local',
    });

    try {
      await transport.request({
        method: 'PATCH',
        path: '/api/v1/settings',
        body: {
          brightness: 999,
        },
      });
      assert.fail('Expected transport request to throw');
    } catch (error) {
      assert.equal(error instanceof AwtrixNgHttpError, true);
      assert.equal(error.name, 'AwtrixNgHttpError');
      assert.equal(error.status, 422);
      assert.equal(error.method, 'PATCH');
      assert.equal(error.url, 'http://awtrix-ng.local/api/v1/settings');
      assert.deepEqual(error.headers, {
        'content-type': 'application/json',
      });
      assert.deepEqual(error.rawBody, rawBody);
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetch AWTRIX NG transport preserves the redirect response', async () => {
  const originalFetch = global.fetch;
  const rawBody = '<a href="http://other-device.local/">Moved</a>';
  const recordingFetch = createRecordingFetch(() => {
    return {
      status: 302,
      headers: {
        location: 'http://other-device.local/',
        'content-type': 'text/html',
      },
      data: rawBody,
    };
  });
  global.fetch = recordingFetch;

  try {
    const transport = new FetchAwtrixNgHttpTransport({
      baseUrl: 'http://awtrix-ng.local',
    });

    await assert.rejects(
      () => transport.request({ method: 'GET', path: '/api/v1/device' }),
      (error) => {
        assert.equal(error instanceof AwtrixNgHttpError, true);
        assert.equal(error.status, 302);
        assert.equal(error.method, 'GET');
        assert.equal(error.url, 'http://awtrix-ng.local/api/v1/device');
        assert.deepEqual(error.headers, {
          location: 'http://other-device.local/',
          'content-type': 'text/html',
        });
        assert.equal(error.rawBody, rawBody);
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('NG timeout includes stalled JSON, text and binary body reads and always clears the deadline', { timeout: 1000 }, async (context) => {
  for (const responseType of ['json', 'text', 'binary']) {
    let aborted = false;
    context.mock.method(global, 'fetch', async (url, config) => {
      const body = new ReadableStream({
        start(controller) {
          config.signal.addEventListener('abort', () => {
            aborted = true; controller.error(config.signal.reason);
          }, { once: true });
        },
      });
      return new Response(body, { status: 200 });
    });
    const transport = new FetchAwtrixNgHttpTransport({ baseUrl: 'http://192.0.2.10', timeoutMs: 10 });
    await assert.rejects(transport.request({ method: 'GET', path: '/api/v1/device', responseType }), /Timeout/);
    assert.equal(aborted, true);
  }
});

test('NG transport never follows redirects, including authenticated requests', async (context) => {
  let sent;
  context.mock.method(global, 'fetch', async (url, config) => {
    sent = config;
    return new Response('', { status: 302, headers: { Location: 'http://192.0.2.20/other' } });
  });
  const transport = new FetchAwtrixNgHttpTransport({ baseUrl: 'http://192.0.2.10', auth: { username: 'synthetic', password: 'synthetic' } });
  await assert.rejects(transport.request({ method: 'GET', path: '/api/v1/device' }), (error) => error.status === 302);
  assert.equal(sent.redirect, 'manual');
});

test('NG response limit rejects an oversized declared body before reading and preserves HTTP details', async (context) => {
  let signal;
  let reads = 0;
  context.mock.method(global, 'fetch', async (url, config) => {
    signal = config.signal;
    return {
      status: 403,
      headers: new Headers({ 'Content-Length': '33', 'X-Result': 'synthetic' }),
      body: {
        getReader: () => {
          reads += 1; throw new Error('Should not read');
        },
      },
    };
  });
  const transport = new FetchAwtrixNgHttpTransport({ baseUrl: 'http://192.0.2.10', maxResponseBytes: 32 });
  await assert.rejects(transport.request({ method: 'GET', path: '/api/v1/files' }), (error) => error.status === 403
    && error.headers['x-result'] === 'synthetic' && /32-byte limit/.test(error.message));
  assert.equal(reads, 0);
  assert.equal(signal.aborted, true);
});

test('NG counts streamed UTF-8 bytes with absent, false or compressed-length headers for every response type', async (context) => {
  for (const contentLength of [undefined, '2']) {
    for (const responseType of ['json', 'text', 'binary']) {
      let signal;
      context.mock.method(global, 'fetch', async (url, config) => {
        signal = config.signal;
        const headers = contentLength === undefined ? {} : { 'Content-Length': contentLength, 'Content-Encoding': 'gzip' };
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('ŽŽ'));
            controller.enqueue(new TextEncoder().encode('🐱'));
            controller.close();
          },
        }), { headers });
      });
      const transport = new FetchAwtrixNgHttpTransport({ baseUrl: 'http://192.0.2.10', maxResponseBytes: 7 });
      await assert.rejects(transport.request({ method: 'GET', path: '/api/v1/device', responseType }), /7-byte limit/);
      assert.equal(signal.aborted, true);
    }
  }
});

test('NG accepts exact limits, split UTF-8, binary bytes, RAW text and empty responses without truncation', async (context) => {
  const bytes = new TextEncoder().encode('Ž🐱');
  const transport = new FetchAwtrixNgHttpTransport({ baseUrl: 'http://192.0.2.10', maxResponseBytes: bytes.length });
  context.mock.method(global, 'fetch', async () => new Response(new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  })));
  assert.equal((await transport.request({ method: 'GET', path: '/api/v1/device', responseType: 'text' })).data, 'Ž🐱');
  assert.deepEqual(new Uint8Array((await transport.request({ method: 'GET', path: '/api/v1/device', responseType: 'binary' })).data), bytes);
  assert.equal((await transport.request({ method: 'GET', path: '/api/v1/device' })).data, 'Ž🐱');
  context.mock.method(global, 'fetch', async () => new Response('{"n":0}', { headers: { 'Content-Length': '7' } }));
  const json = new FetchAwtrixNgHttpTransport({ baseUrl: 'http://192.0.2.10', maxResponseBytes: 7 });
  assert.deepEqual((await json.request({ method: 'GET', path: '/api/v1/device' })).data, { n: 0 });
  context.mock.method(global, 'fetch', async () => new Response(null, { status: 204 }));
  assert.equal((await json.request({ method: 'DELETE', path: '/api/v1/apps/test' })).data, undefined);
});

test('NG oversized RAW responses fail without exposing payload/query in debug logs, and later requests recover', async (context) => {
  // eslint-disable-next-line global-require
  const Client = require('../.homeybuild/lib/awtrixng/Api/Client').default;
  const secret = 'synthetic-callback-secret';
  const logs = [];
  const transport = new FetchAwtrixNgHttpTransport({
    baseUrl: 'http://192.0.2.10',
    maxResponseBytes: 8,
    debug: true,
    log: (entry) => logs.push(entry),
  });
  const client = new Client(transport);
  context.mock.method(global, 'fetch', async () => new Response(secret));
  await assert.rejects(client.sendRawCommand('GET', `/api/v1/system?secret=${secret}`),
    (error) => error.httpStatus === 200 && /8-byte limit/.test(error.message));
  assert.equal(JSON.stringify(logs).includes(secret), false);
  context.mock.method(global, 'fetch', async () => new Response('{"ok":1}'));
  assert.deepEqual(await client.sendRawCommand('GET', '/api/v1/device'), { status: 200, response: '{"ok":1}' });
});
