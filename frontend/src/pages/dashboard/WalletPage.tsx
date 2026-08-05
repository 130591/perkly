import { useState } from 'react'
import { Link } from 'react-router-dom'
import useSWR from 'swr'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { AddFundsModal } from './AddFundsModal'
import { getBalances, getLedger } from '../../api/wallet'
import { composeLedgerView } from '../../lib/ledger'
import { formatBRL, formatDateTime } from '../../lib/format'
import styles from './WalletPage.module.css'

export function WalletPage() {
  const { data } = useSWR('/wallet/balance', getBalances)
  const { data: ledger } = useSWR('/wallet/ledger', getLedger)
  const ledgerRows = ledger ? composeLedgerView(ledger) : undefined
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <PageHeader
        title="Financeiro"
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
          <div className={styles.subtitleRow}>
            <div className={styles.subtitle}>Saldo pré-pago &middot; aporte via PIX e use em campanhas de recompensa.</div>
            <Button variant="primary" size="compact" onClick={() => setModalOpen(true)}>
              + Adicionar saldo
            </Button>
          </div>

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

          <div className={styles.reconciledBanner}>
            <span className={styles.reconciledIcon}>&#10003;</span>
            <span className={styles.reconciledLabel}>Saldo conciliado</span>
            <span className={styles.reconciledDetail}>
              verificado agora &middot; todos os depósitos processados &middot; saldo total{' '}
              <span className={styles.reconciledTotal}>{data ? formatBRL(data.total) : '—'}</span>
            </span>
          </div>

          <h2 className={styles.sectionTitle}>Extrato</h2>
          <div className={styles.ledgerCard}>
            {ledgerRows?.length === 0 && <div className={styles.note}>Nenhuma movimentação ainda.</div>}
            {ledgerRows?.map((entry) => {
              const isOut = entry.amountCents.startsWith('-')
              const direction = isOut ? 'out' : 'in'
              return (
                <div key={entry.id ?? `${entry.label}:${entry.createdAt}`} className={styles.ledgerRow}>
                  <div className={styles.ledgerLeft}>
                    <span className={styles.dot} data-direction={direction} />
                    <div>
                      <div className={styles.ledgerLabel}>{entry.label}</div>
                      <div className={styles.ledgerSub}>
                        {formatDateTime(entry.createdAt)}
                        {entry.id && <> &middot; {entry.id}</>}
                      </div>
                    </div>
                  </div>
                  <div className={styles.ledgerRight}>
                    <StatusBadge status="active" label="Processado" />
                    <span className={styles.ledgerAmount} data-direction={direction}>
                      {isOut ? '−' : '+'}
                      {formatBRL(isOut ? entry.amountCents.slice(1) : entry.amountCents)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>
      {modalOpen && <AddFundsModal onClose={() => setModalOpen(false)} />}
    </>
  )
}
