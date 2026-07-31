interface ToastRegionProps {
  message: string | null
  actionLabel?: string
  onAction?: () => void
}

export function ToastRegion({ message, actionLabel, onAction }: ToastRegionProps) {
  if (!message) {
    return null
  }

  return (
    <div className="toast-region" role="alert">
      <span>{message}</span>
      {actionLabel && onAction ? (
        <button className="toast-region__action" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
