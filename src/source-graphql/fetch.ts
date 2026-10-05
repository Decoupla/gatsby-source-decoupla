import nodeFetch from "node-fetch"

// this is passed to the Apollo Link

// https://www.apollographql.com/docs/link/links/http/#fetch-polyfill

const MAX_RETRY_DELAY_MS = 60_000

class RateLimitError extends Error {
  constructor(message: string, readonly retryAfterSeconds?: number) {
    super(message)
  }
}

/** Seconds from a Retry-After header, given either as seconds or as an HTTP date. */
export const parseRetryAfter = (header: string | null, now = Date.now()): number | undefined => {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds
  const date = Date.parse(header)
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000))
}

const retryDelayMs = (error: RateLimitError, attempt: number) =>
  error.retryAfterSeconds !== undefined
    ? Math.min(error.retryAfterSeconds * 1000, MAX_RETRY_DELAY_MS)
    // Without a Retry-After, back off exponentially with jitter so parallel queries spread out.
    : Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS) * (0.5 + Math.random() / 2)

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason ?? new Error("Aborted"))
  const onAbort = () => { clearTimeout(timer); reject(signal?.reason ?? new Error("Aborted")) }
  const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve() }, ms)
  signal?.addEventListener("abort", onAbort, { once: true })
})

/**
 * Retries rate-limited (429) responses up to `maxRetries` times, waiting as long as
 * Retry-After asks; `onRetry` reports each wait. The timeout applies to each attempt.
 */
export const fetchWrapper = async (uri, options) => {
  const { maxRetries = 5, onRetry, ...attemptOptions } = options ?? {}
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOnce(uri, attemptOptions)
    } catch (error) {
      if (!(error instanceof RateLimitError) || attempt >= maxRetries) throw error
      const delayMs = retryDelayMs(error, attempt)
      onRetry?.({ attempt: attempt + 1, maxRetries, delayMs })
      await wait(delayMs, attemptOptions.signal)
    }
  }
}

const fetchOnce = async (uri, options) => {
  const controller = new AbortController()
  const { timeout = 30_000, signal, ...fetchOptions } = options ?? {}
  const abort = () => controller.abort()
  if (signal?.aborted) abort()
  signal?.addEventListener("abort", abort, { once: true })
  const timer = setTimeout(abort, timeout)
  try {
    const response = await nodeFetch(uri, { ...fetchOptions, signal: controller.signal })
    // Buffer inside the timeout so a stalled response body cannot hang the build.
    const body = await response.text()
    if (!response.ok) {
      let detail = ""
      try {
        const error = JSON.parse(body)
        const messages = error.message ? [error.message] : (error.errors ?? []).map(item => item.message)
        detail = messages.filter(item => typeof item === "string").join("; ").slice(0, 500)
      } catch { /* Non-JSON error bodies are intentionally omitted. */ }
      const message = `[Decoupla] GraphQL API: HTTP ${response.status}${detail ? `: ${detail}` : ""}`
      if (response.status === 429) throw new RateLimitError(message, parseRetryAfter(response.headers.get("retry-after")))
      throw new Error(message)
    }
    return new nodeFetch.Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error(`[Decoupla] GraphQL API request timed out after ${timeout}ms`)
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", abort)
  }
}
