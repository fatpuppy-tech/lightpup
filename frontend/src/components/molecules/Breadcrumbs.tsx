import { Link } from 'react-router-dom'

export type BreadcrumbItem = {
  label: string
  href?: string
}

type BreadcrumbsProps = {
  items: BreadcrumbItem[]
  className?: string
}

const separator = (
  <span className="mx-1.5 text-zinc-600" aria-hidden>
    /
  </span>
)

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  if (items.length === 0) return null

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex flex-wrap items-center text-sm ${className}`}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={i} className="flex items-center">
            {i > 0 && separator}
            {item.href && !isLast ? (
              <Link
                to={item.href}
                className="text-zinc-400 hover:text-emerald-400 transition-colors truncate max-w-[140px] sm:max-w-[200px]"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={isLast ? 'text-zinc-100 font-medium truncate max-w-[180px] sm:max-w-[240px]' : 'text-zinc-400 truncate max-w-[140px] sm:max-w-[200px]'}
              >
                {item.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
