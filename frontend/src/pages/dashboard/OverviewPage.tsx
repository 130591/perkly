import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/PageHeader'
import { CampaignCard } from '../../components/CampaignCard'
import { Button } from '../../components/Button'
import { campaignFixtures } from '../../lib/fixtures'
import { formatBRL } from '../../lib/format'
import styles from './OverviewPage.module.css'

export function OverviewPage() {
  const totalSent = campaignFixtures.reduce((sum, c) => sum + c.sent, 0)
  const totalRedeemed = campaignFixtures.reduce((sum, c) => sum + c.redeemed, 0)
  const redeemedPct = totalSent === 0 ? 0 : Math.round((totalRedeemed / totalSent) * 100)
  const distributedCents = campaignFixtures.reduce((sum, c) => sum + BigInt(c.totalCents), 0n)

  return (
    <>
      <PageHeader
        title="Início"
        actions={
          <Link to="/dashboard/campanhas/nova">
            <Button variant="primary">+ Nova campanha</Button>
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
              </div>
            </div>
            <div className={styles.metricCard} style={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
              <div className={styles.metricLabel}>Distribuído em recompensas</div>
              <div className={styles.distributed}>{formatBRL(distributedCents)}</div>
            </div>
          </div>

          <div className={styles.sectionHeader}>
            <h2>Campanhas ativas</h2>
            <Link to="/dashboard/campanhas" className={styles.seeAll}>
              Ver todas &rarr;
            </Link>
          </div>
          <div className={styles.cardList}>
            {campaignFixtures.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
