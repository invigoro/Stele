/** A value that notifies subscribers whenever it's replaced. */
export class Store<T> {
  private value: T;
  private readonly listeners = new Set<(value: T) => void>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(value: T): void {
    this.value = value;
    for (const listener of this.listeners) listener(value);
  }

  update(change: (value: T) => T): void {
    this.set(change(this.value));
  }

  /** Calls `listener` after every change; returns a function that unsubscribes. */
  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
