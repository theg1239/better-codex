import type { ApprovalPolicy } from '../types'

const APPROVAL_POLICY_ALIASES: Record<string, ApprovalPolicy> = {
  untrusted: 'untrusted',
  unlessTrusted: 'untrusted',
  'unless-trusted': 'untrusted',
  'unless_trusted': 'untrusted',
  'on-request': 'on-request',
  onRequest: 'on-request',
  on_request: 'on-request',
  'on-failure': 'on-failure',
  onFailure: 'on-failure',
  on_failure: 'on-failure',
  never: 'never',
}

export const normalizeApprovalPolicy = (value?: string | null): ApprovalPolicy | null => {
  if (!value) {
    return null
  }
  const normalized = APPROVAL_POLICY_ALIASES[value]
  if (normalized) {
    return normalized
  }
  const lower = value.toLowerCase()
  return APPROVAL_POLICY_ALIASES[lower] ?? null
}

export const approvalPolicyLabel = (value: ApprovalPolicy): string => {
  switch (value) {
    case 'untrusted':
      return 'Untrusted'
    case 'on-failure':
      return 'On failure'
    case 'on-request':
      return 'On request'
    case 'never':
      return 'Never'
  }
}

export const approvalPolicyDescription = (value: ApprovalPolicy): string => {
  switch (value) {
    case 'untrusted':
      return 'Always ask before running commands or edits.'
    case 'on-failure':
      return 'Run in sandbox; ask if it fails.'
    case 'on-request':
      return 'Ask before risky commands; auto-run safe reads.'
    case 'never':
      return 'Run without approvals.'
  }
}
