import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { validateAdminToken, unauthorizedResponse } from '@/lib/auth'

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  if (!validateAdminToken(_request)) return unauthorizedResponse

  const partnerId = params.id
  await prisma.stat.deleteMany({ where: { partnerId } })
  await prisma.partner.delete({ where: { id: partnerId } })

  return NextResponse.json({ success: true })
}
