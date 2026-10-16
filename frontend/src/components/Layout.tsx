import type { ReactNode } from 'react'
import { Nav } from './Nav'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-stretch md:flex-row md:items-start">
      <Nav />
      <main className="min-w-0 flex-1 p-6 md:p-12">{children}</main>
    </div>
  )
}
