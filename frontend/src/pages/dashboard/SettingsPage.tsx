import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/Button'
import { useAuth } from '../../auth/AuthContext'
import styles from './SettingsPage.module.css'

export function SettingsPage() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  async function onLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Configurações"
        actions={
          <Button variant="outline" size="compact" onClick={onLogout}>
            Sair
          </Button>
        }
      />
      <main className={styles.main}>
        <div className={styles.container}>
          <Link to="/dashboard/equipe" className={styles.card}>
            <div className={styles.icon} />
            <div className={styles.text}>
              <div className={styles.title}>Equipe & acessos</div>
              <div className={styles.desc}>Convide pessoas, defina papéis (Admin/Membro) e gerencie quem acessa o painel.</div>
            </div>
            <span className={styles.arrow}>&rarr;</span>
          </Link>

          <div className={styles.card} style={{ opacity: 0.55, cursor: 'default' }}>
            <div className={styles.icon} />
            <div className={styles.text}>
              <div className={styles.title}>Dados da empresa</div>
              <div className={styles.desc}>CNPJ, razão social e responsável legal. Em breve.</div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
