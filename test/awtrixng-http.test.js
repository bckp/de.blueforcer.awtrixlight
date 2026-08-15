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

    return {
      ok: mockedResponse.status >= 200 && mockedResponse.status < 300,
      status: mockedResponse.status,
      statusText: mockedResponse.statusText || 'OK',
      headers: new Headers(mockedResponse.headers || {}),
      text: async () => {
        if (typeof mockedResponse.data === 'string') return mockedResponse.data;
        return JSON.stringify(mockedResponse.data);
      },
      arrayBuffer: async () => new ArrayBuffer(0),
    };
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
