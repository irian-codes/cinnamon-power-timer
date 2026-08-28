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
