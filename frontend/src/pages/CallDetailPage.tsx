import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  getAnalysisForCall,
  getCall,
  getRecordingForCall,
  getTranscriptForCall,
} from '../calling/api'
import { CallStatusBadge } from '../calling/badges'
import { RecordingPlayer } from '../calling/RecordingPlayer'
import { TranscriptMessages } from '../calling/TranscriptMessages'
import { AnalysisPanel } from '../calling/AnalysisPanel'
import {
  CALL_STATUS_LABEL,
  type CallAnalysis,
  type CallDetail,
  type Recording,
  type Transcript,
} from '../calling/types'
import { FullScreenLoader } from '../components/FullScreenLoader'
import { ApiError } from '../lib/api'

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border py-2 text-sm last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  )
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—'
}

export function CallDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const canDownload = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER'

  const [call, setCall] = useState<CallDetail | null>(null)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [analysis, setAnalysis] = useState<CallAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(() => {
    if (!id) return
    Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return getCall(id)
      })
      .then((data) => {
        setCall(data)
        return Promise.all([
          data.recording ? getRecordingForCall(data.id) : null,
          getTranscriptForCall(data.id),
          getAnalysisForCall(data.id),
        ])
      })
      .then(([recordingData, transcriptData, analysisData]) => {
        setRecording(recordingData)
        setTranscript(transcriptData)
        setAnalysis(analysisData)
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load call')
      })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    refetch()
  }, [refetch])

  if (loading) return <FullScreenLoader />

  if (error && !call) {
    return (
      <div className="card">
        <p role="alert" className="mb-4 text-sm font-medium text-danger">
          {error}
        </p>
        <Link to="/calls" className="btn-secondary inline-block">
          Back to live calls
        </Link>
      </div>
    )
  }

  if (!call) return null

  return (
    <>
      <div className="mb-6">
        <Link
          to={`/leads/${call.lead.id}`}
          className="text-sm font-medium text-muted hover:text-ink"
        >
          ← Back to {call.lead.name}
        </Link>
      </div>

      <header className="mb-8">
        <div className="mb-2 flex items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Call with {call.lead.name}
          </h1>
          <CallStatusBadge status={call.status} />
        </div>
        <p className="text-sm text-muted">
          {call.campaign.name} · {call.lead.phone}
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-4 text-base font-bold text-ink">Recording</h2>
          {recording ? (
            <RecordingPlayer recording={recording} canDownload={canDownload} />
          ) : (
            <p className="text-sm text-muted">
              {call.recording
                ? 'This recording is no longer available.'
                : 'No recording for this call.'}
            </p>
          )}
        </div>

        <div className="card">
          <h2 className="mb-4 text-base font-bold text-ink">Details</h2>
          <dl>
            <Detail label="Status" value={CALL_STATUS_LABEL[call.status]} />
            <Detail label="Provider" value={call.provider} />
            <Detail
              label="Attempt"
              value={`${call.queueItem.attempts} / ${call.queueItem.maxAttempts}`}
            />
            <Detail
              label="Duration"
              value={call.duration !== null ? `${call.duration}s` : '—'}
            />
            <Detail label="Started" value={formatDateTime(call.startedAt)} />
            <Detail label="Ended" value={formatDateTime(call.endedAt)} />
          </dl>
        </div>

        <div className="card lg:col-span-3">
          <h2 className="mb-4 text-base font-bold text-ink">Transcript</h2>
          <TranscriptMessages
            messages={transcript?.messages ?? []}
            emptyText="No transcript for this call."
            autoScroll={false}
          />
        </div>

        <div className="card lg:col-span-3">
          <h2 className="mb-4 text-base font-bold text-ink">AI Analysis</h2>
          <AnalysisPanel analysis={analysis} />
        </div>
      </div>
    </>
  )
}
