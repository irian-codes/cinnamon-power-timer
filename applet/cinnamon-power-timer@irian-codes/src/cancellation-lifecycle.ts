export class CancellationLifecycle {
  private _settled = false;

  constructor(private readonly _abort: () => void) {}

  confirm(): boolean {
    if (this._settled) return false;
    this._settled = true;
    return true;
  }

  dismiss(): boolean {
    if (this._settled) return false;
    this._settled = true;
    this._abort();
    return true;
  }
}

export class CancellationCountdown {
  private _remaining: number;

  constructor(delaySeconds: number) {
    this._remaining = Math.max(0, Math.floor(delaySeconds));
  }

  get remaining(): number {
    return this._remaining;
  }

  get isComplete(): boolean {
    return this._remaining === 0;
  }

  tick(): number {
    if (this._remaining > 0) this._remaining -= 1;
    return this._remaining;
  }

  label(): string {
    return this.isComplete ? 'Cancel Timer' : `Cancel Timer (${this._remaining})`;
  }
}
