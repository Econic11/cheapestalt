'use client'

import { useState } from 'react'

type PartnerOption = {
  id: string
  name: string
}

type AdminStatsFormProps = {
  partners: PartnerOption[]
  onSaved: () => void
}

export function AdminStatsForm({ partners, onSaved }: AdminStatsFormProps) {
  const [partnerId, setPartnerId] = useState(partners[0]?.id || '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [clicks, setClicks] = useState('')
  const [orders, setOrders] = useState('')
  const [revenue, setRevenue] = useState('')
  const [message, setMessage] = useState('')

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    const password = window.sessionStorage.getItem('admin-password')

    const response = await fetch('/api/admin/stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': password || '',
      },
      body: JSON.stringify({ partnerId, date, clicks: Number(clicks), orders: Number(orders), revenue: Number(revenue) }),
    })

    const result = await response.json()
    if (!response.ok) {
      setMessage(result.error || 'Unable to save stats')
      return
    }

    setMessage('Stat row saved successfully')
    setClicks('')
    setOrders('')
    setRevenue('')
    onSaved()
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-[#161620] p-6 shadow-glow">
      <h3 className="text-xl font-semibold text-white">Add daily stats</h3>
      <p className="mt-2 text-sm text-slate-400">Insert or update a daily stat row for a partner.</p>
      <form className="mt-6 grid gap-4" onSubmit={handleSave}>
        <label className="block">
          <span className="text-sm text-slate-300">Partner</span>
          <select
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0b0b11] px-4 py-3 text-white outline-none transition focus:border-accent"
          >
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0b0b11] px-4 py-3 text-white outline-none transition focus:border-accent"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Clicks</span>
          <input
            type="number"
            min="0"
            value={clicks}
            onChange={(e) => setClicks(e.target.value)}
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0b0b11] px-4 py-3 text-white outline-none transition focus:border-accent"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Orders</span>
          <input
            type="number"
            min="0"
            value={orders}
            onChange={(e) => setOrders(e.target.value)}
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0b0b11] px-4 py-3 text-white outline-none transition focus:border-accent"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Revenue (USD)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0b0b11] px-4 py-3 text-white outline-none transition focus:border-accent"
            required
          />
        </label>

        {message ? <p className="text-sm text-slate-300">{message}</p> : null}

        <button className="inline-flex h-12 items-center justify-center rounded-3xl bg-accent px-5 text-sm font-semibold text-black transition hover:brightness-110">
          Save stats
        </button>
      </form>
    </div>
  )
}
