import type { ApprovalPolicy, ReasoningEffort, ReasoningSummary } from '../../types'
import { AlertDialog, Button, CopyDialog, Dialog, PromptDialog, Select, type SelectOption } from '../ui'

interface SessionDialogsProps {
  showModelDialog: boolean
  onCloseModelDialog: () => void
  modelOptions: SelectOption[]
  pendingModelId: string
  setPendingModelId: (value: string) => void
  pendingEffortOptions: SelectOption[]
  pendingEffort: ReasoningEffort | ''
  setPendingEffort: (value: ReasoningEffort | '') => void
  summaryOptions: SelectOption[]
  pendingSummary: ReasoningSummary | ''
  setPendingSummary: (value: ReasoningSummary | '') => void
  pendingCwd: string
  setPendingCwd: (value: string) => void
  onApplyModel: () => void
  showApprovalsDialog: boolean
  onCloseApprovalsDialog: () => void
  approvalOptions: Array<{ value: ApprovalPolicy; label: string; description: string }>
  pendingApproval: ApprovalPolicy
  setPendingApproval: (value: ApprovalPolicy) => void
  onApplyApproval: () => void
  showSkillsDialog: boolean
  onCloseSkillsDialog: () => void
  skillsLoading: boolean
  skillsError: string | null
  skillsList: Array<{ name: string; description: string; path: string }>
  onSelectSkill: (name: string) => void
  showResumeDialog: boolean
  onCloseResumeDialog: () => void
  resumeCandidates: Array<{ id: string; title: string; preview: string }>
  onResumeThread: (threadId: string) => void
  showFeedbackDialog: boolean
  onCloseFeedbackDialog: () => void
  feedbackCategory: string
  setFeedbackCategory: (value: string) => void
  feedbackReason: string
  setFeedbackReason: (value: string) => void
  feedbackIncludeLogs: boolean
  setFeedbackIncludeLogs: (value: boolean) => void
  onSendFeedback: () => void
  showApiKeyPrompt: boolean
  onCloseApiKeyPrompt: () => void
  onApiKeySubmit: (value: string) => void
  copyDialog: { open: boolean; url: string }
  setCopyDialog: (state: { open: boolean; url: string }) => void
  alertDialog: { open: boolean; title: string; message: string; variant: 'info' | 'warning' | 'error' }
  setAlertDialog: (state: { open: boolean; title: string; message: string; variant: 'info' | 'warning' | 'error' }) => void
}

