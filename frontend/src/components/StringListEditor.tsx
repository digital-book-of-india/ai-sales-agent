import { useState } from 'react'

/** Add/edit/remove editor for a simple list of strings (questions, rules,
 * possible answers, …) — shared by the playbook and playbook-question forms. */
export function StringListEditor({
  label,
  placeholder,
  items,
  onChange,
}: {
  label: string
  placeholder?: string
  items: string[]
  onChange: (items: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const value = draft.trim()
    if (!value) return
    onChange([...items, value])
    setDraft('')
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  function update(index: number, value: string) {
    onChange(items.map((item, i) => (i === index ? value : item)))
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <input
              className="input-field"
              value={item}
              onChange={(e) => update(index, e.target.value)}
            />
            <button
              type="button"
              className="btn-secondary"
              aria-label={`Remove item ${index + 1}`}
              onClick={() => remove(index)}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            className="input-field"
            placeholder={placeholder ?? 'Add an item…'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
          />
          <button type="button" className="btn-secondary" onClick={add}>
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
