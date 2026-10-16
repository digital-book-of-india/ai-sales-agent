import type {
  CallAnalysis,
  CallIntent,
  CallSentiment,
  DecisionMaker,
} from './types'

const DECISION_MAKER_LABEL: Record<DecisionMaker, string> = {
  YES: 'Yes',
  NO: 'No',
  UNKNOWN: 'Unknown',
}

const DECISION_MAKER_CLASS: Record<DecisionMaker, string> = {
  YES: 'badge badge-success',
  NO: 'badge badge-danger',
  UNKNOWN: 'badge badge-muted',
}

const INTENT_LABEL: Record<CallIntent, string> = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NONE: 'None',
}

const INTENT_CLASS: Record<CallIntent, string> = {
  HIGH: 'badge badge-success',
  MEDIUM: 'badge badge-warning',
  LOW: 'badge badge-muted',
  NONE: 'badge badge-muted',
}

const SENTIMENT_LABEL: Record<CallSentiment, string> = {
  POSITIVE: 'Positive',
  NEUTRAL: 'Neutral',
  NEGATIVE: 'Negative',
}

const SENTIMENT_CLASS: Record<CallSentiment, string> = {
  POSITIVE: 'badge badge-success',
  NEUTRAL: 'badge badge-muted',
  NEGATIVE: 'badge badge-danger',
}

const QUALITY_SCORE_LABEL: Record<
  Exclude<keyof CallAnalysis['qualityScore'], 'total'>,
  string
> = {
  opening: 'Opening',
  discovery: 'Discovery',
  productKnowledge: 'Product knowledge',
  objectionHandling: 'Objection handling',
  closing: 'Closing',
  naturalness: 'Naturalness',
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-40 shrink-0 text-muted">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-medium text-ink">
        {value}
      </span>
    </div>
  )
}

/** AI Analysis panel — shared by the Call Detail page (that call's own
 * analysis) and the Lead Detail page (the lead's most recent analysis
 * across all its calls). `analysis: null` renders the empty state; the
 * caller decides what "no analysis" means for its context (still
 * processing vs. no completed AI-analyzed call yet). */
export function AnalysisPanel({
  analysis,
  emptyText = 'No AI analysis available for this call yet.',
}: {
  analysis: CallAnalysis | null
  emptyText?: string
}) {
  if (!analysis) {
    return <p className="text-sm text-muted">{emptyText}</p>
  }

  return (
    <div className="flex flex-col gap-5">
      {analysis.summary && (
        <p className="text-sm text-ink">{analysis.summary}</p>
      )}

      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold text-muted">Requirement</dt>
          <dd className="text-sm text-ink">{analysis.requirement ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted">Budget</dt>
          <dd className="text-sm text-ink">{analysis.budget ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted">Timeline</dt>
          <dd className="text-sm text-ink">{analysis.timeline ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted">Next action</dt>
          <dd className="text-sm text-ink">{analysis.nextAction ?? '—'}</dd>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={DECISION_MAKER_CLASS[analysis.decisionMaker]}>
          Decision maker: {DECISION_MAKER_LABEL[analysis.decisionMaker]}
        </span>
        <span className={INTENT_CLASS[analysis.intent]}>
          Intent: {INTENT_LABEL[analysis.intent]}
        </span>
        <span className={SENTIMENT_CLASS[analysis.sentiment]}>
          Sentiment: {SENTIMENT_LABEL[analysis.sentiment]}
        </span>
        {analysis.demoRequested && (
          <span className="badge badge-success">Demo requested</span>
        )}
      </div>

      {analysis.objections.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-muted">Objections</h3>
          <ul className="flex flex-col gap-2">
            {analysis.objections.map((o, i) => (
              <li key={i} className="rounded-lg border border-border p-2.5 text-sm">
                <p className="font-medium text-ink">{o.objection}</p>
                <p className="text-muted">{o.response}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted">Call quality</h3>
          <span className="text-sm font-bold text-ink">
            {analysis.qualityScore.total}/100
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {(Object.keys(QUALITY_SCORE_LABEL) as (keyof typeof QUALITY_SCORE_LABEL)[]).map(
            (key) => (
              <ScoreBar
                key={key}
                label={QUALITY_SCORE_LABEL[key]}
                value={analysis.qualityScore[key]}
              />
            ),
          )}
        </div>
      </div>

      {analysis.coachingFeedback && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-muted">
            Coaching feedback
          </h3>
          <p className="text-sm text-ink">{analysis.coachingFeedback}</p>
        </div>
      )}
    </div>
  )
}
