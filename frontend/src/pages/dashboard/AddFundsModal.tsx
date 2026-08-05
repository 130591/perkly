import { useEffect, useState, type FormEvent } from 'react'
import useSWR, { mutate } from 'swr'
import QRCode from 'qrcode'
import { Button } from '../../components/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { createCharge, getChargeStatus } from '../../api/wallet'
import { ApiError } from '../../api/http'
import { formatBRL, formatCountdown, reaisToCents } from '../../lib/format'
import type { Charge } from '../../api/types'
import styles from './AddFundsModal.module.css'

const PRESET_REAIS = [1000, 5000, 10000, 25000]

/** Backend writes this exact literal on confirmation (`ChargeRepository.markPaid`). */
const PAID_STATUS = 'PAID'

export function AddFundsModal({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [charge, setCharge] = useState<Charge | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const cents = amount ? reaisToCents(amount) : 0n
  const canSubmit = cents > 0n && !isSubmitting

  const { data: chargeStatus } = useSWR(
    idempotencyKey ? ['/wallet/charges', idempotencyKey] : null,
    () => getChargeStatus(idempotencyKey!),
    { refreshInterval: (data) => (data?.status === PAID_STATUS ? 0 : 3000) },
  )

  useEffect(() => {
    if (!charge) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [charge])

  useEffect(() => {
    if (!charge?.pixQrCode) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(charge.pixQrCode, { margin: 1, width: 220 }).then((url) => {
      if (!cancelled) setQrDataUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [charge?.pixQrCode])

  useEffect(() => {
    if (chargeStatus?.status === PAID_STATUS) {
      void mutate('/wallet/balance')
      void mutate('/wallet/ledger')
    }
  }, [chargeStatus?.status])

  const remainingSeconds = charge ? Math.max(0, Math.floor((new Date(charge.expiresAt).getTime() - now) / 1000)) : 0
  const isPaid = chargeStatus?.status === PAID_STATUS
  const isExpired = charge !== null && !isPaid && remainingSeconds === 0
  const step = isPaid ? 'success' : charge ? 'charge' : 'form'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setIsSubmitting(true)
    setError(null)
    const key = crypto.randomUUID()
    try {
      const result = await createCharge('pix', cents, key)
      setIdempotencyKey(key)
      setCharge(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível gerar a cobrança.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function onRestart() {
    setCharge(null)
    setIdempotencyKey(null)
    setCopied(false)
  }

  async function onCopy() {
    if (!charge?.pixQrCode) return
    await navigator.clipboard.writeText(charge.pixQrCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const title =
    step === 'success' ? 'Depósito conciliado' : step === 'charge' ? (isExpired ? 'Cobrança expirada' : 'Pague via PIX') : 'Adicionar saldo'

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <button className={styles.close} onClick={onClose} aria-label="Fechar">
            &times;
          </button>
        </div>

        {step === 'form' && (
          <form onSubmit={onSubmit}>
            <label className={styles.label}>Método de aporte</label>
            <div className={styles.methodRow}>
              <div className={styles.methodOption} data-selected="true">
                <span className={styles.methodDot} />
                <span className={styles.methodName}>PIX</span>
                <span className={styles.methodTag}>Selecionado</span>
              </div>
              <div className={styles.methodOption} data-disabled="true">
                <span className={styles.methodName}>Boleto · TED</span>
                <span className={styles.methodTagMuted}>Em breve</span>
              </div>
            </div>

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

            <div className={styles.presetRow}>
              {PRESET_REAIS.map((reais) => (
                <button
                  key={reais}
                  type="button"
                  className={styles.presetChip}
                  data-active={cents === BigInt(reais) * 100n}
                  onClick={() => setAmount(String(reais))}
                >
                  {formatBRL(BigInt(reais) * 100n)}
                </button>
              ))}
            </div>

            <div className={styles.infoBox}>
              <span className={styles.infoDot} />
              <span>
                Geramos uma cobrança PIX única com o valor exato. A confirmação é automática por conciliação — sem
                digitar chave nem casar valores na mão.
              </span>
            </div>

            {error && <div className={styles.error}>{error}</div>}
            <Button variant="accent" fullWidth type="submit" disabled={!canSubmit} style={{ marginTop: 18 }}>
              {isSubmitting ? 'Gerando cobrança…' : 'Gerar cobrança PIX →'}
            </Button>
          </form>
        )}

        {step === 'charge' && charge && (
          <div>
            <div className={styles.chargeHeadRow}>
              <div>
                <div className={styles.chargeLabel}>Valor da cobrança</div>
                <div className={styles.chargeAmount}>{formatBRL(charge.amount)}</div>
              </div>
              <StatusBadge status={isExpired ? 'expired' : 'pending'} label={isExpired ? 'Expirada' : 'Aguardando pagamento'} />
            </div>

            {!isExpired && (
              <>
                {qrDataUrl && (
                  <div className={styles.qrBox}>
                    <img src={qrDataUrl} alt="QR code para pagamento via PIX" className={styles.qrImage} />
                  </div>
                )}

                <label className={styles.labelMuted}>PIX Copia e Cola</label>
                <div className={styles.copyRow}>
                  <input readOnly className={styles.copyInput} value={charge.pixQrCode} />
                  <Button variant="primary" type="button" className={styles.copyButton} onClick={onCopy}>
                    {copied ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>

                <div className={styles.detailsCard} style={{ marginBottom: 16 }}>
                  <div className={styles.detailRow}>
                    <span>Recebedor</span>
                    {/* Perkly's own receiving identity — static, not per-charge data (no API for it yet). */}
                    <span className={styles.detailValueMono}>Perkly Pagamentos Ltda</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span>CNPJ</span>
                    <span className={styles.detailValueMono}>42.510.330/0001-77</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span>ID do depósito</span>
                    <span className={styles.detailValueMono}>{charge.id}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span>Cobrança expira em</span>
                    <span className={styles.detailValueMono}>{formatCountdown(remainingSeconds)}</span>
                  </div>
                </div>

                <div className={styles.plainNote}>
                  <span className={styles.infoDot} />
                  <span>
                    Assim que o banco confirmar, o saldo é creditado automaticamente. Você pode fechar esta janela e
                    conferir o saldo depois.
                  </span>
                </div>
              </>
            )}

            {isExpired && (
              <div className={styles.expiredBox}>
                <div className={styles.note}>Essa cobrança expirou sem pagamento — gere uma nova para tentar de novo.</div>
                <Button variant="primary" fullWidth type="button" onClick={onRestart} style={{ marginTop: 14 }}>
                  Gerar nova cobrança
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 'success' && charge && (
          <div className={styles.successBox}>
            <div className={styles.successIcon}>&#10003;</div>
            <div className={styles.successHeadline}>{formatBRL(charge.amount)} creditados</div>
            <div className={styles.successSubtitle}>Depósito conciliado e disponível no saldo.</div>
            <div className={styles.detailsCard}>
              <div className={styles.detailRow}>
                <span>Valor</span>
                <span className={styles.detailValueMono}>{formatBRL(charge.amount)}</span>
              </div>
              <div className={styles.detailRow}>
                <span>Creditado em</span>
                <span>Saldo disponível</span>
              </div>
              <div className={styles.detailRow}>
                <span>ID do depósito</span>
                <span className={styles.detailValueMono}>{charge.id}</span>
              </div>
              <div className={styles.detailRow}>
                <span>Status</span>
                <StatusBadge status="active" label="Conciliado" variant="inline" />
              </div>
            </div>
            <Button variant="accent" fullWidth onClick={onClose} style={{ marginTop: 18 }}>
              Concluir
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
