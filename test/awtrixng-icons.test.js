const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createAwtrixNgIconUploadForm,
  default: AwtrixNgIcons,
  toAwtrixNgIconAutocompleteItems,
} = require('../.homeybuild/lib/awtrixng/Services/Icons');
const { AwtrixNgApiError } = require('../.homeybuild/lib/awtrixng/Api/ErrorParser');

const labels = {
  emptyName: 'Empty',
  emptyDescription: 'Without icon',
};

const deferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

class FakeIconClient {

  listResponses = [{
    files: [],
    usedBytes: 0,
    totalBytes: 1048576,
  }];

  calls = [];

  listError = null;

  uploadError = null;

  async listFiles(dir) {
    this.calls.push({ method: 'listFiles', dir });

    if (this.listError !== null) {
      throw this.listError;
    }

    return this.listResponses.shift();
  }

  async uploadFile(upload) {
    this.calls.push({
      method: 'uploadFile',
      dir: upload.dir,
      body: upload.body,
    });

    if (this.uploadError !== null) {
      throw this.uploadError;
    }

    return { ok: true };
  }

}

const createFakeTimerHost = () => ({
  nextTimer: 1,
  setCalls: [],
  clearCalls: [],
  setTimeout(callback, ms) {
    const timer = this.nextTimer;
    this.nextTimer += 1;
    this.setCalls.push({ callback, ms, timer });
    return timer;
  },
  clearTimeout(timer) {
    this.clearCalls.push(timer);
  },
});

const createIcons = (client, options = {}) => new AwtrixNgIcons(client, {
  emptyIcon: {
    name: labels.emptyName,
    id: '-',
    description: labels.emptyDescription,
  },
  ...options,
});

test('AWTRIX NG icon mapper converts /api/v1/files response files to Homey autocomplete items', () => {
  const response = {
    files: [
      { name: 'homey.gif', size: 123 },
      { name: 'weather.jpg', size: 456 },
    ],
    usedBytes: 579,
    totalBytes: 1048576,
  };

  assert.deepEqual(toAwtrixNgIconAutocompleteItems(response, labels), [
    {
      name: 'Empty',
      id: '-',
      description: 'Without icon',
    },
    {
      name: 'homey',
      id: 'homey',
    },
    {
      name: 'weather',
      id: 'weather',
    },
  ]);
});

test('AWTRIX NG icons list uses GET /api/v1/files semantics via /ICONS directory and supports autocomplete filtering', async () => {
  const client = new FakeIconClient();
  client.listResponses = [{
    files: [
      { name: 'homey.gif', size: 123 },
      { name: 'weather.jpg', size: 456 },
      { name: 'warning.gif', size: 789 },
    ],
    usedBytes: 1368,
    totalBytes: 1048576,
  }];
  const icons = createIcons(client);

  assert.deepEqual(await icons.find('WEA'), [{
    name: 'weather',
    id: 'weather',
  }]);
  assert.deepEqual(await icons.all(), [
    {
      name: 'Empty',
      id: '-',
      description: 'Without icon',
    },
    {
      name: 'homey',
      id: 'homey',
    },
    {
      name: 'weather',
      id: 'weather',
    },
    {
      name: 'warning',
      id: 'warning',
    },
  ]);
  assert.deepEqual(client.calls, [{
    method: 'listFiles',
    dir: '/ICONS',
  }]);
});

test('AWTRIX NG icon list coalesces concurrent loads', async () => {
  const client = new FakeIconClient();
  const load = deferred();
  client.listFiles = async (dir) => {
    client.calls.push({ method: 'listFiles', dir });
    return load.promise;
  };
  const icons = createIcons(client);

  const first = icons.all();
  const second = icons.all();
  await Promise.resolve();

  assert.equal(client.calls.length, 1);

  load.resolve({
    files: [{ name: 'homey.gif', size: 123 }],
    usedBytes: 123,
    totalBytes: 1048576,
  });

  const expected = [
    { name: 'Empty', id: '-', description: 'Without icon' },
    { name: 'homey', id: 'homey' },
  ];
  assert.deepEqual(await first, expected);
  assert.deepEqual(await second, expected);
});

