import { useState, type FormEvent } from 'react'
import { mutate } from 'swr'
import { Button } from '../../components/Button'
import { createCharge } from '../../api/wallet'
import { ApiError } from '../../api/http'
import { formatBRL, reaisToCents } from '../../lib/format'
import type { Charge } from '../../api/types'
import styles from './AddFundsModal.module.css'

export function AddFundsModal({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [charge, setCharge] = useState<Charge | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const cents = amount ? reaisToCents(amount) : 0n
  const canSubmit = cents > 0n && !isSubmitting

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await createCharge('pix', cents)
      setCharge(result)
      void mutate('/wallet/balance')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível gerar a cobrança.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Adicionar saldo</span>
          <button className={styles.close} onClick={onClose} aria-label="Fechar">
            &times;
          </button>
        </div>

        {charge ? (
          <div>
            <p className={styles.subtitle}>
              Escaneie o QR code para pagar <strong>{formatBRL(charge.amount)}</strong> via PIX.
            </p>
            <div className={styles.qrBox}>{charge.pixQrCode ?? 'QR code indisponível'}</div>
            <div className={styles.note}>O saldo é liberado assim que o pagamento for confirmado.</div>
            <Button variant="primary" fullWidth onClick={onClose} style={{ marginTop: 16 }}>
              Fechar
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <label className={styles.label} htmlFor="amount">
              Valor do aporte
            </label>
            <div className={styles.amountField}>
              <span className={styles.amountPrefix}>R$</span>
              <input
                id="amount"
                className={styles.input}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                autoFocus
              />
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <Button variant="accent" fullWidth type="submit" disabled={!canSubmit} style={{ marginTop: 18 }}>
              {isSubmitting ? 'Gerando cobrança…' : 'Gerar cobrança PIX →'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
