import { Link, Navigate, useParams } from 'react-router-dom'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { campaignFixtures } from '../../lib/fixtures'
import { formatBRL, formatDate } from '../../lib/format'
import styles from './CampaignDetailPage.module.css'

export function CampaignDetailPage() {
  const { campaignId } = useParams()
  const campaign = campaignFixtures.find((c) => c.id === campaignId)

  if (!campaign) return <Navigate to="/dashboard/campanhas" replace />

  const total = campaign.sent || 1
  const rateLabel = `${Math.round((campaign.redeemed / total) * 100)}%`

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
                <StatusBadge status={campaign.status === 'active' ? 'active' : 'expired'} label={campaign.status === 'active' ? 'Ativa' : 'Concluída'} />
              </div>
              <div className={styles.meta}>
                Criada em {formatDate(campaign.createdAt)} &middot; expira em {formatDate(campaign.expiresAt)}
              </div>
            </div>
          </div>

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
              <span>Total reservado</span>
              <span className={styles.mono}>{formatBRL(campaign.totalCents)}</span>
            </div>
            <div className={styles.summaryRow} style={{ fontWeight: 400, fontSize: 12.5 }}>
              <span style={{ color: 'var(--color-text-tertiary)' }}>Taxa de resgate</span>
              <span className={styles.mono}>{rateLabel}</span>
            </div>
          </div>

          <div className={styles.note}>
            Este é um recorte de exemplo — a listagem detalhada de destinatários chega quando o backend expuser um
            endpoint de leitura para campanhas.
          </div>
        </div>
      </main>
    </>
  )
}