export const SessionDialogs = ({
  showModelDialog,
  onCloseModelDialog,
  modelOptions,
  pendingModelId,
  setPendingModelId,
  pendingEffortOptions,
  pendingEffort,
  setPendingEffort,
  summaryOptions,
  pendingSummary,
  setPendingSummary,
  pendingCwd,
  setPendingCwd,
  onApplyModel,
  showApprovalsDialog,
  onCloseApprovalsDialog,
  approvalOptions,
  pendingApproval,
  setPendingApproval,
  onApplyApproval,
  showSkillsDialog,
  onCloseSkillsDialog,
  skillsLoading,
  skillsError,
  skillsList,
  onSelectSkill,
  showResumeDialog,
  onCloseResumeDialog,
  resumeCandidates,
  onResumeThread,
  showFeedbackDialog,
  onCloseFeedbackDialog,
  feedbackCategory,
  setFeedbackCategory,
  feedbackReason,
  setFeedbackReason,
  feedbackIncludeLogs,
  setFeedbackIncludeLogs,
  onSendFeedback,
  showApiKeyPrompt,
  onCloseApiKeyPrompt,
  onApiKeySubmit,
  copyDialog,
  setCopyDialog,
  alertDialog,
  setAlertDialog,
}: SessionDialogsProps) => {
  return (
    <>
      <Dialog open={showModelDialog} onClose={onCloseModelDialog} title="Model & Reasoning">
        <div className="space-y-3">
          <Select
            options={modelOptions}
            value={pendingModelId}
            onChange={(value) => setPendingModelId(value)}
            placeholder="Select model"
          />
          {pendingEffortOptions.length > 0 && (
            <Select
              options={pendingEffortOptions}
              value={pendingEffort || ''}
              onChange={(value) => setPendingEffort(value as ReasoningEffort)}
              placeholder="Effort"
            />
          )}
          <Select
            options={summaryOptions}
            value={pendingSummary || ''}
            onChange={(value) => setPendingSummary(value as ReasoningSummary)}
            placeholder="Summary"
          />
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-[0.2em] text-text-muted">
              Working directory
            </div>
            <input
              value={pendingCwd}
              onChange={(event) => setPendingCwd(event.target.value)}
              placeholder="/path/to/repo"
              className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-text-muted transition-colors"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onCloseModelDialog}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onApplyModel}>
            Apply
          </Button>
        </div>
      </Dialog>

      <Dialog open={showApprovalsDialog} onClose={onCloseApprovalsDialog} title="Approvals">
        <div className="space-y-2">
          {approvalOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPendingApproval(option.value)}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                pendingApproval === option.value
                  ? 'border-text-muted bg-bg-elevated text-text-primary'
                  : 'border-border bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
              }`}
            >
              <div className="text-xs font-semibold">{option.label}</div>
              <div className="text-[10px] text-text-muted mt-0.5">{option.description}</div>
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onCloseApprovalsDialog}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onApplyApproval}>
            Apply
          </Button>
        </div>
      </Dialog>

      <Dialog open={showSkillsDialog} onClose={onCloseSkillsDialog} title="Skills">
        <div className="space-y-2 max-h-[240px] overflow-y-auto">
          {skillsLoading && <div className="text-xs text-text-muted">Loading skills...</div>}
          {skillsError && <div className="text-xs text-accent-red">{skillsError}</div>}
          {!skillsLoading && !skillsError && skillsList.length === 0 && (
            <div className="text-xs text-text-muted">No skills found.</div>
          )}
          {!skillsLoading && !skillsError && skillsList.map((skill) => (
            <button
              key={skill.path}
              type="button"
              onClick={() => onSelectSkill(skill.name)}
              className="w-full text-left px-3 py-2 rounded-lg border border-border bg-bg-tertiary text-text-secondary hover:bg-bg-hover transition-colors"
            >
              <div className="text-xs font-semibold text-text-primary">{skill.name}</div>
              <div className="text-[10px] text-text-muted mt-0.5">{skill.description}</div>
            </button>
          ))}
        </div>
      </Dialog>

      <Dialog open={showResumeDialog} onClose={onCloseResumeDialog} title="Resume Session">
        <div className="space-y-2 max-h-[240px] overflow-y-auto">
          {resumeCandidates.length === 0 && (
            <div className="text-xs text-text-muted">No sessions available.</div>
          )}
          {resumeCandidates.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => onResumeThread(thread.id)}
              className="w-full text-left px-3 py-2 rounded-lg border border-border bg-bg-tertiary text-text-secondary hover:bg-bg-hover transition-colors"
            >
              <div className="text-xs font-semibold text-text-primary truncate">{thread.title}</div>
              <div className="text-[10px] text-text-muted mt-0.5 truncate">{thread.preview}</div>
            </button>
          ))}
        </div>
      </Dialog>

      <Dialog open={showFeedbackDialog} onClose={onCloseFeedbackDialog} title="Send Feedback">
        <div className="space-y-3">
          <Select
            options={[
              { value: 'bug', label: 'Bug' },
              { value: 'feature', label: 'Feature request' },
              { value: 'ux', label: 'UX' },
              { value: 'other', label: 'Other' },
            ]}
            value={feedbackCategory}
            onChange={(value) => setFeedbackCategory(value)}
          />
          <textarea
            value={feedbackReason}
            onChange={(event) => setFeedbackReason(event.target.value)}
            rows={3}
            placeholder="Describe the issue or suggestion..."
            className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-text-muted transition-colors"
          />
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={feedbackIncludeLogs}
              onChange={(event) => setFeedbackIncludeLogs(event.target.checked)}
              className="accent-accent-green"
            />
            Include logs
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onCloseFeedbackDialog}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onSendFeedback}>
            Send
          </Button>
        </div>
      </Dialog>

      <PromptDialog
        open={showApiKeyPrompt}
        onClose={onCloseApiKeyPrompt}
        onSubmit={onApiKeySubmit}
        title="Use API Key"
        placeholder="Paste OpenAI API key..."
        submitLabel="Connect"
      />

      <CopyDialog
        open={copyDialog.open}
        onClose={() => setCopyDialog({ open: false, url: '' })}
        title="Sign In"
        message="Open this URL in your browser to sign in to your OpenAI account:"
        copyText={copyDialog.url}
      />

      <AlertDialog
        open={alertDialog.open}
        onClose={() => setAlertDialog({ ...alertDialog, open: false })}
        title={alertDialog.title}
        message={alertDialog.message}
        variant={alertDialog.variant}
      />
    </>
  )
}
