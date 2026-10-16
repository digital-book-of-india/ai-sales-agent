import { useEffect, useRef, useState } from 'react'
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
import {
  getAiAnalytics,
  getCallAnalytics,
  getLeadAnalytics,
  getSalesAnalytics,
} from '../analytics/api'
import type {
  AiAnalytics,
  AnalyticsQuery,
  CallAnalytics,
  LeadAnalytics,
  SalesAnalytics,
} from '../analytics/types'
import {
  DASHBOARD_RANGES,
  DASHBOARD_RANGE_LABEL,
  type DashboardRange,
} from '../dashboard/types'
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

const TABS = ['calls', 'leads', 'sales', 'ai'] as const
type Tab = (typeof TABS)[number]

const TAB_LABEL: Record<Tab, string> = {
  calls: 'Call Analytics',
  leads: 'Lead Analytics',
  sales: 'Sales Analytics',
  ai: 'AI Analytics',
}

function formatInr(value: number) {
  return `₹${value.toLocaleString('en-IN')}`
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="mb-1.5 text-xs font-semibold text-muted">{label}</p>
      <p className="text-2xl font-bold text-ink">{value}</p>
    </div>
  )
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
      {children}
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="card">
      <h2 className="mb-1 text-base font-bold text-ink">{title}</h2>
      {subtitle && <p className="mb-4 text-xs text-muted">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  )
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
                htmlFor="analytics-from"
                className="text-xs font-semibold text-muted"
              >
                From
              </label>
              <input
                id="analytics-from"
                type="date"
                className="input-field"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => onCustomFromChange(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="analytics-to"
                className="text-xs font-semibold text-muted"
              >
                To
              </label>
              <input
                id="analytics-to"
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

function TabBar({
  active,
  onChange,
}: {
  active: Tab
  onChange: (tab: Tab) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Analytics section"
      className="mb-5 flex flex-wrap gap-1.5 border-b border-border pb-3"
    >
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={active === tab}
          onClick={() => onChange(tab)}
          className={
            active === tab
              ? 'rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-brand-on'
              : 'rounded-lg px-3.5 py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-ink'
          }
        >
          {TAB_LABEL[tab]}
        </button>
      ))}
    </div>
  )
}

function CallAnalyticsSection({ data }: { data: CallAnalytics }) {
  return (
    <>
      <StatGrid>
        <StatCard label="Total calls" value={data.totalCalls.toLocaleString('en-IN')} />
        <StatCard
          label="Connected calls"
          value={data.connectedCalls.toLocaleString('en-IN')}
        />
        <StatCard label="Failed calls" value={data.failedCalls.toLocaleString('en-IN')} />
        <StatCard label="Answer rate" value={`${data.answerRate}%`} />
        <StatCard label="Avg call duration" value={formatDuration(data.avgDuration)} />
        <StatCard label="Retry rate" value={`${data.retryRate}%`} />
      </StatGrid>

      <ChartCard title="Calls over time" subtitle="Total, connected and failed calls per day">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data.trend} margin={{ left: 0, right: 24, top: 4, bottom: 4 }}>
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
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="totalCalls"
              name="Total"
              stroke="var(--brand)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="connectedCalls"
              name="Connected"
              stroke="var(--chart-series-2)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="failedCalls"
              name="Failed"
              stroke="var(--danger)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </>
  )
}

