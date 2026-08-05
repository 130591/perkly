import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import useSWR from 'swr'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { Button } from '../../components/Button'
import { getCampaign, listRecipients } from '../../api/campaign'
import { ApiError } from '../../api/http'
import { useToast } from '../../components/Toast'
import { formatBRL, formatDate, formatDateTime } from '../../lib/format'
import type { CampaignRecipient, PayoutStatus } from '../../api/types'
import styles from './CampaignDetailPage.module.css'

const PAGE_SIZE = 8

const STATUS_META: Record<PayoutStatus, { status: 'claimed' | 'pending' | 'expired'; label: string }> = {
  paid: { status: 'claimed', label: 'Resgatado' },
  pending: { status: 'pending', label: 'Pendente' },
  processing: { status: 'pending', label: 'Pendente' },
  expired: { status: 'expired', label: 'Expirado' },
  failed: { status: 'expired', label: 'Falhou' },
}

function channelLabel(channel: CampaignRecipient['channel']): string {
  return channel.type === 'email' ? channel.address : channel.number
}

export function CampaignDetailPage() {
  const { campaignId } = useParams()
  const { showToast } = useToast()
  const [page, setPage] = useState(1)

  const { data: campaign, error } = useSWR(
    campaignId ? `/campaign/${campaignId}` : null,
    () => getCampaign(campaignId!),
  )
  const { data: recipients } = useSWR(
    campaignId ? `/campaign/${campaignId}/recipients?page=${page}` : null,
    () => listRecipients(campaignId!, page, PAGE_SIZE),
  )

  if (error instanceof ApiError && error.status === 404) {
    return <Navigate to="/dashboard/campanhas" replace />
  }
  if (!campaign) return null

  const total = campaign.sent || 1
  const redeemedPct = Math.round((campaign.redeemed / total) * 100)
  const pendingPct = (campaign.pending / total) * 100
  const expiredPct = (campaign.expired / total) * 100

  async function onExport() {
    // Client-side only — no export endpoint exists; pulls every page up front.
    const all: CampaignRecipient[] = []
    let p = 1
    while (true) {
      const res = await listRecipients(campaignId!, p, 200)
      all.push(...res.items)
      if (all.length >= res.total) break
      p += 1
    }
    const header = 'Nome,Contato,Valor,Status,Pago em\n'
    const rows = all
      .map((r) =>
        [r.name, channelLabel(r.channel), formatBRL(r.amountCents), STATUS_META[r.status].label, r.paidAt ? formatDateTime(r.paidAt) : ''].join(','),
      )
      .join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${campaign!.name}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function onStubAction(kind: 'Reenviar' | 'Cancelar', recipient: CampaignRecipient) {
    showToast(`${kind === 'Reenviar' ? 'Reenviado' : 'Cancelado'} (simulado): ${recipient.name}`)
  }

  const totalPages = recipients ? Math.max(1, Math.ceil(recipients.total / PAGE_SIZE)) : 1

  return (
    <>
      <PageHeader title={campaign.name} />
      <main className={styles.main}>
        <div className={styles.container}>
          <Link to="/dashboard/campanhas" className={styles.back}>
            &larr; Campanhas
          </Link>

          <div className={styles.headRow}>
            <div>
              <div className={styles.titleRow}>
                <h1>{campaign.name}</h1>
                <StatusBadge
                  status={campaign.status === 'active' ? 'active' : 'expired'}
                  label={campaign.status === 'active' ? 'Ativa' : campaign.status === 'draft' ? 'Rascunho' : 'Concluída'}
                />
              </div>
              <div className={styles.meta}>
                Criada em {formatDate(campaign.createdAt)}
                {campaign.expiresAt && <> &middot; expira em {formatDate(campaign.expiresAt)}</>}
              </div>
            </div>
            <Button variant="outline" size="compact" onClick={onExport}>
              Exportar relatório
            </Button>
          </div>

          <div className={styles.detailGrid}>
            <div className={styles.donutCard}>
              <div
                className={styles.donut}
                style={{
                  background: `conic-gradient(var(--color-accent) 0 ${redeemedPct}%, var(--color-warning-dot) ${redeemedPct}% ${redeemedPct + pendingPct}%, #cdced3 ${redeemedPct + pendingPct}% ${redeemedPct + pendingPct + expiredPct}%, var(--color-bg-subtle) 0)`,
                }}
              >
                <div className={styles.donutInner}>
                  <span className={styles.donutValue}>{redeemedPct}%</span>
                  <span className={styles.donutLabel}>resgatado</span>
                </div>
              </div>
              <div className={styles.legend}>
                <div className={styles.legendRow}>
                  <span className={styles.legendDot} style={{ background: 'var(--color-accent)' }} />
                  <span className={styles.legendLabel}>Pago</span>
                  <span className={styles.legendValue}>{campaign.redeemed}</span>
                </div>
                <div className={styles.legendRow}>
                  <span className={styles.legendDot} style={{ background: 'var(--color-warning-dot)' }} />
                  <span className={styles.legendLabel}>Pendente</span>
                  <span className={styles.legendValue}>{campaign.pending}</span>
                </div>
                <div className={styles.legendRow}>
                  <span className={styles.legendDot} style={{ background: '#cdced3' }} />
                  <span className={styles.legendLabel}>Expirado</span>
                  <span className={styles.legendValue}>{campaign.expired}</span>
                </div>
              </div>
            </div>

            <div className={styles.detailRight}>
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Enviados</div>
                  <div className={styles.statValue}>{campaign.sent}</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Pagos</div>
                  <div className={styles.statValue} style={{ color: 'var(--color-accent)' }}>
                    {campaign.redeemed}
                  </div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Pendentes</div>
                  <div className={styles.statValue} style={{ color: 'var(--color-warning)' }}>
                    {campaign.pending}
                  </div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Expirados</div>
                  <div className={styles.statValue} style={{ color: 'var(--color-text-tertiary)' }}>
                    {campaign.expired}
                  </div>
                </div>
              </div>

              <div className={styles.summaryCard}>
                <div className={styles.summaryRow}>
                  <span>Recompensas</span>
                  <span className={styles.mono}>{formatBRL(campaign.totalCents)}</span>
                </div>
                <div className={styles.summaryRow} style={{ fontWeight: 400 }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>Taxa Perkly</span>
                  {/* Fee is hardcoded to 0 in the backend (payout/service.ts confirmPayment) — no fee feature exists yet. */}
                  <span className={styles.mono}>{formatBRL(0n)}</span>
                </div>
                <div className={styles.summaryDivider} />
                <div className={styles.summaryRow}>
                  <span>Total reservado</span>
                  <span className={styles.mono}>{formatBRL(campaign.totalCents)}</span>
                </div>
                <div className={styles.summaryRow} style={{ fontWeight: 400 }}>
                  <span style={{ color: 'var(--color-accent)' }}>Resgatado até agora</span>
                  <span className={styles.mono} style={{ color: 'var(--color-accent)' }}>
                    {formatBRL(campaign.paidCents)}
                  </span>
                </div>
                <div className={styles.summaryRow} style={{ fontWeight: 400 }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>Pendente de resgate</span>
                  <span className={styles.mono}>{formatBRL(campaign.pendingCents)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.recipientsCard}>
            <div className={styles.recipientsHead}>
              <h2>Destinatários</h2>
              {recipients && (
                <span className={styles.recipientsCount}>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, recipients.total)} de {recipients.total}
                </span>
              )}
            </div>

            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Contato</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Resgate</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {recipients?.items.map((r) => {
                  const meta = STATUS_META[r.status]
                  return (
                    <tr key={r.id}>
                      <td className={styles.nameCell}>{r.name}</td>
                      <td className={styles.mutedCell}>{channelLabel(r.channel)}</td>
                      <td className={styles.mono}>{formatBRL(r.amountCents)}</td>
                      <td>
                        <StatusBadge status={meta.status} label={meta.label} variant="inline" />
                      </td>
                      <td className={styles.mutedCell}>{r.paidAt ? formatDate(r.paidAt) : '—'}</td>
                      <td>
                        {(r.status === 'pending' || r.status === 'processing') && (
                          <span className={styles.actions}>
                            <button type="button" className={styles.actionLink} onClick={() => onStubAction('Reenviar', r)}>
                              Reenviar
                            </button>
                            <button type="button" className={styles.actionLinkDanger} onClick={() => onStubAction('Cancelar', r)}>
                              Cancelar
                            </button>
                          </span>
                        )}
                        {r.status !== 'pending' && r.status !== 'processing' && <span className={styles.mutedCell}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className={styles.pagination}>
                <Button variant="outline" size="compact" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  &larr; Anterior
                </Button>
                <span className={styles.pageIndicator}>
                  Página {page} de {totalPages}
                </span>
                <Button variant="outline" size="compact" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Próxima &rarr;
                </Button>
              </div>
            )}

          </div>

          {campaign.expiresAt && (
            <div className={styles.note}>
              <span className={styles.noteDot} />
              Links expiram em {formatDate(campaign.expiresAt)}. Valores não resgatados retornam automaticamente ao
              saldo disponível.
            </div>
          )}
        </div>
      </main>
    </>
  )
}
