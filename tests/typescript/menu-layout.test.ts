import { describe, expect, it } from 'vitest';
import { positionDropdown } from '../../applet/cinnamon-power-timer@irian-codes/src/menu-layout';

describe('positionDropdown', () => {
  it('aligns the dropdown bottom with the parent menu', () => {
    expect(
      positionDropdown(
        250,
        900,
        { width: 240, height: 320 },
        { x: 0, y: 0, width: 1920, height: 1080 },
      ),
    ).toEqual({ x: 250, y: 580 });
  });

  it('keeps the dropdown inside offset monitor bounds', () => {
    expect(
      positionDropdown(
        3740,
        1030,
        { width: 300, height: 400 },
        { x: 1920, y: 0, width: 1920, height: 1080 },
      ),
    ).toEqual({ x: 3540, y: 630 });
  });

  it('pins oversized dropdowns to the monitor origin', () => {
    expect(
      positionDropdown(
        200,
        900,
        { width: 1200, height: 1000 },
        { x: 100, y: 50, width: 800, height: 600 },
      ),
    ).toEqual({ x: 100, y: 50 });
  });
});
