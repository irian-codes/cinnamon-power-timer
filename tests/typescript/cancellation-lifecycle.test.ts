import { describe, expect, it, vi } from 'vitest';
import {
  CancellationCountdown,
  CancellationLifecycle,
} from '../../applet/cinnamon-power-timer@irian-codes/src/cancellation-lifecycle';

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

describe('CancellationCountdown', () => {
  it('counts every second before completing', () => {
    const countdown = new CancellationCountdown(10);
    const labels = [countdown.label()];

    while (!countdown.isComplete) {
      countdown.tick();
      labels.push(countdown.label());
    }

    expect(labels).toEqual([
      'Cancel Timer (10)',
      'Cancel Timer (9)',
      'Cancel Timer (8)',
      'Cancel Timer (7)',
      'Cancel Timer (6)',
      'Cancel Timer (5)',
      'Cancel Timer (4)',
      'Cancel Timer (3)',
      'Cancel Timer (2)',
      'Cancel Timer (1)',
      'Cancel Timer',
    ]);
  });

  it('enables immediately for a zero-second delay', () => {
    const countdown = new CancellationCountdown(0);

    expect(countdown.isComplete).toBe(true);
    expect(countdown.label()).toBe('Cancel Timer');
  });
});
