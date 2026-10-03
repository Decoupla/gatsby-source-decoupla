import nodeFetch from "node-fetch"

// this is passed to the Apollo Link

// https://www.apollographql.com/docs/link/links/http/#fetch-polyfill

export const fetchWrapper = async (uri, options) => {
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
      throw new Error(`[Decoupla] GraphQL API: HTTP ${response.status}${detail ? `: ${detail}` : ""}`)
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
