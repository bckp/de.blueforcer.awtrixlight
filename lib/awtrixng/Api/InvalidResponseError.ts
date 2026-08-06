export interface AwtrixNgInvalidResponseErrorOptions {
  endpoint: string;
  expectedShape: string;
  actualValue: unknown;
}

const describeAwtrixNgResponseType = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  return typeof value;
};

export class AwtrixNgInvalidResponseError extends Error {

  readonly protocol = 'awtrix-ng';

  readonly endpoint: string;

  readonly expectedShape: string;

  readonly actualType: string;

  constructor(options: AwtrixNgInvalidResponseErrorOptions) {
    const actualType = describeAwtrixNgResponseType(options.actualValue);

    super(`Invalid AWTRIX NG response from ${options.endpoint}: expected ${options.expectedShape}, received ${actualType}.`);
    this.name = 'AwtrixNgInvalidResponseError';
    this.endpoint = options.endpoint;
    this.expectedShape = options.expectedShape;
    this.actualType = actualType;

    Object.setPrototypeOf(this, AwtrixNgInvalidResponseError.prototype);
  }

}
