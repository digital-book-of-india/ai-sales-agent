import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import type { Role } from '../auth/types'
import {
  activateTeamMember,
  deactivateTeamMember,
  inviteTeamMember,
  listTeam,
  updateTeamMember,
} from '../team/api'
import {
  ROLE_LABEL,
  TEAM_ROLES,
  type InviteTeamMemberInput,
  type TeamMember,
  type UpdateTeamMemberInput,
} from '../team/types'
import { TeamMemberForm } from '../team/TeamMemberForm'
import { DASHBOARD_RANGES, DASHBOARD_RANGE_LABEL, type DashboardRange } from '../dashboard/types'
import { Modal } from '../components/Modal'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { confirm } from '../lib/confirm'

function formatInr(value: number) {
  return `₹${value.toLocaleString('en-IN')}`
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">
      Deactivated
    </span>
  )
}

export function TeamPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  // A SALES_MANAGER can't invite/promote to ADMIN — TeamService enforces
  // this too, this just keeps the option off the select for them.
  const assignableRoles: Role[] = isAdmin
    ? TEAM_ROLES
    : TEAM_ROLES.filter((role) => role !== 'ADMIN')

  const [range, setRange] = useState<DashboardRange>('month')
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refetch = useCallback(() => {
    Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return listTeam({ range })
      })
      .then(setMembers)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load team')
      })
      .finally(() => setLoading(false))
  }, [range])

  useEffect(() => {
    refetch()
  }, [refetch])

  function canManage(member: TeamMember) {
    if (member.id === user?.id) return false
    if (!isAdmin && member.role === 'ADMIN') return false
    return true
  }

  async function handleInvite(values: InviteTeamMemberInput | UpdateTeamMemberInput) {
    const input = values as InviteTeamMemberInput
    await inviteTeamMember(input)
    setInviting(false)
    toast.success(`Invited ${input.name}`)
    refetch()
  }

  async function handleEditSubmit(values: InviteTeamMemberInput | UpdateTeamMemberInput) {
    if (!editing) return
    await updateTeamMember(editing.id, values as UpdateTeamMemberInput)
    setEditing(null)
    toast.success('Team member updated')
    refetch()
  }

  async function handleDeactivate(member: TeamMember) {
    const confirmed = await confirm({
      title: 'Deactivate team member',
      message: `${member.name} will no longer be able to log in. You can reactivate them later.`,
      confirmLabel: 'Deactivate',
      destructive: true,
    })
    if (!confirmed) return
    setBusyId(member.id)
    try {
      await deactivateTeamMember(member.id)
      toast.success(`${member.name} deactivated`)
      refetch()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to deactivate')
    } finally {
      setBusyId(null)
    }
  }

  async function handleActivate(member: TeamMember) {
    setBusyId(member.id)
    try {
      await activateTeamMember(member.id)
      toast.success(`${member.name} reactivated`)
      refetch()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reactivate')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-brand uppercase">
            Team
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {isAdmin ? 'Everyone on the team' : 'Your team'}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {members.length} member{members.length === 1 ? '' : 's'} · performance for{' '}
            {DASHBOARD_RANGE_LABEL[range].toLowerCase()}
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setInviting(true)}>
          Invite member
        </button>
      </header>

      <div className="card mb-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="team-range" className="text-xs font-semibold text-muted">
            Performance range
          </label>
          <select
            id="team-range"
            className="input-field max-w-xs"
            value={range}
            onChange={(e) => setRange(e.target.value as DashboardRange)}
          >
            {DASHBOARD_RANGES.filter((r) => r !== 'custom').map((r) => (
              <option key={r} value={r}>
                {DASHBOARD_RANGE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {loading && <p className="text-sm text-muted">Loading team…</p>}

      {!loading && members.length === 0 && !error && (
        <div className="card text-center text-sm text-muted">No team members yet.</div>
      )}

      {!loading && members.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-225 text-sm">
            <thead>
              <tr className="border-b border-border text-xs">
                <th className="px-4 py-3 text-left font-semibold text-muted">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-muted">Role</th>
                <th className="px-4 py-3 text-left font-semibold text-muted">Status</th>
                <th className="px-4 py-3 text-right font-semibold text-muted">Calls made</th>
                <th className="px-4 py-3 text-right font-semibold text-muted">Leads converted</th>
                <th className="px-4 py-3 text-right font-semibold text-muted">Revenue</th>
                <th className="px-4 py-3 text-left font-semibold text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{member.name}</div>
                    <div className="text-xs text-muted">{member.email}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{ROLE_LABEL[member.role]}</td>
                  <td className="px-4 py-3">
                    <StatusBadge isActive={member.isActive} />
                  </td>
                  <td className="px-4 py-3 text-right text-ink">{member.performance.callsMade}</td>
                  <td className="px-4 py-3 text-right text-ink">{member.performance.leadsConverted}</td>
                  <td className="px-4 py-3 text-right text-ink">{formatInr(member.performance.revenue)}</td>
                  <td className="px-4 py-3">
                    {canManage(member) && (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-secondary" onClick={() => setEditing(member)}>
                          Edit
                        </button>
                        {member.isActive ? (
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={busyId === member.id}
                            onClick={() => void handleDeactivate(member)}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={busyId === member.id}
                            onClick={() => void handleActivate(member)}
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inviting && (
        <Modal title="Invite team member" onClose={() => setInviting(false)}>
          <TeamMemberForm
            mode="invite"
            initialValues={{ name: '', email: '', password: '', role: 'SALES_EXECUTIVE' }}
            assignableRoles={assignableRoles}
            submitLabel="Send invite"
            onSubmit={handleInvite}
            onCancel={() => setInviting(false)}
          />
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <TeamMemberForm
            mode="edit"
            initialValues={{ name: editing.name, email: editing.email, password: '', role: editing.role }}
            assignableRoles={assignableRoles}
            submitLabel="Save changes"
            onSubmit={handleEditSubmit}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </>
  )
}
