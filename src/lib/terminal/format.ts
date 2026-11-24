export function formatGridTable(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  maxColWidth: number = 42
): string[] {
  if (rows.length === 0) return ["(no rows)"];

  const colWidths = headers.map((h, i) => {
    let max = h.length;
    for (const r of rows) {
      const len = String(r[i] ?? "NULL").length;
      if (len > max) max = len;
    }
    return Math.min(Math.max(max, 3), maxColWidth);
  });

  const headerLine = headers
    .map((h, i) => h.toUpperCase().padEnd(colWidths[i]))
    .join("   ");
  const sepLine = colWidths.map((w) => "-".repeat(w)).join("   ");
  const dataLines = rows.map((r) =>
    headers
      .map((_, i) => {
        const raw = String(r[i] ?? "NULL");
        const cell =
          raw.length > colWidths[i]
            ? `${raw.slice(0, Math.max(1, colWidths[i] - 3))}...`
            : raw;
        return cell.padEnd(colWidths[i]);
      })
      .join("   ")
  );

  return [headerLine, sepLine, ...dataLines];
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  return `${value.toFixed(1)} ${units[unitIdx]}`;
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0s";
  const whole = Math.floor(seconds);
  const days = Math.floor(whole / 86400);
  const hours = Math.floor((whole % 86400) / 3600);
  const mins = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (mins > 0 || hours > 0 || days > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(" ");
}

