import { useState } from 'react'
import { createPlaybookQuestion, deletePlaybookQuestion, updatePlaybookQuestion } from './api'
import type { PlaybookQuestion, PlaybookQuestionInput } from './types'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { confirm } from '../lib/confirm'

const EMPTY_DRAFT: PlaybookQuestionInput = {
  question: '',
  purpose: '',
  expectedInfo: '',
  possibleAnswers: [],
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

function QuestionRow({
  question,
  onSaved,
  onDeleted,
}: {
  question: PlaybookQuestion
  onSaved: (question: PlaybookQuestion) => void
  onDeleted: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<PlaybookQuestionInput>({
    question: question.question,
    purpose: question.purpose ?? '',
    expectedInfo: question.expectedInfo ?? '',
    possibleAnswers: question.possibleAnswers,
    order: question.order,
  })
  const [answersText, setAnswersText] = useState(question.possibleAnswers.join(', '))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const updated = await updatePlaybookQuestion(question.id, {
        ...draft,
        possibleAnswers: splitCsv(answersText),
      })
      onSaved(updated)
      setEditing(false)
      toast.success('Question updated')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update question')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    const confirmed = await confirm({
      message: 'Delete this discovery question?',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    try {
      await deletePlaybookQuestion(question.id)
      onDeleted(question.id)
      toast.success('Question deleted')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete question')
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
            value={draft.purpose ?? ''}
            onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
          />
        </td>
        <td className="px-3 py-2">
          <input
            className="input-field"
            value={draft.expectedInfo ?? ''}
            onChange={(e) => setDraft({ ...draft, expectedInfo: e.target.value })}
          />
        </td>
        <td className="px-3 py-2">
          <input
            className="input-field"
            placeholder="Comma separated"
            value={answersText}
            onChange={(e) => setAnswersText(e.target.value)}
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
      <td className="px-3 py-2 font-medium text-ink">{question.question}</td>
      <td className="px-3 py-2 text-muted">{question.purpose ?? '—'}</td>
      <td className="px-3 py-2 text-muted">{question.expectedInfo ?? '—'}</td>
      <td className="px-3 py-2 text-muted">
        {question.possibleAnswers.length ? question.possibleAnswers.join(', ') : '—'}
      </td>
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

export function PlaybookQuestionsTable({
  playbookId,
  questions,
  onChange,
}: {
  playbookId: string
  questions: PlaybookQuestion[]
  onChange: (questions: PlaybookQuestion[]) => void
}) {
  const [draft, setDraft] = useState<PlaybookQuestionInput>(EMPTY_DRAFT)
  const [answersText, setAnswersText] = useState('')
  const [adding, setAdding] = useState(false)

  async function add() {
    if (!draft.question.trim()) return
    setAdding(true)
    try {
      const created = await createPlaybookQuestion(playbookId, {
        ...draft,
        possibleAnswers: splitCsv(answersText),
        order: questions.length,
      })
      onChange([...questions, created])
      setDraft(EMPTY_DRAFT)
      setAnswersText('')
      toast.success('Question added')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add question')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-ink">
        Discovery questions
      </span>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-180 text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-3 py-2 text-left font-semibold">Question</th>
              <th className="px-3 py-2 text-left font-semibold">Purpose</th>
              <th className="px-3 py-2 text-left font-semibold">Expected info</th>
              <th className="px-3 py-2 text-left font-semibold">Possible answers</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {questions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted">
                  No discovery questions yet.
                </td>
              </tr>
            )}
            {questions.map((question) => (
              <QuestionRow
                key={question.id}
                question={question}
                onSaved={(updated) =>
                  onChange(questions.map((q) => (q.id === updated.id ? updated : q)))
                }
                onDeleted={(id) => onChange(questions.filter((q) => q.id !== id))}
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
                  placeholder="Purpose"
                  value={draft.purpose ?? ''}
                  onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  className="input-field"
                  placeholder="Expected info"
                  value={draft.expectedInfo ?? ''}
                  onChange={(e) => setDraft({ ...draft, expectedInfo: e.target.value })}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  className="input-field"
                  placeholder="Comma separated"
                  value={answersText}
                  onChange={(e) => setAnswersText(e.target.value)}
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
