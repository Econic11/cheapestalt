import './globals.css'
import type { Metadata } from 'next'
import { Syne, DM_Sans } from 'next/font/google'

const syne = Syne({ subsets: ['latin'], weight: ['500', '700', '800'] })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600'] })

export const metadata: Metadata = {
  title: 'CheapestAlt Partner Dashboard',
  description: 'Private partner dashboard for cheapestalt.com',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  openGraph: {
    title: 'CheapestAlt Partner Dashboard',
    description: 'Private partner dashboard for cheapestalt.com',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${syne.className} ${dmSans.className} bg-page text-white`}>
        {children}
      </body>
    </html>
  )
}
