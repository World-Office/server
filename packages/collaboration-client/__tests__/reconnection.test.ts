import { beforeEach, describe, expect, it, vi } from "vitest"
import { BackoffStrategy, createBackoffStrategy } from "../src/reconnection"

describe("BackoffStrategy", () => {
  it("should start with the initial delay", () => {
    const strategy = new BackoffStrategy({ baseDelay: 1000, maxDelay: 30000, maxRetries: 5 })
    expect(strategy.next()).toBe(1000)
  })

  it("should double the delay each time", () => {
    const strategy = new BackoffStrategy({ baseDelay: 1000, maxDelay: 30000, maxRetries: 5 })
    expect(strategy.next()).toBe(1000) // 2^0 * 1000
    expect(strategy.next()).toBe(2000) // 2^1 * 1000
    expect(strategy.next()).toBe(4000) // 2^2 * 1000
    expect(strategy.next()).toBe(8000) // 2^3 * 1000
    expect(strategy.next()).toBe(16000) // 2^4 * 1000
  })

  it("should cap at maxDelay", () => {
    const strategy = new BackoffStrategy({ baseDelay: 1000, maxDelay: 5000, maxRetries: 10 })
    strategy.next() // 1000
    strategy.next() // 2000
    strategy.next() // 4000
    expect(strategy.next()).toBe(5000) // capped
    expect(strategy.next()).toBe(5000) // still capped
  })

  it("should add jitter between 0.5x and 1.5x the delay", () => {
    const strategy = new BackoffStrategy({ baseDelay: 1000, maxDelay: 30000, maxRetries: 5 })
    const delay = strategy.next()
    expect(delay).toBeGreaterThanOrEqual(500)
    expect(delay).toBeLessThanOrEqual(1500)
  })

  it("should report hasMoreRetries correctly", () => {
    const strategy = new BackoffStrategy({ baseDelay: 1000, maxDelay: 30000, maxRetries: 3 })
    expect(strategy.hasMoreRetries()).toBe(true)
    strategy.next()
    strategy.next()
    strategy.next()
    expect(strategy.hasMoreRetries()).toBe(false)
  })

  it("should reset the retry count", () => {
    const strategy = new BackoffStrategy({ baseDelay: 1000, maxDelay: 30000, maxRetries: 3 })
    strategy.next()
    strategy.next()
    strategy.reset()
    expect(strategy.next()).toBe(1000)
  })

  it("should return -1 when exhausted", () => {
    const strategy = new BackoffStrategy({ baseDelay: 1000, maxDelay: 30000, maxRetries: 2 })
    strategy.next()
    strategy.next()
    expect(strategy.next()).toBe(-1)
  })

  it("should track retryCount", () => {
    const strategy = new BackoffStrategy({ baseDelay: 1000, maxDelay: 30000, maxRetries: 5 })
    expect(strategy.retryCount).toBe(0)
    strategy.next()
    expect(strategy.retryCount).toBe(1)
    strategy.next()
    expect(strategy.retryCount).toBe(2)
  })
})

describe("createBackoffStrategy", () => {
  it("should return a BackoffStrategy with defaults", () => {
    const strategy = createBackoffStrategy()
    expect(strategy).toBeInstanceOf(BackoffStrategy)
    const delay = strategy.next()
    expect(delay).toBeGreaterThan(0)
  })
})
