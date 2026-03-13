import { useEffect, useRef, useState } from 'react'
import { Button } from '../atoms/Button'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
}

export type SudoPasswordModalProps = {
  open: boolean
  title: string
  message: string
  runLabel: string
  onRun: (password: string) => void
  onCancel: () => void
  loading?: boolean
}

export function SudoPasswordModal({
  open,
  title,
  message,
  runLabel,
  onRun,
  onCancel,
  loading = false,
}: SudoPasswordModalProps) {
  const [password, setPassword] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const previousOpen = useRef(open)
  const focusRestoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open && !previousOpen.current) {
      previousOpen.current = true
      focusRestoreRef.current = document.activeElement as HTMLElement | null
      setTimeout(() => inputRef.current?.focus(), 0)
    }
    if (!open) {
      previousOpen.current = false
      if (focusRestoreRef.current?.focus) {
        focusRestoreRef.current.focus()
        focusRestoreRef.current = null
      }
    }
  }, [open])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Tab' || !contentRef.current) return
    const focusable = getFocusableElements(contentRef.current)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sudo-modal-title"
      aria-describedby="sudo-modal-desc"
    >
      <div
        ref={contentRef}
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          } else if (e.key === 'Enter') {
            e.preventDefault()
            onRun(password)
          } else {
            handleKeyDown(e)
          }
        }}
      >
        <h2
          id="sudo-modal-title"
          className="text-base font-semibold text-zinc-100"
        >
          {title}
        </h2>
        <p id="sudo-modal-desc" className="mt-2 text-sm text-zinc-400">
          {message}
        </p>
        <div className="mt-4">
          <label htmlFor="sudo-password" className="sr-only">
            Sudo password
          </label>
          <input
            ref={inputRef}
            id="sudo-password"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="md" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => onRun(password)}
            disabled={loading}
          >
            {loading ? '…' : runLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
