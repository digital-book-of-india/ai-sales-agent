import type { CompanyInfo } from './types'

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
    </div>
  )
}

export function CompanyInfoForm({
  value,
  onChange,
}: {
  value: CompanyInfo
  onChange: (value: CompanyInfo) => void
}) {
  function set<K extends keyof CompanyInfo>(key: K, next: CompanyInfo[K]) {
    onChange({ ...value, [key]: next })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Company name" htmlFor="company-name">
          <input
            id="company-name"
            className="input-field"
            value={value.name ?? ''}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="Contact" htmlFor="company-contact">
          <input
            id="company-contact"
            className="input-field"
            placeholder="Phone / email for escalation"
            value={value.contact ?? ''}
            onChange={(e) => set('contact', e.target.value)}
          />
        </Field>
      </div>

      <Field label="About" htmlFor="company-about">
        <textarea
          id="company-about"
          className="input-field min-h-20 resize-y"
          value={value.about ?? ''}
          onChange={(e) => set('about', e.target.value)}
        />
      </Field>

      <Field label="Services summary" htmlFor="company-services">
        <textarea
          id="company-services"
          className="input-field min-h-16 resize-y"
          placeholder="Short summary the agent can quote — the detailed catalog lives below"
          value={value.services ?? ''}
          onChange={(e) => set('services', e.target.value)}
        />
      </Field>

      <Field label="Locations (comma separated)" htmlFor="company-locations">
        <input
          id="company-locations"
          className="input-field"
          placeholder="Mumbai, Delhi, Bengaluru…"
          value={(value.locations ?? []).join(', ')}
          onChange={(e) =>
            set(
              'locations',
              e.target.value
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean),
            )
          }
        />
      </Field>
    </div>
  )
}
