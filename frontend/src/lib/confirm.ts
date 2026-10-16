export interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

interface ConfirmState extends ConfirmOptions {
  id: string
  resolve: (value: boolean) => void
}

type Listener = () => void

let state: ConfirmState | null = null
const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((listener) => listener())
}

/** In-app replacement for window.confirm(); resolves true/false. */
export function confirm(options: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof options === 'string' ? { message: options } : options
  return new Promise((resolve) => {
    state = { id: crypto.randomUUID(), resolve, ...opts }
    emit()
  })
}

export function resolveConfirm(value: boolean) {
  const current = state
  state = null
  emit()
  current?.resolve(value)
}

export function subscribeConfirm(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getConfirmSnapshot() {
  return state
}
