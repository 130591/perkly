import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { getClaim, confirmClaim } from '../../api/claim'
import { ApiError } from '../../api/http'
import { formatBRL, formatDate } from '../../lib/format'
import type { ClaimStatus } from '../../api/types'
import { Button } from '../../components/Button'
import { Logo } from '../../components/Logo'
import styles from './ClaimPage.module.css'

type Phase = 'loading' | 'landing' | 'form' | 'success' | 'already-claimed' | 'expired' | 'not-found'

const PIX_KEY_TYPES = [
  { key: 'cpf', label: 'CPF', placeholder: '000.000.000-00' },
  { key: 'phone', label: 'Telefone', placeholder: '(11) 90000-0000' },
  { key: 'email', label: 'E-mail', placeholder: 'seu@email.com' },
  { key: 'random', label: 'Aleatória', placeholder: 'chave aleatória' },
] as const

function phaseFromStatus(status: ClaimStatus): Phase {
  if (status === 'claimed') return 'already-claimed'
  if (status === 'expired') return 'expired'
  return 'landing'
}

export function ClaimPage() {
  const { claimId = '' } = useParams()
  const [phase, setPhase] = useState<Phase>('loading')
  const [amount, setAmount] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [keyType, setKeyType] = useState<(typeof PIX_KEY_TYPES)[number]['key']>('cpf')
  const [pixKey, setPixKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    getClaim(claimId)
      .then((claim) => {
        if (cancelled) return
        setAmount(claim.amount)
        setExpiresAt(claim.expiresAt)
        setPhase(phaseFromStatus(claim.status))
      })
      .catch(() => {
        if (!cancelled) setPhase('not-found')
      })
    return () => {
      cancelled = true
    }
  }, [claimId])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!pixKey.trim()) return
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await confirmClaim(claimId, pixKey.trim())
      setAmount(result.amount)
      setPhase(result.status === 'claimed' ? 'success' : phaseFromStatus(result.status))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível confirmar sua chave PIX.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {phase === 'loading' && <div className={styles.centerNote}>Carregando…</div>}

        {phase === 'not-found' && (
          <div className={styles.centered}>
            <div className={styles.iconNeutral} />
            <h1>Link não encontrado</h1>
            <p>Este link de resgate não existe ou foi digitado incorretamente.</p>
          </div>
        )}

        {phase === 'expired' && (
          <div className={styles.centered}>
            <div className={styles.iconNeutral} />
            <h1>Esta recompensa expirou</h1>
            <p>
              O link de resgate venceu{expiresAt ? ` em ${formatDate(expiresAt)}` : ''}. Entre em contato com quem te
              enviou.
            </p>
          </div>
        )}

        {phase === 'already-claimed' && (
          <div className={styles.centered}>
            <div className={styles.iconSuccess}>
              <span className={styles.check} />
            </div>
            <h1>Recompensa já resgatada</h1>
            <p>Este link já foi usado. Cada link funciona uma única vez.</p>
          </div>
        )}

        {phase === 'landing' && (
          <div>
            <div className={styles.logoRow}>
              <Logo size="sm" />
            </div>
            <div className={styles.overline}>Você recebeu</div>
            <div className={styles.amount}>{amount ? formatBRL(amount) : '—'}</div>
            <div className={styles.expiry}>
              <span className={styles.warnDot} />
              Resgate até {expiresAt ? formatDate(expiresAt) : '—'}
            </div>
            <ul className={styles.bullets}>
              <li>Pagamento via PIX &middot; cai na hora</li>
              <li>Link exclusivo e de uso único</li>
              <li>Processado com segurança pela Perkly</li>
            </ul>
            <Button variant="accent" fullWidth onClick={() => setPhase('form')} style={{ height: 54, fontSize: 16 }}>
              Resgatar
            </Button>
            <div className={styles.centerNote} style={{ marginTop: 14 }}>
              Sem cadastro, senha ou aplicativo.
            </div>
          </div>
        )}

        {phase === 'form' && (
          <form onSubmit={onSubmit}>
            <h1 className={styles.formTitle}>Para onde enviamos seu PIX?</h1>
            <p className={styles.formSubtitle}>Informe sua chave PIX. O dinheiro cai na sua conta na hora.</p>
            <div className={styles.keyTypeGrid}>
              {PIX_KEY_TYPES.map((t) => (
                <button
                  type="button"
                  key={t.key}
                  className={styles.keyTypeButton}
                  data-active={keyType === t.key}
                  onClick={() => setKeyType(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <input
              className={styles.keyInput}
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder={PIX_KEY_TYPES.find((t) => t.key === keyType)?.placeholder}
            />
            {error && <div className={styles.error}>{error}</div>}
            <Button variant="accent" fullWidth type="submit" disabled={!pixKey.trim() || isSubmitting} style={{ marginTop: 20, height: 54, fontSize: 16 }}>
              {isSubmitting ? 'Enviando…' : `Enviar ${amount ? formatBRL(amount) : ''}`}
            </Button>
          </form>
        )}

        {phase === 'success' && (
          <div className={styles.centered}>
            <div className={styles.iconSuccess}>
              <span className={styles.check} />
            </div>
            <h1>{amount ? formatBRL(amount) : ''} enviados!</h1>
            <p>O pagamento foi confirmado e enviado via PIX para a chave informada.</p>
          </div>
        )}
      </div>
    </div>
  )
}
