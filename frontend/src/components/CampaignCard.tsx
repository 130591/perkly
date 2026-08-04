import { Link } from 'react-router-dom'
import type { CampaignSummary } from '../lib/fixtures'
import { formatBRL, formatDate } from '../lib/format'
import styles from './CampaignCard.module.css'

export function CampaignCard({
  campaign,
  footer = 'activity',
}: {
  campaign: CampaignSummary
  footer?: 'activity' | 'created'
}) {
  const total = campaign.sent || 1
  const redeemedPct = (campaign.redeemed / total) * 100
  const pendingPct = (campaign.pending / total) * 100
  const expiredPct = (campaign.expired / total) * 100
  const rateLabel = `${Math.round((campaign.redeemed / total) * 100)}%`

  return (
    <Link to={`/dashboard/campanhas/${campaign.id}`} className={styles.card}>
      <div className={styles.top}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{campaign.name}</span>
          <span className={styles.badge} data-tone={campaign.status === 'active' ? 'success' : 'neutral'}>
            <span className={styles.badgeDot} />
            {campaign.status === 'active' ? 'Ativa' : 'Concluída'}
          </span>
        </div>
        <span className={styles.total}>{formatBRL(campaign.totalCents)}</span>
      </div>
      <div className={styles.bar}>
        <div style={{ width: `${redeemedPct}%`, background: 'var(--color-accent)' }} />
        <div style={{ width: `${pendingPct}%`, background: 'var(--color-warning-dot)' }} />
        <div style={{ width: `${expiredPct}%`, background: '#cdced3' }} />
      </div>
      <div className={styles.footer}>
        <span>
          {footer === 'created' ? (
            <>Criada em {formatDate(campaign.createdAt)} &middot; {campaign.sent} enviados</>
          ) : (
            <>{campaign.sent} enviados &middot; {campaign.redeemed} resgatados</>
          )}
        </span>
        <span className={styles.rate}>{rateLabel} resgatado</span>
      </div>
    </Link>
  )
}
