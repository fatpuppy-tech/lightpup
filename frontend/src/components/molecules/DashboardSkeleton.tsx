import { Card } from '../atoms/Card'
import { Skeleton } from '../atoms/Skeleton'

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-zinc-800/80 bg-zinc-900/70">
          <Skeleton className="h-3 w-20" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </Card>
        <Card className="border-zinc-800/80 bg-zinc-900/70">
          <Skeleton className="h-3 w-24" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-full" />
          </div>
        </Card>
        <Card className="border-zinc-800/80 bg-zinc-900/70">
          <Skeleton className="h-3 w-28" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </Card>
      </section>
      <section>
        <Skeleton className="mb-3 h-4 w-32" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="flex items-center gap-4 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-36" />
              <Skeleton className="ml-auto h-5 w-14 rounded" />
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
