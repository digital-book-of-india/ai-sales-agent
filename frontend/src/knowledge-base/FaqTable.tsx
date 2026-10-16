import { useState } from 'react'
import { createFaq, deleteFaq, updateFaq } from './api'
import type { Faq, FaqInput } from './types'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { confirm } from '../lib/confirm'

const EMPTY_DRAFT: FaqInput = { question: '', answer: '', category: '', priority: 0 }

function FaqRow({
  faq,
  onSaved,
  onDeleted,
}: {
  faq: Faq
  onSaved: (faq: Faq) => void
  onDeleted: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<FaqInput>({
    question: faq.question,
    answer: faq.answer,
    category: faq.category ?? '',
    priority: faq.priority,
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const updated = await updateFaq(faq.id, draft)
      onSaved(updated)
      setEditing(false)
      toast.success('FAQ updated')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update FAQ')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    const confirmed = await confirm({
      message: 'Delete this FAQ?',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    try {
      await deleteFaq(faq.id)
      onDeleted(faq.id)
      toast.success('FAQ deleted')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete FAQ')
    }
  }

  if (editing) {
    return (
      <tr className="border-b border-border last:border-b-0">
        <td className="px-3 py-2">
          <input
            className="input-field"
            value={draft.question}
            onChange={(e) => setDraft({ ...draft, question: e.target.value })}
          />
        </td>
        <td className="px-3 py-2">
          <input
            className="input-field"
            value={draft.answer}
            onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
          />
        </td>
        <td className="px-3 py-2">
          <input
            className="input-field"
            value={draft.category ?? ''}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            className="input-field"
            value={draft.priority ?? 0}
            onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
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
      <td className="px-3 py-2 font-medium text-ink">{faq.question}</td>
      <td className="px-3 py-2 text-muted">{faq.answer}</td>
      <td className="px-3 py-2 text-muted">{faq.category ?? '—'}</td>
      <td className="px-3 py-2 text-muted">{faq.priority}</td>
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

export function FaqTable({
  knowledgeBaseId,
  faqs,
  onChange,
}: {
  knowledgeBaseId: string
  faqs: Faq[]
  onChange: (faqs: Faq[]) => void
}) {
  const [draft, setDraft] = useState<FaqInput>(EMPTY_DRAFT)
  const [adding, setAdding] = useState(false)

  async function add() {
    if (!draft.question.trim() || !draft.answer.trim()) return
    setAdding(true)
    try {
      const created = await createFaq(knowledgeBaseId, draft)
      onChange([...faqs, created])
      setDraft(EMPTY_DRAFT)
      toast.success('FAQ added')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add FAQ')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-ink">FAQs</span>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-160 text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-3 py-2 text-left font-semibold">Question</th>
              <th className="px-3 py-2 text-left font-semibold">Answer</th>
              <th className="px-3 py-2 text-left font-semibold">Category</th>
              <th className="px-3 py-2 text-left font-semibold">Priority</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {faqs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted">
                  No FAQs yet.
                </td>
              </tr>
            )}
            {faqs.map((faq) => (
              <FaqRow
                key={faq.id}
                faq={faq}
                onSaved={(updated) =>
                  onChange(faqs.map((f) => (f.id === updated.id ? updated : f)))
                }
                onDeleted={(id) => onChange(faqs.filter((f) => f.id !== id))}
              />
            ))}
            <tr>
              <td className="px-3 py-2">
                <input
                  className="input-field"
                  placeholder="Question"
                  value={draft.question}
                  onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  className="input-field"
                  placeholder="Answer"
                  value={draft.answer}
                  onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  className="input-field"
                  placeholder="Category"
                  value={draft.category ?? ''}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  className="input-field"
                  placeholder="0"
                  value={draft.priority ?? 0}
                  onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
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
