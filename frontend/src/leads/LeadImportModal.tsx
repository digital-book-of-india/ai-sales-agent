import { useState } from 'react'
import { Modal } from '../components/Modal'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { confirmLeadImport, uploadLeadImport } from './api'
import { ImportRowStatusBadge } from './badges'
import {
  IMPORTABLE_FIELDS,
  type ImportableField,
  type LeadImportResult,
  type LeadImportUploadResult,
} from './types'

type Step = 'upload' | 'mapping' | 'preview' | 'done'

const NO_MAPPING = ''

export function LeadImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: () => void
}) {
  const [step, setStep] = useState<Step>('upload')

  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<LeadImportUploadResult | null>(
    null,
  )

  const [mapping, setMapping] = useState<Record<string, string>>({})

  const [previewResult, setPreviewResult] = useState<LeadImportResult | null>(
    null,
  )
  const [finalResult, setFinalResult] = useState<LeadImportResult | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function errorMessage(err: unknown, fallback: string) {
    return err instanceof ApiError ? err.message : fallback
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const result = await uploadLeadImport(file)
      setUploadResult(result)
      setMapping(result.suggestedMapping as Record<string, string>)
      setStep('mapping')
    } catch (err) {
      const message = errorMessage(err, 'Failed to upload file')
      setError(message)
      toast.error(message)
    } finally {
      setUploading(false)
    }
  }

  const mappedFields = new Set(Object.values(mapping).filter(Boolean))
  const canPreview = mappedFields.has('name') && mappedFields.has('phone')

  async function handlePreview() {
    if (!uploadResult || !canPreview) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await confirmLeadImport(uploadResult.importId, mapping, true)
      setPreviewResult(result)
      setStep('preview')
    } catch (err) {
      const message = errorMessage(err, 'Failed to validate rows')
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleConfirm() {
    if (!uploadResult) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await confirmLeadImport(uploadResult.importId, mapping, false)
      setFinalResult(result)
      setStep('done')
      toast.success(`Imported ${result.summary.importedRows} leads`)
    } catch (err) {
      const message = errorMessage(err, 'Failed to import leads')
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const stepTitle: Record<Step, string> = {
    upload: 'Import leads: upload file',
    mapping: 'Import leads: map columns',
    preview: 'Import leads: preview',
    done: 'Import leads: complete',
  }

  return (
    <Modal title={stepTitle[step]} onClose={onClose} widthClassName="max-w-3xl">
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      {step === 'upload' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Upload a CSV or XLSX file. You&apos;ll map columns to lead fields
            in the next step.
          </p>
          <input
            type="file"
            accept=".csv,.xlsx"
            aria-label="Import file"
            className="input-field"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!file || uploading}
              onClick={() => void handleUpload()}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>
      )}

      {step === 'mapping' && uploadResult && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            {uploadResult.totalRows} row
            {uploadResult.totalRows === 1 ? '' : 's'} found. Map each column
            to a lead field. Name and phone are required.
          </p>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-3 py-2">Column</th>
                  <th className="px-3 py-2">Sample value</th>
                  <th className="px-3 py-2">Maps to</th>
                </tr>
              </thead>
              <tbody>
                {uploadResult.headers.map((header) => (
                  <tr key={header} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 font-medium text-ink">{header}</td>
                    <td className="px-3 py-2 text-muted">
                      {uploadResult.previewRows[0]?.[header] || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="input-field"
                        value={mapping[header] ?? NO_MAPPING}
                        onChange={(e) =>
                          setMapping((prev) => ({
                            ...prev,
                            [header]: e.target.value,
                          }))
                        }
                      >
                        <option value={NO_MAPPING}>— Do not import —</option>
                        {IMPORTABLE_FIELDS.map((field) => (
                          <option key={field.value} value={field.value}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!canPreview && (
            <p className="text-sm text-warning">
              Map at least one column each to Name and Phone to continue.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStep('upload')}
            >
              Back
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!canPreview || submitting}
              onClick={() => void handlePreview()}
            >
              {submitting ? 'Validating…' : 'Next: Preview'}
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && previewResult && (
        <div className="flex flex-col gap-4">
          <ImportSummaryStrip summary={previewResult.summary} />
          <ImportRowsTable rows={previewResult.rows} />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStep('mapping')}
            >
              Back
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={previewResult.summary.validRows === 0 || submitting}
              onClick={() => void handleConfirm()}
            >
              {submitting
                ? 'Importing…'
                : `Confirm import (${previewResult.summary.validRows})`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && finalResult && (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium text-ink">
            Imported {finalResult.summary.importedRows} of{' '}
            {finalResult.summary.totalRows} rows.
          </p>
          <ImportSummaryStrip summary={finalResult.summary} />
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                onImported()
                onClose()
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ImportSummaryStrip({
  summary,
}: {
  summary: LeadImportResult['summary']
}) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <SummaryStat label="Total" value={summary.totalRows} />
      <SummaryStat label="Valid" value={summary.validRows} />
      <SummaryStat label="Invalid" value={summary.invalidRows} />
      <SummaryStat label="Duplicate" value={summary.duplicateRows} />
      <SummaryStat label="Imported" value={summary.importedRows} />
    </dl>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-bold text-ink">{value}</dd>
    </div>
  )
}

function ImportRowsTable({ rows }: { rows: LeadImportResult['rows'] }) {
  const fieldKeys: ImportableField[] = ['name', 'phone']
  return (
    <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="px-3 py-2">Row</th>
            <th className="px-3 py-2">Status</th>
            {fieldKeys.map((key) => (
              <th key={key} className="px-3 py-2 capitalize">
                {key}
              </th>
            ))}
            <th className="px-3 py-2">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rowIndex} className="border-b border-border last:border-b-0">
              <td className="px-3 py-2 text-muted">{row.rowIndex + 1}</td>
              <td className="px-3 py-2">
                <ImportRowStatusBadge status={row.status} />
              </td>
              {fieldKeys.map((key) => (
                <td key={key} className="px-3 py-2 text-ink">
                  {row.data[key] || '—'}
                </td>
              ))}
              <td className="px-3 py-2 text-muted">{row.reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
