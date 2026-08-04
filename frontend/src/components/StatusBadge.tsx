import styles from './StatusBadge.module.css'

type Tone = 'success' | 'warning' | 'neutral' | 'muted' | 'danger' | 'dark'

const TONE_LABEL: Record<string, { tone: Tone; label: string }> = {
  pending: { tone: 'warning', label: 'Pendente' },
  claimed: { tone: 'success', label: 'Resgatado' },
  expired: { tone: 'neutral', label: 'Expirado' },
  active: { tone: 'success', label: 'Ativo' },
  ADMIN: { tone: 'dark', label: 'Admin' },
  MEMBER: { tone: 'muted', label: 'Membro' },
}

export function StatusBadge({
  status,
  label,
  dot = true,
  variant = 'pill',
}: {
  status: keyof typeof TONE_LABEL
  label?: string
  dot?: boolean
  variant?: 'pill' | 'inline'
}) {
  const meta = TONE_LABEL[status] ?? { tone: 'neutral' as Tone, label: status }
  return (
    <span className={styles.badge} data-tone={meta.tone} data-variant={variant}>
      {dot && <span className={styles.dot} />}
      {label ?? meta.label}
    </span>
  )
}
