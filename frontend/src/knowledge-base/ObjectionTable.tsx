import { useState } from 'react'
import { createObjection, deleteObjection, updateObjection } from './api'
import type { Objection, ObjectionInput } from './types'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { confirm } from '../lib/confirm'

const EMPTY_DRAFT: ObjectionInput = {
  objection: '',
  recommendedResponse: '',
  followUpQuestion: '',
  escalationRule: '',
}

function ObjectionRow({
  objection,
  onSaved,
  onDeleted,
}: {
  objection: Objection
  onSaved: (objection: Objection) => void
  onDeleted: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ObjectionInput>({
    objection: objection.objection,
    recommendedResponse: objection.recommendedResponse,
    followUpQuestion: objection.followUpQuestion ?? '',
    escalationRule: objection.escalationRule ?? '',
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const updated = await updateObjection(objection.id, draft)
      onSaved(updated)
      setEditing(false)
      toast.success('Objection updated')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update objection')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    const confirmed = await confirm({
      message: 'Delete this objection?',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    try {
      await deleteObjection(objection.id)
      onDeleted(objection.id)
      toast.success('Objection deleted')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete objection')
    }
  }

  if (editing) {
    return (
      <tr className="border-b border-border last:border-b-0">
        <td className="px-3 py-2">
          <input
            className="input-field"
            value={draft.objection}
            onChange={(e) => setDraft({ ...draft, objection: e.target.value })}
          />
        </td>
        <td className="px-3 py-2">
          <input
            className="input-field"
            value={draft.recommendedResponse}
            onChange={(e) => setDraft({ ...draft, recommendedResponse: e.target.value })}
          />
        </td>
        <td className="px-3 py-2">
          <input
            className="input-field"
            value={draft.followUpQuestion ?? ''}
            onChange={(e) => setDraft({ ...draft, followUpQuestion: e.target.value })}
          />
        </td>
        <td className="px-3 py-2">
          <input
            className="input-field"
            value={draft.escalationRule ?? ''}
            onChange={(e) => setDraft({ ...draft, escalationRule: e.target.value })}
          />
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <button
            type="button"
            className="btn-secondary mr-2"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3 py-2 font-medium text-ink">{objection.objection}</td>
      <td className="px-3 py-2 text-muted">{objection.recommendedResponse}</td>
      <td className="px-3 py-2 text-muted">{objection.followUpQuestion ?? '—'}</td>
      <td className="px-3 py-2 text-muted">{objection.escalationRule ?? '—'}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <button type="button" className="btn-secondary mr-2" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button type="button" className="btn-secondary" onClick={() => void remove()}>
          Delete
        </button>
      </td>
    </tr>
  )
}

export function ObjectionTable({
  knowledgeBaseId,
  objections,
  onChange,
}: {
  knowledgeBaseId: string
  objections: Objection[]
  onChange: (objections: Objection[]) => void
}) {
  const [draft, setDraft] = useState<ObjectionInput>(EMPTY_DRAFT)
  const [adding, setAdding] = useState(false)

  async function add() {
    if (!draft.objection.trim() || !draft.recommendedResponse.trim()) return
    setAdding(true)
    try {
      const created = await createObjection(knowledgeBaseId, draft)
      onChange([...objections, created])
      setDraft(EMPTY_DRAFT)
      toast.success('Objection added')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add objection')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-ink">
        Objection handling
      </span>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-180 text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-3 py-2 text-left font-semibold">Objection</th>
              <th className="px-3 py-2 text-left font-semibold">Recommended response</th>
              <th className="px-3 py-2 text-left font-semibold">Follow-up question</th>
              <th className="px-3 py-2 text-left font-semibold">Escalation rule</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {objections.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted">
                  No objections captured yet.
                </td>
              </tr>
            )}
            {objections.map((objection) => (
              <ObjectionRow
                key={objection.id}
                objection={objection}
                onSaved={(updated) =>
                  onChange(objections.map((o) => (o.id === updated.id ? updated : o)))
                }
                onDeleted={(id) => onChange(objections.filter((o) => o.id !== id))}
              />
            ))}
            <tr>
              <td className="px-3 py-2">
                <input
                  className="input-field"
                  placeholder="Objection"
                  value={draft.objection}
                  onChange={(e) => setDraft({ ...draft, objection: e.target.value })}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  className="input-field"
                  placeholder="Recommended response"
                  value={draft.recommendedResponse}
                  onChange={(e) => setDraft({ ...draft, recommendedResponse: e.target.value })}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  className="input-field"
                  placeholder="Follow-up question"
                  value={draft.followUpQuestion ?? ''}
                  onChange={(e) => setDraft({ ...draft, followUpQuestion: e.target.value })}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  className="input-field"
                  placeholder="Escalation rule"
                  value={draft.escalationRule ?? ''}
                  onChange={(e) => setDraft({ ...draft, escalationRule: e.target.value })}
                />
              </td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={adding}
                  onClick={() => void add()}
                >
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
