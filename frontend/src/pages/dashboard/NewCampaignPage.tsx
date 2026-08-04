import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mutate } from 'swr'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/Button'
import { useAuth } from '../../auth/AuthContext'
import { createCampaign, confirmCampaign } from '../../api/campaign'
import { getBalances } from '../../api/wallet'
import { ApiError } from '../../api/http'
import { formatBRL, reaisToCents } from '../../lib/format'
import type { CampaignInput, Recipient } from '../../api/types'
import styles from './NewCampaignPage.module.css'

const SAMPLE_CSV = `Ana Ribeiro,ana@exemplo.com,50
Bruno Alves,bruno@exemplo.com,50
Carla Souza,carla@exemplo.com,75`

const EXPIRY_OPTIONS = [7, 15, 30, 60]

type ParsedRow = { line: number; name: string; email: string; amountCents: bigint }
type Issue = { line: number; raw: string; reason: string }

function parseCsv(text: string): { rows: ParsedRow[]; issues: Issue[] } {
  const rows: ParsedRow[] = []
  const issues: Issue[] = []

  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((raw, idx) => {
      const line = idx + 1
      const [name, email, valor] = raw.split(',').map((part) => part.trim())
      if (!name || !email || !valor) {
        issues.push({ line, raw, reason: 'colunas faltando' })
        return
      }
      if (!/.+@.+\..+/.test(email)) {
        issues.push({ line, raw, reason: 'e-mail inválido' })
        return
      }
      const amount = Number.parseFloat(valor.replace(',', '.'))
      if (!Number.isFinite(amount) || amount <= 0) {
        issues.push({ line, raw, reason: 'valor inválido' })
        return
      }
      rows.push({ line, name, email, amountCents: reaisToCents(valor) })
    })

  return { rows, issues }
}

