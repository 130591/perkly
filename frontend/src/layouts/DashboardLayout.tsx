import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../auth/AuthContext'
import styles from './DashboardLayout.module.css'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Início', end: true },
  { to: '/dashboard/campanhas', label: 'Campanhas' },
  { to: '/dashboard/financeiro', label: 'Financeiro' },
]

export function DashboardLayout() {
  const { user } = useAuth()

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.logoRow}>
          <Logo size="sm" />
          <span className={styles.betaTag}>beta</span>
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.spacer} />

        <NavLink to="/dashboard/configuracoes" className={styles.accountRow}>
          <div className={styles.avatar}>{user?.role === 'ADMIN' ? 'AD' : 'ME'}</div>
          <div className={styles.accountText}>
            <div className={styles.accountRole}>{user?.role === 'ADMIN' ? 'Admin' : 'Membro'}</div>
            <div className={styles.accountSub}>Empresa &middot; Configurações</div>
          </div>
        </NavLink>
      </aside>

      <div className={styles.main}>
        <Outlet />
      </div>
    </div>
  )
}
