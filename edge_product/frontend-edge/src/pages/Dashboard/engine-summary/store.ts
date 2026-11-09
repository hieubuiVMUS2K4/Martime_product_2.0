import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Period } from './model'

interface EngineSummaryState {
  chartPeriod: Period
  kpiPeriod: Period
  setChartPeriod: (period: Period) => void
  setKpiPeriod: (period: Period) => void
}
export const useEngineSummary = create<EngineSummaryState>()(persist(set => ({
  chartPeriod: 1, kpiPeriod: 1,
  setChartPeriod: chartPeriod => set({ chartPeriod }),
  setKpiPeriod: kpiPeriod => set({ kpiPeriod }),
}), {
  name: 'edge-engine-summary-view', version: 1,
  partialize: state => ({ chartPeriod: state.chartPeriod, kpiPeriod: state.kpiPeriod }),
}))
