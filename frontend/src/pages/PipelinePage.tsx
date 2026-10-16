import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { createDeal, getDealsBoard, moveDealStage } from '../pipeline/api'
import { DealForm } from '../pipeline/DealForm'
import {
  EMPTY_DEAL_FORM_VALUES,
  formValuesToDealInput,
  type BoardStage,
  type Deal,
  type DealFormValues,
} from '../pipeline/types'
import { listUsers, type BasicUser } from '../users/api'
import { Modal } from '../components/Modal'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

function stageTotal(stage: BoardStage): number {
  return stage.deals.reduce((sum, deal) => sum + deal.value, 0)
}

function DealCard({
  deal,
  onDragStart,
  onOpen,
}: {
  deal: Deal
  onDragStart: (e: React.DragEvent, deal: Deal) => void
  onOpen: (deal: Deal) => void
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, deal)}
      onClick={() => onOpen(deal)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(deal)
      }}
      className="cursor-grab rounded-lg border border-border bg-surface p-3 text-sm shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
    >
      <div className="mb-1.5 truncate font-semibold text-ink">
        {deal.lead.name}
      </div>
      {deal.lead.companyName && (
        <div className="mb-2 truncate text-xs text-muted">
          {deal.lead.companyName}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-ink">{formatCurrency(deal.value)}</span>
        <span className="badge badge-muted">{deal.probability}%</span>
      </div>
      <div className="mt-2 truncate text-xs text-muted">{deal.owner.name}</div>
    </div>
  )
}

export function PipelinePage() {
  const { user } = useAuth()
  const canAssign = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER'
  const navigate = useNavigate()

  const [stages, setStages] = useState<BoardStage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [owners, setOwners] = useState<BasicUser[]>([])
  const [creating, setCreating] = useState(false)
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null)

  const refetch = useCallback(() => {
    Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return getDealsBoard()
      })
      .then(setStages)
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load the pipeline',
        )
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  useEffect(() => {
    if (canAssign) {
      listUsers()
        .then(setOwners)
        .catch(() => setOwners([]))
    }
  }, [canAssign])

  function handleDragStart(e: React.DragEvent, deal: Deal) {
    e.dataTransfer.setData('text/plain', deal.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  async function handleDrop(e: React.DragEvent, targetStageId: string) {
    e.preventDefault()
    setDragOverStageId(null)
    const dealId = e.dataTransfer.getData('text/plain')
    if (!dealId) return

    const sourceStage = stages.find((s) =>
      s.deals.some((d) => d.id === dealId),
    )
    if (!sourceStage || sourceStage.id === targetStageId) return

    const deal = sourceStage.deals.find((d) => d.id === dealId)
    if (!deal) return

    // Optimistic move — the Kanban board should feel instant, and
    // moveDealStage is a single-field update unlikely to fail.
    setStages((prev) =>
      prev.map((stage) => {
        if (stage.id === sourceStage.id) {
          return { ...stage, deals: stage.deals.filter((d) => d.id !== dealId) }
        }
        if (stage.id === targetStageId) {
          return {
            ...stage,
            deals: [{ ...deal, stageId: targetStageId }, ...stage.deals],
          }
        }
        return stage
      }),
    )

    try {
      await moveDealStage(dealId, targetStageId)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Failed to move the deal',
      )
      refetch()
    }
  }

  async function handleCreate(
    values: DealFormValues,
    lead: { id: string } | null,
  ) {
    if (!lead) return
    await createDeal(formValuesToDealInput(lead.id, values))
    setCreating(false)
    toast.success('Deal created')
    refetch()
  }

  return (
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-brand uppercase">
            Pipeline
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Deal pipeline
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Drag a card to move it between stages.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setCreating(true)}
        >
          New deal
        </button>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      {loading && <p className="text-sm text-muted">Loading pipeline…</p>}

      {!loading && stages.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <div
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverStageId(stage.id)
              }}
              onDragLeave={() =>
                setDragOverStageId((id) => (id === stage.id ? null : id))
              }
              onDrop={(e) => void handleDrop(e, stage.id)}
              className={`flex w-72 shrink-0 flex-col rounded-xl border p-3 transition-colors ${
                dragOverStageId === stage.id
                  ? 'border-brand bg-brand-soft/40'
                  : 'border-border bg-surface-hover'
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-2 px-1">
                <h2 className="text-sm font-bold text-ink">{stage.name}</h2>
                <span className="text-xs font-semibold text-muted">
                  {stage.deals.length}
                </span>
              </div>
              <div className="mb-3 px-1 text-xs text-muted">
                {formatCurrency(stageTotal(stage))}
              </div>
              <div className="flex min-h-20 flex-col gap-2">
                {stage.deals.map((deal) => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    onDragStart={handleDragStart}
                    onOpen={(d) => navigate(`/deals/${d.id}`)}
                  />
                ))}
                {stage.deals.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted">
                    No deals
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <Modal title="Create deal" onClose={() => setCreating(false)}>
          <DealForm
            initialValues={EMPTY_DEAL_FORM_VALUES}
            submitLabel="Create deal"
            onSubmit={handleCreate}
            onCancel={() => setCreating(false)}
            requireLead
            owners={canAssign ? owners : undefined}
          />
        </Modal>
      )}
    </>
  )
}