export function NewCampaignPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [expiresDays, setExpiresDays] = useState(30)
  const [csvText, setCsvText] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ id: string; confirmed: boolean } | null>(null)

  const { rows, issues } = useMemo(() => parseCsv(csvText), [csvText])
  const rewardsCents = rows.reduce((sum, r) => sum + r.amountCents, 0n)

  const step1Valid = name.trim().length > 0 && message.trim().length > 0
  const step2Valid = rows.length > 0

  function goNext() {
    if (step === 1 && step1Valid) setStep(2)
    else if (step === 2 && step2Valid) setStep(3)
  }

  function goBack() {
    if (step === 2) setStep(1)
    else if (step === 3) setStep(2)
  }

  async function onConfirmSend() {
    setIsSubmitting(true)
    setError(null)
    try {
      const linksExpireAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString()
      const recipients: Recipient[] = rows.map((r) => ({
        name: r.name,
        amountCents: r.amountCents.toString(),
        channel: { type: 'email', address: r.email },
      }))
      const input: CampaignInput = {
        name,
        message,
        transferType: 'pix',
        batches: [{ linksExpireAt, recipients }],
      }
      const created = await createCampaign(input)

      let confirmed = false
      if (user?.role === 'ADMIN') {
        try {
          await confirmCampaign(created.id)
          confirmed = true
          void mutate('/wallet/balance', getBalances())
        } catch (err) {
          setError(err instanceof ApiError ? `Campanha criada, mas a confirmação falhou: ${err.message}` : 'Campanha criada, mas a confirmação falhou.')
        }
      }
      setResult({ id: created.id, confirmed })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a campanha.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (result) {
    return (
      <>
        <PageHeader title="Nova campanha" />
        <main className={styles.main}>
          <div className={styles.narrowContainer}>
            <div className={styles.successCard}>
              <div className={styles.successIcon} />
              <h1>Campanha criada!</h1>
              {result.confirmed ? (
                <p>A campanha foi confirmada e os links de resgate já estão sendo enviados.</p>
              ) : (
                <p>
                  A campanha foi salva como rascunho.{' '}
                  {user?.role === 'ADMIN' ? 'A confirmação falhou — tente novamente pela lista de campanhas.' : 'Peça a um admin da conta para confirmar o envio.'}
                </p>
              )}
              <Button variant="accent" fullWidth onClick={() => navigate(`/dashboard/campanhas/${result.id}`)} style={{ marginTop: 16 }}>
                Ver campanha
              </Button>
            </div>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Nova campanha" />
      <main className={styles.main}>
        <div className={styles.narrowContainer}>
          <div className={styles.steps}>
            {(['Detalhes', 'Destinatários', 'Revisão'] as const).map((label, idx) => (
              <div key={label} className={styles.stepItem}>
                <div className={styles.stepCircle} data-active={step === idx + 1} data-done={step > idx + 1}>
                  {idx + 1}
                </div>
                <span>{label}</span>
                {idx < 2 && <div className={styles.stepLine} />}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className={styles.card}>
              <label className={styles.label}>Nome da campanha</label>
              <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 18 }} />

              <label className={styles.label}>Mensagem ao destinatário</label>
              <textarea className={styles.textarea} value={message} onChange={(e) => setMessage(e.target.value)} />
              <div className={styles.hint}>Aparece no e-mail e na página de resgate.</div>

              <label className={styles.label} style={{ marginTop: 18 }}>
                Expiração dos links
              </label>
              <select className={styles.input} value={expiresDays} onChange={(e) => setExpiresDays(Number(e.target.value))}>
                {EXPIRY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} dias
                  </option>
                ))}
              </select>
            </div>
          )}

          {step === 2 && (
            <div className={styles.card}>
              <div className={styles.rowBetween}>
                <label className={styles.label}>Destinatários (nome, e-mail, valor — um por linha)</label>
                <button className={styles.sampleLink} onClick={() => setCsvText(SAMPLE_CSV)} type="button">
                  Usar lista de exemplo
                </button>
              </div>
              <textarea
                className={styles.csvTextarea}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                spellCheck={false}
                placeholder={'Ana Ribeiro,ana@exemplo.com,50\nBruno Alves,bruno@exemplo.com,50'}
              />
              <div className={styles.countsGrid}>
                <div className={styles.countCard} data-tone="ok">
                  <div className={styles.countValue}>{rows.length}</div>
                  <div>destinatários válidos</div>
                </div>
                <div className={styles.countCard} data-tone="warn">
                  <div className={styles.countValue}>{issues.length}</div>
                  <div>linhas com problema</div>
                </div>
              </div>
              {issues.length > 0 && (
                <div className={styles.issueList}>
                  {issues.map((it) => (
                    <div key={it.line} className={styles.issueRow}>
                      <span className={styles.mono}>#{it.line}</span>
                      <span className={styles.issueRaw}>{it.raw}</span>
                      <span className={styles.issueReason}>{it.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.totalsBlock}>
                <div className={styles.rowBetween}>
                  <span>Recompensas</span>
                  <span className={styles.mono}>{formatBRL(rewardsCents)}</span>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className={styles.card}>
              <div className={styles.reviewLabel}>Revisão final</div>
              <div className={styles.reviewRow}>
                <span>Campanha</span>
                <span style={{ fontWeight: 600 }}>{name}</span>
              </div>
              <div className={styles.reviewRow}>
                <span>Destinatários</span>
                <span className={styles.mono}>{rows.length}</span>
              </div>
              <div className={styles.reviewRow}>
                <span>Expira em</span>
                <span style={{ fontWeight: 600 }}>{expiresDays} dias</span>
              </div>
              <div className={styles.divider} />
              <div className={styles.reviewRow} style={{ fontWeight: 600, fontSize: 14 }}>
                <span>Total a reservar</span>
                <span className={styles.mono}>{formatBRL(rewardsCents)}</span>
              </div>
              {user?.role !== 'ADMIN' && (
                <div className={styles.infoNote}>Você não é admin: a campanha será salva como rascunho até um admin confirmar.</div>
              )}
              {error && <div className={styles.errorNote}>{error}</div>}
            </div>
          )}

          <div className={styles.footerRow}>
            <div>{step > 1 && <Button variant="outline" onClick={goBack}>← Voltar</Button>}</div>
            <div>
              {step < 3 && (
                <Button variant="primary" onClick={goNext} disabled={step === 1 ? !step1Valid : !step2Valid}>
                  Continuar →
                </Button>
              )}
              {step === 3 && (
                <Button variant="accent" onClick={onConfirmSend} disabled={isSubmitting}>
                  {isSubmitting ? 'Enviando…' : 'Confirmar e enviar →'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
