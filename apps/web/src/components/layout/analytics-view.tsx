import { useState, useMemo } from 'react'
import { useAnalytics, useMultipleMetrics, type AnalyticsMetric } from '../../hooks/use-analytics'
import { Icons, Select, SectionHeader } from '../ui'
import { useAppStore } from '../../store'

const CONTRIBUTION_METRICS: { value: AnalyticsMetric; label: string }[] = [
  { value: 'turns_started', label: 'Turns' },
  { value: 'turns_completed', label: 'Turns Completed' },
  { value: 'threads_started', label: 'Sessions' },
  { value: 'command_exec', label: 'Commands' },
]

const YEARS = [2026, 2025, 2024]

export function AnalyticsView() {
  const { accounts, selectedAccountId } = useAppStore()
  const [selectedMetric, setSelectedMetric] = useState<AnalyticsMetric>('turns_started')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  
  const profileId = selectedAccountId ?? undefined
  
  const now = new Date()
  const isCurrentYear = selectedYear === now.getFullYear()
  const yearStart = new Date(selectedYear, 0, 1)
  const yearEnd = isCurrentYear ? now : new Date(selectedYear, 11, 31)
  const daysDiff = Math.ceil((yearEnd.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
  
  const { data: graphData, loading } = useAnalytics(selectedMetric, profileId, undefined, isCurrentYear ? 365 : daysDiff)
  
  const yearData = useMemo(() => {
    return graphData.filter(d => d.date.startsWith(String(selectedYear)))
  }, [graphData, selectedYear])
  
  const { data: allMetrics } = useMultipleMetrics(
    ['turns_started', 'threads_started', 'command_exec', 'approvals_requested_command'],
    profileId,
    365
  )
  
  const totalTurns = (allMetrics.turns_started ?? []).reduce((sum, d) => sum + d.count, 0)
  const totalSessions = (allMetrics.threads_started ?? []).reduce((sum, d) => sum + d.count, 0)
  const totalCommands = (allMetrics.command_exec ?? []).reduce((sum, d) => sum + d.count, 0)
  const totalApprovals = (allMetrics.approvals_requested_command ?? []).reduce((sum, d) => sum + d.count, 0)

  const selectedAccount = accounts.find(a => a.id === selectedAccountId)
  const totalForYear = yearData.reduce((sum, d) => sum + d.count, 0)

  return (
    <div className="flex-1 overflow-y-auto bg-bg-primary">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Analytics</h1>
          <p className="text-sm text-text-muted mt-1">
            {selectedAccount 
              ? `Activity for ${selectedAccount.name}`
              : 'Activity across all accounts'
            }
          </p>
        </div>

        <div className="bg-bg-secondary border border-border rounded-lg p-4 overflow-visible">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="text-sm text-text-primary">
              <span className="font-medium">{totalForYear.toLocaleString()}</span>
              <span className="text-text-muted ml-1">
                {CONTRIBUTION_METRICS.find(m => m.value === selectedMetric)?.label.toLowerCase()} in {selectedYear}
              </span>
            </div>
            <div className="flex items-center gap-2 relative z-10">
              <Select
                value={selectedMetric}
                onChange={(value) => setSelectedMetric(value as AnalyticsMetric)}
                options={CONTRIBUTION_METRICS}
                className="w-44"
              />
            </div>
          </div>
          
          {loading ? (
            <div className="h-32 flex items-center justify-center text-text-muted">
              Loading...
            </div>
          ) : (
            <div className="flex gap-4">
              <div className="hidden md:flex flex-col gap-1 text-xs text-text-muted">
                {YEARS.map(year => (
                  <button
                    key={year}
                    onClick={() => setSelectedYear(year)}
                    className={`px-2 py-1 rounded text-left transition-colors ${
                      selectedYear === year 
                        ? 'bg-bg-elevated text-text-primary font-medium' 
                        : 'hover:text-text-secondary'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
              
              <div className="flex-1 overflow-x-auto">
                <GitHubContributionGraph data={yearData} year={selectedYear} />
              </div>
            </div>
          )}
          
          <div className="flex md:hidden items-center justify-center gap-2 mt-4 pt-3 border-t border-border">
            {YEARS.map(year => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  selectedYear === year 
                    ? 'bg-bg-elevated text-text-primary font-medium border border-border' 
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatBlock label="Turns" value={totalTurns} icon={<Icons.Bolt className="w-4 h-4" />} />
          <StatBlock label="Sessions" value={totalSessions} icon={<Icons.Grid className="w-4 h-4" />} />
          <StatBlock label="Commands" value={totalCommands} icon={<Icons.Terminal className="w-4 h-4" />} />
          <StatBlock label="Approvals" value={totalApprovals} icon={<Icons.Check className="w-4 h-4" />} />
        </div>

        <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <SectionHeader>Recent Activity</SectionHeader>
          </div>
          <div className="divide-y divide-border">
            {[...yearData].reverse().slice(0, 10).map((day) => (
              <div key={day.date} className="flex items-center justify-between px-4 py-2.5 hover:bg-bg-hover">
                <span className="text-sm text-text-primary">{formatDate(day.date)}</span>
                <span className="text-sm text-text-muted">{day.count} {day.count === 1 ? 'contribution' : 'contributions'}</span>
              </div>
            ))}
            {yearData.length === 0 && (
              <div className="px-4 py-8 text-center text-text-muted text-sm">
                No activity recorded for {selectedYear}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatBlock({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-3 flex items-center gap-3">
      <div className="p-2 bg-bg-hover rounded-lg text-text-muted">
        {icon}
      </div>
      <div>
        <div className="text-lg font-semibold text-text-primary">{value.toLocaleString()}</div>
        <div className="text-xs text-text-muted">{label}</div>
      </div>
    </div>
  )
}

interface DailyDataPoint {
  date: string
  count: number
}

function GitHubContributionGraph({ data, year }: { data: DailyDataPoint[]; year: number }) {
  const { grid, monthLabels, maxCount } = useMemo(() => {
    const dataMap = new Map<string, number>()
    for (const point of data) {
      dataMap.set(point.date, point.count)
    }

    const now = new Date()
    const isCurrentYear = year === now.getFullYear()
    const endDate = isCurrentYear ? now : new Date(year, 11, 31)
    const startDate = new Date(year, 0, 1)
    
    const startDayOfWeek = startDate.getDay()
    const adjustedStart = new Date(startDate)
    adjustedStart.setDate(adjustedStart.getDate() - startDayOfWeek)

    const weeks: Array<Array<{ date: string; count: number; isInRange: boolean }>> = []
    const monthLabels: Array<{ label: string; weekIndex: number }> = []
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    let currentDate = new Date(adjustedStart)
    let lastMonth = -1
    let maxCount = 0

    while (currentDate <= endDate || weeks.length < 53) {
      const week: Array<{ date: string; count: number; isInRange: boolean }> = []
      
      for (let d = 0; d < 7; d++) {
        const dateKey = formatDateKey(currentDate)
        const count = dataMap.get(dateKey) ?? 0
        const inYear = currentDate.getFullYear() === year
        const notFuture = currentDate <= now
        const isInRange = inYear && notFuture
        
        if (inYear && currentDate.getMonth() !== lastMonth && currentDate.getDate() <= 7) {
          monthLabels.push({ label: months[currentDate.getMonth()], weekIndex: weeks.length })
          lastMonth = currentDate.getMonth()
        }
        
        week.push({ date: dateKey, count, isInRange })
        maxCount = Math.max(maxCount, count)
        
        currentDate.setDate(currentDate.getDate() + 1)
      }
      
      weeks.push(week)
      if (weeks.length >= 53) break
    }

    return { grid: weeks, monthLabels, maxCount }
  }, [data, year])

  const getColorClass = (count: number, isInRange: boolean): string => {
    if (!isInRange) return 'bg-transparent'
    if (count === 0) return 'bg-bg-elevated'
    if (maxCount === 0) return 'bg-bg-elevated'
    const ratio = count / maxCount
    if (ratio <= 0.25) return 'bg-emerald-900/60'
    if (ratio <= 0.5) return 'bg-emerald-700/70'
    if (ratio <= 0.75) return 'bg-emerald-500/80'
    return 'bg-emerald-400'
  }

  const days = ['', 'Mon', '', 'Wed', '', 'Fri', '']

  return (
    <div>
      <div className="flex text-[10px] text-text-muted mb-1 ml-6">
        {monthLabels.map((m, i) => (
          <span 
            key={i} 
            className="absolute"
            style={{ marginLeft: `${m.weekIndex * 13}px` }}
          >
            {m.label}
          </span>
        ))}
      </div>
      
      <div className="flex gap-[3px] mt-4">
        <div className="flex flex-col gap-[3px] text-[10px] text-text-muted w-5">
          {days.map((day, i) => (
            <div key={i} className="h-[11px] flex items-center justify-end pr-1">
              {day}
            </div>
          ))}
        </div>
        
        {grid.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day, di) => (
              <div
                key={di}
                className={`w-[11px] h-[11px] rounded-sm ${getColorClass(day.count, day.isInRange)}`}
                title={day.isInRange ? `${day.date}: ${day.count} contributions` : undefined}
              />
            ))}
          </div>
        ))}
      </div>
      
      <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-text-muted">
        <span>Less</span>
        <div className="w-[11px] h-[11px] rounded-sm bg-bg-elevated" />
        <div className="w-[11px] h-[11px] rounded-sm bg-emerald-900/60" />
        <div className="w-[11px] h-[11px] rounded-sm bg-emerald-700/70" />
        <div className="w-[11px] h-[11px] rounded-sm bg-emerald-500/80" />
        <div className="w-[11px] h-[11px] rounded-sm bg-emerald-400" />
        <span>More</span>
      </div>
    </div>
  )
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
