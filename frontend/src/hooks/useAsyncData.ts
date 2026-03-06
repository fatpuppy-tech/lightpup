import { useCallback, useEffect, useRef, useState } from 'react'

export type UseAsyncDataResult<T> = {
  data: T | null
  loading: boolean
  error: string | null
  retry: () => void
}

/**
 * Fetches data on mount and when deps change. Returns { data, loading, error, retry }.
 */
export function useAsyncData<T>(
  fetchFn: () => Promise<T>,
  deps: React.DependencyList = []
): UseAsyncDataResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchFnRef = useRef(fetchFn)
  fetchFnRef.current = fetchFn

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchFnRef.current()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, retry: run }
}
