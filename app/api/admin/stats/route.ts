import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { validateAdminToken, unauthorizedResponse } from '@/lib/auth'

export async function POST(request: Request) {
  if (!validateAdminToken(request)) return unauthorizedResponse

  const body = await request.json()
  const { partnerId, date, clicks, orders, revenue } = body

  if (!partnerId || !date || clicks == null || orders == null || revenue == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const statDate = new Date(date)
  statDate.setHours(0, 0, 0, 0)

  const stat = await prisma.stat.upsert({
    where: { partnerId_date: { partnerId, date: statDate } },
    update: { clicks, orders, revenue },
    create: { partnerId, date: statDate, clicks, orders, revenue },
  })

  return NextResponse.json({ stat: { id: stat.id, date: stat.date.toISOString().slice(0, 10), clicks: stat.clicks, orders: stat.orders, revenue: stat.revenue } })
}