function LeadAnalyticsSection({ data }: { data: LeadAnalytics }) {
  return (
    <>
      <StatGrid>
        <StatCard label="New leads" value={data.newLeads.toLocaleString('en-IN')} />
        <StatCard label="Contacted" value={data.contactedLeads.toLocaleString('en-IN')} />
        <StatCard label="Interested" value={data.interestedLeads.toLocaleString('en-IN')} />
        <StatCard label="Qualified" value={data.qualifiedLeads.toLocaleString('en-IN')} />
        <StatCard label="Hot leads" value={data.hotLeads.toLocaleString('en-IN')} />
      </StatGrid>

      <ChartCard title="Conversion funnel" subtitle="Leads created in range, by current stage">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={data.funnel}
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
              width={110}
              tick={{ fill: 'var(--muted)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--chart-grid)' }}
              tickLine={false}
            />
            <Tooltip cursor={{ fill: 'var(--surface-hover)' }} contentStyle={tooltipStyle} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
              {data.funnel.map((stage, index) => (
                <Cell key={stage.status} fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </>
  )
}

function SalesAnalyticsSection({ data }: { data: SalesAnalytics }) {
  return (
    <>
      <StatGrid>
        <StatCard label="Open pipeline value" value={formatInr(data.totalPipelineValue)} />
        <StatCard label="Won deals" value={data.wonDeals.toLocaleString('en-IN')} />
        <StatCard label="Lost deals" value={data.lostDeals.toLocaleString('en-IN')} />
        <StatCard label="Revenue" value={formatInr(data.revenue)} />
        <StatCard label="Conversion rate" value={`${data.conversionRate}%`} />
      </StatGrid>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard title="Pipeline value by stage">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={data.pipelineByStage}
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
                dataKey="stageName"
                width={110}
                tick={{ fill: 'var(--muted)', fontSize: 12 }}
                axisLine={{ stroke: 'var(--chart-grid)' }}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'var(--surface-hover)' }}
                contentStyle={tooltipStyle}
                formatter={(value) => formatInr(Number(value))}
              />
              <Bar dataKey="value" fill="var(--brand)" radius={[0, 4, 4, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue over time" subtitle="Won-lead budgets by day">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={data.revenueOverTime}
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
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatInr(Number(value))} />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="var(--chart-series-2)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </>
  )
}

function RankedBarChart({
  data,
  dataKey,
  emptyLabel,
}: {
  data: { label: string; count: number }[]
  dataKey: string
  emptyLabel: string
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted">{emptyLabel}</p>
  }
  const height = Math.max(160, data.length * 36)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 12, right: 24, top: 4, bottom: 4 }}>
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
          width={160}
          tick={{ fill: 'var(--muted)', fontSize: 12 }}
          axisLine={{ stroke: 'var(--chart-grid)' }}
          tickLine={false}
        />
        <Tooltip cursor={{ fill: 'var(--surface-hover)' }} contentStyle={tooltipStyle} />
        <Bar dataKey={dataKey} fill="var(--brand)" radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function AiAnalyticsSection({ data }: { data: AiAnalytics }) {
  return (
    <>
      <StatGrid>
        <StatCard label="AI calls" value={data.aiCalls.toLocaleString('en-IN')} />
        <StatCard label="Successful calls" value={data.successfulCalls.toLocaleString('en-IN')} />
        <StatCard label="Human transfers" value={data.humanTransfers.toLocaleString('en-IN')} />
        <StatCard label="Failed AI calls" value={data.failedAiCalls.toLocaleString('en-IN')} />
        <StatCard label="Avg quality score" value={`${data.avgQualityScore}`} />
      </StatGrid>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard title="Most common objections">
          <RankedBarChart
            data={data.topObjections.map((row) => ({ label: row.objection, count: row.count }))}
            dataKey="count"
            emptyLabel="No objections recorded in this range."
          />
        </ChartCard>
        <ChartCard title="Most common customer questions">
          <RankedBarChart
            data={data.topCustomerQuestions.map((row) => ({ label: row.question, count: row.count }))}
            dataKey="count"
            emptyLabel="No customer questions recorded in this range."
          />
        </ChartCard>
      </div>
    </>
  )
}

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('calls')
  const [range, setRange] = useState<DashboardRange>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const [callData, setCallData] = useState<CallAnalytics | null>(null)
  const [leadData, setLeadData] = useState<LeadAnalytics | null>(null)
  const [salesData, setSalesData] = useState<SalesAnalytics | null>(null)
  const [aiData, setAiData] = useState<AiAnalytics | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequestId = useRef(0)

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo)) {
      return
    }

    const requestId = ++latestRequestId.current
    const query: AnalyticsQuery = { range, from: customFrom, to: customTo }

    const fetchers: Record<Tab, () => Promise<void>> = {
      calls: () => getCallAnalytics(query).then(setCallData),
      leads: () => getLeadAnalytics(query).then(setLeadData),
      sales: () => getSalesAnalytics(query).then(setSalesData),
      ai: () => getAiAnalytics(query).then(setAiData),
    }

    Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return fetchers[activeTab]()
      })
      .catch((err: unknown) => {
        if (requestId !== latestRequestId.current) return
        setError(
          err instanceof ApiError ? err.message : 'Failed to load analytics',
        )
      })
      .finally(() => {
        if (requestId !== latestRequestId.current) return
        setLoading(false)
      })
  }, [activeTab, range, customFrom, customTo])

  return (
    <>
      <header className="mb-8">
        <span className="mb-1.5 block text-xs font-semibold tracking-wide text-brand uppercase">
          Analytics
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Analytics</h1>
        <p className="mt-1.5 text-sm text-muted">
          Calls, leads, sales and AI performance {DASHBOARD_RANGE_LABEL[range].toLowerCase()}.
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

      <TabBar active={activeTab} onChange={setActiveTab} />

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {range === 'custom' && (!customFrom || !customTo) && !error && (
        <p className="mb-4 text-sm text-muted">
          Select a start and end date to load the custom range.
        </p>
      )}

      {loading && <p className="text-sm text-muted">Loading analytics…</p>}

      {!loading && activeTab === 'calls' && callData && (
        <CallAnalyticsSection data={callData} />
      )}
      {!loading && activeTab === 'leads' && leadData && (
        <LeadAnalyticsSection data={leadData} />
      )}
      {!loading && activeTab === 'sales' && salesData && (
        <SalesAnalyticsSection data={salesData} />
      )}
      {!loading && activeTab === 'ai' && aiData && (
        <AiAnalyticsSection data={aiData} />
      )}
    </>
  )
}
