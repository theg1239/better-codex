import { useMemo } from 'react'
import type { DailyDataPoint } from '../../hooks/use-analytics'

interface ContributionGraphProps {
  data: DailyDataPoint[]
  days?: number
  label?: string
  colorScheme?: 'green' | 'blue' | 'purple'
}

const COLOR_SCHEMES = {
  green: ['bg-bg-elevated', 'bg-emerald-900/50', 'bg-emerald-700/70', 'bg-emerald-500/80', 'bg-emerald-400'],
  blue: ['bg-bg-elevated', 'bg-blue-900/50', 'bg-blue-700/70', 'bg-blue-500/80', 'bg-blue-400'],
  purple: ['bg-bg-elevated', 'bg-purple-900/50', 'bg-purple-700/70', 'bg-purple-500/80', 'bg-purple-400'],
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

export function ContributionGraph({ 
  data, 
  days = 365,
  label = 'contributions',
  colorScheme = 'green'
}: ContributionGraphProps) {
  const { grid, monthLabels, totalCount, maxCount } = useMemo(() => {
    const dataMap = new Map<string, number>()
    for (const point of data) {
      dataMap.set(point.date, point.count)
    }

    const today = new Date()
    const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - days + 1)
    
    const dayOfWeek = startDate.getDay()
    startDate.setDate(startDate.getDate() - dayOfWeek)

    const weeks: Array<Array<{ date: string; count: number; isInRange: boolean }>> = []
    const monthLabels: Array<{ label: string; weekIndex: number }> = []
    let currentDate = new Date(startDate)
    let lastMonth = -1
    let totalCount = 0
    let maxCount = 0

    while (currentDate <= endDate) {
      const week: Array<{ date: string; count: number; isInRange: boolean }> = []
      
      for (let d = 0; d < 7; d++) {
        const dateKey = formatDate(currentDate)
        const count = dataMap.get(dateKey) ?? 0
        const isInRange = currentDate >= startDate && currentDate <= endDate
        
        if (isInRange && currentDate.getMonth() !== lastMonth) {
          monthLabels.push({ label: MONTHS[currentDate.getMonth()], weekIndex: weeks.length })
          lastMonth = currentDate.getMonth()
        }
        
        week.push({ date: dateKey, count, isInRange })
        
        if (isInRange) {
          totalCount += count
          maxCount = Math.max(maxCount, count)
        }
        
        currentDate.setDate(currentDate.getDate() + 1)
      }
      
      weeks.push(week)
    }

    return { grid: weeks, monthLabels, totalCount, maxCount }
  }, [data, days])

  const colors = COLOR_SCHEMES[colorScheme]

  const getColorLevel = (count: number): number => {
    if (count === 0) return 0
    if (maxCount === 0) return 0
    const ratio = count / maxCount
    if (ratio <= 0.25) return 1
    if (ratio <= 0.5) return 2
    if (ratio <= 0.75) return 3
    return 4
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary font-medium">
          {totalCount.toLocaleString()} {label} in the last {days === 365 ? 'year' : `${days} days`}
        </span>
      </div>
      
      <div className="overflow-x-auto">
        <div className="inline-block">
          <div className="flex text-[10px] text-text-muted mb-1 pl-7">
            {monthLabels.map((month, i) => (
              <div
                key={i}
                className="absolute"
                style={{ marginLeft: `${month.weekIndex * 12}px` }}
              >
                {month.label}
              </div>
            ))}
          </div>
          
          <div className="flex gap-0.5 relative mt-4">
            <div className="flex flex-col gap-0.5 text-[10px] text-text-muted pr-1 w-6">
              {DAYS.map((day, i) => (
                <div key={i} className="h-[10px] flex items-center justify-end">
                  {day}
                </div>
              ))}
            </div>
            
            {grid.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-0.5">
                {week.map((day, dayIndex) => (
                  <div
                    key={dayIndex}
                    className={`w-[10px] h-[10px] rounded-sm ${
                      day.isInRange ? colors[getColorLevel(day.count)] : 'bg-transparent'
                    }`}
                    title={day.isInRange ? `${day.date}: ${day.count} ${label}` : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
          
          <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-text-muted">
            <span>Less</span>
            {colors.map((color, i) => (
              <div key={i} className={`w-[10px] h-[10px] rounded-sm ${color}`} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface StatCardProps {
  label: string
  value: number | string
  change?: number
  icon?: React.ReactNode
}

export function StatCard({ label, value, change, icon }: StatCardProps) {
  return (
    <div className="bg-bg-elevated border border-border rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-text-muted mb-1">{label}</p>
          <p className="text-2xl font-semibold text-text-primary">{value}</p>
          {change !== undefined && (
            <p className={`text-xs mt-1 ${change >= 0 ? 'text-success' : 'text-error'}`}>
              {change >= 0 ? '+' : ''}{change}% from last period
            </p>
          )}
        </div>
        {icon && (
          <div className="p-2 bg-bg-hover rounded-lg text-text-muted">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
