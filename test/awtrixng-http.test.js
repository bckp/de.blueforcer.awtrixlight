const assert = require('node:assert/strict');
const test = require('node:test');
const FormData = require('form-data');

const http = require('../.homeybuild/lib/awtrixng/Http/Transport');
const AxiosAwtrixNgHttpTransport = require('../.homeybuild/lib/awtrixng/Http/AxiosTransport').default;

const { AwtrixNgHttpError } = http;

const createRecordingAxios = (responseFactory) => {
  const calls = [];

  return {
    calls,
    client: {
      async request(config) {
        calls.push(config);
        return responseFactory(config);
      },
    },
  };
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

test('axios AWTRIX NG transport maps GET, POST, PATCH and DELETE requests', async () => {
  const recordingAxios = createRecordingAxios(() => ({
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
    data: {
      ok: true,
    },
  }));
  const transport = new AxiosAwtrixNgHttpTransport({
    baseUrl: 'http://192.0.2.10:8080/',
    timeoutMs: 10000,
  }, recordingAxios.client);

  await transport.request({ method: 'GET', path: '/api/v1/device' });
  await transport.request({ method: 'POST', path: '/api/v1/notifications', body: { text: 'hello' } });
  await transport.request({ method: 'PATCH', path: '/api/v1/display', body: { power: false } });
  await transport.request({ method: 'DELETE', path: '/api/v1/notifications/active' });

  assert.deepEqual(recordingAxios.calls.map((call) => ({
    method: call.method,
    url: call.url,
    data: call.data,
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
});

test('axios AWTRIX NG transport applies auth, JSON content type, query and timeout config', async () => {
  const recordingAxios = createRecordingAxios(() => ({
    status: 200,
    headers: {
      'x-test': 'ok',
    },
    data: {
      power: true,
    },
  }));
  const transport = new AxiosAwtrixNgHttpTransport({
    baseUrl: 'http://awtrix-ng.local:8081',
    timeoutMs: 10000,
    auth: {
      username: 'homey',
      password: 'secret',
    },
  }, recordingAxios.client);

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

  assert.equal(recordingAxios.calls.length, 1);
  assert.equal(recordingAxios.calls[0].url, 'http://awtrix-ng.local:8081/api/v1/display');
  assert.equal(recordingAxios.calls[0].timeout, 2500);
  assert.equal(recordingAxios.calls[0].maxRedirects, 0);
  assert.deepEqual(recordingAxios.calls[0].params, {
    dryRun: false,
    retry: 1,
  });
  assert.equal(recordingAxios.calls[0].headers.Authorization, `Basic ${Buffer.from('homey:secret').toString('base64')}`);
  assert.equal(recordingAxios.calls[0].headers['Content-Type'], 'application/json');
  assert.equal(recordingAxios.calls[0].headers.Accept, '*/*');
  assert.equal(recordingAxios.calls[0].headers['User-Agent'], 'Homey/1.0');
  assert.deepEqual(response, {
    status: 200,
    headers: {
      'x-test': 'ok',
    },
    data: {
      power: true,
    },
  });
});

test('axios AWTRIX NG transport does not log requests by default', async () => {
  const logs = [];
  const recordingAxios = createRecordingAxios(() => ({
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': 'application/json',
    },
    data: {
      ok: true,
    },
  }));
  const transport = new AxiosAwtrixNgHttpTransport({
    baseUrl: 'http://awtrix-ng.local',
    log: (entry) => logs.push(entry),
  }, recordingAxios.client);

  await transport.request({
    method: 'GET',
    path: '/api/v1/device',
  });

  assert.deepEqual(logs, []);
});

test('axios AWTRIX NG transport logs request and response in debug mode with redacted auth header', async () => {
  const logs = [];
  const recordingAxios = createRecordingAxios(() => ({
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': 'application/json',
    },
    data: {
      ok: true,
    },
  }));
  const transport = new AxiosAwtrixNgHttpTransport({
    baseUrl: 'http://awtrix-ng.local',
    auth: {
      username: 'homey',
      password: 'secret',
    },
    debug: true,
    log: (entry) => logs.push(entry),
  }, recordingAxios.client);

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

  assert.equal(recordingAxios.calls[0].headers.Authorization, `Basic ${Buffer.from('homey:secret').toString('base64')}`);
  assert.deepEqual(logs, [{
    message: 'POST',
    url: 'http://awtrix-ng.local/api/v1/notifications',
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
    url: 'http://awtrix-ng.local/api/v1/notifications',
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
});

test('axios AWTRIX NG transport logs error response body in debug mode', async () => {
  const logs = [];
  const rawBody = {
    error: {
      code: 'validationFailed',
      message: 'unknown field',
      field: 'duration',
    },
  };
  const recordingAxios = createRecordingAxios(() => {
    const error = new Error('Request failed with status code 422');
    error.isAxiosError = true;
    error.response = {
      status: 422,
      statusText: 'Unprocessable Content',
      headers: {
        'content-type': 'application/json',
      },
      data: rawBody,
    };
    throw error;
  });
  const transport = new AxiosAwtrixNgHttpTransport({
    baseUrl: 'http://awtrix-ng.local',
    debug: true,
    log: (entry) => logs.push(entry),
  }, recordingAxios.client);

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
});

test('axios AWTRIX NG transport supports text responses', async () => {
  const recordingAxios = createRecordingAxios(() => ({
    status: 200,
    headers: {
      'content-type': 'text/plain',
    },
    data: '1.0.0',
  }));
  const transport = new AxiosAwtrixNgHttpTransport({
    baseUrl: 'http://awtrix-ng.local',
  }, recordingAxios.client);

  const response = await transport.request({
    method: 'GET',
    path: '/version',
    responseType: 'text',
  });

  assert.equal(recordingAxios.calls[0].responseType, 'text');
  assert.deepEqual(response, {
    status: 200,
    headers: {
      'content-type': 'text/plain',
    },
    data: '1.0.0',
  });
});

test('axios AWTRIX NG transport does not overwrite multipart content type with JSON', async () => {
  const recordingAxios = createRecordingAxios(() => ({
    status: 200,
    headers: {},
    data: {
      ok: true,
    },
  }));
  const transport = new AxiosAwtrixNgHttpTransport({
    baseUrl: 'http://awtrix-ng.local',
  }, recordingAxios.client);
  const form = new FormData();
  form.append('file', Buffer.from('icon'), { filename: 'homey.gif' });

  await transport.request({
    method: 'POST',
    path: '/api/v1/files',
    query: {
      dir: '/ICONS',
    },
    body: form,
  });

  assert.equal(recordingAxios.calls[0].headers['Content-Type'], undefined);
  assert.match(recordingAxios.calls[0].headers['content-type'], /^multipart\/form-data; boundary=/);
  assert.equal(recordingAxios.calls[0].data, form);
});

test('axios AWTRIX NG transport preserves non-2xx status, headers and raw body', async () => {
  const rawBody = {
    error: {
      code: 'validationFailed',
      message: 'out of range',
      field: 'brightness',
    },
  };
  const recordingAxios = createRecordingAxios(() => {
    const error = new Error('Request failed with status code 422');
    error.isAxiosError = true;
    error.response = {
      status: 422,
      headers: {
        'content-type': 'application/json',
      },
      data: rawBody,
    };
    throw error;
  });
  const transport = new AxiosAwtrixNgHttpTransport({
    baseUrl: 'http://awtrix-ng.local',
  }, recordingAxios.client);

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
    assert.equal(error.rawBody, rawBody);
  }
});

test('axios AWTRIX NG transport disables redirects and preserves the redirect response', async () => {
  const rawBody = '<a href="http://other-device.local/">Moved</a>';
  const recordingAxios = createRecordingAxios(() => {
    const error = new Error('Request failed with status code 302');
    error.isAxiosError = true;
    error.response = {
      status: 302,
      headers: {
        location: 'http://other-device.local/',
        'content-type': 'text/html',
      },
      data: rawBody,
    };
    throw error;
  });
  const transport = new AxiosAwtrixNgHttpTransport({
    baseUrl: 'http://awtrix-ng.local',
  }, recordingAxios.client);

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
  assert.equal(recordingAxios.calls[0].maxRedirects, 0);
});
