export interface AwtrixNgUnsupportedVersionErrorOptions {
  currentVersion?: string;
  minimumVersion: string;
}

export class AwtrixNgUnsupportedVersionError extends Error {

  readonly currentVersion?: string;

  readonly minimumVersion: string;

  constructor(options: AwtrixNgUnsupportedVersionErrorOptions) {
    const detectedVersion = options.currentVersion === undefined
      ? 'The device firmware version is not known.'
      : `Detected firmware: ${options.currentVersion}.`;

    super(`This operation requires AWTRIX NG firmware ${options.minimumVersion} or newer. ${detectedVersion}`);
    this.name = 'AwtrixNgUnsupportedVersionError';
    this.currentVersion = options.currentVersion;
    this.minimumVersion = options.minimumVersion;

    Object.setPrototypeOf(this, AwtrixNgUnsupportedVersionError.prototype);
  }

}
