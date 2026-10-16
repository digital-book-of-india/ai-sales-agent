import { useEffect, useState } from 'react'
import { getSetting, updateSetting } from '../settings/api'
import {
  WEEKDAY_LABELS,
  type AiSettings,
  type CallingSettings,
  type CompanyInfo,
  type LeadScoringConfig,
  type SalesSettings,
} from '../settings/types'
import { listAgents } from '../ai-agents/api'
import type { AiAgent } from '../ai-agents/types'
import { listPipelineStages } from '../pipeline/api'
import type { PipelineStage } from '../pipeline/types'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { FullScreenLoader } from '../components/FullScreenLoader'

const DEFAULT_COMPANY: CompanyInfo = {
  name: '',
  logoUrl: '',
  contactEmail: '',
  contactPhone: '',
  businessHours: { timezone: 'Asia/Kolkata', opensAt: '09:00', closesAt: '18:00', daysOpen: [1, 2, 3, 4, 5] },
}
const DEFAULT_CALLING: CallingSettings = {
  provider: 'asterisk',
  callerId: '',
  recordingEnabled: true,
  callingHoursStart: '09:00',
  callingHoursEnd: '19:00',
  maxRetries: 3,
  retryIntervalMinutes: 60,
  concurrentCalls: 1,
}
const DEFAULT_AI: AiSettings = {
  defaultAgentId: null,
  defaultLanguage: 'en-IN',
  defaultVoice: 'meera',
  defaultResponseStyle: 'friendly',
}
const DEFAULT_SALES: SalesSettings = {
  followUpRules: { autoScheduleOnNoAnswer: true, defaultDueInHours: 24, maxAutoFollowUps: 3 },
}
const DEFAULT_LEAD_SCORING: LeadScoringConfig = {
  weights: {
    requirementConfirmed: 25,
    budgetConfirmed: 20,
    timelineConfirmed: 20,
    decisionMaker: 15,
    positiveIntent: 10,
    demoRequested: 10,
  },
  thresholds: { hot: 90, warm: 70, cold: 40 },
}

type Tab = 'company' | 'calling' | 'ai' | 'sales'
const TABS: { id: Tab; label: string }[] = [
  { id: 'company', label: 'Company' },
  { id: 'calling', label: 'Calling' },
  { id: 'ai', label: 'AI' },
  { id: 'sales', label: 'Sales' },
]

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
    </div>
  )
}

