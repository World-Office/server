/**
 * Exponential backoff reconnection strategy for WebSocket connections.
 *
 * Delay formula: min(baseDelay * 2^attempt, maxDelay) * jitter(0.5..1.5)
 */

export interface BackoffOptions {
  /** Initial delay in ms. Default: 1000 */
  baseDelay?: number
  /** Maximum delay cap in ms. Default: 30000 */
  maxDelay?: number
  /** Maximum number of retries before giving up. Default: Infinity */
  maxRetries?: number
}

export class BackoffStrategy {
  private readonly baseDelay: number
  private readonly maxDelay: number
  private readonly maxRetries: number
  private _retryCount = 0

  constructor(options: BackoffOptions = {}) {
    this.baseDelay = options.baseDelay ?? 1000
    this.maxDelay = options.maxDelay ?? 30000
    this.maxRetries = options.maxRetries ?? Number.POSITIVE_INFINITY
  }

  get retryCount(): number {
    return this._retryCount
  }

  /**
   * Get the next delay in ms. Returns -1 if retries are exhausted.
   */
  next(): number {
    if (this._retryCount >= this.maxRetries) {
      return -1
    }

    const exponential = this.baseDelay * 2 ** this._retryCount
    const capped = Math.min(exponential, this.maxDelay)

    this._retryCount++
    return capped
  }

  hasMoreRetries(): boolean {
    return this._retryCount < this.maxRetries
  }

  reset(): void {
    this._retryCount = 0
  }
}

/** Create a BackoffStrategy with sensible defaults. */
export function createBackoffStrategy(options?: BackoffOptions): BackoffStrategy {
  return new BackoffStrategy(options)
}
