import { useState } from 'react'
import { StringListEditor } from '../components/StringListEditor'
import { fromRuleList, toRuleList, type SalesPlaybook, type UpdatePlaybookInput } from './types'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'

export function PlaybookForm({
  playbook,
  onSave,
}: {
  playbook: SalesPlaybook
  onSave: (input: UpdatePlaybookInput) => Promise<void>
}) {
  const [opening, setOpening] = useState(playbook.opening ?? '')
  const [discoveryQuestions, setDiscoveryQuestions] = useState(playbook.discoveryQuestions)
  const [qualificationRules, setQualificationRules] = useState(
    toRuleList(playbook.qualificationRules),
  )
  const [objectionHandling, setObjectionHandling] = useState(
    toRuleList(playbook.objectionHandling),
  )
  const [closingRules, setClosingRules] = useState(toRuleList(playbook.closingRules))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({
        opening: opening.trim() || undefined,
        discoveryQuestions,
        qualificationRules: fromRuleList(qualificationRules),
        objectionHandling: fromRuleList(objectionHandling),
        closingRules: fromRuleList(closingRules),
      })
      toast.success('Playbook saved')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save playbook')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label htmlFor="playbook-opening" className="mb-1.5 block text-sm font-semibold text-ink">
          Opening
        </label>
        <textarea
          id="playbook-opening"
          className="input-field min-h-20 resize-y"
          placeholder="How the agent opens the call, before discovery questions"
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
        />
      </div>

      <StringListEditor
        label="Quick discovery prompts"
        placeholder="e.g. What's driving this purchase?"
        items={discoveryQuestions}
        onChange={setDiscoveryQuestions}
      />

      <StringListEditor
        label="Qualification rules"
        placeholder="e.g. Budget above ₹50,000 qualifies as hot"
        items={qualificationRules}
        onChange={setQualificationRules}
      />

      <StringListEditor
        label="Objection handling rules"
        placeholder="e.g. Never discount more than 10% without approval"
        items={objectionHandling}
        onChange={setObjectionHandling}
      />

      <StringListEditor
        label="Closing outcome options"
        placeholder="e.g. Book demo, Send brochure, Not interested"
        items={closingRules}
        onChange={setClosingRules}
      />

      <div className="flex justify-end">
        <button
          type="button"
          className="btn-primary"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? 'Saving…' : 'Save playbook'}
        </button>
      </div>
    </div>
  )
}
