import { useEffect, useState } from 'react'
import { listLeads } from '../leads/api'
import type { LeadSummary } from '../leads/types'

// Type-to-search lead combobox shared by the Meeting and Deal creation
// forms — both need "which lead is this for" and neither wants a full page
// navigation just to pick one.
export function LeadPicker({
  value,
  onChange,
}: {
  value: LeadSummary | null
  onChange: (lead: LeadSummary | null) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LeadSummary[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const trimmed = query.trim()
    const handle = setTimeout(() => {
      if (!trimmed || value) {
        setResults([])
        return
      }
      listLeads({ search: trimmed, limit: 8 })
        .then((res) => setResults(res.data))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(handle)
  }, [query, value])

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-hover px-3.5 py-2.5 text-sm">
        <div className="min-w-0">
          <div className="truncate font-semibold text-ink">{value.name}</div>
          <div className="truncate text-xs text-muted">{value.phone}</div>
        </div>
        <button
          type="button"
          className="shrink-0 text-xs font-semibold text-brand hover:underline"
          onClick={() => onChange(null)}
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        type="text"
        className="input-field"
        placeholder="Search leads by name or phone…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          {results.map((lead) => (
            <li key={lead.id}>
              <button
                type="button"
                className="block w-full px-3.5 py-2 text-left text-sm hover:bg-surface-hover"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(lead)
                  setQuery('')
                  setOpen(false)
                }}
              >
                <div className="font-semibold text-ink">{lead.name}</div>
                <div className="text-xs text-muted">
                  {lead.phone}
                  {lead.companyName ? ` · ${lead.companyName}` : ''}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
