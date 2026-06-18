import type { ComponentType } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import NetworkMetricsChart from '../charts/NetworkMetricsChart'
import AccountActivityChart from '../charts/AccountActivityChart'
import BalanceHistoryChart from '../charts/BalanceHistoryChart'
import AdvancedChartSuite from '../charts/AdvancedChartSuite'

const ChartsTab: ComponentType = () => {
  const { t } = useTranslation()

  return (
    <div
      className="animate-in"
      style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '22px',
          fontWeight: 700,
        }}
      >
        {t('charts.title', {})}
      </div>
      <NetworkMetricsChart />
      <AccountActivityChart />
      <BalanceHistoryChart />
      <AdvancedChartSuite />
    </div>
  )
}

export default ChartsTab
