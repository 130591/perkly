import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '../layouts/AuthLayout'
import { Button } from '../components/Button'
import { requestPasswordReset } from '../api/identity'
import { ApiError } from '../api/http'
import formStyles from './AuthForm.module.css'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o link.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthLayout>
        <div style={{ textAlign: 'center' }}>
          <div className={formStyles.successIcon} />
          <h1 className={formStyles.title}>Verifique seu e-mail</h1>
          <p className={formStyles.subtitle}>
            Se houver uma conta para <strong>{email}</strong>, enviamos um link para redefinir a senha.
          </p>
          <Button variant="outline" fullWidth onClick={() => setSent(false)}>
            Reenviar e-mail
          </Button>
          <Link to="/login" className={formStyles.linkMuted} style={{ display: 'block', marginTop: 8 }}>
            ← Voltar ao login
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h1 className={formStyles.title}>Esqueci minha senha</h1>
      <p className={formStyles.subtitle}>
        Informe seu e-mail corporativo. Enviaremos um link para redefinir sua senha.
      </p>
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
        />
        {error && <div className={formStyles.error}>{error}</div>}
        <Button variant="accent" fullWidth type="submit" disabled={!email || isSubmitting} style={{ marginTop: 20, height: 50 }}>
          {isSubmitting ? 'Enviando…' : 'Enviar link'}
        </Button>
        <Link to="/login" className={formStyles.linkMuted} style={{ display: 'block', textAlign: 'center', marginTop: 10 }}>
          ← Voltar ao login
        </Link>
      </form>
    </AuthLayout>
  )
}
