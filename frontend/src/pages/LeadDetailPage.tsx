import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  addLeadNote,
  addLeadTag,
  deleteLead,
  getLead,
  getLeadActivity,
  updateLead,
} from '../leads/api'
import { listUsers, type BasicUser } from '../users/api'
import {
  formValuesToInput,
  leadToFormValues,
  type Lead,
  type LeadActivity,
  type LeadFormValues,
} from '../leads/types'
import { StatusBadge, PriorityBadge, LeadScoreBadge } from '../leads/badges'
import { LeadForm } from '../leads/LeadForm'
import {
  getLatestAnalysisForLead,
  getRecordingForCall,
  listCallsForLead,
} from '../calling/api'
import { CallStatusBadge } from '../calling/badges'
import { RecordingPlayer } from '../calling/RecordingPlayer'
import { CallButton } from '../calling/CallButton'
import { AnalysisPanel } from '../calling/AnalysisPanel'
import { useLeadEventsSocket } from '../calling/socket'
import type { CallAnalysis, CallSummary, Recording } from '../calling/types'
import { FullScreenLoader } from '../components/FullScreenLoader'
import { Modal } from '../components/Modal'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { confirm } from '../lib/confirm'
import {
  completeFollowUp,
  createFollowUp,
  deleteFollowUp,
  listFollowUps,
} from '../follow-ups/api'
import { FollowUpStatusBadge } from '../follow-ups/badges'
import { FollowUpForm } from '../follow-ups/FollowUpForm'
import {
  EMPTY_FOLLOW_UP_FORM_VALUES,
  formValuesToFollowUpInput,
  type FollowUp,
  type FollowUpFormValues,
} from '../follow-ups/types'
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border py-2 text-sm last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  )
}

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const canManage = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER'

  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [owners, setOwners] = useState<BasicUser[]>([])
  const [editing, setEditing] = useState(false)

  const [newTag, setNewTag] = useState('')
  const [tagSubmitting, setTagSubmitting] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [noteSubmitting, setNoteSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [calls, setCalls] = useState<CallSummary[]>([])
  const [callsLoading, setCallsLoading] = useState(true)
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null)
  const [expandedRecording, setExpandedRecording] = useState<Recording | null>(
    null,
  )
  const [recordingLoading, setRecordingLoading] = useState(false)

  const [analysis, setAnalysis] = useState<CallAnalysis | null>(null)
  const [activity, setActivity] = useState<LeadActivity[]>([])
  const [activityLoading, setActivityLoading] = useState(true)

  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [followUpsLoading, setFollowUpsLoading] = useState(true)
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [followUpBusyId, setFollowUpBusyId] = useState<string | null>(null)

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
        return getLead(id)
      })
      .then(setLead)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load lead')
      })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    refetch()
  }, [refetch])

  useEffect(() => {
    if (!canManage) return
    listUsers()
      .then(setOwners)
      .catch(() => setOwners([]))
  }, [canManage])

  const refetchCalls = useCallback(() => {
    if (!id) return
    Promise.resolve()
      .then(() => {
        setCallsLoading(true)
        return listCallsForLead(id)
      })
      .then(setCalls)
      .catch(() => setCalls([]))
      .finally(() => setCallsLoading(false))
  }, [id])

  useEffect(() => {
    refetchCalls()
  }, [refetchCalls])

  const refetchAnalysis = useCallback(() => {
    if (!id) return
    getLatestAnalysisForLead(id)
      .then(setAnalysis)
      .catch(() => setAnalysis(null))
  }, [id])

  useEffect(() => {
    refetchAnalysis()
  }, [refetchAnalysis])

  const refetchActivity = useCallback(() => {
    if (!id) return
    Promise.resolve()
      .then(() => {
        setActivityLoading(true)
        return getLeadActivity(id)
      })
      .then(setActivity)
      .catch(() => setActivity([]))
      .finally(() => setActivityLoading(false))
  }, [id])

  useEffect(() => {
    refetchActivity()
  }, [refetchActivity])

  const refetchFollowUps = useCallback(() => {
    if (!id) return
    Promise.resolve()
      .then(() => {
        setFollowUpsLoading(true)
        return listFollowUps({ leadId: id, limit: 50 })
      })
      .then((res) => setFollowUps(res.data))
      .catch(() => setFollowUps([]))
      .finally(() => setFollowUpsLoading(false))
  }, [id])

  useEffect(() => {
    refetchFollowUps()
  }, [refetchFollowUps])

  const refetchTasks = useCallback(() => {
    if (!id) return
    Promise.resolve()
      .then(() => {
        setTasksLoading(true)
        return listTasks({ leadId: id, limit: 50 })
      })
      .then((res) => setTasks(res.data))
      .catch(() => setTasks([]))
      .finally(() => setTasksLoading(false))
  }, [id])

  useEffect(() => {
    refetchTasks()
  }, [refetchTasks])

  // Post-call analysis (see CallAnalysisService) updates this lead and its
  // score in the background — and may itself create a follow-up when the
  // transcript held a callback request (see createFollowUpIfRequested) — so
  // refetch everything this page shows once that happens, rather than
  // requiring the viewer to reload.
  useLeadEventsSocket(id ?? null, () => {
    refetch()
    refetchAnalysis()
    refetchActivity()
    refetchFollowUps()
  })

  async function handleTogglePlay(call: CallSummary) {
    if (expandedCallId === call.id) {
      setExpandedCallId(null)
      setExpandedRecording(null)
      return
    }
    setExpandedCallId(call.id)
    setExpandedRecording(null)
    setRecordingLoading(true)
    try {
      const recording = await getRecordingForCall(call.id)
      setExpandedRecording(recording)
    } catch {
      setExpandedRecording(null)
    } finally {
      setRecordingLoading(false)
    }
  }

  async function handleUpdate(values: LeadFormValues) {
    if (!id) return
    const updated = await updateLead(id, formValuesToInput(values))
    setLead(updated)
    setEditing(false)
    toast.success('Lead updated')
  }

  async function handleAddTag(e: FormEvent) {
    e.preventDefault()
    if (!id || !newTag.trim()) return
    setTagSubmitting(true)
    try {
      const updated = await addLeadTag(id, newTag.trim())
      setLead(updated)
      setNewTag('')
      toast.success('Tag added')
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to add tag'
      toast.error(message)
    } finally {
      setTagSubmitting(false)
    }
  }

  async function handleAddNote(e: FormEvent) {
    e.preventDefault()
    if (!id || !newNote.trim()) return
    setNoteSubmitting(true)
    try {
      const updated = await addLeadNote(id, newNote.trim())
      setLead(updated)
      setNewNote('')
      toast.success('Note added')
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to add note'
      toast.error(message)
    } finally {
      setNoteSubmitting(false)
    }
  }

  async function handleCreateFollowUp(values: FollowUpFormValues) {
    if (!id) return
    await createFollowUp(formValuesToFollowUpInput(id, values))
    setShowFollowUpModal(false)
    toast.success('Follow-up scheduled')
    refetchFollowUps()
  }

  async function handleCompleteFollowUp(followUp: FollowUp) {
    setFollowUpBusyId(followUp.id)
    try {
      await completeFollowUp(followUp.id)
      toast.success('Follow-up marked done')
      refetchFollowUps()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Failed to complete follow-up',
      )
    } finally {
      setFollowUpBusyId(null)
    }
  }

  async function handleDeleteFollowUp(followUp: FollowUp) {
    const confirmed = await confirm({
      title: 'Delete follow-up',
      message: 'Delete this follow-up? This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    setFollowUpBusyId(followUp.id)
    try {
      await deleteFollowUp(followUp.id)
      toast.success('Follow-up deleted')
      refetchFollowUps()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Failed to delete follow-up',
      )
    } finally {
      setFollowUpBusyId(null)
    }
  }

  async function handleCreateTask(values: TaskFormValues) {
    if (!id) return
    await createTask(formValuesToTaskInput(values, { leadId: id }))
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

  async function handleDelete() {
    if (!id) return
    const confirmed = await confirm({
      title: 'Delete lead',
      message: 'Delete this lead? This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    setDeleting(true)
    try {
      await deleteLead(id)
      toast.success('Lead deleted')
      navigate('/leads', { replace: true })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to delete lead'
      toast.error(message)
      setDeleting(false)
    }
  }

  if (loading) return <FullScreenLoader />

  if (error && !lead) {
    return (
      <div className="card">
        <p role="alert" className="mb-4 text-sm font-medium text-danger">
          {error}
        </p>
        <Link to="/leads" className="btn-secondary inline-block">
          Back to leads
        </Link>
      </div>
    )
  }

  if (!lead) return null

  return (
    <>
      <div className="mb-6">
        <Link
          to="/leads"
          className="text-sm font-medium text-muted hover:text-ink"
        >
          ← Back to leads
        </Link>
      </div>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              {lead.name}
            </h1>
            <StatusBadge status={lead.status} />
            <PriorityBadge priority={lead.priority} />
            <LeadScoreBadge score={lead.leadScore} />
          </div>
          <p className="text-sm text-muted">
            {lead.companyName ?? 'No company'} · Owned by{' '}
            {lead.assignedTo?.name ?? 'Unassigned'}
          </p>
        </div>
        <div className="flex gap-3">
          <CallButton
            leadId={lead.id}
            leadName={lead.name}
            onCallEnded={refetchCalls}
          />
          {!editing && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
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
        <div className="lg:col-span-2">
          <div className="card mb-5">
            <h2 className="mb-4 text-base font-bold text-ink">Profile</h2>
            {editing ? (
              <LeadForm
                initialValues={leadToFormValues(lead)}
                owners={owners}
                canAssign={canManage}
                submitLabel="Save changes"
                onSubmit={handleUpdate}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <dl>
                <Detail label="Phone" value={lead.phone} />
                <Detail
                  label="Alternate phone"
                  value={lead.alternatePhone ?? '—'}
                />
                <Detail label="Email" value={lead.email ?? '—'} />
                <Detail label="Designation" value={lead.designation ?? '—'} />
                <Detail label="Industry" value={lead.industry ?? '—'} />
                <Detail label="Source" value={lead.source ?? '—'} />
                <Detail
                  label="Location"
                  value={
                    [lead.city, lead.state].filter(Boolean).join(', ') || '—'
                  }
                />
                <div className="flex justify-between border-b border-border py-2 text-sm">
                  <dt className="text-muted">Lead score</dt>
                  <dd>
                    <LeadScoreBadge score={lead.leadScore} />
                  </dd>
                </div>
                <Detail
                  label="Budget"
                  value={
                    lead.budget !== null ? lead.budget.toLocaleString() : '—'
                  }
                />
                <Detail label="Timeline" value={lead.timeline ?? '—'} />
                <Detail
                  label="Last contacted"
                  value={
                    lead.lastContactedAt
                      ? new Date(lead.lastContactedAt).toLocaleDateString()
                      : '—'
                  }
                />
                <Detail
                  label="Next follow-up"
                  value={
                    lead.nextFollowUpAt
                      ? new Date(lead.nextFollowUpAt).toLocaleDateString()
                      : '—'
                  }
                />
                <Detail label="Requirement" value={lead.requirement ?? '—'} />
              </dl>
            )}
          </div>

          <div className="card mb-5">
            <h2 className="mb-4 text-base font-bold text-ink">Tags</h2>
            <div className="mb-4 flex flex-wrap gap-2">
              {lead.tags.length === 0 && (
                <span className="text-sm text-muted">No tags yet.</span>
              )}
              {lead.tags.map((tag) => (
                <span key={tag} className="badge badge-muted">
                  {tag}
                </span>
              ))}
            </div>
            <form className="flex gap-2" onSubmit={(e) => void handleAddTag(e)}>
              <input
                className="input-field"
                placeholder="Add a tag"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                aria-label="New tag"
              />
              <button
                type="submit"
                className="btn-secondary shrink-0"
                disabled={tagSubmitting || !newTag.trim()}
              >
                Add
              </button>
            </form>
          </div>

          <div className="card">
            <h2 className="mb-4 text-base font-bold text-ink">Notes</h2>
            <form
              className="mb-5 flex flex-col gap-2"
              onSubmit={(e) => void handleAddNote(e)}
            >
              <textarea
                className="input-field min-h-20 resize-y"
                placeholder="Log a call, email, or update…"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                aria-label="New note"
              />
              <button
                type="submit"
                className="btn-primary self-end"
                disabled={noteSubmitting || !newNote.trim()}
              >
                {noteSubmitting ? 'Adding…' : 'Add note'}
              </button>
            </form>
            <div className="flex flex-col gap-4">
              {lead.notes.length === 0 && (
                <p className="text-sm text-muted">No notes yet.</p>
              )}
              {lead.notes.map((note) => (
                <div
                  key={note.id}
                  className="border-b border-border pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="mb-1 flex items-center justify-between text-xs text-muted">
                    <span className="font-semibold text-ink">
                      {note.author.name}
                    </span>
                    <span>{new Date(note.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-ink">{note.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="card mb-5">
            <h2 className="mb-4 text-base font-bold text-ink">Calls</h2>
            {callsLoading && (
              <p className="text-sm text-muted">Loading calls…</p>
            )}
            {!callsLoading && calls.length === 0 && (
              <p className="text-sm text-muted">No calls yet.</p>
            )}
            {!callsLoading && calls.length > 0 && (
              <ul className="flex flex-col gap-3">
                {calls.map((call) => (
                  <li
                    key={call.id}
                    className="border-b border-border pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <Link
                        to={`/calls/${call.id}`}
                        className="text-sm font-semibold text-ink hover:text-brand"
                      >
                        {new Date(call.createdAt).toLocaleString()}
                      </Link>
                      <CallStatusBadge status={call.status} />
                    </div>
                    <p className="mb-2 text-xs text-muted">
                      {call.campaign.name}
                      {call.duration !== null && ` · ${call.duration}s`}
                    </p>
                    {call.recording?.retentionStatus === 'ACTIVE' && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void handleTogglePlay(call)}
                      >
                        {expandedCallId === call.id
                          ? 'Hide player'
                          : 'Play recording'}
                      </button>
                    )}
                    {expandedCallId === call.id &&
                      (recordingLoading ? (
                        <p className="mt-2 text-xs text-muted">
                          Loading recording…
                        </p>
                      ) : expandedRecording ? (
                        <div className="mt-2">
                          <RecordingPlayer
                            recording={expandedRecording}
                            canDownload={canManage}
                          />
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-muted">
                          Recording unavailable.
                        </p>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card mb-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">Follow-ups</h2>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowFollowUpModal(true)}
              >
                Schedule
              </button>
            </div>
            {followUpsLoading && (
              <p className="text-sm text-muted">Loading follow-ups…</p>
            )}
            {!followUpsLoading && followUps.length === 0 && (
              <p className="text-sm text-muted">No follow-ups scheduled.</p>
            )}
            {!followUpsLoading && followUps.length > 0 && (
              <ul className="flex flex-col gap-3">
                {followUps.map((followUp) => (
                  <li
                    key={followUp.id}
                    className="border-b border-border pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {new Date(followUp.dueAt).toLocaleString()}
                      </span>
                      <FollowUpStatusBadge status={followUp.status} />
                    </div>
                    <p className="mb-2 text-sm text-muted">{followUp.reason}</p>
                    {followUp.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={followUpBusyId === followUp.id}
                          onClick={() => void handleCompleteFollowUp(followUp)}
                        >
                          Complete
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={followUpBusyId === followUp.id}
                          onClick={() => void handleDeleteFollowUp(followUp)}
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

          <div className="card mb-5">
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

          <div className="card mb-5">
            <h2 className="mb-4 text-base font-bold text-ink">AI Analysis</h2>
            <AnalysisPanel
              analysis={analysis}
              emptyText="No AI-analyzed call for this lead yet."
            />
          </div>

          <div className="card">
            <h2 className="mb-4 text-base font-bold text-ink">
              Activity timeline
            </h2>
            {activityLoading && (
              <p className="text-sm text-muted">Loading activity…</p>
            )}
            {!activityLoading && activity.length === 0 && (
              <p className="text-sm text-muted">No activity recorded yet.</p>
            )}
            {!activityLoading && activity.length > 0 && (
              <ul className="flex flex-col gap-3">
                {activity.map((entry) => (
                  <li
                    key={entry.id}
                    className="border-b border-border pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted">
                      <span className="font-semibold text-ink">
                        {entry.type.replace(/_/g, ' ')}
                      </span>
                      <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                    {typeof entry.payload.summary === 'string' && (
                      <p className="text-sm text-ink">{entry.payload.summary}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {showFollowUpModal && (
        <Modal
          title="Schedule follow-up"
          onClose={() => setShowFollowUpModal(false)}
        >
          <FollowUpForm
            initialValues={EMPTY_FOLLOW_UP_FORM_VALUES}
            submitLabel="Schedule follow-up"
            onSubmit={handleCreateFollowUp}
            onCancel={() => setShowFollowUpModal(false)}
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
