import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-10 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-surface/70 p-8 shadow-glow backdrop-blur-xl">
        <div className="mb-8 space-y-3">
          <p className="text-sm uppercase tracking-[0.3em] text-orange-300">CheapestAlt Partner Dashboard</p>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Partner stats for affiliate creators</h1>
          <p className="max-w-2xl text-lg text-slate-300">Secure private affiliate dashboards for clicks, orders, and commissions. Partners access data through a unique secret token URL.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/admin" className="rounded-3xl bg-[#17171f] p-6 transition hover:-translate-y-1 hover:bg-white/5">
            <h2 className="text-xl font-semibold text-white">Admin Panel</h2>
            <p className="mt-2 text-sm text-slate-400">Manage partners, add daily stats, and publish dashboard links.</p>
          </Link>
          <Link href="/partner/demo-john" className="rounded-3xl bg-[#17171f] p-6 transition hover:-translate-y-1 hover:bg-white/5">
            <h2 className="text-xl font-semibold text-white">Demo Partner</h2>
            <p className="mt-2 text-sm text-slate-400">View the example partner dashboard for demo-john.</p>
          </Link>
        </div>
      </div>
    </main>
  )
}
