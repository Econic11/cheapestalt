'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type ClicksChartProps = {
  data: { date: string; clicks: number }[]
}

export function ClicksChart({ data }: ClicksChartProps) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      <h3
        style={{
          fontSize: '16px',
          fontWeight: 600,
          color: '#0F1117',
          marginTop: 0,
          marginBottom: '20px',
        }}
      >
        Clicks — Last 7 Days
      </h3>
      <div style={{ height: '220px', width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: '#FFFFFF',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.07)',
                color: '#0F1117',
              }}
              labelStyle={{ color: '#374151', fontWeight: 600 }}
              cursor={{ fill: '#EFF6FF' }}
            />
            <Bar dataKey="clicks" radius={[6, 6, 0, 0]} fill="#2563EB" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
