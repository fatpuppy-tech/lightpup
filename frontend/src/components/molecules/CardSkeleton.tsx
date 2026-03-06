import { Card } from '../atoms/Card'
import { Skeleton } from '../atoms/Skeleton'

/** Skeleton that approximates a ProjectCard / generic card: title, lines, footer. */
export function CardSkeleton() {
  return (
    <Card className="border-zinc-800/80 bg-zinc-900/70">
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/2" />
          <div className="pt-1">
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>
    </Card>
  )
}
