type StatRow = {
  date: string
  clicks: number
  orders: number
  revenue: number
}

type StatsTableProps = {
  rows: StatRow[]
}

export function StatsTable({ rows }: StatsTableProps) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0F1117', margin: 0 }}>
          Last 30 Days
        </h3>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
          <thead>
            <tr style={{ background: '#F9FAFB' }}>
              {['Date', 'Clicks', 'Orders', 'Revenue'].map((col) => (
                <th
                  key={col}
                  style={{
                    padding: '12px 24px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#6B7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.date}
                style={{
                  background: i % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                  borderTop: '1px solid #F3F4F6',
                }}
              >
                <td
                  style={{
                    padding: '14px 24px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                  }}
                >
                  {row.date}
                </td>
                <td
                  style={{
                    padding: '14px 24px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#0F1117',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {row.clicks}
                </td>
                <td
                  style={{
                    padding: '14px 24px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#0F1117',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {row.orders}
                </td>
                <td
                  style={{
                    padding: '14px 24px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#059669',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  ${row.revenue.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
