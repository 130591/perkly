import styles from './Logo.module.css'

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <div className={styles.logo} data-size={size}>
      <span className={styles.mark} />
      <span className={styles.word}>perkly</span>
    </div>
  )
}
