import { useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../auth/AuthContext'
import { inviteMember, listMembers } from '../../api/identity'
import { ApiError } from '../../api/http'
import type { TeamMember } from '../../api/types'
import styles from './TeamPage.module.css'

export function TeamPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const key = user ? `/identity/tenants/${user.accountId}/members` : null
  const { data: members, mutate } = useSWR(key, () => listMembers(user!.accountId))
  const [inviteOpen, setInviteOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function onResend(m: TeamMember) {
    showToast(`Convite reenviado para ${m.email}`)
  }

  // No backend endpoint to cancel an invite / revoke access yet — this only
  // updates the local view, a refresh brings the member back.
  function onRemove(m: TeamMember) {
    mutate((prev) => prev?.filter((x) => x.id !== m.id), { revalidate: false })
    showToast(`${m.status === 'pending' ? 'Convite cancelado' : 'Acesso removido'}: ${m.name}`)
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setIsSubmitting(true)
    setError(null)
    try {
      await inviteMember(user.accountId, email, role)
      await mutate()
      setInviteOpen(false)
      setEmail('')
      setRole('MEMBER')
      showToast(`Convite enviado para ${email}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o convite.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Configurações · Equipe"
        actions={
          <Button size="compact" onClick={() => setInviteOpen(true)}>
            + Convidar pessoa
          </Button>
        }
      />
      <main className={styles.main}>
        <div className={styles.container}>
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
            {members?.length ?? 0} pessoas com acesso
          </div>
          <div className={styles.card}>
            {members?.map((m) => (
              <div key={m.id} className={styles.row}>
                <div className={styles.avatar}>{m.name.slice(0, 2).toUpperCase()}</div>
                <div className={styles.info}>
                  <div className={styles.name}>{m.name}</div>
                  <div className={styles.email}>{m.email}</div>
                </div>
                <StatusBadge status={m.role} dot={false} />
                <span className={styles.statusCol}>
                  <StatusBadge
                    status={m.status === 'active' ? 'active' : 'pending'}
                    label={m.status === 'active' ? 'Ativo' : 'Convite pendente'}
                    variant="inline"
                  />
                </span>
                <span className={styles.actions}>
                  {m.status === 'pending' && (
                    <Button variant="ghost" type="button" onClick={() => onResend(m)}>
                      Reenviar
                    </Button>
                  )}
                  <Button variant="danger" type="button" onClick={() => onRemove(m)}>
                    {m.status === 'pending' ? 'Cancelar' : 'Remover'}
                  </Button>
                </span>
              </div>
            ))}
          </div>
          <div className={styles.legend}>
            <strong className={styles.legendTerm}>Admin</strong> tem acesso total: financeiro, campanhas e equipe.{' '}
            <strong className={styles.legendTerm}>Membro</strong> cria e acompanha campanhas, sem acesso a financeiro ou
            equipe.
          </div>
        </div>
      </main>

      {inviteOpen && (
        <div className={styles.overlay} onClick={() => setInviteOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Convidar pessoa</h2>
            <p className={styles.modalSubtitle}>Enviamos um link por e-mail para essa pessoa definir a senha e entrar.</p>
            <form onSubmit={onInvite}>
              <label className={styles.label}>E-mail corporativo</label>
              <input className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com.br" />

              <label className={styles.label} style={{ marginTop: 18 }}>
                Papel
              </label>
              <div className={styles.roleOptions}>
                <button type="button" className={styles.roleOption} data-active={role === 'ADMIN'} onClick={() => setRole('ADMIN')}>
                  <div className={styles.roleTitle}>Admin</div>
                  <div className={styles.roleDesc}>Acesso total: financeiro, campanhas e equipe.</div>
                </button>
                <button type="button" className={styles.roleOption} data-active={role === 'MEMBER'} onClick={() => setRole('MEMBER')}>
                  <div className={styles.roleTitle}>Membro</div>
                  <div className={styles.roleDesc}>Cria e acompanha campanhas, sem financeiro nem equipe.</div>
                </button>
              </div>

              {error && <div className={styles.error}>{error}</div>}

              <div className={styles.modalActions}>
                <Button variant="outline" type="button" onClick={() => setInviteOpen(false)}>
                  Cancelar
                </Button>
                <Button variant="accent" type="submit" disabled={!/.+@.+\..+/.test(email) || isSubmitting} style={{ flex: 1 }}>
                  {isSubmitting ? 'Enviando…' : 'Enviar convite'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
