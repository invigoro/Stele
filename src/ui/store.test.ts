import { describe, expect, it, vi } from 'vitest';
import { Store } from './store';

describe('Store', () => {
  it('notifies subscribers of each new value until they unsubscribe', () => {
    const store = new Store({ count: 0 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.update((value) => ({ count: value.count + 1 }));
    expect(store.get()).toEqual({ count: 1 });
    expect(listener).toHaveBeenLastCalledWith({ count: 1 });

    unsubscribe();
    store.set({ count: 5 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual({ count: 5 });
  });
});
