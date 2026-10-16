import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  deleteDeal,
  getDeal,
  listPipelineStages,
  moveDealStage,
  updateDeal,
} from '../pipeline/api'
import { DealForm } from '../pipeline/DealForm'
import {
  dealToFormValues,
  formValuesToUpdateDealInput,
  type Deal,
  type DealFormValues,
  type PipelineStage,
} from '../pipeline/types'
import { listUsers, type BasicUser } from '../users/api'
import {
  createTask,
  deleteTask,
  listTasks,
  updateTaskStatus,
} from '../tasks/api'
import { TaskForm } from '../tasks/TaskForm'
import {
  TaskPriorityBadge,
  TaskStatusBadge,
  TaskTypeBadge,
} from '../tasks/badges'
import {
  EMPTY_TASK_FORM_VALUES,
  formValuesToTaskInput,
  type Task,
  type TaskFormValues,
} from '../tasks/types'
import { FullScreenLoader } from '../components/FullScreenLoader'
import { Modal } from '../components/Modal'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { confirm } from '../lib/confirm'

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border py-2 text-sm last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  )
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function DealDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const canManage = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER'

  const [deal, setDeal] = useState<Deal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [owners, setOwners] = useState<BasicUser[]>([])
  const [editing, setEditing] = useState(false)
  const [movingStage, setMovingStage] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null)

  const refetch = useCallback(() => {
    if (!id) return
    Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return getDeal(id)
      })
      .then(setDeal)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load deal')
      })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    refetch()
  }, [refetch])

  useEffect(() => {
    listPipelineStages()
      .then(setStages)
      .catch(() => setStages([]))
    if (canManage) {
      listUsers()
        .then(setOwners)
        .catch(() => setOwners([]))
    }
  }, [canManage])

  const refetchTasks = useCallback(() => {
    if (!id) return
    Promise.resolve()
      .then(() => {
        setTasksLoading(true)
        return listTasks({ dealId: id, limit: 50 })
      })
      .then((res) => setTasks(res.data))
      .catch(() => setTasks([]))
      .finally(() => setTasksLoading(false))
  }, [id])

  useEffect(() => {
    refetchTasks()
  }, [refetchTasks])

  async function handleCreateTask(values: TaskFormValues) {
    if (!id) return
    await createTask(formValuesToTaskInput(values, { dealId: id }))
    setShowTaskModal(false)
    toast.success('Task created')
    refetchTasks()
  }

  async function handleCompleteTask(task: Task) {
    setTaskBusyId(task.id)
    try {
      await updateTaskStatus(task.id, 'DONE')
      toast.success('Task marked done')
      refetchTasks()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to complete task')
    } finally {
      setTaskBusyId(null)
    }
  }

  async function handleDeleteTask(task: Task) {
    const confirmed = await confirm({
      title: 'Delete task',
      message: 'Delete this task? This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    setTaskBusyId(task.id)
    try {
      await deleteTask(task.id)
      toast.success('Task deleted')
      refetchTasks()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete task')
    } finally {
      setTaskBusyId(null)
    }
  }

  async function handleUpdate(values: DealFormValues) {
    if (!id) return
    const updated = await updateDeal(id, formValuesToUpdateDealInput(values))
    setDeal(updated)
    setEditing(false)
    toast.success('Deal updated')
  }

  async function handleMoveStage(stageId: string) {
    if (!id || !deal || stageId === deal.stageId) return
    setMovingStage(true)
    try {
      const updated = await moveDealStage(id, stageId)
      setDeal(updated)
      toast.success('Deal moved')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to move deal')
    } finally {
      setMovingStage(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    const confirmed = await confirm({
      title: 'Delete deal',
      message: 'Delete this deal? This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    setDeleting(true)
    try {
      await deleteDeal(id)
      toast.success('Deal deleted')
      navigate('/pipeline')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete deal')
      setDeleting(false)
    }
  }

  if (loading) return <FullScreenLoader />

  if (error || !deal) {
    return (
      <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
        {error ?? 'Deal not found'}
      </p>
    )
  }

  return (
    <>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-brand uppercase">
            Deal
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {deal.lead.name}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {formatCurrency(deal.value)} · {deal.probability}% probability
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              Delete
            </button>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-4 text-base font-bold text-ink">Deal details</h2>
          <dl>
            <Detail
              label="Lead"
              value={`${deal.lead.name} (${deal.lead.phone})`}
            />
            {deal.lead.companyName && (
              <Detail label="Company" value={deal.lead.companyName} />
            )}
            <Detail label="Owner" value={deal.owner.name} />
            <Detail label="Value" value={formatCurrency(deal.value)} />
            <Detail label="Probability" value={`${deal.probability}%`} />
            <Detail
              label="Expected close date"
              value={
                deal.expectedCloseDate
                  ? new Date(deal.expectedCloseDate).toLocaleDateString()
                  : '—'
              }
            />
            <Detail
              label="Created"
              value={new Date(deal.createdAt).toLocaleString()}
            />
          </dl>
          {deal.notes && (
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="mb-1.5 text-sm font-semibold text-ink">Notes</h3>
              <p className="text-sm text-muted">{deal.notes}</p>
            </div>
          )}
          <div className="mt-4 border-t border-border pt-4">
            <Link
              to={`/leads/${deal.leadId}`}
              className="text-sm font-semibold text-brand hover:underline"
            >
              View lead →
            </Link>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-4 text-base font-bold text-ink">Stage</h2>
          <select
            className="input-field"
            value={deal.stageId}
            disabled={movingStage}
            onChange={(e) => void handleMoveStage(e.target.value)}
          >
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </div>

        <div className="card lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Tasks</h2>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowTaskModal(true)}
            >
              New task
            </button>
          </div>
          {tasksLoading && <p className="text-sm text-muted">Loading tasks…</p>}
          {!tasksLoading && tasks.length === 0 && (
            <p className="text-sm text-muted">No tasks yet.</p>
          )}
          {!tasksLoading && tasks.length > 0 && (
            <ul className="flex flex-col gap-3">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className="border-b border-border pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">
                      {task.title}
                    </span>
                    <TaskStatusBadge status={task.status} />
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <TaskTypeBadge type={task.type} />
                    <TaskPriorityBadge priority={task.priority} />
                    <span className="text-xs text-muted">
                      {new Date(task.dueDate).toLocaleString()}
                    </span>
                  </div>
                  {task.status !== 'DONE' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={taskBusyId === task.id}
                        onClick={() => void handleCompleteTask(task)}
                      >
                        Complete
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={taskBusyId === task.id}
                        onClick={() => void handleDeleteTask(task)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editing && (
        <Modal title="Edit deal" onClose={() => setEditing(false)}>
          <DealForm
            initialValues={dealToFormValues(deal)}
            submitLabel="Save changes"
            onSubmit={handleUpdate}
            onCancel={() => setEditing(false)}
            owners={canManage ? owners : undefined}
          />
        </Modal>
      )}

      {showTaskModal && (
        <Modal title="Create task" onClose={() => setShowTaskModal(false)}>
          <TaskForm
            initialValues={EMPTY_TASK_FORM_VALUES}
            submitLabel="Create task"
            onSubmit={handleCreateTask}
            onCancel={() => setShowTaskModal(false)}
            assignees={canManage ? owners : undefined}
          />
        </Modal>
      )}
    </>
  )
}
