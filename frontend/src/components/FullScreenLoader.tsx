export function FullScreenLoader() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3.5 text-sm text-muted">
      <span
        className="h-7 w-7 animate-spin rounded-full border-3 border-border border-t-brand"
        aria-hidden="true"
      />
      <span>Loading…</span>
    </div>
  )
}
