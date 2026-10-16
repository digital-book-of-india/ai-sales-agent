import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { NotificationBell } from '../notifications/NotificationBell'

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Admin',
  SALES_MANAGER: 'Sales Manager',
  SALES_EXECUTIVE: 'Sales Executive',
}

function initialsFor(email: string) {
  return email.slice(0, 2).toUpperCase()
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `nav-link ${isActive ? 'active' : ''}`
}

export function Nav() {
  const { user, logout } = useAuth()

  if (!user) return null

  return (
    <aside className="sticky top-0 flex shrink-0 items-center gap-4 overflow-x-auto border-b border-border bg-surface px-4 py-3 md:h-svh md:w-65 md:flex-col md:items-stretch md:gap-0 md:overflow-visible md:border-r md:border-b-0 md:px-4 md:py-6">
      <div className="mb-0 flex items-center gap-2.5 px-0.5 text-base font-bold md:mb-8">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-linear-to-br from-brand to-[#8b7ffb] text-sm font-extrabold text-white"
          aria-hidden="true"
        >
          S
        </span>
        <span>Sales ERP</span>
      </div>

      <nav className="flex flex-row gap-0.5 md:flex-1 md:flex-col">
        <NavLink to="/dashboard" end className={navLinkClass}>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="h-4.5 w-4.5 shrink-0"
          >
            <path
              d="M3 10.5 10 4l7 6.5M5 9v7h10V9"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Dashboard
        </NavLink>
        <NavLink to="/analytics" className={navLinkClass}>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="h-4.5 w-4.5 shrink-0"
          >
            <path
              d="M4 16.5V10M10 16.5V3.5M16 16.5v-6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          Analytics
        </NavLink>
        <NavLink to="/leads" className={navLinkClass}>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="h-4.5 w-4.5 shrink-0"
          >
            <path
              d="M10 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 17c.7-3.2 3.1-5 6-5s5.3 1.8 6 5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Leads
        </NavLink>
        <NavLink to="/campaigns" className={navLinkClass}>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="h-4.5 w-4.5 shrink-0"
          >
            <path
              d="M3 6a2 2 0 0 1 2-2h6l4 4v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M7 10.5h6M7 13.5h4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          Campaigns
        </NavLink>
        <NavLink to="/calls" className={navLinkClass}>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="h-4.5 w-4.5 shrink-0"
          >
            <path
              d="M4 4c0 7 5 12 12 12l1.5-2.6a1 1 0 0 0-.5-1.4l-3-1.3a1 1 0 0 0-1.1.2l-1 1a9 9 0 0 1-4-4l1-1a1 1 0 0 0 .2-1.1l-1.3-3a1 1 0 0 0-1.4-.5L4 4Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          Live Calls
        </NavLink>
        <NavLink to="/ai-agents" className={navLinkClass}>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="h-4.5 w-4.5 shrink-0"
          >
            <rect
              x="4"
              y="5"
              width="12"
              height="10"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M8 5V3.5M12 5V3.5M7.5 9.5h5M7.5 12h3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          AI Agents
        </NavLink>
        <NavLink to="/follow-ups" className={navLinkClass}>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="h-4.5 w-4.5 shrink-0"
          >
            <rect
              x="3.5"
              y="4"
              width="13"
              height="12.5"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M3.5 7.5h13M7 2.5v3M13 2.5v3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M6.5 11h2M6.5 13.5h4.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          Follow-ups
        </NavLink>
        <NavLink to="/meetings" className={navLinkClass}>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="h-4.5 w-4.5 shrink-0"
          >
            <rect
              x="3.5"
              y="4.5"
              width="13"
              height="12"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M3.5 8h13M7 3v3M13 3v3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="10" cy="12" r="1.4" fill="currentColor" />
          </svg>
          Meetings
        </NavLink>
        <NavLink to="/pipeline" className={navLinkClass}>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="h-4.5 w-4.5 shrink-0"
          >
            <rect
              x="3"
              y="4"
              width="4"
              height="12"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <rect
              x="8"
              y="4"
              width="4"
              height="8"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <rect
              x="13"
              y="4"
              width="4"
              height="10"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.6"
            />
          </svg>
          Pipeline
        </NavLink>
        <NavLink to="/tasks" className={navLinkClass}>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="h-4.5 w-4.5 shrink-0"
          >
            <path
              d="M4 5.5h12M4 10h12M4 14.5h7"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="m14.5 12.5 1.2 1.2 2.3-2.4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Tasks
        </NavLink>
        <NavLink to="/knowledge-base" className={navLinkClass}>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="h-4.5 w-4.5 shrink-0"
          >
            <path
              d="M4 4.5h5a2 2 0 0 1 2 2V16a1.5 1.5 0 0 0-1.5-1.5H4v-10Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M16 4.5h-5a2 2 0 0 0-2 2V16a1.5 1.5 0 0 1 1.5-1.5H16v-10Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          Knowledge Base
        </NavLink>
        {(user.role === 'ADMIN' || user.role === 'SALES_MANAGER') && (
          <NavLink to="/team" className={navLinkClass}>
            <svg
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
              className="h-4.5 w-4.5 shrink-0"
            >
              <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="14" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M2.5 16c.6-2.8 2.3-4.3 4.5-4.3s3.9 1.5 4.5 4.3M12 12.7c1.8.1 3.1 1.3 3.6 3.3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            Team
          </NavLink>
        )}
        {user.role === 'ADMIN' && (
          <NavLink to="/settings" className={navLinkClass}>
            <svg
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
              className="h-4.5 w-4.5 shrink-0"
            >
              <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M10 3.5v2M10 14.5v2M3.5 10h2M14.5 10h2M5.6 5.6l1.4 1.4M13 13l1.4 1.4M14.4 5.6 13 7M7 13l-1.4 1.4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            Settings
          </NavLink>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-3 border-l border-border pl-4 md:mt-4 md:ml-0 md:flex-col md:items-stretch md:gap-3 md:border-t md:border-l-0 md:pt-4 md:pl-0">
        <div className="flex items-center justify-between gap-2 md:flex-row-reverse">
          <NotificationBell />
          <div className="flex min-w-0 items-center gap-2.5 px-0.5">
            <span
              className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand"
              aria-hidden="true"
            >
              {initialsFor(user.email)}
            </span>
            <span className="hidden min-w-0 flex-col md:flex">
              <span className="truncate text-sm font-semibold text-ink">
                {user.email}
              </span>
              <span className="text-xs text-muted">
                {ROLE_LABEL[user.role] ?? user.role}
              </span>
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0 whitespace-nowrap md:w-full"
          onClick={() => void logout()}
        >
          Log out
        </button>
      </div>
    </aside>
  )
}
