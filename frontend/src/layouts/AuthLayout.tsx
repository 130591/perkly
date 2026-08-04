import type { ReactNode } from 'react'
import { Logo } from '../components/Logo'
import styles from './AuthLayout.module.css'

export function AuthLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.column}>
        <div className={styles.logoRow}>
          <Logo />
        </div>
        <div className={styles.card}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  )
}
