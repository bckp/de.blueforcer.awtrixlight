import { AwtrixNgApiScriptAppError } from '../Api/Types';

/** A successful save can still fail during script init/setup; HTTP 200 is not enough. */
export default class AwtrixNgScriptRestartError extends Error {

  readonly protocol = 'awtrix-ng';

  readonly httpStatus = 200;

  readonly code = 'scriptError';

  readonly field = 'error';

  readonly line?: number;

  readonly hook?: string;

  constructor(error: AwtrixNgApiScriptAppError) {
    const location = [error.hook, error.line === undefined ? undefined : `line ${error.line}`].filter(Boolean).join(', ');
    super(`Saved, but script restart failed${location ? ` (${location})` : ''}: ${error.message}`);
    this.name = 'AwtrixNgScriptRestartError';
    this.line = error.line;
    this.hook = error.hook;
  }

}
