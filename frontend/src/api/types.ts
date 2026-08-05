/** Amounts cross the API as decimal-cents strings (bigint on the backend). */
export type CentsString = string

export type UserRole = 'ADMIN' | 'MEMBER'

export type LoginResponse = {
  accessToken: string
}

export type WalletBalances = {
  available: CentsString
  reserved: CentsString
  total: CentsString
}

export type ChargeMethod = 'pix' | 'boleto'

export type Charge = {
  id: string
  status: string
  amount: CentsString
  pixQrCode?: string
  boletoLine?: string
  expiresAt: string
}

/** Backend writes `'PAID'` on confirmation (see `ChargeRepository.markPaid`); anything else is still open. */
export type ChargeStatusView = {
  status: string
  expiresAt: string
}

export type ClaimStatus = 'pending' | 'claimed' | 'expired'

export type ClaimView = {
  status: ClaimStatus
  amount: CentsString
  expiresAt: string
}

export type Recipient = {
  name: string
  amountCents: CentsString
  channel: { type: 'email'; address: string } | { type: 'phone'; number: string }
}

export type CampaignInput = {
  name: string
  message: string
  transferType?: 'pix'
  batches: Array<{
    linksExpireAt: string
    recipients: Recipient[]
  }>
}

export type CampaignStatus = 'draft' | 'active' | 'closed' | 'canceled'

export type CampaignSummary = {
  id: string
  name: string
  status: CampaignStatus
  createdAt: string
  expiresAt: string | null
  totalCents: CentsString
  sent: number
  redeemed: number
  pending: number
  expired: number
  /** Sum of payout amounts still pending/processing/failed for this campaign. */
  pendingCents: CentsString
  /** Sum of payout amounts actually paid out for this campaign. */
  paidCents: CentsString
}

export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'expired'

export type CampaignRecipient = {
  id: string
  name: string
  channel: { type: 'email'; address: string } | { type: 'phone'; number: string }
  amountCents: CentsString
  status: PayoutStatus
  /** Only set once the payout is actually paid — real send time, not a claim/redemption timestamp. */
  paidAt: string | null
  createdAt: string
}

export type CampaignRecipientsPage = {
  items: CampaignRecipient[]
  total: number
  page: number
  pageSize: number
}

export type LedgerTransactionType = 'fund' | 'reserve' | 'settle' | 'expire'

/**
 * One real ledger transaction — facts only, no display copy. `amountCents`
 * is signed (negative = reduced what's spendable right now); labels,
 * wording, and any rollup of same-day entries are a presentation concern,
 * composed in `lib/ledger.ts`, not part of the API contract.
 */
export type LedgerEntry = {
  id: string
  type: LedgerTransactionType
  chargeMethod: ChargeMethod | null
  campaignName: string | null
  amountCents: CentsString
  createdAt: string
}

export type TeamMemberStatus = 'active' | 'pending'

export type TeamMember = {
  id: string
  name: string
  email: string
  role: UserRole
  status: TeamMemberStatus
}
