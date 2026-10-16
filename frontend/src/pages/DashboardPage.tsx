import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../auth/useAuth'
import { getDashboardCharts, getDashboardStats } from '../dashboard/api'
import {
  DASHBOARD_RANGES,
  DASHBOARD_RANGE_LABEL,
  type CampaignPerformanceRow,
  type DashboardCharts,
  type DashboardRange,
  type DashboardStats,
} from '../dashboard/types'
import { CampaignStatusBadge } from '../campaigns/badges'
import { FollowUpsDueWidget } from '../dashboard/FollowUpsDueWidget'
import { MyTasksWidget } from '../dashboard/MyTasksWidget'
import { ApiError } from '../lib/api'

const FUNNEL_COLORS = [
  'var(--chart-funnel-1)',
  'var(--chart-funnel-2)',
  'var(--chart-funnel-3)',
  'var(--chart-funnel-4)',
  'var(--chart-funnel-5)',
  'var(--chart-funnel-6)',
  'var(--chart-funnel-7)',
  'var(--chart-funnel-8)',
]

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatInr(value: number) {
  return `₹${value.toLocaleString('en-IN')}`
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

interface StatCardDef {
  label: string
  value: string
}

function statCards(stats: DashboardStats): StatCardDef[] {
  return [
    { label: 'Total leads', value: stats.totalLeads.toLocaleString('en-IN') },
    { label: 'New leads', value: stats.newLeads.toLocaleString('en-IN') },
    {
      label: 'Interested leads',
      value: stats.interestedLeads.toLocaleString('en-IN'),
    },
    { label: 'Hot leads', value: stats.hotLeads.toLocaleString('en-IN') },
    { label: 'Warm leads', value: stats.warmLeads.toLocaleString('en-IN') },
    {
      label: 'Follow-ups due',
      value: stats.followUpsDue.toLocaleString('en-IN'),
    },
    { label: 'Open deals', value: stats.openDeals.toLocaleString('en-IN') },
    { label: 'Won deals', value: stats.wonDeals.toLocaleString('en-IN') },
    { label: 'Lost deals', value: stats.lostDeals.toLocaleString('en-IN') },
    { label: 'Revenue', value: formatInr(stats.revenue) },
    { label: 'Conversion rate', value: `${stats.conversionRate}%` },
    { label: 'Calls', value: stats.callsToday.toLocaleString('en-IN') },
    {
      label: 'Connected calls',
      value: stats.connectedCalls.toLocaleString('en-IN'),
    },
    {
      label: 'Failed calls',
      value: stats.failedCalls.toLocaleString('en-IN'),
    },
    { label: 'Meetings', value: stats.meetings.toLocaleString('en-IN') },
    {
      label: 'Avg call duration',
      value: formatDuration(stats.avgCallDuration),
    },
    {
      label: 'AI call success rate',
      value: `${stats.aiCallSuccessRate}%`,
    },
  ]
}

function DateRangeSelector({
  range,
  onRangeChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: {
  range: DashboardRange
  onRangeChange: (range: DashboardRange) => void
  customFrom: string
  customTo: string
  onCustomFromChange: (value: string) => void
  onCustomToChange: (value: string) => void
}) {
  return (
    <div className="card mb-5">
      <div className="flex flex-wrap items-end gap-3">
        <div
          role="group"
          aria-label="Date range"
          className="flex flex-wrap gap-1.5"
        >
          {DASHBOARD_RANGES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onRangeChange(value)}
              aria-pressed={range === value}
              className={
                range === value
                  ? 'rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-on'
                  : 'rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-ink'
              }
            >
              {DASHBOARD_RANGE_LABEL[value]}
            </button>
          ))}
        </div>

        {range === 'custom' && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="dashboard-from"
                className="text-xs font-semibold text-muted"
              >
                From
              </label>
              <input
                id="dashboard-from"
                type="date"
                className="input-field"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => onCustomFromChange(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="dashboard-to"
                className="text-xs font-semibold text-muted"
              >
                To
              </label>
              <input
                id="dashboard-to"
                type="date"
                className="input-field"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => onCustomToChange(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LeadFunnelChart({ charts }: { charts: DashboardCharts }) {
  return (
    <div className="card">
      <h2 className="mb-4 text-base font-bold text-ink">Lead funnel</h2>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={charts.leadFunnel}
          layout="vertical"
          margin={{ left: 12, right: 24, top: 4, bottom: 4 }}
        >
          <CartesianGrid
            horizontal={false}
            stroke="var(--chart-grid)"
          />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--chart-grid)' }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={110}
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--chart-grid)' }}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {charts.leadFunnel.map((stage, index) => (
              <Cell key={stage.status} fill={FUNNEL_COLORS[index]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function StatusDistributionChart({ charts }: { charts: DashboardCharts }) {
  const sorted = [...charts.statusDistribution].sort(
    (a, b) => b.count - a.count,
  )
  const height = Math.max(220, sorted.length * 32)

  return (
    <div className="card">
      <h2 className="mb-4 text-base font-bold text-ink">
        Status distribution
      </h2>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ left: 12, right: 24, top: 4, bottom: 4 }}
        >
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--chart-grid)' }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--chart-grid)' }}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
            }}
          />
          <Bar
            dataKey="count"
            fill="var(--brand)"
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function CallsOverTimeChart({ charts }: { charts: DashboardCharts }) {
  return (
    <div className="card">
      <h2 className="mb-1 text-base font-bold text-ink">Calls over time</h2>
      <p className="mb-4 text-xs text-muted">
        Populates once the Dialer/Calls module is live.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart
          data={charts.callsOverTime}
          margin={{ left: 0, right: 24, top: 4, bottom: 4 }}
        >
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--chart-grid)' }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--chart-grid)' }}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
            }}
          />
          <Line
            type="monotone"
            dataKey="calls"
            name="Calls"
            stroke="var(--brand)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="connected"
            name="Connected"
            stroke="var(--chart-series-2)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function CampaignPerformanceTable({ rows }: { rows: CampaignPerformanceRow[] }) {
  return (
    <div className="card overflow-x-auto p-0">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-base font-bold text-ink">Campaign performance</h2>
      </div>
      <table className="w-full min-w-150 text-sm">
        <thead>
          <tr className="border-b border-border text-xs">
            <th className="px-4 py-3 text-left font-semibold text-muted">
              Campaign
            </th>
            <th className="px-4 py-3 text-left font-semibold text-muted">
              Status
            </th>
            <th className="px-4 py-3 text-left font-semibold text-muted">
              Leads
            </th>
            <th className="px-4 py-3 text-left font-semibold text-muted">
              Connected
            </th>
            <th className="px-4 py-3 text-left font-semibold text-muted">
              Interested
            </th>
            <th className="px-4 py-3 text-left font-semibold text-muted">
              Converted
            </th>
            <th className="px-4 py-3 text-left font-semibold text-muted">
              Conversion
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-muted">
                No campaigns yet.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr
              key={row.campaignId}
              className="border-b border-border last:border-b-0"
            >
              <td className="px-4 py-3 font-semibold text-ink">
                {row.campaignName}
              </td>
              <td className="px-4 py-3">
                <CampaignStatusBadge status={row.status} />
              </td>
              <td className="px-4 py-3 text-muted">{row.totalLeads}</td>
              <td className="px-4 py-3 text-muted">{row.connected}</td>
              <td className="px-4 py-3 text-muted">{row.interested}</td>
              <td className="px-4 py-3 text-muted">{row.converted}</td>
              <td className="px-4 py-3 text-muted">
                {row.conversionRate}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DashboardPage() {
  const { user } = useAuth()

  const [range, setRange] = useState<DashboardRange>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [charts, setCharts] = useState<DashboardCharts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequestId = useRef(0)

  const refetch = useCallback(() => {
    if (range === 'custom' && (!customFrom || !customTo)) {
      return
    }

    const requestId = ++latestRequestId.current
    const query = { range, from: customFrom, to: customTo }

    Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return Promise.all([
          getDashboardStats(query),
          getDashboardCharts(query),
        ])
      })
      .then(([statsResult, chartsResult]) => {
        if (requestId !== latestRequestId.current) return
        setStats(statsResult)
        setCharts(chartsResult)
      })
      .catch((err: unknown) => {
        if (requestId !== latestRequestId.current) return
        setError(
          err instanceof ApiError ? err.message : 'Failed to load dashboard',
        )
      })
      .finally(() => {
        if (requestId !== latestRequestId.current) return
        setLoading(false)
      })
  }, [range, customFrom, customTo])

  useEffect(() => {
    refetch()
  }, [refetch])

  return (
    <>
      <header className="mb-8">
        <span className="mb-1.5 block text-xs font-semibold tracking-wide text-brand uppercase">
          Dashboard
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {greeting()}
          {user ? `, ${user.email.split('@')[0]}` : ''}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Here&rsquo;s what&rsquo;s happening{' '}
          {DASHBOARD_RANGE_LABEL[range].toLowerCase()}.
        </p>
      </header>

      <DateRangeSelector
        range={range}
        onRangeChange={setRange}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      {range === 'custom' && (!customFrom || !customTo) && !error && (
        <p className="mb-4 text-sm text-muted">
          Select a start and end date to load the custom range.
        </p>
      )}

      {loading && <p className="text-sm text-muted">Loading dashboard…</p>}

      {!loading && stats && (
        <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
          {statCards(stats).map((card) => (
            <div key={card.label} className="card">
              <p className="mb-1.5 text-xs font-semibold text-muted">
                {card.label}
              </p>
              <p className="text-2xl font-bold text-ink">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && charts && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <LeadFunnelChart charts={charts} />
          <StatusDistributionChart charts={charts} />
          <FollowUpsDueWidget />
          <MyTasksWidget />
          <div className="lg:col-span-2">
            <CallsOverTimeChart charts={charts} />
          </div>
          <div className="lg:col-span-2">
            <CampaignPerformanceTable rows={charts.campaignPerformance} />
          </div>
        </div>
      )}
    </>
  )
}
