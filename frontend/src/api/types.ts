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
