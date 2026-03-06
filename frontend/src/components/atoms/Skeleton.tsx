import type { HTMLAttributes } from 'react'

type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  /** Optional class for the shimmer (default: animate-pulse) */
  animation?: string
}

export function Skeleton({ className = '', animation = 'animate-pulse', ...props }: SkeletonProps) {
  return (
    <div
      className={`rounded bg-zinc-700/60 ${animation} ${className}`.trim()}
      aria-hidden
      {...props}
    />
  )
}
