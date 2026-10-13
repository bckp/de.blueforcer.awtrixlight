// Kept separately in each protocol layer; neither transport imports the other.
export const DefaultMaxResponseBytes = 8 * 1024 * 1024;

export class ResponseTooLargeError extends RangeError {

  constructor(maxBytes: number) {
    super(`HTTP response exceeds the ${maxBytes}-byte limit.`);
    this.name = 'ResponseTooLargeError';
  }

}

export const readLimitedResponse = async (
  response: Response, maxBytes: number, controller: AbortController,
): Promise<Uint8Array> => {
  try {
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) throw new ResponseTooLargeError(maxBytes);
    if (response.body === null) return new Uint8Array(0);
    const reader = response.body.getReader();
    let buffer = new Uint8Array(0);
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return buffer.subarray(0, size);
        const nextSize = size + value.byteLength;
        if (nextSize > maxBytes) throw new ResponseTooLargeError(maxBytes);
        if (nextSize > buffer.byteLength) {
          const capacity = Math.min(maxBytes, Math.max(nextSize, buffer.byteLength * 2, 1024));
          const grown = new Uint8Array(capacity);
          grown.set(buffer.subarray(0, size));
          buffer = grown;
        }
        buffer.set(value, size);
        size = nextSize;
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    // Native fetch binds the response stream/socket to this controller as well.
    controller.abort(error);
    throw error;
  }
};
