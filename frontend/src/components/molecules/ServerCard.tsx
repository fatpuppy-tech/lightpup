import type { MouseEventHandler } from 'react'
import { Card } from '../atoms/Card'
import type { Server } from '../../lib/api'

const ServerIconBg = () => (
  <svg
    className="h-36 w-36 text-zinc-700/30"
    viewBox="0 0 640 640"
    fill="currentColor"
    aria-hidden
  >
    <path d="M160 96C124.7 96 96 124.7 96 160L96 224C96 259.3 124.7 288 160 288L480 288C515.3 288 544 259.3 544 224L544 160C544 124.7 515.3 96 480 96L160 96zM376 168C389.3 168 400 178.7 400 192C400 205.3 389.3 216 376 216C362.7 216 352 205.3 352 192C352 178.7 362.7 168 376 168zM432 192C432 178.7 442.7 168 456 168C469.3 168 480 178.7 480 192C480 205.3 469.3 216 456 216C442.7 216 432 205.3 432 192zM160 352C124.7 352 96 380.7 96 416L96 480C96 515.3 124.7 544 160 544L480 544C515.3 544 544 515.3 544 480L544 416C544 380.7 515.3 352 480 352L160 352zM376 424C389.3 424 400 434.7 400 448C400 461.3 389.3 472 376 472C362.7 472 352 461.3 352 448C352 434.7 362.7 424 376 424zM432 448C432 434.7 442.7 424 456 424C469.3 424 480 434.7 480 448C480 461.3 469.3 472 456 472C442.7 472 432 461.3 432 448z" />
  </svg>
)

type ServerCardProps = {
  server: Server
  onClick?: MouseEventHandler<HTMLButtonElement>
}

export function ServerCard({ server, onClick }: ServerCardProps) {
  const isRemote = !!server.ssh_user
  const sshSummary =
    server.ssh_user || server.ssh_key_path
      ? `${server.ssh_user ?? 'ssh'} @ ${server.address}${
          server.ssh_key_path ? ` · ${server.ssh_key_path}` : ''
        }`
      : server.address

  return (
    <button type="button" onClick={onClick} className="cursor-pointer text-left">
      <Card className="relative h-full overflow-hidden border-zinc-800/80 bg-zinc-900/70 transition-colors hover:border-emerald-500 hover:bg-zinc-800/80">
        <div
          className="pointer-events-none absolute -bottom-8 -right-8"
          aria-hidden
        >
          <ServerIconBg />
        </div>
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-zinc-100">
                {server.name}
              </span>
              {isRemote && (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400">
                  SSH
                </span>
              )}
            </div>
            <div className="mt-1 truncate text-[11px] text-zinc-500">
              {sshSummary}
            </div>
            <div className="mt-1 text-[11px] text-zinc-600">
              <span className="text-zinc-500">Host:</span>{' '}
              <span className="font-mono">{server.address}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-600">
              <span className="text-zinc-500">ID:</span>{' '}
              <span className="font-mono">{server.id}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  server.is_active ? 'bg-emerald-400' : 'bg-zinc-500'
                }`}
              />
              <span>{server.is_active ? 'Active' : 'Disabled'}</span>
            </div>
          </div>
        </div>
      </Card>
    </button>
  )
}

