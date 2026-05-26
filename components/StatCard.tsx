type StatCardProps = {
  title: string
  value: string
  subtitle?: string
  variant?: 'blue' | 'green'
}

export function StatCard({ title, value, subtitle, variant = 'blue' }: StatCardProps) {
  const accentColor = variant === 'green' ? '#059669' : '#2563EB'
  const valueColor = variant === 'green' ? '#059669' : '#0F1117'

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderLeft: `4px solid ${accentColor}`,
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      <p
        style={{
          fontSize: '13px',
          fontWeight: 500,
          color: '#6B7280',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          margin: 0,
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontSize: '36px',
          fontWeight: 700,
          color: valueColor,
          marginTop: '12px',
          marginBottom: 0,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
        }}
      >
        {value}
      </p>
      {subtitle && (
        <p style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '8px', marginBottom: 0 }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}
