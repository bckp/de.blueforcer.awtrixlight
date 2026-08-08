export class AwtrixNgDeviceIdentityMismatchError extends Error {

  readonly protocol = 'awtrix-ng' as const;

  readonly expectedUid: string;

  readonly actualUid: string;

  constructor(expectedUid: string, actualUid: string) {
    super(`AWTRIX NG device identity mismatch: expected ${expectedUid}, received ${actualUid}.`);
    this.name = 'AwtrixNgDeviceIdentityMismatchError';
    this.expectedUid = expectedUid;
    this.actualUid = actualUid;

    Object.setPrototypeOf(this, AwtrixNgDeviceIdentityMismatchError.prototype);
  }

}

export default AwtrixNgDeviceIdentityMismatchError;
