import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

async function main() {
  const partners = [
    { name: 'John', email: 'john@cheapestalt.com', token: 'demo-john', amazonTag: 'cheapestalt-john-20' },
    { name: 'Sara', email: 'sara@cheapestalt.com', token: 'demo-sara', amazonTag: 'cheapestalt-sara-20' },
    { name: 'Mike', email: 'mike@cheapestalt.com', token: 'demo-mike', amazonTag: 'cheapestalt-mike-20' },
  ]

  for (const partnerData of partners) {
    const partner = await prisma.partner.upsert({
      where: { email: partnerData.email },
      update: {},
      create: partnerData,
    })

    for (let day = 0; day < 30; day++) {
      const date = new Date()
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() - day)

      await prisma.stat.upsert({
        where: {
          partnerId_date: {
            partnerId: partner.id,
            date,
          },
        },
        update: {
          clicks: randomInt(200, 1500),
          orders: randomInt(5, 40),
          revenue: Number((Math.random() * 110 + 10).toFixed(2)),
        },
        create: {
          partnerId: partner.id,
          date,
          clicks: randomInt(200, 1500),
          orders: randomInt(5, 40),
          revenue: Number((Math.random() * 110 + 10).toFixed(2)),
        },
      })
    }
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
