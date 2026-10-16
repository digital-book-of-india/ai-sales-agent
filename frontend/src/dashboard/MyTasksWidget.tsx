import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listMyTasks } from '../tasks/api'
import { TaskPriorityBadge } from '../tasks/badges'
import type { Task } from '../tasks/types'

function formatDue(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** "My Tasks" widget — every open (not DONE) task assigned to the current
 * user (see GET /tasks/mine), ordered by due date. Refetches on mount only,
 * same posture as FollowUpsDueWidget. */
export function MyTasksWidget() {
  const [tasks, setTasks] = useState<Task[] | null>(null)

  useEffect(() => {
    listMyTasks()
      .then(setTasks)
      .catch(() => setTasks([]))
  }, [])

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-ink">My tasks</h2>
        <Link
          to="/tasks"
          className="text-xs font-semibold text-brand hover:underline"
        >
          View all
        </Link>
      </div>

      {tasks === null && <p className="text-sm text-muted">Loading…</p>}

      {tasks !== null && tasks.length === 0 && (
        <p className="text-sm text-muted">No open tasks right now.</p>
      )}

      {tasks !== null && tasks.length > 0 && (
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
                <TaskPriorityBadge priority={task.priority} />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                <span>{formatDue(task.dueDate)}</span>
                {task.relatedLead && (
                  <Link
                    to={`/leads/${task.relatedLead.id}`}
                    className="text-brand hover:underline"
                  >
                    {task.relatedLead.name}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
