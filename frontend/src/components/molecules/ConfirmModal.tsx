import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '../atoms/Button'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
}

type ConfirmModalProps = {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'primary' | 'danger'
  loading?: boolean
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'primary',
  loading = false,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const previousOpen = useRef(open)
  const focusRestoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open && !previousOpen.current) {
      previousOpen.current = true
      focusRestoreRef.current = document.activeElement as HTMLElement | null
      setTimeout(() => confirmRef.current?.focus(), 0)
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
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
    >
      <div
        ref={contentRef}
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          } else {
            handleKeyDown(e)
          }
        }}
      >
        <h2
          id="confirm-modal-title"
          className="text-base font-semibold text-zinc-100"
        >
          {title}
        </h2>
        <p id="confirm-modal-desc" className="mt-2 text-sm text-zinc-400">
          {message}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="md" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={variant === 'danger' ? 'danger' : 'primary'}
            size="md"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? '…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
