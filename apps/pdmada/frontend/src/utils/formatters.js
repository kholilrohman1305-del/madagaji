export function formatDate(value) {
  if (!value) return '-';
  const str = String(value).slice(0, 10);
  const parts = str.split('-');
  if (parts.length === 3) {
    const [yyyy, mm, dd] = parts;
    if (yyyy && mm && dd) return `${mm}/${dd}/${yyyy}`;
  }
  return str;
}

export function formatYear(value) {
  if (!value) return '-';
  const str = String(value).slice(0, 10);
  const parts = str.split('-');
  if (parts.length >= 1 && parts[0]) return parts[0];
  return str;
}
