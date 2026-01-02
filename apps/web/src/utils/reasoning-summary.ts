import type { ReasoningSummary } from '../types'

const SUMMARY_ALIASES: Record<string, ReasoningSummary> = {
  auto: 'auto',
  concise: 'concise',
  detailed: 'detailed',
  none: 'none',
  off: 'none',
  disable: 'none',
}

export const normalizeReasoningSummary = (value?: string | null): ReasoningSummary | null => {
  if (!value) {
    return null
  }
  const normalized = SUMMARY_ALIASES[value]
  if (normalized) {
    return normalized
  }
  const lower = value.toLowerCase()
  return SUMMARY_ALIASES[lower] ?? null
}

export const reasoningSummaryLabel = (value: ReasoningSummary): string => {
  switch (value) {
    case 'auto':
      return 'Auto'
    case 'concise':
      return 'Concise'
    case 'detailed':
      return 'Detailed'
    case 'none':
      return 'None'
  }
}

export const reasoningSummaryDescription = (value: ReasoningSummary): string => {
  switch (value) {
    case 'auto':
      return 'Let the model choose the best summary length.'
    case 'concise':
      return 'Short, readable reasoning summaries.'
    case 'detailed':
      return 'Longer reasoning summaries with extra detail.'
    case 'none':
      return 'Disable reasoning summaries.'
  }
}
