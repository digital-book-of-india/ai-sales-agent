import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { createAgent, deleteAgent, listAgents, updateAgent } from '../ai-agents/api'
import { AgentForm } from '../ai-agents/AgentForm'
import {
  EMPTY_AGENT_FORM_VALUES,
  agentToFormValues,
  formValuesToAgentInput,
  type AgentFormValues,
  type AiAgent,
} from '../ai-agents/types'
import { Modal } from '../components/Modal'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { confirm } from '../lib/confirm'

export function AiAgentsListPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = user?.role === 'ADMIN'

  const [agents, setAgents] = useState<AiAgent[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AiAgent | null>(null)

  const refetch = useCallback(() => {
    Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return listAgents({ search: search || undefined })
      })
      .then(setAgents)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load agents')
      })
      .finally(() => setLoading(false))
  }, [search])

  useEffect(() => {
    refetch()
  }, [refetch])

  async function handleCreate(values: AgentFormValues) {
    await createAgent(formValuesToAgentInput(values))
    setShowCreateModal(false)
    toast.success('Agent created')
    refetch()
  }

  async function handleUpdate(values: AgentFormValues) {
    if (!editingAgent) return
    await updateAgent(editingAgent.id, formValuesToAgentInput(values))
    setEditingAgent(null)
    toast.success('Agent updated')
    refetch()
  }

  async function handleDelete(agent: AiAgent) {
    const confirmed = await confirm({
      title: 'Delete agent',
      message: `Delete "${agent.name}"? Its knowledge base and playbook will be deleted too.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    try {
      await deleteAgent(agent.id)
      toast.success('Agent deleted')
      refetch()
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to delete agent'
      toast.error(message)
    }
  }

  return (
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-brand uppercase">
            AI Agents
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Calling agents
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {agents ? `${agents.length} agent${agents.length === 1 ? '' : 's'}` : 'Loading…'}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            New agent
          </button>
        )}
      </header>

      <div className="card mb-5">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <label htmlFor="agent-search" className="text-xs font-semibold text-muted">
            Search
          </label>
          <input
            id="agent-search"
            className="input-field"
            placeholder="Agent name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      {loading && <p className="text-sm text-muted">Loading agents…</p>}

      {!loading && agents?.length === 0 && (
        <div className="card text-center text-sm text-muted">
          No agents match your filters.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!loading &&
          agents?.map((agent) => (
            <div key={agent.id} className="card">
              <div className="mb-3 flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="cursor-pointer text-left text-base font-bold text-ink hover:text-brand"
                  onClick={() => navigate(`/knowledge-base?agentId=${agent.id}`)}
                >
                  {agent.name}
                </button>
                <span className={agent.active ? 'badge badge-success' : 'badge badge-muted'}>
                  {agent.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {agent.description && (
                <p className="mb-4 line-clamp-2 text-sm text-muted">{agent.description}</p>
              )}
              <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Voice</dt>
                  <dd className="font-semibold text-ink">{agent.voice ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Language</dt>
                  <dd className="font-semibold text-ink">{agent.language ?? '—'}</dd>
                </div>
              </dl>
              {canManage && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary flex-1"
                    onClick={() => setEditingAgent(agent)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-secondary flex-1"
                    onClick={() => navigate(`/knowledge-base?agentId=${agent.id}`)}
                  >
                    Knowledge base
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void handleDelete(agent)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>

      {canManage && showCreateModal && (
        <Modal
          title="New agent"
          onClose={() => setShowCreateModal(false)}
          widthClassName="max-w-2xl"
        >
          <AgentForm
            initialValues={EMPTY_AGENT_FORM_VALUES}
            submitLabel="Create agent"
            onSubmit={handleCreate}
            onCancel={() => setShowCreateModal(false)}
          />
        </Modal>
      )}

      {canManage && editingAgent && (
        <Modal
          title={`Edit ${editingAgent.name}`}
          onClose={() => setEditingAgent(null)}
          widthClassName="max-w-2xl"
        >
          <AgentForm
            initialValues={agentToFormValues(editingAgent)}
            submitLabel="Save changes"
            onSubmit={handleUpdate}
            onCancel={() => setEditingAgent(null)}
          />
        </Modal>
      )}
    </>
  )
}
