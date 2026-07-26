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

class FakeIconClient {

  listResponses = [{
    files: [],
    usedBytes: 0,
    totalBytes: 1048576,
  }];

  calls = [];

  uploadError = null;

  async listFiles(dir) {
    this.calls.push({ method: 'listFiles', dir });

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

const createIcons = (client) => new AwtrixNgIcons(client, {
  emptyIcon: {
    name: labels.emptyName,
    id: '-',
    description: labels.emptyDescription,
  },
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
});

test('AWTRIX NG icon upload form exposes multipart headers for transport', () => {
  const form = createAwtrixNgIconUploadForm({
    fileName: 'homey.gif',
    body: Buffer.from('icon'),
  });

  assert.equal(typeof form.getHeaders, 'function');
  assert.match(form.getHeaders()['content-type'], /^multipart\/form-data; boundary=/);
});
