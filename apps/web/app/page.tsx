import { AppShell } from './_components/app-shell'
import { ConnectionStatus } from './_components/connection-status'
import { DashboardHome } from './_components/dashboard-home'

export default function HomePage() {
  return (
    <AppShell active="Home">
      <ConnectionStatus />
      <DashboardHome />
    </AppShell>
  )
}
