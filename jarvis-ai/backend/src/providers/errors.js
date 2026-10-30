// One error type for every AI provider, so the apps get a clear message
// whichever provider is configured.
export class ProviderError extends Error {
  constructor(code, message, { retryable = false, status = 502 } = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}
