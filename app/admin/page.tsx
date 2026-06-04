'use client'

import { useEffect, useState } from 'react'
import { AdminPartnerForm } from '@/components/AdminPartnerForm'
import { AdminStatsForm } from '@/components/AdminStatsForm'

type PartnerRow = {
  id: string
  name: string
  email: string
  amazonTag: string
  token: string
  totalClicksThisMonth: number
  totalRevenueThisMonth: number
}

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [partners, setPartners] = useState<PartnerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdLink, setCreatedLink] = useState('')

  useEffect(() => {
    const stored = window.sessionStorage.getItem('admin-password')
    if (stored) {
      setAuthed(true)
    }
  }, [])

  useEffect(() => {
    if (!authed) return
    setLoading(true)
    fetch('/api/admin/partners', { headers: { 'x-admin-token': window.sessionStorage.getItem('admin-password') ?? '' } })
      .then(async (res) => {
        if (!res.ok) throw new Error('Unable to load partners')
        return res.json()
      })
      .then((data) => setPartners(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [authed, refreshKey])

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    window.sessionStorage.setItem('admin-password', password)
    setAuthed(true)
  }

  const handleCreate = (link: string) => {
    setCreatedLink(link)
    setTimeout(() => setCreatedLink(''), 10000)
    setRefreshKey((current) => current + 1)
  }

  const handleRefresh = () => setRefreshKey((current) => current + 1)

  if (!authed) {
    return (
      <main className="min-h-screen px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-surface/70 p-10 shadow-glow">
          <h1 className="text-3xl font-semibold text-white">Admin sign in</h1>
          <p className="mt-3 text-slate-400">Enter the admin password stored in your .env file.</p>
          <form className="mt-8 space-y-4" onSubmit={handleLogin}>
            <label className="block">
              <span className="text-sm text-slate-300">Admin password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0b0b11] px-4 py-3 text-white outline-none transition focus:border-accent"
                required
              />
            </label>
            <button className="inline-flex h-12 items-center justify-center rounded-3xl bg-accent px-5 text-sm font-semibold text-black transition hover:brightness-110">
              Sign in
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-6 py-10 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-3xl border border-white/10 bg-surface/70 p-8 shadow-glow">
          <h1 className="text-3xl font-semibold text-white">Admin panel</h1>
          <p className="mt-2 text-slate-400">Manage partners, create new dashboard links, and enter daily performance.</p>
        </header>

        {createdLink ? (
          <div className="rounded-3xl border border-success/20 bg-[#05251d] p-6 text-success shadow-glow">
            <p className="font-medium">Partner created</p>
            <p className="mt-2 text-sm text-slate-300">Share this private link:</p>
            <p className="mt-2 break-all text-white">{createdLink}</p>
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-[#161620] p-6 shadow-glow">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-orange-300">Partner list</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">All partners</h2>
                </div>
                <button
                  onClick={handleRefresh}
                  className="inline-flex h-11 items-center justify-center rounded-3xl bg-[#0f172a] px-4 text-sm text-slate-200 transition hover:bg-[#111827]"
                >
                  Refresh
                </button>
              </div>
              {loading ? (
                <div className="mt-8 space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-12 rounded-2xl bg-[#0b0b11]" />
                  ))}
                </div>
              ) : error ? (
                <p className="mt-6 text-sm text-red-400">{error}</p>
              ) : (
                <div className="mt-8 overflow-x-auto">
                  <table className="min-w-full divide-y divide-white/10 text-left text-sm text-slate-300">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 font-medium text-white">Name</th>
                        <th className="px-4 py-3 font-medium text-white">Email</th>
                        <th className="px-4 py-3 font-medium text-white">Amazon Tag</th>
                        <th className="px-4 py-3 font-medium text-white">Clicks</th>
                        <th className="px-4 py-3 font-medium text-white">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {partners.map((partner) => (
                        <tr key={partner.id} className="hover:bg-white/5">
                          <td className="whitespace-nowrap px-4 py-4 font-medium text-white">{partner.name}</td>
                          <td className="px-4 py-4">{partner.email}</td>
                          <td className="px-4 py-4">{partner.amazonTag}</td>
                          <td className="px-4 py-4">{partner.totalClicksThisMonth}</td>
                          <td className="px-4 py-4 text-success">${partner.totalRevenueThisMonth.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <AdminStatsForm partners={partners.map((partner) => ({ id: partner.id, name: partner.name }))} onSaved={handleRefresh} />
          </div>

          <AdminPartnerForm onCreate={handleCreate} />
        </div>
      </div>
    </main>
  )
}
