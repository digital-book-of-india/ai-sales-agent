import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { TasksPage } from './TasksPage'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const executiveUser = {
  id: 'exec-1',
  email: 'exec@example.com',
  role: 'SALES_EXECUTIVE',
}

const task = {
  id: 'task-1',
  title: 'Send pricing sheet',
  description: null,
  type: 'SEND_QUOTATION',
  assignedToId: 'exec-1',
  dueDate: '2026-08-28T10:00:00.000Z',
  priority: 'HIGH',
  status: 'TODO',
  relatedLeadId: 'lead-1',
  relatedDealId: null,
  createdAt: '2026-08-26T00:00:00.000Z',
  updatedAt: '2026-08-26T00:00:00.000Z',
  assignedTo: { id: 'exec-1', name: 'Executive' },
  relatedLead: {
    id: 'lead-1',
    name: 'Priya Sharma',
    phone: '9990001111',
    companyName: null,
  },
  relatedDeal: null,
}

const doneTask = {
  ...task,
  id: 'task-2',
  title: 'Internal admin task',
  type: 'INTERNAL',
  status: 'DONE',
  relatedLeadId: null,
  relatedLead: null,
}

const tasksPage = {
  data: [task],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
}

const boardTasks = [task, doneTask]

function renderTasksPage() {
  return render(
    <MemoryRouter initialEntries={['/tasks']}>
      <AuthProvider>
        <Routes>
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/leads/:id" element={<p>Lead detail page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function mockFetchAs() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(
          jsonResponse({ accessToken: 'token', user: executiveUser }),
        )
      }
      if (init?.method === 'POST' && url.endsWith('/tasks')) {
        return Promise.resolve(jsonResponse(task))
      }
      if (url.includes('/tasks?') && url.includes('limit=200')) {
        return Promise.resolve(
          jsonResponse({
            data: boardTasks,
            total: boardTasks.length,
            page: 1,
            limit: 200,
            totalPages: 1,
          }),
        )
      }
      if (url.includes('/tasks?')) {
        return Promise.resolve(jsonResponse(tasksPage))
      }
      return Promise.reject(
        new Error(`Unexpected fetch to ${url} (${init?.method ?? 'GET'})`),
      )
    },
  )
}

describe('TasksPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders tasks returned by the API in list view', async () => {
    mockFetchAs()

    renderTasksPage()

    expect(await screen.findByText('Send pricing sheet')).toBeInTheDocument()
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText('To Do', { selector: 'span' })).toBeInTheDocument()
  })

  it('switches to board view and groups tasks by status column', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderTasksPage()
    await screen.findByText('Send pricing sheet')

    await user.click(screen.getByRole('button', { name: 'Board' }))

    expect(await screen.findByText('Internal admin task')).toBeInTheDocument()
    expect(screen.getByText('To Do')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('creates a task via the New task modal', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderTasksPage()
    await screen.findByText('Send pricing sheet')

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Call back tomorrow')
    const dueInput = screen.getByLabelText('Due date & time')
    await user.type(dueInput, '2026-08-29T09:00')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/tasks$/),
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('navigates to the linked lead from a task row', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderTasksPage()
    await screen.findByText('Send pricing sheet')

    await user.click(screen.getByText('Priya Sharma'))

    expect(await screen.findByText('Lead detail page')).toBeInTheDocument()
  })
})
