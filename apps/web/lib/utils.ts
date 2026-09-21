export { cn } from "cn"

export function getInitials(name: string | null | undefined): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "0"
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)
}

export function formatCurrency(
  value: number | null | undefined,
  currency = "USD",
): string {
  if (value == null || Number.isNaN(value)) value = 0
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes) || bytes <= 0) return "0 Bytes"
  const units = ["Bytes", "KB", "MB", "GB", "TB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  return `${Number(value.toFixed(value >= 10 || i === 0 ? 0 : 1))} ${units[i]}`
}