test('AWTRIX NG icon list clears rejected in-flight load and retries with the original error preserved', async () => {
  const client = new FakeIconClient();
  const apiError = new AwtrixNgApiError({
    method: 'GET',
    url: 'http://awtrix-ng.local/api/v1/files?dir=/ICONS',
    httpStatus: 503,
    code: 'serviceBusy',
    message: 'icon storage is busy',
    field: 'dir',
  });
  client.listError = apiError;
  const icons = createIcons(client);

  const results = await Promise.allSettled([icons.all(), icons.all()]);
  assert.equal(client.calls.length, 1);
  assert.deepEqual(results.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(results[0].reason, apiError);
  assert.equal(results[1].reason, apiError);

  client.listError = null;
  client.listResponses = [{
    files: [{ name: 'retry.gif', size: 42 }],
    usedBytes: 42,
    totalBytes: 1048576,
  }];

  assert.deepEqual(await icons.all(), [
    { name: 'Empty', id: '-', description: 'Without icon' },
    { name: 'retry', id: 'retry' },
  ]);
  assert.equal(client.calls.length, 2);
});

test('AWTRIX NG icon cache keeps its 5 second TTL and supports explicit invalidation', async () => {
  const client = new FakeIconClient();
  client.listResponses = [{
    files: [{ name: 'first.gif', size: 1 }],
    usedBytes: 1,
    totalBytes: 1048576,
  }, {
    files: [{ name: 'second.gif', size: 2 }],
    usedBytes: 2,
    totalBytes: 1048576,
  }];
  const timerHost = createFakeTimerHost();
  const icons = createIcons(client, { timerHost });

  await icons.all();
  assert.equal(timerHost.setCalls[0].ms, 5000);

  icons.invalidate();
  assert.deepEqual(timerHost.clearCalls, [1]);
  assert.deepEqual(await icons.all(), [
    { name: 'Empty', id: '-', description: 'Without icon' },
    { name: 'second', id: 'second' },
  ]);
  assert.deepEqual(client.calls.map((call) => call.method), ['listFiles', 'listFiles']);
});

test('AWTRIX NG icon upload creates multipart form data and posts to /ICONS', async () => {
  const client = new FakeIconClient();
  const icons = createIcons(client);

  assert.deepEqual(await icons.upload({
    fileName: 'homey.gif',
    body: Buffer.from('icon'),
  }), { ok: true });

  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].method, 'uploadFile');
  assert.equal(client.calls[0].dir, '/ICONS');
  assert.equal(typeof client.calls[0].body.getHeaders, 'function');
  assert.match(client.calls[0].body.getHeaders()['content-type'], /^multipart\/form-data; boundary=/);
});

test('AWTRIX NG icon upload clears cached list after successful upload', async () => {
  const client = new FakeIconClient();
  client.listResponses = [{
    files: [{ name: 'homey.gif', size: 123 }],
    usedBytes: 123,
    totalBytes: 1048576,
  }, {
    files: [
      { name: 'homey.gif', size: 123 },
      { name: 'weather.jpg', size: 456 },
    ],
    usedBytes: 579,
    totalBytes: 1048576,
  }];
  const icons = createIcons(client);

  assert.deepEqual(await icons.all(), [
    {
      name: 'Empty',
      id: '-',
      description: 'Without icon',
    },
    {
      name: 'homey',
      id: 'homey',
    },
  ]);
  await icons.upload({
    fileName: 'weather.jpg',
    body: Buffer.from('icon'),
  });
  assert.deepEqual(await icons.all(), [
    {
      name: 'Empty',
      id: '-',
      description: 'Without icon',
    },
    {
      name: 'homey',
      id: 'homey',
    },
    {
      name: 'weather',
      id: 'weather',
    },
  ]);
  assert.deepEqual(client.calls.map((call) => call.method), ['listFiles', 'uploadFile', 'listFiles']);
});

test('AWTRIX NG icon upload propagates NG API errors with details', async () => {
  const client = new FakeIconClient();
  client.listResponses = [{
    files: [{ name: 'cached.gif', size: 123 }],
    usedBytes: 123,
    totalBytes: 1048576,
  }];
  const icons = createIcons(client);
  const apiError = new AwtrixNgApiError({
    method: 'POST',
    url: 'http://awtrix-ng.local/api/v1/files?dir=/ICONS',
    httpStatus: 403,
    code: 'forbidden',
    message: 'file upload is disabled in provisioning mode',
    rawBody: {
      error: {
        code: 'forbidden',
        message: 'file upload is disabled in provisioning mode',
      },
    },
  });
  client.uploadError = apiError;

  const cachedIcons = await icons.all();

  await assert.rejects(
    () => icons.upload({
      fileName: 'homey.gif',
      body: Buffer.from('icon'),
    }),
    (error) => {
      assert.equal(error, apiError);
      assert.equal(error.httpStatus, 403);
      assert.equal(error.code, 'forbidden');
      assert.equal(error.message, 'file upload is disabled in provisioning mode');
      return true;
    },
  );

  assert.equal(await icons.all(), cachedIcons);
  assert.deepEqual(client.calls.map((call) => call.method), ['listFiles', 'uploadFile']);
});

test('AWTRIX NG icon upload form exposes multipart headers for transport', () => {
  const form = createAwtrixNgIconUploadForm({
    fileName: 'homey.gif',
    body: Buffer.from('icon'),
  });

  assert.equal(typeof form.getHeaders, 'function');
  assert.match(form.getHeaders()['content-type'], /^multipart\/form-data; boundary=/);
});
