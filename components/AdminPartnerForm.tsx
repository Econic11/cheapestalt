'use client'

import { useState } from 'react'

type AdminPartnerFormProps = {
  onCreate: (partnerUrl: string) => void
}

export function AdminPartnerForm({ onCreate }: AdminPartnerFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [amazonTag, setAmazonTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const password = window.sessionStorage.getItem('admin-password')
      const response = await fetch('/api/admin/partners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': password || '',
        },
        body: JSON.stringify({ name, email, amazonTag }),
      })

      const result = await response.json()
      setLoading(false)

      if (!response.ok) {
        setError(result?.error || 'Unable to create partner')
        return
      }

      onCreate(`${process.env.NEXT_PUBLIC_SITE_URL}/partner/${result.token}`)
      setName('')
      setEmail('')
      setAmazonTag('')
    } catch (err) {
      setLoading(false)
      setError('Failed to create partner')
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-[#161620] p-6 shadow-glow">
      <h3 className="text-xl font-semibold text-white">Add new partner</h3>
      <p className="mt-2 text-sm text-slate-400">Create a partner and generate their private dashboard token.</p>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm text-slate-300">Name</span>
          <input
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0b0b11] px-4 py-3 text-white outline-none transition focus:border-accent"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-300">Email</span>
          <input
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0b0b11] px-4 py-3 text-white outline-none transition focus:border-accent"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            type="email"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-300">Amazon Tag</span>
          <input
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0b0b11] px-4 py-3 text-white outline-none transition focus:border-accent"
            value={amazonTag}
            onChange={(e) => setAmazonTag(e.target.value)}
            placeholder="cheapestalt-jane-20"
            required
          />
        </label>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-12 items-center justify-center rounded-3xl bg-accent px-5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Creating…' : 'Create partner'}
        </button>
      </form>
    </div>
  )
}
