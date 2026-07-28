const GOLDEN_ANGLE = 137.508;

function extraIdentity(item) {
  return String(item?.extracurricularId || item?.name || 'ekstra');
}

function hslToRgb(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs((2 * l) - 1)) * s;
  const segment = hue / 60;
  const second = chroma * (1 - Math.abs((segment % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  if (segment < 1) [red, green] = [chroma, second];
  else if (segment < 2) [red, green] = [second, chroma];
  else if (segment < 3) [green, blue] = [chroma, second];
  else if (segment < 4) [green, blue] = [second, chroma];
  else if (segment < 5) [red, blue] = [second, chroma];
  else [red, blue] = [chroma, second];
  const match = l - (chroma / 2);
  return [red, green, blue].map((value) => Math.round((value + match) * 255));
}

function makeColor(index) {
  const hue = Math.round((index * GOLDEN_ANGLE + 9) % 360);
  const saturation = [82, 72, 88, 76, 84][index % 5];
  const lightness = [43, 49, 38, 54][Math.floor(index / 5) % 4];
  return {
    solid: `hsl(${hue} ${saturation}% ${lightness}%)`,
    ink: `hsl(${hue} ${Math.min(92, saturation + 4)}% 22%)`,
    soft: `hsl(${hue} ${Math.max(48, saturation - 14)}% 95%)`,
    border: `hsl(${hue} ${Math.max(55, saturation - 8)}% 76%)`,
    glow: `hsl(${hue} ${saturation}% ${lightness}% / .2)`,
    solidRgb: hslToRgb(hue, saturation, lightness),
    inkRgb: hslToRgb(hue, Math.min(92, saturation + 4), 22),
    softRgb: hslToRgb(hue, Math.max(48, saturation - 14), 95)
  };
}

export function buildExtraColorMap(rows = []) {
  const unique = new Map();
  rows.forEach((item) => {
    const key = extraIdentity(item);
    if (!unique.has(key)) unique.set(key, item);
  });
  const sorted = [...unique.entries()].sort(([, left], [, right]) => (
    String(left?.name || '').localeCompare(String(right?.name || ''), 'id', { numeric: true })
  ));
  return new Map(sorted.map(([key], index) => [key, makeColor(index)]));
}

export function colorForExtra(item, colorMap) {
  return colorMap?.get(extraIdentity(item)) || makeColor(0);
}