function SaveBar({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <div className="flex justify-end">
      <button type="button" className="btn-primary" disabled={saving} onClick={onSave}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('company')
  const [loading, setLoading] = useState(true)

  const [company, setCompany] = useState(DEFAULT_COMPANY)
  const [calling, setCalling] = useState(DEFAULT_CALLING)
  const [ai, setAi] = useState(DEFAULT_AI)
  const [sales, setSales] = useState(DEFAULT_SALES)
  const [leadScoring, setLeadScoring] = useState(DEFAULT_LEAD_SCORING)
  const [agents, setAgents] = useState<AiAgent[]>([])
  const [stages, setStages] = useState<PipelineStage[]>([])

  const [savingSection, setSavingSection] = useState<Tab | null>(null)

  useEffect(() => {
    Promise.all([
      getSetting<CompanyInfo>('company'),
      getSetting<CallingSettings>('calling'),
      getSetting<AiSettings>('ai'),
      getSetting<SalesSettings>('sales'),
      getSetting<LeadScoringConfig>('lead_scoring'),
      listAgents(),
      listPipelineStages(),
    ])
      .then(([companyRes, callingRes, aiRes, salesRes, leadScoringRes, agentsRes, stagesRes]) => {
        setCompany(companyRes)
        setCalling(callingRes)
        setAi(aiRes)
        setSales(salesRes)
        setLeadScoring(leadScoringRes)
        setAgents(agentsRes)
        setStages(stagesRes)
      })
      .catch((err: unknown) => {
        toast.error(err instanceof ApiError ? err.message : 'Failed to load settings')
      })
      .finally(() => setLoading(false))
  }, [])

  async function save<T>(key: 'company' | 'calling' | 'ai', value: T) {
    setSavingSection(key)
    try {
      await updateSetting(key, value)
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save settings')
    } finally {
      setSavingSection(null)
    }
  }

  async function saveSalesTab() {
    setSavingSection('sales')
    try {
      await Promise.all([
        updateSetting('sales', sales),
        updateSetting('lead_scoring', leadScoring),
      ])
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save settings')
    } finally {
      setSavingSection(null)
    }
  }

  if (loading) return <FullScreenLoader />

  return (
    <>
      <header className="mb-8">
        <span className="mb-1.5 block text-xs font-semibold tracking-wide text-brand uppercase">
          Settings
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Organization settings</h1>
        <p className="mt-1.5 text-sm text-muted">
          Company details, calling defaults, AI defaults, and sales rules.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`cursor-pointer rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === t.id ? 'border-b-2 border-brand text-brand' : 'text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'company' && (
        <div className="card flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Company name" htmlFor="company-name">
              <input
                id="company-name"
                className="input-field"
                value={company.name}
                onChange={(e) => setCompany({ ...company, name: e.target.value })}
              />
            </Field>
            <Field label="Logo URL" htmlFor="company-logo">
              <input
                id="company-logo"
                className="input-field"
                value={company.logoUrl}
                onChange={(e) => setCompany({ ...company, logoUrl: e.target.value })}
              />
            </Field>
            <Field label="Contact email" htmlFor="company-email">
              <input
                id="company-email"
                type="email"
                className="input-field"
                value={company.contactEmail}
                onChange={(e) => setCompany({ ...company, contactEmail: e.target.value })}
              />
            </Field>
            <Field label="Contact phone" htmlFor="company-phone">
              <input
                id="company-phone"
                className="input-field"
                value={company.contactPhone}
                onChange={(e) => setCompany({ ...company, contactPhone: e.target.value })}
              />
            </Field>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-bold text-ink">Business hours</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Timezone" htmlFor="business-tz">
                <input
                  id="business-tz"
                  className="input-field"
                  value={company.businessHours.timezone}
                  onChange={(e) =>
                    setCompany({ ...company, businessHours: { ...company.businessHours, timezone: e.target.value } })
                  }
                />
              </Field>
              <Field label="Opens at" htmlFor="business-open">
                <input
                  id="business-open"
                  type="time"
                  className="input-field"
                  value={company.businessHours.opensAt}
                  onChange={(e) =>
                    setCompany({ ...company, businessHours: { ...company.businessHours, opensAt: e.target.value } })
                  }
                />
              </Field>
              <Field label="Closes at" htmlFor="business-close">
                <input
                  id="business-close"
                  type="time"
                  className="input-field"
                  value={company.businessHours.closesAt}
                  onChange={(e) =>
                    setCompany({ ...company, businessHours: { ...company.businessHours, closesAt: e.target.value } })
                  }
                />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              {WEEKDAY_LABELS.map((label, day) => {
                const checked = company.businessHours.daysOpen.includes(day)
                return (
                  <label key={label} className="flex items-center gap-1.5 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const daysOpen = e.target.checked
                          ? [...company.businessHours.daysOpen, day].sort()
                          : company.businessHours.daysOpen.filter((d) => d !== day)
                        setCompany({ ...company, businessHours: { ...company.businessHours, daysOpen } })
                      }}
                    />
                    {label}
                  </label>
                )
              })}
            </div>
          </div>

          <SaveBar saving={savingSection === 'company'} onSave={() => void save('company', company)} />
        </div>
      )}

      {tab === 'calling' && (
        <div className="card flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Telephony provider" htmlFor="calling-provider">
              <select
                id="calling-provider"
                className="input-field"
                value={calling.provider}
                onChange={(e) => setCalling({ ...calling, provider: e.target.value })}
              >
                <option value="asterisk">Asterisk</option>
                <option value="mock">Mock (dev/test)</option>
              </select>
            </Field>
            <Field label="Caller ID" htmlFor="calling-caller-id">
              <input
                id="calling-caller-id"
                className="input-field"
                placeholder="+91XXXXXXXXXX"
                value={calling.callerId}
                onChange={(e) => setCalling({ ...calling, callerId: e.target.value })}
              />
            </Field>
            <Field label="Calling hours start" htmlFor="calling-start">
              <input
                id="calling-start"
                type="time"
                className="input-field"
                value={calling.callingHoursStart}
                onChange={(e) => setCalling({ ...calling, callingHoursStart: e.target.value })}
              />
            </Field>
            <Field label="Calling hours end" htmlFor="calling-end">
              <input
                id="calling-end"
                type="time"
                className="input-field"
                value={calling.callingHoursEnd}
                onChange={(e) => setCalling({ ...calling, callingHoursEnd: e.target.value })}
              />
            </Field>
            <Field label="Max retry attempts" htmlFor="calling-retries">
              <input
                id="calling-retries"
                type="number"
                min={0}
                className="input-field"
                value={calling.maxRetries}
                onChange={(e) => setCalling({ ...calling, maxRetries: Number(e.target.value) })}
              />
            </Field>
            <Field label="Retry interval (minutes)" htmlFor="calling-retry-interval">
              <input
                id="calling-retry-interval"
                type="number"
                min={1}
                className="input-field"
                value={calling.retryIntervalMinutes}
                onChange={(e) => setCalling({ ...calling, retryIntervalMinutes: Number(e.target.value) })}
              />
            </Field>
            <Field label="Concurrent calls" htmlFor="calling-concurrent">
              <input
                id="calling-concurrent"
                type="number"
                min={1}
                className="input-field"
                value={calling.concurrentCalls}
                onChange={(e) => setCalling({ ...calling, concurrentCalls: Number(e.target.value) })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={calling.recordingEnabled}
              onChange={(e) => setCalling({ ...calling, recordingEnabled: e.target.checked })}
            />
            Record calls by default
          </label>
          <p className="text-xs text-muted">
            These are org-wide defaults a new campaign starts with — an already-running campaign keeps its own
            settings.
          </p>
          <SaveBar saving={savingSection === 'calling'} onSave={() => void save('calling', calling)} />
        </div>
      )}

      {tab === 'ai' && (
        <div className="card flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Default AI agent" htmlFor="ai-agent">
              <select
                id="ai-agent"
                className="input-field"
                value={ai.defaultAgentId ?? ''}
                onChange={(e) => setAi({ ...ai, defaultAgentId: e.target.value || null })}
              >
                <option value="">None</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Default language" htmlFor="ai-language">
              <input
                id="ai-language"
                className="input-field"
                placeholder="en-IN"
                value={ai.defaultLanguage}
                onChange={(e) => setAi({ ...ai, defaultLanguage: e.target.value })}
              />
            </Field>
            <Field label="Default voice" htmlFor="ai-voice">
              <input
                id="ai-voice"
                className="input-field"
                value={ai.defaultVoice}
                onChange={(e) => setAi({ ...ai, defaultVoice: e.target.value })}
              />
            </Field>
            <Field label="Response style" htmlFor="ai-style">
              <select
                id="ai-style"
                className="input-field"
                value={ai.defaultResponseStyle}
                onChange={(e) => setAi({ ...ai, defaultResponseStyle: e.target.value as AiSettings['defaultResponseStyle'] })}
              >
                <option value="concise">Concise</option>
                <option value="friendly">Friendly</option>
                <option value="formal">Formal</option>
                <option value="persuasive">Persuasive</option>
              </select>
            </Field>
          </div>
          <SaveBar saving={savingSection === 'ai'} onSave={() => void save('ai', ai)} />
        </div>
      )}

      {tab === 'sales' && (
        <div className="flex flex-col gap-5">
          <div className="card flex flex-col gap-4">
            <h3 className="text-sm font-bold text-ink">Lead scoring weights</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {(Object.keys(leadScoring.weights) as (keyof typeof leadScoring.weights)[]).map((key) => (
                <Field key={key} label={key} htmlFor={`weight-${key}`}>
                  <input
                    id={`weight-${key}`}
                    type="number"
                    className="input-field"
                    value={leadScoring.weights[key]}
                    onChange={(e) =>
                      setLeadScoring({
                        ...leadScoring,
                        weights: { ...leadScoring.weights, [key]: Number(e.target.value) },
                      })
                    }
                  />
                </Field>
              ))}
            </div>
            <h3 className="mt-2 text-sm font-bold text-ink">Score thresholds</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {(Object.keys(leadScoring.thresholds) as (keyof typeof leadScoring.thresholds)[]).map((key) => (
                <Field key={key} label={key} htmlFor={`threshold-${key}`}>
                  <input
                    id={`threshold-${key}`}
                    type="number"
                    className="input-field"
                    value={leadScoring.thresholds[key]}
                    onChange={(e) =>
                      setLeadScoring({
                        ...leadScoring,
                        thresholds: { ...leadScoring.thresholds, [key]: Number(e.target.value) },
                      })
                    }
                  />
                </Field>
              ))}
            </div>
          </div>

          <div className="card flex flex-col gap-4">
            <h3 className="text-sm font-bold text-ink">Follow-up rules</h3>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={sales.followUpRules.autoScheduleOnNoAnswer}
                onChange={(e) =>
                  setSales({
                    ...sales,
                    followUpRules: { ...sales.followUpRules, autoScheduleOnNoAnswer: e.target.checked },
                  })
                }
              />
              Auto-schedule a follow-up when a call goes unanswered
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Default due-in (hours)" htmlFor="followup-due-hours">
                <input
                  id="followup-due-hours"
                  type="number"
                  min={1}
                  className="input-field"
                  value={sales.followUpRules.defaultDueInHours}
                  onChange={(e) =>
                    setSales({
                      ...sales,
                      followUpRules: { ...sales.followUpRules, defaultDueInHours: Number(e.target.value) },
                    })
                  }
                />
              </Field>
              <Field label="Max auto follow-ups per lead" htmlFor="followup-max">
                <input
                  id="followup-max"
                  type="number"
                  min={0}
                  className="input-field"
                  value={sales.followUpRules.maxAutoFollowUps}
                  onChange={(e) =>
                    setSales({
                      ...sales,
                      followUpRules: { ...sales.followUpRules, maxAutoFollowUps: Number(e.target.value) },
                    })
                  }
                />
              </Field>
            </div>
          </div>

          <div className="card">
            <h3 className="mb-3 text-sm font-bold text-ink">Pipeline stages</h3>
            {stages.length === 0 ? (
              <p className="text-sm text-muted">No pipeline stages configured.</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {stages.map((stage) => (
                  <li key={stage.id} className="flex items-center gap-3 text-sm text-ink">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                      {stage.order}
                    </span>
                    {stage.name}
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-xs text-muted">Managed from the Pipeline board.</p>
          </div>

          <SaveBar saving={savingSection === 'sales'} onSave={() => void saveSalesTab()} />
        </div>
      )}
    </>
  )
}
