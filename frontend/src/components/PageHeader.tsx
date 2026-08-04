import type { ReactNode } from 'react'
import useSWR from 'swr'
import { getBalances } from '../api/wallet'
import { formatBRL } from '../lib/format'
import styles from './PageHeader.module.css'

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  const { data } = useSWR('/wallet/balance', getBalances)

  return (
    <header className={styles.header}>
      <span className={styles.title}>{title}</span>
      <div className={styles.actions}>
        <div className={styles.balanceChip}>
          <span className={styles.dot} />
          <span className={styles.balanceLabel}>Saldo</span>
          <span className={styles.balanceValue}>{data ? formatBRL(data.available) : '—'}</span>
        </div>
        {actions}
      </div>
    </header>
  )
}
