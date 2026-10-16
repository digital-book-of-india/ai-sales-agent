import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  createTask,
  deleteTask,
  listTasks,
  updateTask,
  updateTaskStatus,
} from '../tasks/api'
import { TaskForm } from '../tasks/TaskForm'
import { TaskPriorityBadge, TaskStatusBadge, TaskTypeBadge } from '../tasks/badges'
import {
  EMPTY_TASK_FORM_VALUES,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  formValuesToTaskInput,
  formValuesToUpdateTaskInput,
  taskToFormValues,
  type PaginatedTasks,
  type Task,
  type TaskFormValues,
  type TaskStatus,
} from '../tasks/types'
import { listUsers, type BasicUser } from '../users/api'
import { Modal } from '../components/Modal'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { confirm } from '../lib/confirm'

type ViewMode = 'list' | 'board'

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function TaskCard({
  task,
  onDragStart,
  onOpen,
}: {
  task: Task
  onDragStart: (e: React.DragEvent, task: Task) => void
  onOpen: (task: Task) => void
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={() => onOpen(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(task)
      }}
      className="cursor-grab rounded-lg border border-border bg-surface p-3 text-sm shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="font-semibold text-ink">{task.title}</span>
        <TaskPriorityBadge priority={task.priority} />
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <TaskTypeBadge type={task.type} />
      </div>
      <div className="mb-1 text-xs text-muted">{formatDueDate(task.dueDate)}</div>
      <div className="truncate text-xs text-muted">{task.assignedTo.name}</div>
      {task.relatedLead && (
        <div className="mt-1 truncate text-xs text-brand">
          {task.relatedLead.name}
        </div>
      )}
    </div>
  )
}

