const HomeyPushedAppPrefix = 'homey-';
const HomeyPushedAppUserNamePattern = /^[A-Za-z0-9_-]{1,26}$/;

export type AwtrixNgHomeyPushedAppName = `${typeof HomeyPushedAppPrefix}${string}`;

export class InvalidAwtrixNgHomeyPushedAppNameError extends Error {

  readonly protocol = 'awtrix-ng';

  readonly field = 'name';

  readonly value: string;

  constructor(value: string) {
    super('Custom app name must match ^[A-Za-z0-9_-]{1,26}$ before adding the internal homey- prefix.');
    this.name = 'InvalidAwtrixNgHomeyPushedAppNameError';
    this.value = value;

    Object.setPrototypeOf(this, InvalidAwtrixNgHomeyPushedAppNameError.prototype);
  }

}

export const toAwtrixNgHomeyPushedAppName = (userAppName: string): AwtrixNgHomeyPushedAppName => {
  if (!HomeyPushedAppUserNamePattern.test(userAppName)) {
    throw new InvalidAwtrixNgHomeyPushedAppNameError(userAppName);
  }

  return `${HomeyPushedAppPrefix}${userAppName}`;
};

export const fromAwtrixNgHomeyPushedAppName = (deviceAppName: string): string | undefined => {
  if (!deviceAppName.startsWith(HomeyPushedAppPrefix)) {
    return undefined;
  }

  return deviceAppName.slice(HomeyPushedAppPrefix.length);
};
