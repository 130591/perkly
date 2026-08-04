import { useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../layouts/AuthLayout'
import { Button } from '../components/Button'
import { acceptInvitation, confirmPasswordReset } from '../api/identity'
import { ApiError } from '../api/http'
import formStyles from './AuthForm.module.css'

/**
 * Backs both `/convite/:token` (accept invitation, needs a name) and
 * `/redefinir-senha/:token` (password reset, no name) — same shape of form,
 * different endpoint underneath.
 */
export function SetPasswordPage({ mode }: { mode: 'invite' | 'reset' }) {
  const { token = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const passwordsMatch = password.length >= 8 && password === confirmPassword
  const canSubmit = passwordsMatch && (mode === 'reset' || name.trim().length > 1)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setIsSubmitting(true)
    setError(null)
    try {
      if (mode === 'invite') {
        await acceptInvitation(token, name, password)
      } else {
        await confirmPasswordReset(token, password)
      }
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a senha.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const email = searchParams.get('email')

  const passwordStrength = password.length >= 12 ? 'strong' : password.length >= 8 ? 'medium' : 'weak'
  const strengthColor =
    passwordStrength === 'strong' ? 'var(--color-accent)' : passwordStrength === 'medium' ? '#d68a0c' : 'var(--color-border-input)'

  return (
    <AuthLayout>
      {mode === 'invite' ? (
        <>
          <div className={formStyles.eyebrow}>Convite de equipe</div>
          <h1 className={formStyles.title}>Defina sua senha</h1>
          <p className={formStyles.subtitle}>Você foi convidado para a Perkly. Defina uma senha para acessar o painel.</p>
        </>
      ) : (
        <>
          <h1 className={formStyles.title}>Defina uma nova senha</h1>
          <p className={formStyles.subtitle}>Escolha uma nova senha para sua conta.</p>
        </>
      )}

      <form onSubmit={onSubmit}>
        {email && (
          <div className={formStyles.infoRow}>
            <span className={formStyles.infoDot} />
            {email}
          </div>
        )}

        {mode === 'invite' && (
          <>
            <label className={formStyles.label} htmlFor="name">
              Nome completo
            </label>
            <input
              id="name"
              className={formStyles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Ana Ribeiro"
              style={{ marginBottom: 16 }}
            />
          </>
        )}

        <label className={formStyles.label} htmlFor="password">
          Nova senha
        </label>
        <input
          id="password"
          className={formStyles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 8 caracteres"
          style={{ marginBottom: 8 }}
        />

        <div className={formStyles.strengthBar}>
          <div className={formStyles.strengthSeg} style={{ background: password.length >= 1 ? strengthColor : undefined }} />
          <div className={formStyles.strengthSeg} style={{ background: password.length >= 8 ? strengthColor : undefined }} />
          <div className={formStyles.strengthSeg} style={{ background: password.length >= 12 ? strengthColor : undefined }} />
        </div>

        <label className={formStyles.label} htmlFor="confirmPassword">
          Confirmar senha
        </label>
        <input
          id="confirmPassword"
          className={formStyles.input}
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Repita a senha"
        />

        {error && <div className={formStyles.error}>{error}</div>}

        <Button variant="accent" fullWidth type="submit" disabled={!canSubmit || isSubmitting} style={{ marginTop: 18, height: 50 }}>
          {isSubmitting ? 'Salvando…' : mode === 'invite' ? 'Criar senha e entrar' : 'Salvar nova senha'}
        </Button>
      </form>
    </AuthLayout>
  )
}
