/**
 * Canal de contato de um destinatário sem conta Perkly (recipient de payout,
 * convite, etc). Vivia em `campaign/domain/batch.ts` até `notification`
 * aparecer como terceiro consumidor (depois de `campaign` e `claim`) — nesse
 * ponto `campaign` deixou de ser "dono" do conceito, só tinha sido quem
 * precisou primeiro. RFC 0006, Camada 1.
 */
export type Channel =
  | { type: 'email'; address: string }
  | { type: 'phone'; number: string }
