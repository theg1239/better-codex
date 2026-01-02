import { useState, useEffect, useCallback } from 'react'
import { HUB_URL } from '../config'

export interface DailyDataPoint {
  date: string
  count: number
}

export interface AnalyticsSeries {
  metric: string
  series: DailyDataPoint[]
}

export type AnalyticsMetric = 
  | 'turns_started'
  | 'turns_completed'
  | 'threads_started'
  | 'command_exec'
  | 'approvals_requested_command'
  | 'approvals_requested_file'
  | 'approvals_accept'
  | 'approvals_decline'

export const METRIC_LABELS: Record<AnalyticsMetric, string> = {
  turns_started: 'Turns Started',
  turns_completed: 'Turns Completed',
  threads_started: 'Sessions Started',
  command_exec: 'Commands Executed',
  approvals_requested_command: 'Command Approvals',
  approvals_requested_file: 'File Approvals',
  approvals_accept: 'Approvals Accepted',
  approvals_decline: 'Approvals Declined',
}

export function useAnalytics(
  metric: AnalyticsMetric = 'turns_started',
  profileId?: string,
  model?: string,
  days = 365
) {
  const [data, setData] = useState<DailyDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams({ metric, days: String(days) })
      if (profileId) params.set('profileId', profileId)
      if (model) params.set('model', model)
      
      const response = await fetch(`${HUB_URL}/analytics/daily?${params}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch analytics: ${response.statusText}`)
      }
      
      const result: AnalyticsSeries = await response.json()
      setData(result.series)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [metric, profileId, model, days])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}

export function useMultipleMetrics(
  metrics: AnalyticsMetric[],
  profileId?: string,
  days = 365
) {
  const [data, setData] = useState<Record<AnalyticsMetric, DailyDataPoint[]>>({} as Record<AnalyticsMetric, DailyDataPoint[]>)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const results = await Promise.all(
        metrics.map(async (metric) => {
          const params = new URLSearchParams({ metric, days: String(days) })
          if (profileId) params.set('profileId', profileId)
          
          const response = await fetch(`${HUB_URL}/analytics/daily?${params}`)
          if (!response.ok) {
            throw new Error(`Failed to fetch ${metric}`)
          }
          
          const result: AnalyticsSeries = await response.json()
          return { metric, series: result.series }
        })
      )
      
      const dataMap = {} as Record<AnalyticsMetric, DailyDataPoint[]>
      for (const { metric, series } of results) {
        dataMap[metric as AnalyticsMetric] = series
      }
      setData(dataMap)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics')
    } finally {
      setLoading(false)
    }
  }, [metrics, profileId, days])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  return { data, loading, error, refetch: fetchAll }
}
