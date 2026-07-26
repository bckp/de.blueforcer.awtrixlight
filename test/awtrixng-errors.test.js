const assert = require('node:assert/strict');
const test = require('node:test');

const { AwtrixNgHttpError } = require('../.homeybuild/lib/awtrixng/Http/Transport');
const {
  AwtrixNgApiError,
  isAwtrixNgErrorEnvelope,
  parseAwtrixNgApiError,
} = require('../.homeybuild/lib/awtrixng/Api/ErrorParser');

const unauthorized = require('./fixtures/awtrixng/errors/unauthorized.json');
const validationField = require('./fixtures/awtrixng/errors/validation-field.json');
const forbidden = require('./fixtures/awtrixng/errors/forbidden.json');
const notFound = require('./fixtures/awtrixng/errors/not-found.json');
const nonEnvelope = require('./fixtures/awtrixng/errors/non-envelope.json');

const createHttpError = ({ status, body }) => new AwtrixNgHttpError({
  method: 'PATCH',
  url: 'http://awtrix-ng.local/api/v1/settings',
  message: `Request failed with status code ${status}`,
  status,
  headers: {
    'content-type': 'application/json',
  },
  rawBody: body,
});

test('AWTRIX NG error envelope type guard accepts documented envelope shape', () => {
  assert.equal(isAwtrixNgErrorEnvelope(unauthorized), true);
  assert.equal(isAwtrixNgErrorEnvelope(validationField), true);
  assert.equal(isAwtrixNgErrorEnvelope(nonEnvelope), false);
  assert.equal(isAwtrixNgErrorEnvelope({ error: { code: 'unauthorized' } }), false);
  assert.equal(isAwtrixNgErrorEnvelope({ error: { code: 'unauthorized', message: 'auth', field: 1 } }), false);
});

test('AWTRIX NG parser preserves 401 unauthorized error envelope', () => {
  const source = createHttpError({ status: 401, body: unauthorized });
  const error = parseAwtrixNgApiError(source);

  assert.equal(error instanceof AwtrixNgApiError, true);
  assert.equal(error.name, 'AwtrixNgApiError');
  assert.equal(error.protocol, 'awtrix-ng');
  assert.equal(error.httpStatus, 401);
  assert.equal(error.code, 'unauthorized');
  assert.equal(error.message, 'authentication required');
  assert.equal(error.field, undefined);
  assert.equal(error.rawBody, unauthorized);
  assert.equal(error.errorCause, source);
  assert.equal(error.method, 'PATCH');
  assert.equal(error.url, 'http://awtrix-ng.local/api/v1/settings');
});

test('AWTRIX NG parser preserves 422 validation field', () => {
  const error = parseAwtrixNgApiError(createHttpError({ status: 422, body: validationField }));

  assert.equal(error.httpStatus, 422);
  assert.equal(error.code, 'validationFailed');
  assert.equal(error.message, 'out of range');
  assert.equal(error.field, 'brightness');
  assert.equal(error.rawBody, validationField);
});

test('AWTRIX NG parser preserves 403 forbidden error envelope', () => {
  const error = parseAwtrixNgApiError(createHttpError({ status: 403, body: forbidden }));

  assert.equal(error.httpStatus, 403);
  assert.equal(error.code, 'forbidden');
  assert.equal(error.message, 'operation forbidden while provisioning');
  assert.equal(error.field, undefined);
  assert.equal(error.rawBody, forbidden);
});

test('AWTRIX NG parser preserves 404 notFound error envelope', () => {
  const error = parseAwtrixNgApiError(createHttpError({ status: 404, body: notFound }));

  assert.equal(error.httpStatus, 404);
  assert.equal(error.code, 'notFound');
  assert.equal(error.message, 'resource not found');
  assert.equal(error.field, undefined);
  assert.equal(error.rawBody, notFound);
});

test('AWTRIX NG parser converts non-envelope response body to typed API error and preserves raw body', () => {
  const source = createHttpError({ status: 500, body: nonEnvelope });
  const error = parseAwtrixNgApiError(source);

  assert.equal(error instanceof AwtrixNgApiError, true);
  assert.equal(error.code, 'unknownErrorEnvelope');
  assert.equal(error.httpStatus, 500);
  assert.equal(error.message, 'Request failed with status code 500');
  assert.equal(error.field, undefined);
  assert.equal(error.rawBody, nonEnvelope);
  assert.equal(error.errorCause, source);
});

test('AWTRIX NG parser does not throw a bare string for text response body', () => {
  const source = createHttpError({ status: 500, body: 'internal server error' });
  const error = parseAwtrixNgApiError(source);

  assert.equal(error instanceof AwtrixNgApiError, true);
  assert.equal(error.code, 'unknownErrorEnvelope');
  assert.equal(error.httpStatus, 500);
  assert.equal(error.rawBody, 'internal server error');
  assert.equal(typeof error, 'object');
});
