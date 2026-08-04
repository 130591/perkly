export function formatBRL(cents: string | bigint): string {
  const value = Number(BigInt(cents)) / 100
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function reaisToCents(reais: string): bigint {
  const normalized = reais.replace(/\./g, '').replace(',', '.')
  const value = Number.parseFloat(normalized)
  return BigInt(Math.round(value * 100))
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
