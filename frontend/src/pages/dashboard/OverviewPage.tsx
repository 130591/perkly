import { Link } from 'react-router-dom'
import useSWR from 'swr'
import { PageHeader } from '../../components/PageHeader'
import { CampaignCard } from '../../components/CampaignCard'
import { Button } from '../../components/Button'
import { listCampaigns } from '../../api/campaign'
import { formatBRL, formatDate } from '../../lib/format'
import styles from './OverviewPage.module.css'

/** Product-level north-star target, not per-tenant configurable (no goal-setting feature exists). */
const TARGET_REDEMPTION_PCT = 85

export function OverviewPage() {
  const { data: campaigns } = useSWR('/campaign', listCampaigns)
  const activeCampaigns = campaigns?.filter((c) => c.status === 'active') ?? []

  const totalSent = campaigns?.reduce((sum, c) => sum + c.sent, 0) ?? 0
  const totalRedeemed = campaigns?.reduce((sum, c) => sum + c.redeemed, 0) ?? 0
  const redeemedPct = totalSent === 0 ? 0 : Math.round((totalRedeemed / totalSent) * 100)
  const targetGapPts = redeemedPct - TARGET_REDEMPTION_PCT

  const distributedCents = campaigns?.reduce((sum, c) => sum + BigInt(c.totalCents), 0n) ?? 0n
  const awaitingCents = campaigns?.reduce((sum, c) => sum + BigInt(c.pendingCents), 0n) ?? 0n

  // Only the single active campaign with pending redemptions closest to expiring.
  const attentionCampaigns = activeCampaigns
    .filter((c) => c.pending > 0 && c.expiresAt)
    .sort((a, b) => new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime())
    .slice(0, 1)

  return (
    <>
      <PageHeader
        title="Início"
        actions={
          <Link to="/dashboard/campanhas/nova">
            <Button variant="primary" size="compact">
              + Nova campanha
            </Button>
          </Link>
        }
      />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.ring} style={{ background: `conic-gradient(var(--color-accent) ${redeemedPct}%, var(--color-bg-subtle) 0)` }}>
                <div className={styles.ringInner}>
                  <span className={styles.ringValue}>{redeemedPct}%</span>
                  <span className={styles.ringLabel}>resgatado</span>
                </div>
              </div>
              <div>
                <div className={styles.metricLabel}>Taxa de resgate &middot; métrica norte</div>
                <div className={styles.metricHeadline}>
                  {totalRedeemed} de {totalSent} pessoas resgataram
                </div>
                {totalSent > 0 && (
                  <div className={styles.metricSub}>
                    <span className={styles.metricDot} data-tone={targetGapPts >= 0 ? 'success' : 'warning'} />
                    {targetGapPts >= 0 ? `${targetGapPts}pts acima da meta` : `${Math.abs(targetGapPts)}pts abaixo da meta`}
                    <span className={styles.metricSubMuted}> &middot; meta {TARGET_REDEMPTION_PCT}%</span>
                  </div>
                )}
              </div>
            </div>
            <div className={styles.distributedCard}>
              <div className={styles.metricLabel}>Distribuído em recompensas</div>
              <div className={styles.distributed}>{formatBRL(distributedCents)}</div>
              {awaitingCents > 0n && (
                <div className={styles.metricSub}>
                  <span className={styles.metricDot} data-tone="warning" />
                  <span className={styles.metricSubMuted}>{formatBRL(awaitingCents)} aguardando resgate</span>
                </div>
              )}
            </div>
          </div>

          {attentionCampaigns.length > 0 && (
            <div className={styles.attentionCard}>
              <div className={styles.attentionHead}>
                <span className={styles.attentionDot} />
                <span>Precisa de atenção</span>
              </div>
              {attentionCampaigns.map((c) => (
                <Link key={c.id} to={`/dashboard/campanhas/${c.id}`} className={styles.attentionItem}>
                  <span>
                    <strong>{c.name}</strong> &middot; {c.pending} resgates pendentes &middot; links expiram em{' '}
                    {formatDate(c.expiresAt!)}
                  </span>
                  <span className={styles.attentionLink}>Acompanhar &rarr;</span>
                </Link>
              ))}
            </div>
          )}

          <div className={styles.sectionHeader}>
            <h2>Campanhas ativas</h2>
            <Link to="/dashboard/campanhas" className={styles.seeAll}>
              Ver todas &rarr;
            </Link>
          </div>
          <div className={styles.cardList}>
            {activeCampaigns.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
