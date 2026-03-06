import type { ReactNode } from 'react'

export function PageMain({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <main
      id="app"
      className={`w-full px-4 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6 ${className}`.trim()}
    >
      {children}
    </main>
  )
}

