import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { validateAdminToken, unauthorizedResponse } from '@/lib/auth'

function getMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { start, end }
}

export async function GET(request: Request) {
  if (!validateAdminToken(request)) return unauthorizedResponse

  const { start, end } = getMonthRange()
  const partners = await prisma.partner.findMany({ include: { stats: { where: { date: { gte: start, lt: end } } } } })

  const payload = partners.map((partner) => ({
    id: partner.id,
    name: partner.name,
    email: partner.email,
    amazonTag: partner.amazonTag,
    token: partner.token,
    totalClicksThisMonth: partner.stats.reduce((sum, stat) => sum + stat.clicks, 0),
    totalRevenueThisMonth: partner.stats.reduce((sum, stat) => sum + stat.revenue, 0),
  }))

  return NextResponse.json(payload)
}

export async function POST(request: Request) {
  if (!validateAdminToken(request)) return unauthorizedResponse

  const body = await request.json()
  const { name, email, amazonTag } = body

  if (!name || !email || !amazonTag) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const token = `p-${crypto.randomUUID().slice(0, 8)}`
  const partner = await prisma.partner.create({
    data: { name, email, amazonTag, token },
  })

  return NextResponse.json({ id: partner.id, token: partner.token, name: partner.name, email: partner.email, amazonTag: partner.amazonTag })
}
