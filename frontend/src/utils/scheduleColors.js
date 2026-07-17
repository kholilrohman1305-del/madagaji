const HUE_STEPS = 24;
const SHADE_STEPS = 6;

const PALETTE = Array.from({ length: HUE_STEPS * SHADE_STEPS }, (_, index) => {
  const hueIndex = index % HUE_STEPS;
  const shadeIndex = Math.floor(index / HUE_STEPS);
  const hue = Math.round((hueIndex * 360) / HUE_STEPS);
  const saturation = 58 + ((shadeIndex * 7) % 28);
  const lightness = 91 - (shadeIndex * 4);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
});

function hashString(value) {
  const str = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function scheduleCellColor(...parts) {
  const key = parts.filter((part) => part !== undefined && part !== null && part !== '').join('|');
  if (!key) return 'transparent';
  return PALETTE[hashString(key) % PALETTE.length];
}

export const schedulePaletteSize = PALETTE.length;
