import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../layouts/AuthLayout'
import { Button } from '../components/Button'
import { useAuth } from '../auth/AuthContext'
import { ApiError } from '../api/http'
import formStyles from './AuthForm.module.css'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = email.length > 0 && password.length > 0 && !isSubmitting

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setIsSubmitting(true)
    setError(null)
    try {
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      footer={
        <>
          <div>Seus dados são usados apenas para autenticação e conformidade.</div>
          <div style={{ marginTop: 8 }}>
            Precisa de ajuda? <a href="mailto:comercial@perkly.com.br">Fale com o time comercial</a>
          </div>
        </>
      }
    >
      <h1 className={formStyles.title}>Entrar na Perkly</h1>
      <p className={formStyles.subtitle}>Acesse o painel de recompensas da sua empresa.</p>

      <form onSubmit={onSubmit}>
        <label className={formStyles.label} htmlFor="email">
          E-mail corporativo
        </label>
        <input
          id="email"
          className={formStyles.input}
          data-mono
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ana@empresa.com.br"
          autoComplete="email"
        />

        <label className={formStyles.label} htmlFor="password" style={{ marginTop: 16 }}>
          Senha
        </label>
        <input
          id="password"
          className={formStyles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          data-invalid={!!error}
        />

        {error && <div className={formStyles.error}>{error}</div>}

        <div style={{ textAlign: 'right', marginTop: 9 }}>
          <Link className={formStyles.linkMuted} to="/esqueci-senha">
            Esqueci minha senha
          </Link>
        </div>

        <Button variant="accent" fullWidth type="submit" disabled={!canSubmit} style={{ marginTop: 18, height: 50 }}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </Button>

        <div className={formStyles.divider}>
          Não tem conta? A Perkly não tem cadastro público —<br />
          <a href="mailto:comercial@perkly.com.br">fale com o time comercial</a> para uma demonstração.
        </div>
      </form>
    </AuthLayout>
  )
}