export function TasksPage() {
  const { user } = useAuth()
  const canAssign = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER'

  const [view, setView] = useState<ViewMode>('list')
  const [status, setStatus] = useState<TaskStatus | ''>('')
  const [assignees, setAssignees] = useState<BasicUser[]>([])

  // List view
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<PaginatedTasks | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Board view
  const [boardTasks, setBoardTasks] = useState<Task[]>([])
  const [boardLoading, setBoardLoading] = useState(true)
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (canAssign) {
      listUsers()
        .then(setAssignees)
        .catch(() => setAssignees([]))
    }
  }, [canAssign])

  const refetchList = useCallback(() => {
    Promise.resolve()
      .then(() => {
        setListLoading(true)
        setError(null)
        return listTasks({ status: status || undefined, page, limit: 20 })
      })
      .then(setResult)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load tasks')
      })
      .finally(() => setListLoading(false))
  }, [status, page])

  useEffect(() => {
    if (view === 'list') refetchList()
  }, [view, refetchList])

  const refetchBoard = useCallback(() => {
    Promise.resolve()
      .then(() => {
        setBoardLoading(true)
        setError(null)
        return listTasks({ limit: 200 })
      })
      .then((res) => setBoardTasks(res.data))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load tasks')
      })
      .finally(() => setBoardLoading(false))
  }, [])

  useEffect(() => {
    if (view === 'board') refetchBoard()
  }, [view, refetchBoard])

  const refetch = view === 'list' ? refetchList : refetchBoard

  const tasksByStatus = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>(
      TASK_STATUSES.map((s) => [s, [] as Task[]]),
    )
    for (const task of boardTasks) {
      map.get(task.status)?.push(task)
    }
    return map
  }, [boardTasks])

  function handleDragStart(e: React.DragEvent, task: Task) {
    e.dataTransfer.setData('text/plain', task.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  async function handleDrop(e: React.DragEvent, targetStatus: TaskStatus) {
    e.preventDefault()
    setDragOverStatus(null)
    const taskId = e.dataTransfer.getData('text/plain')
    if (!taskId) return

    const task = boardTasks.find((t) => t.id === taskId)
    if (!task || task.status === targetStatus) return

    // Optimistic move — the board should feel instant, same posture as the
    // Pipeline Kanban board's drag-and-drop.
    setBoardTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: targetStatus } : t)),
    )

    try {
      await updateTaskStatus(taskId, targetStatus)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to move task')
      refetchBoard()
    }
  }

  async function handleCreate(values: TaskFormValues) {
    await createTask(formValuesToTaskInput(values))
    setCreating(false)
    toast.success('Task created')
    refetch()
  }

  async function handleEditSubmit(values: TaskFormValues) {
    if (!editing) return
    await updateTask(editing.id, formValuesToUpdateTaskInput(values))
    setEditing(null)
    toast.success('Task updated')
    refetch()
  }

  async function handleDelete(task: Task) {
    const confirmed = await confirm({
      title: 'Delete task',
      message: `Delete "${task.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    setBusyId(task.id)
    try {
      await deleteTask(task.id)
      toast.success('Task deleted')
      refetch()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete task')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-brand uppercase">
            Tasks
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Tasks
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {view === 'list' && result
              ? `${result.total} task${result.total === 1 ? '' : 's'}`
              : 'Drag a card to move it between columns.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div role="group" aria-label="View" className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              className={
                view === 'list'
                  ? 'rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-on'
                  : 'rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-ink'
              }
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setView('board')}
              aria-pressed={view === 'board'}
              className={
                view === 'board'
                  ? 'rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-on'
                  : 'rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-ink'
              }
            >
              Board
            </button>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setCreating(true)}
          >
            New task
          </button>
        </div>
      </header>

      {view === 'list' && (
        <div className="card mb-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="task-status-filter"
                className="text-xs font-semibold text-muted"
              >
                Status
              </label>
              <select
                id="task-status-filter"
                className="input-field"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as TaskStatus | '')
                  setPage(1)
                }}
              >
                <option value="">All statuses</option>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      {view === 'list' && (
        <>
          {listLoading && <p className="text-sm text-muted">Loading tasks…</p>}

          {!listLoading && result?.data.length === 0 && (
            <div className="card text-center text-sm text-muted">
              No tasks match your filters.
            </div>
          )}

          {!listLoading && result && result.data.length > 0 && (
            <div className="card overflow-x-auto p-0">
              <table className="w-full min-w-150 text-sm">
                <thead>
                  <tr className="border-b border-border text-xs">
                    <th className="px-4 py-3 text-left font-semibold text-muted">
                      Title
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted">
                      Due
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted">
                      Priority
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted">
                      Assigned to
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((task) => (
                    <tr
                      key={task.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">
                          {task.title}
                        </div>
                        {task.relatedLead && (
                          <Link
                            to={`/leads/${task.relatedLead.id}`}
                            className="text-xs text-brand hover:underline"
                          >
                            {task.relatedLead.name}
                          </Link>
                        )}
                        {task.relatedDeal && (
                          <Link
                            to={`/deals/${task.relatedDeal.id}`}
                            className="block text-xs text-brand hover:underline"
                          >
                            Deal
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <TaskTypeBadge type={task.type} />
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {formatDueDate(task.dueDate)}
                      </td>
                      <td className="px-4 py-3">
                        <TaskPriorityBadge priority={task.priority} />
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {task.assignedTo.name}
                      </td>
                      <td className="px-4 py-3">
                        <TaskStatusBadge status={task.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setEditing(task)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={busyId === task.id}
                            onClick={() => void handleDelete(task)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result && result.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted">
              <span>
                Page {result.page} of {result.totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page >= result.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {view === 'board' && (
        <>
          {boardLoading && <p className="text-sm text-muted">Loading tasks…</p>}

          {!boardLoading && (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {TASK_STATUSES.map((s) => (
                <div
                  key={s}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOverStatus(s)
                  }}
                  onDragLeave={() =>
                    setDragOverStatus((cur) => (cur === s ? null : cur))
                  }
                  onDrop={(e) => void handleDrop(e, s)}
                  className={`flex w-72 shrink-0 flex-col rounded-xl border p-3 transition-colors ${
                    dragOverStatus === s
                      ? 'border-brand bg-brand-soft/40'
                      : 'border-border bg-surface-hover'
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-2 px-1">
                    <h2 className="text-sm font-bold text-ink">
                      {TASK_STATUS_LABEL[s]}
                    </h2>
                    <span className="text-xs font-semibold text-muted">
                      {tasksByStatus.get(s)?.length ?? 0}
                    </span>
                  </div>
                  <div className="flex min-h-20 flex-col gap-2">
                    {(tasksByStatus.get(s) ?? []).map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onDragStart={handleDragStart}
                        onOpen={(t) => setEditing(t)}
                      />
                    ))}
                    {(tasksByStatus.get(s) ?? []).length === 0 && (
                      <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted">
                        No tasks
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {creating && (
        <Modal title="Create task" onClose={() => setCreating(false)}>
          <TaskForm
            initialValues={EMPTY_TASK_FORM_VALUES}
            submitLabel="Create task"
            onSubmit={handleCreate}
            onCancel={() => setCreating(false)}
            assignees={canAssign ? assignees : undefined}
          />
        </Modal>
      )}

      {editing && (
        <Modal title="Edit task" onClose={() => setEditing(null)}>
          <TaskForm
            initialValues={taskToFormValues(editing)}
            submitLabel="Save changes"
            onSubmit={handleEditSubmit}
            onCancel={() => setEditing(null)}
            assignees={canAssign ? assignees : undefined}
            showStatus
          />
        </Modal>
      )}
    </>
  )
}
