import { useState } from 'react'
import type { ProductItem } from './types'

const EMPTY_ITEM: ProductItem = { name: '', description: '', category: '' }

export function CatalogEditor({
  label,
  items,
  onChange,
}: {
  label: string
  items: ProductItem[]
  onChange: (items: ProductItem[]) => void
}) {
  const [draft, setDraft] = useState<ProductItem>(EMPTY_ITEM)

  function add() {
    if (!draft.name.trim()) return
    onChange([...items, { ...draft, name: draft.name.trim() }])
    setDraft(EMPTY_ITEM)
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  function update(index: number, patch: Partial<ProductItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-140 text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-3 py-2 text-left font-semibold">Name</th>
              <th className="px-3 py-2 text-left font-semibold">Description</th>
              <th className="px-3 py-2 text-left font-semibold">Price</th>
              <th className="px-3 py-2 text-left font-semibold">Category</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2">
                  <input
                    className="input-field"
                    value={item.name}
                    onChange={(e) => update(index, { name: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="input-field"
                    value={item.description ?? ''}
                    onChange={(e) => update(index, { description: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    className="input-field"
                    value={item.price ?? ''}
                    onChange={(e) =>
                      update(index, {
                        price: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="input-field"
                    value={item.category ?? ''}
                    onChange={(e) => update(index, { category: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    aria-label={`Remove ${item.name || 'item'}`}
                    onClick={() => remove(index)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td className="px-3 py-2">
                <input
                  className="input-field"
                  placeholder="Name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  className="input-field"
                  placeholder="Description"
                  value={draft.description ?? ''}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  min={0}
                  className="input-field"
                  placeholder="Price"
                  value={draft.price ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      price: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
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
                <button type="button" className="btn-secondary" onClick={add}>
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
