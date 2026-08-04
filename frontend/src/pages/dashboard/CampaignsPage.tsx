import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/PageHeader'
import { CampaignCard } from '../../components/CampaignCard'
import { Button } from '../../components/Button'
import { campaignFixtures } from '../../lib/fixtures'
import styles from './OverviewPage.module.css'

export function CampaignsPage() {
  return (
    <>
      <PageHeader
        title="Campanhas"
        actions={
          <Link to="/dashboard/campanhas/nova">
            <Button variant="primary">+ Nova campanha</Button>
          </Link>
        }
      />
      <main className={styles.main}>
        <div className={styles.container}>
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
            {campaignFixtures.length} campanhas no total
          </div>
          <div className={styles.cardList}>
            {campaignFixtures.map((c) => (
              <CampaignCard key={c.id} campaign={c} footer="created" />
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
