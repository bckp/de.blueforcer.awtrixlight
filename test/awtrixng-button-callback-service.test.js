const assert = require('node:assert/strict');
const test = require('node:test');

const { AwtrixNgInvalidResponseError } = require('../.homeybuild/lib/awtrixng/Api/InvalidResponseError');
const { AwtrixNgApiError } = require('../.homeybuild/lib/awtrixng/Api/ErrorParser');
const {
  readAwtrixNgButtonCallback,
  writeAwtrixNgButtonCallback,
} = require('../.homeybuild/lib/awtrixng/Services/ButtonCallback');

test('button callback service validates the narrow GET contract', async () => {
  assert.equal(await readAwtrixNgButtonCallback({ getSystem: async () => ({ buttonCallback: '' }) }), '');

  for (const response of [null, [], {}, { buttonCallback: 1 }]) {
    await assert.rejects(readAwtrixNgButtonCallback({ getSystem: async () => response }), (error) => {
      assert.ok(error instanceof AwtrixNgInvalidResponseError);
      assert.equal(error.endpoint, '/api/v1/system');
      return true;
    });
  }
});

test('button callback service writes only the requested patch and verifies the resulting value', async () => {
  const calls = [];
  await writeAwtrixNgButtonCallback({
    async putSystem(patch) {
      calls.push(patch);
      return { buttonCallback: patch.buttonCallback, unrelated: 1 };
    },
  }, 'http://homey.local/callback');
  assert.deepEqual(calls, [{ buttonCallback: 'http://homey.local/callback' }]);

  await assert.rejects(writeAwtrixNgButtonCallback({
    async putSystem() {
      return { buttonCallback: '' };
    },
  }, 'http://homey.local/callback'), AwtrixNgInvalidResponseError);
});

test('button callback service preserves API errors', async () => {
  const apiError = new AwtrixNgApiError({
    httpStatus: 422, code: 'validationFailed', message: 'bad', field: 'buttonCallback',
  });
  await assert.rejects(readAwtrixNgButtonCallback({
    async getSystem() {
      throw apiError;
    },
  }), (error) => {
    assert.equal(error, apiError);
    assert.equal(error.httpStatus, 422);
    assert.equal(error.field, 'buttonCallback');
    return true;
  });
});
