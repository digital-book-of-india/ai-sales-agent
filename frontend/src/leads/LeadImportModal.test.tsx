import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LeadImportModal } from './LeadImportModal'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const uploadResponse = {
  importId: 'import-1',
  headers: ['Name', 'Phone'],
  suggestedMapping: { Name: 'name', Phone: 'phone' },
  totalRows: 1,
  previewRows: [{ Name: 'Jane Doe', Phone: '9990001111' }],
}

const dryRunResponse = {
  summary: {
    totalRows: 1,
    validRows: 1,
    invalidRows: 0,
    duplicateRows: 0,
    importedRows: 0,
  },
  rows: [
    {
      rowIndex: 0,
      data: { name: 'Jane Doe', phone: '9990001111' },
      status: 'valid',
    },
  ],
}

const finalResponse = {
  ...dryRunResponse,
  summary: { ...dryRunResponse.summary, importedRows: 1 },
}

describe('LeadImportModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('walks through upload, mapping, preview, and confirm', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/leads/import')) {
          return Promise.resolve(jsonResponse(uploadResponse))
        }
        if (url.endsWith('/leads/import/confirm')) {
          const body = JSON.parse(String(init?.body)) as { dryRun?: boolean }
          return Promise.resolve(
            jsonResponse(body.dryRun ? dryRunResponse : finalResponse),
          )
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      })

    const onClose = vi.fn()
    const onImported = vi.fn()
    render(<LeadImportModal onClose={onClose} onImported={onImported} />)

    const file = new File(['Name,Phone\nJane Doe,9990001111'], 'leads.csv', {
      type: 'text/csv',
    })
    await user.upload(screen.getByLabelText('Import file'), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))

    // upload used a multipart body, not a JSON content-type
    const uploadCall = fetchMock.mock.calls.find(([reqInput]) =>
      String(reqInput).endsWith('/leads/import'),
    )
    expect(uploadCall?.[1]?.body).toBeInstanceOf(FormData)
    expect((uploadCall?.[1]?.headers as Headers).get('Content-Type')).toBeNull()

    // mapping step: suggested mapping pre-fills Name -> name, Phone -> phone
    expect(await screen.findByText('1 row found. Map each column to a lead field. Name and phone are required.')).toBeInTheDocument()
    const selects = screen.getAllByRole('combobox')
    expect(selects.map((s) => (s as HTMLSelectElement).value)).toEqual([
      'name',
      'phone',
    ])

    await user.click(screen.getByRole('button', { name: 'Next: Preview' }))

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getAllByText('Valid').length).toBeGreaterThan(0)

    await user.click(
      screen.getByRole('button', { name: 'Confirm import (1)' }),
    )

    expect(
      await screen.findByText('Imported 1 of 1 rows.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onImported).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('disables Next: Preview until name and phone are mapped', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/leads/import')) {
          return Promise.resolve(
            jsonResponse({
              ...uploadResponse,
              suggestedMapping: { Name: 'name', Phone: null },
            }),
          )
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      },
    )

    const user = userEvent.setup()
    render(<LeadImportModal onClose={vi.fn()} onImported={vi.fn()} />)

    const file = new File(['Name,Phone\nJane Doe,9990001111'], 'leads.csv', {
      type: 'text/csv',
    })
    await user.upload(screen.getByLabelText('Import file'), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))

    expect(
      await screen.findByText(
        'Map at least one column each to Name and Phone to continue.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next: Preview' })).toBeDisabled()
  })
})
