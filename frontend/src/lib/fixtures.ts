/**
 * Local placeholder data for screens the backend doesn't expose a read
 * endpoint for yet — there's no `GET /campaign`, `GET /campaign/:id`, wallet
 * ledger listing, or team-member listing (only `POST` create/confirm/invite
 * exist today). Swap this module out once those endpoints land; nothing
 * outside this file should know the data is fake.
 */

export type CampaignSummary = {
  id: string
  name: string
  status: 'active' | 'completed'
  createdAt: string
  expiresAt: string
  totalCents: string
  sent: number
  redeemed: number
  pending: number
  expired: number
}

export const campaignFixtures: CampaignSummary[] = [
  {
    id: 'demo-1',
    name: 'Pesquisa de satisfação Q3',
    status: 'active',
    createdAt: '2026-07-02T00:00:00Z',
    expiresAt: '2026-08-01T00:00:00Z',
    totalCents: '450000',
    sent: 90,
    redeemed: 61,
    pending: 22,
    expired: 7,
  },
  {
    id: 'demo-2',
    name: 'Indicação de novos parceiros',
    status: 'active',
    createdAt: '2026-06-18T00:00:00Z',
    expiresAt: '2026-07-18T00:00:00Z',
    totalCents: '180000',
    sent: 36,
    redeemed: 30,
    pending: 4,
    expired: 2,
  },
]

export type LedgerEntry = {
  id: string
  label: string
  sub: string
  amountCents: string
  direction: 'in' | 'out'
}

export const ledgerFixtures: LedgerEntry[] = [
  { id: 'txn_c81a', label: 'Aporte via PIX', sub: 'Confirmado', amountCents: '500000', direction: 'in' },
  { id: 'txn_88fe', label: 'Campanha · Pesquisa de satisfação Q3', sub: 'Reserva', amountCents: '450000', direction: 'out' },
  { id: 'txn_11bd', label: 'Campanha · Indicação de novos parceiros', sub: 'Reserva', amountCents: '180000', direction: 'out' },
]

export type TeamMember = {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'MEMBER'
  status: 'active' | 'pending'
}

export const teamFixtures: TeamMember[] = [
  { id: 'u1', name: 'Ana Ribeiro', email: 'ana@empresa.com.br', role: 'ADMIN', status: 'active' },
  { id: 'u2', name: 'Bruno Alves', email: 'bruno@empresa.com.br', role: 'MEMBER', status: 'active' },
]
