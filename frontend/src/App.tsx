import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { DashboardLayout } from './layouts/DashboardLayout'
import { LoginPage } from './pages/LoginPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { SetPasswordPage } from './pages/SetPasswordPage'
import { OverviewPage } from './pages/dashboard/OverviewPage'
import { CampaignsPage } from './pages/dashboard/CampaignsPage'
import { CampaignDetailPage } from './pages/dashboard/CampaignDetailPage'
import { NewCampaignPage } from './pages/dashboard/NewCampaignPage'
import { WalletPage } from './pages/dashboard/WalletPage'
import { TeamPage } from './pages/dashboard/TeamPage'
import { SettingsPage } from './pages/dashboard/SettingsPage'
import { ClaimPage } from './pages/claim/ClaimPage'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
      <Route path="/convite/:token" element={<SetPasswordPage mode="invite" />} />
      <Route path="/redefinir-senha/:token" element={<SetPasswordPage mode="reset" />} />
      <Route path="/r/:claimId" element={<ClaimPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="campanhas" element={<CampaignsPage />} />
          <Route path="campanhas/nova" element={<NewCampaignPage />} />
          <Route path="campanhas/:campaignId" element={<CampaignDetailPage />} />
          <Route path="financeiro" element={<WalletPage />} />
          <Route path="equipe" element={<TeamPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
