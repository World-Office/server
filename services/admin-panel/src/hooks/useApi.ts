import { useEffect, useState } from "react"

const API_BASE = "/api"

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchIndex, setRefetchIndex] = useState(0)

  const refetch = () => {
    setRefetchIndex((i) => i + 1)
  }

  useEffect(() => {
    let cancelled = false

    async function fetchApi() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`${API_BASE}${path}`)
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        }
        const json = (await res.json()) as T
        if (!cancelled) {
          setData(json)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchApi()
    return () => {
      cancelled = true
    }
  }, [path, refetchIndex])

  return { data, loading, error, refetch }
}

export async function putApi<T>(path: string, data: T): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }
}

export async function postApi<T>(path: string, data?: T): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }
}
