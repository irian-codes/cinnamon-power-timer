import { describe, expect, it, vi } from 'vitest';
import { CancellationLifecycle } from '../../applet/cinnamon-power-timer@irian-codes/src/cancellation-lifecycle';

describe('CancellationLifecycle', () => {
  it('aborts cancellation when dismissed', () => {
    const abort = vi.fn();
    const lifecycle = new CancellationLifecycle(abort);

    expect(lifecycle.dismiss()).toBe(true);
    expect(abort).toHaveBeenCalledOnce();
  });

  it('handles repeated close and destroy signals once', () => {
    const abort = vi.fn();
    const lifecycle = new CancellationLifecycle(abort);

    expect(lifecycle.dismiss()).toBe(true);
    expect(lifecycle.dismiss()).toBe(false);
    expect(abort).toHaveBeenCalledOnce();
  });

  it('does not abort after confirmation', () => {
    const abort = vi.fn();
    const lifecycle = new CancellationLifecycle(abort);

    expect(lifecycle.confirm()).toBe(true);
    expect(lifecycle.dismiss()).toBe(false);
    expect(abort).not.toHaveBeenCalled();
  });
});
