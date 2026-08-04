import { useState, type FormEvent } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../auth/AuthContext'
import { inviteMember } from '../../api/identity'
import { ApiError } from '../../api/http'
import { teamFixtures, type TeamMember } from '../../lib/fixtures'
import styles from './TeamPage.module.css'

export function TeamPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [members, setMembers] = useState<TeamMember[]>(teamFixtures)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function onResend(m: TeamMember) {
    showToast(`Convite reenviado para ${m.email}`)
  }

  function onRemove(m: TeamMember) {
    setMembers((prev) => prev.filter((x) => x.id !== m.id))
    showToast(`${m.status === 'pending' ? 'Convite cancelado' : 'Acesso removido'}: ${m.name}`)
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setIsSubmitting(true)
    setError(null)
    try {
      await inviteMember(user.accountId, email, role)
      setMembers((prev) => [
        ...prev,
        { id: crypto.randomUUID(), name: email.split('@')[0], email, role, status: 'pending' },
      ])
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
      <PageHeader title="Configurações · Equipe" actions={<Button onClick={() => setInviteOpen(true)}>+ Convidar pessoa</Button>} />
      <main className={styles.main}>
        <div className={styles.container}>
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
            {members.length} pessoas com acesso
          </div>
          <div className={styles.card}>
            {members.map((m) => (
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
                {m.status === 'pending' && (
                  <Button variant="ghost" type="button" onClick={() => onResend(m)}>
                    Reenviar
                  </Button>
                )}
                <Button variant="danger" type="button" onClick={() => onRemove(m)}>
                  {m.status === 'pending' ? 'Cancelar' : 'Remover'}
                </Button>
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
