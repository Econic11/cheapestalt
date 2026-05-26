'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { StatCard } from '@/components/StatCard'
import { ClicksChart } from '@/components/ClicksChart'
import { StatsTable } from '@/components/StatsTable'

type StatRow = {
  date: string
  clicks: number
  orders: number
  revenue: number
}

type PartnerPayload = {
  partner: {
    name: string
    token: string
    amazonTag: string
  }
  stats: StatRow[]
}

const PAGE_STYLE: React.CSSProperties = {
  minHeight: '100vh',
  background: '#F8F9FC',
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  color: '#0F1117',
}

const CARD_STYLE: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E5E7EB',
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
}

function SkeletonPulse({ height, width = '100%' }: { height: number | string; width?: string }) {
  return (
    <div
      className="animate-pulse"
      style={{ height, width, background: '#F3F4F6', borderRadius: '12px' }}
    />
  )
}

function PageHeader({ name, initials }: { name?: string; initials?: string }) {
  return (
    <header
      style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E5E7EB',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <span
        style={{
          color: '#2563EB',
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: '-0.02em',
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        }}
      >
        CheapestAlt
      </span>
      {name && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>{name}</span>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#2563EB',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
        </div>
      )}
    </header>
  )
}

export default function PartnerDashboard({ params }: { params: { token: string } }) {
  const [data, setData] = useState<PartnerPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/partner/${params.token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Dashboard not found')
        return res.json()
      })
      .then((payload) => setData(payload))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [params.token])

  const stats = data?.stats ?? []

  const todayStat = useMemo(() => {
    const todayKey = format(new Date(), 'yyyy-MM-dd')
    return stats.find((row) => row.date === todayKey) ?? { clicks: 0, orders: 0, revenue: 0, date: todayKey }
  }, [stats])

  const monthStats = useMemo(() => {
    return stats.reduce(
      (acc, row) => ({
        clicks: acc.clicks + row.clicks,
        orders: acc.orders + row.orders,
        revenue: acc.revenue + row.revenue,
      }),
      { clicks: 0, orders: 0, revenue: 0 }
    )
  }, [stats])

  const chartData = useMemo(
    () =>
      stats
        .slice(0, 7)
        .map((row) => ({ date: format(new Date(row.date), 'MM/dd'), clicks: row.clicks }))
        .reverse(),
    [stats]
  )

  const partnerInitials = data?.partner.name ? data.partner.name.charAt(0).toUpperCase() : '?'

  if (loading) {
    return (
      <div style={PAGE_STYLE}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
        <PageHeader />
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <SkeletonPulse height={60} width="42%" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonPulse key={i} height={114} />
              ))}
            </div>
            <SkeletonPulse height={292} />
            <SkeletonPulse height={420} />
          </div>
        </main>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={PAGE_STYLE}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
        <PageHeader />
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
          <div style={{ ...CARD_STYLE, padding: '48px 32px', textAlign: 'center' }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                margin: 0,
              }}
            >
              Error
            </p>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0F1117', marginTop: 12, marginBottom: 8 }}>
              Dashboard not found
            </h1>
            <p style={{ fontSize: 14, color: '#6B7280', margin: 0 }}>
              Make sure you opened the correct private link or contact support.
            </p>
          </div>
        </main>
      </div>
    )
  }

  if (!data.partner.amazonTag) {
    return (
      <div style={PAGE_STYLE}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
        <PageHeader name={data.partner.name} initials={partnerInitials} />
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
          <div style={{ ...CARD_STYLE, padding: '56px 32px', textAlign: 'center' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: '#EFF6FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F1117', margin: '0 0 8px' }}>
              Your account is being set up
            </h2>
            <p style={{ fontSize: 14, color: '#6B7280', maxWidth: 420, margin: '0 auto' }}>
              We&apos;ll assign your Amazon tracking ID shortly. Your stats will appear here once everything is linked.
            </p>
            <a
              href="mailto:support@cheapestalt.com"
              style={{
                display: 'inline-block',
                marginTop: 24,
                padding: '10px 24px',
                border: '1px solid #2563EB',
                borderRadius: 8,
                color: '#2563EB',
                fontSize: 14,
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Contact Support
            </a>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div style={PAGE_STYLE}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      <PageHeader name={data.partner.name} initials={partnerInitials} />

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* Greeting */}
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0F1117', margin: '0 0 6px', lineHeight: 1.2 }}>
              Hey {data.partner.name} 👋
            </h1>
            <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 12px' }}>
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: '#EFF6FF',
                color: '#2563EB',
                border: '1px solid #BFDBFE',
                borderRadius: 20,
                padding: '4px 12px',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Tag: {data.partner.amazonTag}
            </span>
          </div>

          {/* 5 Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <StatCard
              title="Today Clicks"
              value={todayStat.clicks.toString()}
              variant="blue"
            />
            <StatCard
              title="Today Orders"
              value={todayStat.orders.toString()}
              variant="green"
            />
            <StatCard
              title="Month Orders"
              value={monthStats.orders.toString()}
              variant="blue"
            />
            <StatCard
              title="Total Commission"
              value={`$${monthStats.revenue.toFixed(2)}`}
              variant="green"
              subtitle="Combined (both partners)"
            />
            <StatCard
              title="Net Earnings"
              value={`$${(monthStats.revenue * 0.5).toFixed(2)}`}
              variant="green"
              subtitle="Your 50% share"
            />
          </div>

          {/* Chart */}
          <ClicksChart data={chartData} />

          {/* Stats Table */}
          <StatsTable rows={stats.slice(0, 30)} />

        </div>
      </main>
    </div>
  )
}
