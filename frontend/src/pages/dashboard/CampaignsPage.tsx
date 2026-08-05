import { Link } from 'react-router-dom'
import useSWR from 'swr'
import { PageHeader } from '../../components/PageHeader'
import { CampaignCard } from '../../components/CampaignCard'
import { Button } from '../../components/Button'
import { listCampaigns } from '../../api/campaign'
import styles from './OverviewPage.module.css'

export function CampaignsPage() {
  const { data: campaigns } = useSWR('/campaign', listCampaigns)

  return (
    <>
      <PageHeader
        title="Campanhas"
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
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
            {campaigns?.length ?? 0} campanhas no total
          </div>
          <div className={styles.cardList}>
            {campaigns?.map((c) => (
              <CampaignCard key={c.id} campaign={c} footer="created" />
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
