export interface MenuRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MenuSize {
  width: number;
  height: number;
}

export interface MenuPosition {
  x: number;
  y: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function positionDropdown(
  anchorX: number,
  parentBottom: number,
  dropdown: MenuSize,
  monitor: MenuRectangle,
): MenuPosition {
  const maximumX = Math.max(monitor.x, monitor.x + monitor.width - dropdown.width);
  const maximumY = Math.max(monitor.y, monitor.y + monitor.height - dropdown.height);
  return {
    x: Math.round(clamp(anchorX, monitor.x, maximumX)),
    y: Math.round(clamp(parentBottom - dropdown.height, monitor.y, maximumY)),
  };
}
