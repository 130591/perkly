import type { LedgerEntry } from '../api/types'

/**
 * Presentation layer for the wallet extract: turns backend facts (`type`,
 * `campaignName`, signed `amountCents`) into copy. Lives here, not in the
 * API, so wording/i18n/rollup choices are free to change without touching
 * the backend, and a different client could read the same endpoint and
 * present it differently.
 */
export type LedgerEntryView = {
  /** `null` for a rolled-up row (e.g. a batch's expirations) — not one real transaction. */
  id: string | null
  label: string
  amountCents: string
  createdAt: string
}

const FALLBACK_CAMPAIGN_NAME = 'campanha removida'

export function composeLedgerView(entries: LedgerEntry[]): LedgerEntryView[] {
  const rows: LedgerEntryView[] = []
  const expireGroups = new Map<string, { campaign: string; count: number; amountCents: bigint; createdAt: string }>()

  for (const entry of entries) {
    const campaign = entry.campaignName ?? FALLBACK_CAMPAIGN_NAME

    if (entry.type === 'expire') {
      const day = entry.createdAt.slice(0, 10)
      const key = `${campaign}:${day}`
      const amount = BigInt(entry.amountCents)
      const group = expireGroups.get(key)
      if (group) {
        group.count += 1
        group.amountCents += amount
        if (entry.createdAt > group.createdAt) group.createdAt = entry.createdAt
      } else {
        expireGroups.set(key, { campaign, count: 1, amountCents: amount, createdAt: entry.createdAt })
      }
      continue
    }

    rows.push({
      id: entry.id,
      label: describeLabel(entry.type, entry.chargeMethod, campaign),
      amountCents: entry.amountCents,
      createdAt: entry.createdAt,
    })
  }

  for (const group of expireGroups.values()) {
    rows.push({
      id: null,
      label: `Devolução · ${group.campaign}${group.count > 1 ? ` (${group.count} expirados)` : ''}`,
      amountCents: group.amountCents.toString(),
      createdAt: group.createdAt,
    })
  }

  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

function describeLabel(
  type: Exclude<LedgerEntry['type'], 'expire'>,
  chargeMethod: LedgerEntry['chargeMethod'],
  campaign: string,
): string {
  switch (type) {
    case 'fund':
      return chargeMethod === 'boleto' ? 'Aporte via boleto' : 'Aporte via PIX'
    case 'reserve':
      return `Reserva · ${campaign}`
    case 'settle':
      return `Repasse · ${campaign}`
  }
}
