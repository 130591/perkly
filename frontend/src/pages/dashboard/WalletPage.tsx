import { useState } from 'react'
import useSWR from 'swr'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/Button'
import { AddFundsModal } from './AddFundsModal'
import { getBalances } from '../../api/wallet'
import { ledgerFixtures } from '../../lib/fixtures'
import { formatBRL } from '../../lib/format'
import styles from './WalletPage.module.css'

export function WalletPage() {
  const { data } = useSWR('/wallet/balance', getBalances)
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <PageHeader title="Financeiro" actions={<Button onClick={() => setModalOpen(true)}>+ Adicionar saldo</Button>} />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Disponível</div>
              <div className={styles.summaryValue}>{data ? formatBRL(data.available) : '—'}</div>
              <div className={styles.summaryHint}>Pronto para novas campanhas</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Reservado em campanhas</div>
              <div className={styles.summaryValue} style={{ color: 'var(--color-text-tertiary)' }}>
                {data ? formatBRL(data.reserved) : '—'}
              </div>
              <div className={styles.summaryHint}>Liberado conforme os links expiram</div>
            </div>
          </div>

          <h2 className={styles.sectionTitle}>Extrato</h2>
          <div className={styles.ledgerCard}>
            {ledgerFixtures.map((entry) => (
              <div key={entry.id} className={styles.ledgerRow}>
                <div className={styles.ledgerLeft}>
                  <span className={styles.dot} data-direction={entry.direction} />
                  <div>
                    <div className={styles.ledgerLabel}>{entry.label}</div>
                    <div className={styles.ledgerSub}>
                      {entry.sub} &middot; {entry.id}
                    </div>
                  </div>
                </div>
                <span className={styles.ledgerAmount} data-direction={entry.direction}>
                  {entry.direction === 'in' ? '+' : '-'}
                  {formatBRL(entry.amountCents)}
                </span>
              </div>
            ))}
          </div>
          <div className={styles.note}>
            Extrato de exemplo — a listagem real chega quando o backend expuser um endpoint de leitura do ledger.
          </div>
        </div>
      </main>
      {modalOpen && <AddFundsModal onClose={() => setModalOpen(false)} />}
    </>
  )
}
