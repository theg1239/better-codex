import { useState } from 'react'
import { Dialog, Button, Icons } from '../ui'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

type SettingsTab = 'general' | 'accounts' | 'appearance' | 'shortcuts'

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  return (
    <Dialog open={open} onClose={onClose} size="large">
      <div className="flex h-[600px]">
        <div className="w-48 border-r border-border p-4 flex flex-col">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Settings</h2>
          <nav className="space-y-1 flex-1">
            <SettingsNavItem
              icon={<Icons.Settings className="w-4 h-4" />}
              label="General"
              active={activeTab === 'general'}
              onClick={() => setActiveTab('general')}
            />
            <SettingsNavItem
              icon={<Icons.Grid className="w-4 h-4" />}
              label="Accounts"
              active={activeTab === 'accounts'}
              onClick={() => setActiveTab('accounts')}
            />
            <SettingsNavItem
              icon={<Icons.Bolt className="w-4 h-4" />}
              label="Appearance"
              active={activeTab === 'appearance'}
              onClick={() => setActiveTab('appearance')}
            />
            <SettingsNavItem
              icon={<Icons.Clipboard className="w-4 h-4" />}
              label="Shortcuts"
              active={activeTab === 'shortcuts'}
              onClick={() => setActiveTab('shortcuts')}
            />
          </nav>
          <div className="pt-4 border-t border-border">
            <Button variant="ghost" size="sm" className="w-full" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'general' && <GeneralSettings />}
          {activeTab === 'accounts' && <AccountsSettings />}
          {activeTab === 'appearance' && <AppearanceSettings />}
          {activeTab === 'shortcuts' && <ShortcutsSettings />}
        </div>
      </div>
    </Dialog>
  )
}

function SettingsNavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left ${
        active
          ? 'bg-bg-elevated text-text-primary'
          : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
      }`}
    >
      <span className={active ? 'text-accent-green' : ''}>{icon}</span>
      <span className="text-sm">{label}</span>
    </button>
  )
}

function GeneralSettings() {
  return (
    <div className="p-6">
      <div className="max-w-2xl">
        <h3 className="text-base font-semibold text-text-primary mb-1">General Settings</h3>
        <p className="text-sm text-text-muted mb-6">Manage your general preferences and behavior</p>

        <div className="space-y-6">
          <SettingItem
            label="Auto-save conversations"
            description="Automatically save your conversations as you type"
          >
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-bg-elevated peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-green"></div>
            </label>
          </SettingItem>

          <SettingItem
            label="Default model"
            description="Choose the default AI model for new conversations"
          >
            <select className="px-3 py-1.5 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary focus:border-accent-green focus:outline-none">
              <option>GPT-4</option>
              <option>GPT-4 Turbo</option>
              <option>GPT-3.5</option>
            </select>
          </SettingItem>

          <SettingItem
            label="Send message on Enter"
            description="Press Enter to send messages (Shift+Enter for new line)"
          >
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-bg-elevated peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-green"></div>
            </label>
          </SettingItem>

          <SettingItem
            label="Clear conversation history"
            description="Delete all your conversations permanently"
          >
            <Button variant="danger" size="sm">
              Clear All
            </Button>
          </SettingItem>
        </div>
      </div>
    </div>
  )
}

function AccountsSettings() {
  return (
    <div className="p-6">
      <div className="max-w-2xl">
        <h3 className="text-base font-semibold text-text-primary mb-1">Account Management</h3>
        <p className="text-sm text-text-muted mb-6">Manage your connected accounts and authentication</p>

        <div className="space-y-6">
          <SettingItem
            label="Connected accounts"
            description="View and manage your connected AI service accounts"
          >
            <Button variant="primary" size="sm">
              <Icons.Plus className="w-3.5 h-3.5" />
              Add Account
            </Button>
          </SettingItem>

          <div className="bg-bg-tertiary border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent-green flex items-center justify-center">
                  <span className="text-black text-sm font-bold">AI</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">OpenAI Account</p>
                  <p className="text-xs text-text-muted">user@example.com</p>
                </div>
              </div>
              <Button variant="ghost" size="sm">
                Disconnect
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-1 bg-accent-green/10 text-accent-green rounded">Active</span>
              <span className="text-text-muted">Last used: Today</span>
            </div>
          </div>

          <SettingItem
            label="Session timeout"
            description="Automatically log out after period of inactivity"
          >
            <select className="px-3 py-1.5 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary focus:border-accent-green focus:outline-none">
              <option>Never</option>
              <option>15 minutes</option>
              <option>30 minutes</option>
              <option>1 hour</option>
              <option>4 hours</option>
            </select>
          </SettingItem>
        </div>
      </div>
    </div>
  )
}

function AppearanceSettings() {
  return (
    <div className="p-6">
      <div className="max-w-2xl">
        <h3 className="text-base font-semibold text-text-primary mb-1">Appearance</h3>
        <p className="text-sm text-text-muted mb-6">Customize how the application looks</p>

        <div className="space-y-6">
          <SettingItem
            label="Theme"
            description="Choose your preferred color theme"
          >
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-accent-green text-white rounded-lg text-sm font-medium">
                Dark
              </button>
              <button className="px-4 py-2 bg-bg-tertiary border border-border text-text-muted rounded-lg text-sm">
                Light
              </button>
              <button className="px-4 py-2 bg-bg-tertiary border border-border text-text-muted rounded-lg text-sm">
                Auto
              </button>
            </div>
          </SettingItem>

          <SettingItem
            label="Font size"
            description="Adjust the size of text throughout the app"
          >
            <select className="px-3 py-1.5 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary focus:border-accent-green focus:outline-none">
              <option>Small</option>
              <option>Medium</option>
              <option>Large</option>
            </select>
          </SettingItem>

          <SettingItem
            label="Code theme"
            description="Choose syntax highlighting theme for code blocks"
          >
            <select className="px-3 py-1.5 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary focus:border-accent-green focus:outline-none">
              <option>GitHub Dark</option>
              <option>Dracula</option>
              <option>Monokai</option>
              <option>One Dark</option>
            </select>
          </SettingItem>

          <SettingItem
            label="Compact mode"
            description="Reduce spacing for a more condensed interface"
          >
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" />
              <div className="w-11 h-6 bg-bg-elevated peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-green"></div>
            </label>
          </SettingItem>

          <SettingItem
            label="Animations"
            description="Enable smooth transitions and animations"
          >
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-bg-elevated peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-green"></div>
            </label>
          </SettingItem>
        </div>
      </div>
    </div>
  )
}

function ShortcutsSettings() {
  return (
    <div className="p-6">
      <div className="max-w-2xl">
        <h3 className="text-base font-semibold text-text-primary mb-1">Keyboard Shortcuts</h3>
        <p className="text-sm text-text-muted mb-6">View and customize keyboard shortcuts</p>

        <div className="space-y-4">
          <ShortcutItem label="New conversation" shortcut="⌘ N" />
          <ShortcutItem label="Search" shortcut="⌘ K" />
          <ShortcutItem label="Toggle sidebar" shortcut="⌘ B" />
          <ShortcutItem label="Focus message input" shortcut="⌘ /" />
          <ShortcutItem label="Copy last response" shortcut="⌘ ⇧ C" />
          <ShortcutItem label="Delete conversation" shortcut="⌘ ⇧ ⌫" />
          <ShortcutItem label="Settings" shortcut="⌘ ," />
        </div>
      </div>
    </div>
  )
}

function SettingItem({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex-1 pr-4">
        <p className="text-sm font-medium text-text-primary mb-0.5">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function ShortcutItem({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-text-secondary">{label}</span>
      <kbd className="px-2 py-1 bg-bg-tertiary border border-border rounded text-xs text-text-muted font-mono">
        {shortcut}
      </kbd>
    </div>
  )
}
