export type Listener<T extends unknown[]> = (...data: T) => void

export type Unsubscribe = () => void

export class Topic<T extends unknown[]> {
  listeners: Set<(...data: T) => void> = new Set()

  add(handler: Listener<T>): Unsubscribe {
    this.listeners.add(handler)

    return () => this.remove(handler)
  }

  remove(handler: Listener<T>): void {
    this.listeners.delete(handler)
  }

  emit(...data: T): void {
    for (const handler of this.listeners) {
      handler(...data)
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}
