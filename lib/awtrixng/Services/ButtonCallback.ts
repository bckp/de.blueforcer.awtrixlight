import { AwtrixNgInvalidResponseError } from '../Api/InvalidResponseError';
import { AwtrixNgApiSystemPatch, AwtrixNgApiSystemResponse } from '../Api/Types';
import { isPlainObject } from '../Support/Guards';

const SystemEndpoint = '/api/v1/system';

export interface AwtrixNgButtonCallbackClient {
  getSystem(): Promise<AwtrixNgApiSystemResponse>;
  putSystem(patch: AwtrixNgApiSystemPatch): Promise<AwtrixNgApiSystemResponse>;
}

const readButtonCallback = (response: unknown): string => {
  if (!isPlainObject(response) || typeof response.buttonCallback !== 'string') {
    throw new AwtrixNgInvalidResponseError({
      endpoint: SystemEndpoint,
      expectedShape: 'a plain object with a string buttonCallback',
      actualValue: response,
    });
  }

  return response.buttonCallback;
};

export const readAwtrixNgButtonCallback = async (client: AwtrixNgButtonCallbackClient): Promise<string> => (
  readButtonCallback(await client.getSystem())
);

export const writeAwtrixNgButtonCallback = async (
  client: AwtrixNgButtonCallbackClient,
  buttonCallback: string,
): Promise<void> => {
  const result = await client.putSystem({ buttonCallback });
  const appliedValue = readButtonCallback(result);

  if (appliedValue !== buttonCallback) {
    throw new AwtrixNgInvalidResponseError({
      endpoint: SystemEndpoint,
      expectedShape: 'a resulting system object whose buttonCallback exactly matches the requested value',
      actualValue: result,
    });
  }
};
