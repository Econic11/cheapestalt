import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const partner = await prisma.partner.findUnique({
    where: { token: params.token },
    include: { stats: { orderBy: { date: 'desc' } } },
  })

  if (!partner) {
    return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
  }

  const stats = partner.stats
    .map((stat) => ({
      date: stat.date.toISOString().slice(0, 10),
      clicks: stat.clicks,
      orders: stat.orders,
      revenue: stat.revenue,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  return NextResponse.json({ partner: { name: partner.name, token: partner.token, amazonTag: partner.amazonTag }, stats })
}
