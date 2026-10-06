import { PermissionGate } from '@/components/auth/PermissionGate'
import { useState, useEffect, useCallback } from 'react'
import {
  DollarSign, TrendingUp, TrendingDown, Plus, Check, X,
  FileText, CreditCard, Receipt, BarChart3, Lock, AlertCircle,
  ArrowRight, Trash2,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useTranslationSafe } from '@/contexts/I18nContext'
import { voyageMgmtService } from '@/services/voyage.service'
import type {
  VoyageFinancialOverview,
  VoyageExpenseRequest, CreateExpenseRequestDto,
  VoyageAdvancePayment, CreateAdvancePaymentDto,
  VoyageDisbursement, CreateDisbursementDto,
  VoyageActualRevenue, CreateActualRevenueDto,
  VoyageSettlement,
} from '@/types/financial.types'
import {
  COST_CATEGORIES, REVENUE_CATEGORIES, ALLOCATION_SCOPES,
  ADVANCE_TYPES,
} from '@/types/financial.types'

// ============================================================
// FINANCIAL TAB — Phase 4: Voyage Financial Management
// ============================================================

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-200 text-gray-500',
  PENDING: 'bg-yellow-100 text-yellow-700',
  PAID: 'bg-green-100 text-green-700',
  SETTLED: 'bg-emerald-100 text-emerald-700',
  RECORDED: 'bg-blue-100 text-blue-700',
  VERIFIED: 'bg-indigo-100 text-indigo-700',
  DISPUTED: 'bg-red-100 text-red-700',
  INVOICED: 'bg-blue-100 text-blue-700',
  RECEIVED: 'bg-green-100 text-green-700',
  OPEN: 'bg-blue-100 text-blue-700',
  PENDING_SETTLEMENT: 'bg-yellow-100 text-yellow-700',
  CLOSED: 'bg-gray-200 text-gray-600',
  REVIEWED: 'bg-indigo-100 text-indigo-700',
}

const FINANCIAL_STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-500',
  PENDING_SETTLEMENT: 'bg-yellow-500',
  SETTLED: 'bg-green-500',
  CLOSED: 'bg-gray-500',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-700'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function VarianceCell({ value }: { value: number }) {
  if (value === 0) return <span className="text-gray-400">—</span>
  const isNegative = value < 0
  return (
    <span className={`flex items-center gap-1 ${isNegative ? 'text-green-600' : 'text-red-600'}`}>
      {isNegative ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
      {formatCurrency(Math.abs(value))}
    </span>
  )
}

// ============================================================
// MAIN FINANCIAL TAB
// ============================================================

export default function FinancialTab({ voyageId }: { voyageId: string }) {
  const [overview, setOverview] = useState<VoyageFinancialOverview | null>(null)
  const [expenses, setExpenses] = useState<VoyageExpenseRequest[]>([])
  const [advances, setAdvances] = useState<VoyageAdvancePayment[]>([])
  const [disbursements, setDisbursements] = useState<VoyageDisbursement[]>([])
  const [revenues, setRevenues] = useState<VoyageActualRevenue[]>([])
  const [settlements, setSettlements] = useState<VoyageSettlement[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<string>('overview')
  const { t } = useTranslationSafe()

  // Form states
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showAdvanceForm, setShowAdvanceForm] = useState(false)
  const [showDisbursementForm, setShowDisbursementForm] = useState(false)
  const [showRevenueForm, setShowRevenueForm] = useState(false)

  const isClosed = overview?.financialStatus === 'CLOSED'

  const loadAll = useCallback(async () => {
    try {
      setLoading(true)
      const [ov, exp, adv, dis, rev, stl] = await Promise.all([
        voyageMgmtService.financial.getOverview(voyageId),
        voyageMgmtService.financial.getExpenses(voyageId),
        voyageMgmtService.financial.getAdvances(voyageId),
        voyageMgmtService.financial.getDisbursements(voyageId),
        voyageMgmtService.financial.getRevenues(voyageId),
        voyageMgmtService.financial.getSettlements(voyageId),
      ])
      setOverview(ov)
      setExpenses(exp)
      setAdvances(adv)
      setDisbursements(dis)
      setRevenues(rev)
      setSettlements(stl)
    } catch {
      toast.error(t('voyage.financial.title'))
    } finally {
      setLoading(false)
    }
  }, [voyageId])

  useEffect(() => { loadAll() }, [loadAll])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!overview) {
    return (
      <div className="text-center py-12 text-gray-500">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>{t('voyage.financial.title')}</p>
      </div>
    )
  }

  const sections = [
    { key: 'overview', label: t('voyage.financial.tabs.overview'), icon: BarChart3 },
    { key: 'expenses', label: t('voyage.financial.tabs.expenses'), icon: FileText, count: expenses.length },
    { key: 'advances', label: t('voyage.financial.tabs.advances'), icon: CreditCard, count: advances.length },
    { key: 'disbursements', label: t('voyage.financial.tabs.disbursements'), icon: Receipt, count: disbursements.length },
    { key: 'revenues', label: t('voyage.financial.tabs.revenue'), icon: DollarSign, count: revenues.length },
    { key: 'settlements', label: t('voyage.financial.tabs.settlements'), icon: Lock, count: settlements.length },
  ]

  return (
    <div className="space-y-4">
      {/* Financial Status Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${FINANCIAL_STATUS_COLORS[overview.financialStatus] || 'bg-gray-400'}`} />
            <h2 className="text-lg font-bold text-gray-900">
              {t('voyage.financial.title')} — {overview.voyageNumber}
            </h2>
            <StatusBadge status={overview.financialStatus} />
          </div>
          {overview.financialClosedAt && (
            <span className="text-xs text-gray-500">
              {t('voyage.financial.closed')} {format(new Date(overview.financialClosedAt), 'dd MMM yyyy')} by {overview.financialClosedBy}
            </span>
          )}
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 bg-white rounded-lg p-1 shadow-sm border border-gray-200">
        {sections.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              activeSection === s.key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <s.icon className="w-4 h-4" />
            <span>{s.label}</span>
            {s.count != null && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                activeSection === s.key ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {s.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Section Content */}
      {activeSection === 'overview' && <OverviewSection overview={overview} />}
      {activeSection === 'expenses' && (
        <ExpenseSection
          expenses={expenses}
          showForm={showExpenseForm}
          setShowForm={setShowExpenseForm}
          voyageId={voyageId}
          onRefresh={loadAll}
          isClosed={isClosed}
        />
      )}
      {activeSection === 'advances' && (
        <AdvanceSection
          advances={advances}
          showForm={showAdvanceForm}
          setShowForm={setShowAdvanceForm}
          voyageId={voyageId}
          onRefresh={loadAll}
          isClosed={isClosed}
        />
      )}
      {activeSection === 'disbursements' && (
        <DisbursementSection
          disbursements={disbursements}
          showForm={showDisbursementForm}
          setShowForm={setShowDisbursementForm}
          voyageId={voyageId}
          onRefresh={loadAll}
          isClosed={isClosed}
        />
      )}
      {activeSection === 'revenues' && (
        <RevenueSection
          revenues={revenues}
          showForm={showRevenueForm}
          setShowForm={setShowRevenueForm}
          voyageId={voyageId}
          onRefresh={loadAll}
          isClosed={isClosed}
        />
      )}
      {activeSection === 'settlements' && (
        <SettlementSection
          settlements={settlements}
          voyageId={voyageId}
          overview={overview}
          onRefresh={loadAll}
          isClosed={isClosed}
        />
      )}
    </div>
  )
}

// ============================================================
// OVERVIEW SECTION
// ============================================================

function OverviewSection({ overview }: { overview: VoyageFinancialOverview }) {
  const { t } = useTranslationSafe()
  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label={t('voyage.financial.estCost')} value={overview.totalEstimatedCost} />
        <KPICard label={t('voyage.financial.actCost')} value={overview.totalActualCost} variant={overview.costVariance > 0 ? 'danger' : 'success'} />
        <KPICard label={t('voyage.financial.estRevenue')} value={overview.totalEstimatedRevenue} />
        <KPICard label={t('voyage.financial.actRevenue')} value={overview.totalActualRevenue} variant={overview.revenueVariance > 0 ? 'success' : 'danger'} />
      </div>

      {/* Profit & Cash */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KPICard label={t('voyage.financial.actProfit')} value={overview.actualProfitMargin} variant={overview.actualProfitMargin >= 0 ? 'success' : 'danger'} />
        <KPICard label={t('voyage.financial.totalAdvanced')} value={overview.totalAdvanced} />
        <KPICard label={t('voyage.financial.outstandingBalance')} value={overview.outstandingBalance} variant={overview.outstandingBalance > 0 ? 'warning' : 'success'} />
      </div>

      {/* Variance Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('voyage.financial.planVsActual')}</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="text-left py-2">{t('voyage.financial.metric')}</th>
              <th className="text-right py-2">{t('voyage.financial.estimated')}</th>
              <th className="text-right py-2">{t('voyage.financial.actual')}</th>
              <th className="text-right py-2">{t('voyage.financial.variance')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-2 font-medium">{t('voyage.financial.totalCost')}</td>
              <td className="text-right">{formatCurrency(overview.totalEstimatedCost)}</td>
              <td className="text-right">{formatCurrency(overview.totalActualCost)}</td>
              <td className="text-right"><VarianceCell value={overview.costVariance} /></td>
            </tr>
            <tr className="border-b">
              <td className="py-2 font-medium">{t('voyage.financial.totalRevenue')}</td>
              <td className="text-right">{formatCurrency(overview.totalEstimatedRevenue)}</td>
              <td className="text-right">{formatCurrency(overview.totalActualRevenue)}</td>
              <td className="text-right"><VarianceCell value={-overview.revenueVariance} /></td>
            </tr>
            <tr>
              <td className="py-2 font-bold">{t('voyage.financial.profitMargin')}</td>
              <td className="text-right font-bold">{formatCurrency(overview.estimatedProfitMargin)}</td>
              <td className="text-right font-bold">{formatCurrency(overview.actualProfitMargin)}</td>
              <td className="text-right font-bold"><VarianceCell value={overview.profitVariance} /></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {overview.actualCostBreakdown.length > 0 && (
          <BreakdownCard title={t('voyage.financial.costByCategory')} items={overview.actualCostBreakdown.map(b => ({ label: b.category, amount: b.amount, pct: b.percentage }))} />
        )}
        {overview.actualRevenueBreakdown.length > 0 && (
          <BreakdownCard title={t('voyage.financial.revenueByCategory')} items={overview.actualRevenueBreakdown.map(b => ({ label: b.category, amount: b.amount, pct: b.percentage }))} />
        )}
        {overview.costAllocationBreakdown.length > 0 && (
          <BreakdownCard title={t('voyage.financial.costByAllocation')} items={overview.costAllocationBreakdown.map(b => ({ label: b.scope, amount: b.amount, pct: b.percentage }))} />
        )}
      </div>

      {/* Activity Counts */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('voyage.financial.activitySummary')}</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center text-sm">
          <CountStat label={t('voyage.financial.expenses2')} count={overview.expenseRequestCount} />
          <CountStat label={t('voyage.financial.pendingExpenses')} count={overview.pendingExpenseCount} highlight />
          <CountStat label={t('voyage.financial.advances2')} count={overview.advancePaymentCount} />
          <CountStat label={t('voyage.financial.disbursements2')} count={overview.disbursementCount} />
          <CountStat label={t('voyage.financial.revenueItems')} count={overview.revenueCount} />
          <CountStat label={t('voyage.financial.settlements2')} count={overview.settlementCount} />
        </div>
      </div>
    </div>
  )
}

function KPICard({ label, value, variant }: { label: string; value: number; variant?: 'success' | 'danger' | 'warning' }) {
  const colors = {
    success: 'border-green-200 bg-green-50',
    danger: 'border-red-200 bg-red-50',
    warning: 'border-yellow-200 bg-yellow-50',
  }
  return (
    <div className={`rounded-xl border p-4 ${variant ? colors[variant] : 'border-gray-200 bg-white'}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold mt-1">{formatCurrency(value)}</p>
    </div>
  )
}

function BreakdownCard({ title, items }: { title: string; items: { label: string; amount: number; pct: number }[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">{item.label.replace(/_/g, ' ')}</span>
                <span className="font-medium">{formatCurrency(item.amount)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(item.pct, 100)}%` }} />
              </div>
            </div>
            <span className="text-xs text-gray-500 w-12 text-right">{item.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CountStat({ label, count, highlight }: { label: string; count: number; highlight?: boolean }) {
  return (
    <div>
      <p className={`text-2xl font-bold ${highlight && count > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{count}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}

// ============================================================
// EXPENSE REQUESTS SECTION
// ============================================================

function ExpenseSection({ expenses, showForm, setShowForm, voyageId, onRefresh, isClosed }: {
  expenses: VoyageExpenseRequest[]
  showForm: boolean
  setShowForm: (v: boolean) => void
  voyageId: string
  onRefresh: () => void
  isClosed: boolean
}) {
  const [form, setForm] = useState<CreateExpenseRequestDto>({
    costCategory: 'FUEL', allocationScope: 'VOYAGE', description: '',
    requestedAmount: 0, currency: 'USD', exchangeRate: 1,
  })

  const handleCreate = async () => {
    try {
      await voyageMgmtService.financial.createExpense(voyageId, form)
      toast.success('Expense request created')
      setShowForm(false)
      setForm({ costCategory: 'FUEL', allocationScope: 'VOYAGE', description: '', requestedAmount: 0, currency: 'USD', exchangeRate: 1 })
      onRefresh()
    } catch { toast.error('Failed to create expense') }
  }

  const handleTransition = async (id: string, newStatus: string, approvedAmount?: number) => {
    try {
      await voyageMgmtService.financial.transitionExpense(id, { newStatus, approvedAmount })
      toast.success(`Expense ${newStatus.toLowerCase()}`)
      onRefresh()
    } catch { toast.error('Failed to update status') }
  }

  const handleDelete = async (id: string) => {
    toast('Delete this expense request?', {
      action: {
        label: t('common.delete') || 'Delete',
        onClick: async () => {
          try {
            await voyageMgmtService.financial.deleteExpense(id)
            toast.success('Deleted')
            onRefresh()
          } catch { toast.error('Failed to delete') }
        }
      }
    })
  }

  const { t } = useTranslationSafe()

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-gray-800">{t('voyage.financial.expenseRequests')} ({expenses.length})</h3>
        {!isClosed && (
          <PermissionGate permission="voyage.create"><button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> {t('voyage.financial.newExpense')}
          </button></PermissionGate>
        )}
      </div>

      {showForm && (
        <div className="p-4 bg-blue-50 border-b space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select value={form.costCategory} onChange={e => setForm({ ...form, costCategory: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
              {COST_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
            <select value={form.allocationScope} onChange={e => setForm({ ...form, allocationScope: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
              {ALLOCATION_SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="number" placeholder="Amount" value={form.requestedAmount || ''} onChange={e => setForm({ ...form, requestedAmount: +e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            <input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} placeholder="Currency" className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input type="number" step="0.0001" value={form.exchangeRate} onChange={e => setForm({ ...form, exchangeRate: +e.target.value })} placeholder="Exchange Rate" className="border rounded-lg px-3 py-2 text-sm" />
            <input value={form.vendorName || ''} onChange={e => setForm({ ...form, vendorName: e.target.value })} placeholder="Vendor Name" className="border rounded-lg px-3 py-2 text-sm" />
            <input value={form.portName || ''} onChange={e => setForm({ ...form, portName: e.target.value })} placeholder="Port" className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2">
            <PermissionGate permission="voyage.create"><button onClick={handleCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Create</button></PermissionGate>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      )}

      {expenses.length === 0 ? (
        <p className="text-center py-8 text-gray-400">{t('voyage.financial.noExpenses')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50 text-gray-500">
              <th className="text-left px-4 py-2">{t('voyage.financial.number')}</th>
              <th className="text-left px-4 py-2">{t('voyage.financial.category')}</th>
              <th className="text-left px-4 py-2">{t('voyage.financial.description')}</th>
              <th className="text-right px-4 py-2">{t('voyage.financial.amount')}</th>
              <th className="text-left px-4 py-2">{t('voyage.financial.vendor')}</th>
              <th className="text-left px-4 py-2">{t('voyage.financial.status')}</th>
              <th className="text-right px-4 py-2">{t('voyage.financial.actions')}</th>
            </tr></thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{e.requestNumber}</td>
                  <td className="px-4 py-2">{e.costCategory.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 max-w-[200px] truncate">{e.description}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(e.requestedAmountUsd)}</td>
                  <td className="px-4 py-2">{e.vendorName || '—'}</td>
                  <td className="px-4 py-2"><StatusBadge status={e.status} /></td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {!isClosed && e.status === 'DRAFT' && (
                        <>
                          <PermissionGate permission="voyage.approve"><button onClick={() => handleTransition(e.id, 'SUBMITTED')} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Submit">
                            <ArrowRight className="w-4 h-4" />
                          </button></PermissionGate>
                          <PermissionGate permission="voyage.delete"><button onClick={() => handleDelete(e.id)} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button></PermissionGate>
                        </>
                      )}
                      {!isClosed && e.status === 'SUBMITTED' && (
                        <>
                          <PermissionGate permission="voyage.approve"><button onClick={() => handleTransition(e.id, 'APPROVED', e.requestedAmount)} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Approve">
                            <Check className="w-4 h-4" />
                          </button></PermissionGate>
                          <PermissionGate permission="voyage.reject"><button onClick={() => handleTransition(e.id, 'REJECTED')} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Reject">
                            <X className="w-4 h-4" />
                          </button></PermissionGate>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============================================================
// ADVANCE PAYMENTS SECTION
// ============================================================

function AdvanceSection({ advances, showForm, setShowForm, voyageId, onRefresh, isClosed }: {
  advances: VoyageAdvancePayment[]
  showForm: boolean
  setShowForm: (v: boolean) => void
  voyageId: string
  onRefresh: () => void
  isClosed: boolean
}) {
  const [form, setForm] = useState<CreateAdvancePaymentDto>({
    advanceType: 'PORT_AGENT', description: '', amount: 0, currency: 'USD', exchangeRate: 1, recipientName: '',
  })

  const handleCreate = async () => {
    try {
      await voyageMgmtService.financial.createAdvance(voyageId, form)
      toast.success('Advance payment created')
      setShowForm(false)
      setForm({ advanceType: 'PORT_AGENT', description: '', amount: 0, currency: 'USD', exchangeRate: 1, recipientName: '' })
      onRefresh()
    } catch { toast.error('Failed to create advance') }
  }

  const handlePay = async (id: string) => {
    try {
      await voyageMgmtService.financial.payAdvance(id, { newStatus: 'PAID' })
      toast.success('Advance marked as paid')
      onRefresh()
    } catch { toast.error('Failed to mark as paid') }
  }

  const { t } = useTranslationSafe()

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-gray-800">{t('voyage.financial.advancePayments')} ({advances.length})</h3>
        {!isClosed && (
          <PermissionGate permission="voyage.create"><button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> {t('voyage.financial.newAdvance')}
          </button></PermissionGate>
        )}
      </div>

      {showForm && (
        <div className="p-4 bg-blue-50 border-b space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select value={form.advanceType} onChange={e => setForm({ ...form, advanceType: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
              {ADVANCE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            <input value={form.recipientName} onChange={e => setForm({ ...form, recipientName: e.target.value })} placeholder="Recipient" className="border rounded-lg px-3 py-2 text-sm" />
            <input type="number" value={form.amount || ''} onChange={e => setForm({ ...form, amount: +e.target.value })} placeholder="Amount" className="border rounded-lg px-3 py-2 text-sm" />
            <input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} placeholder="Currency" className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <PermissionGate permission="voyage.create"><button onClick={handleCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Create</button></PermissionGate>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      )}

      {advances.length === 0 ? (
        <p className="text-center py-8 text-gray-400">{t('voyage.financial.noAdvances')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50 text-gray-500">
              <th className="text-left px-4 py-2">{t('voyage.financial.number')}</th>
              <th className="text-left px-4 py-2">{t('voyage.financial.type')}</th>
              <th className="text-left px-4 py-2">{t('voyage.financial.recipient')}</th>
              <th className="text-right px-4 py-2">{t('voyage.financial.amountUsd')}</th>
              <th className="text-right px-4 py-2">{t('voyage.financial.settled')}</th>
              <th className="text-right px-4 py-2">{t('voyage.financial.unsettled')}</th>
              <th className="text-left px-4 py-2">{t('voyage.financial.status')}</th>
              <th className="text-right px-4 py-2">{t('voyage.financial.actions')}</th>
            </tr></thead>
            <tbody>
              {advances.map(a => (
                <tr key={a.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{a.advanceNumber}</td>
                  <td className="px-4 py-2">{a.advanceType.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2">{a.recipientName}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(a.amountUsd)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(a.settledAmount)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(a.unsettledBalance)}</td>
                  <td className="px-4 py-2"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-2 text-right">
                    {!isClosed && a.status === 'PENDING' && (
                      <PermissionGate permission="voyage.approve"><button onClick={() => handlePay(a.id)} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Mark Paid">
                        <Check className="w-4 h-4" />
                      </button></PermissionGate>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============================================================
// DISBURSEMENTS SECTION
// ============================================================

function DisbursementSection({ disbursements, showForm, setShowForm, voyageId, onRefresh, isClosed }: {
  disbursements: VoyageDisbursement[]
  showForm: boolean
  setShowForm: (v: boolean) => void
  voyageId: string
  onRefresh: () => void
  isClosed: boolean
}) {
  const [form, setForm] = useState<CreateDisbursementDto>({
    costCategory: 'FUEL', allocationScope: 'VOYAGE', description: '',
    amount: 0, currency: 'USD', exchangeRate: 1,
  })

  const handleCreate = async () => {
    try {
      await voyageMgmtService.financial.createDisbursement(voyageId, form)
      toast.success('Disbursement created')
      setShowForm(false)
      setForm({ costCategory: 'FUEL', allocationScope: 'VOYAGE', description: '', amount: 0, currency: 'USD', exchangeRate: 1 })
      onRefresh()
    } catch { toast.error('Failed to create disbursement') }
  }

  const handleTransition = async (id: string, newStatus: string) => {
    try {
      await voyageMgmtService.financial.transitionDisbursement(id, { newStatus })
      toast.success(`Disbursement ${newStatus.toLowerCase()}`)
      onRefresh()
    } catch { toast.error('Failed to update status') }
  }

  const { t } = useTranslationSafe()

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-gray-800">{t('voyage.financial.disbursementsTitle')} ({disbursements.length})</h3>
        {!isClosed && (
          <PermissionGate permission="voyage.create"><button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> {t('voyage.financial.newDisbursement')}
          </button></PermissionGate>
        )}
      </div>

      {showForm && (
        <div className="p-4 bg-blue-50 border-b space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select value={form.costCategory} onChange={e => setForm({ ...form, costCategory: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
              {COST_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
            <select value={form.allocationScope} onChange={e => setForm({ ...form, allocationScope: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
              {ALLOCATION_SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="number" value={form.amount || ''} onChange={e => setForm({ ...form, amount: +e.target.value })} placeholder="Amount" className="border rounded-lg px-3 py-2 text-sm" />
            <input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} placeholder="Currency" className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input value={form.vendorName || ''} onChange={e => setForm({ ...form, vendorName: e.target.value })} placeholder="Vendor" className="border rounded-lg px-3 py-2 text-sm" />
            <input value={form.invoiceNumber || ''} onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} placeholder="Invoice #" className="border rounded-lg px-3 py-2 text-sm" />
            <input value={form.portName || ''} onChange={e => setForm({ ...form, portName: e.target.value })} placeholder="Port" className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2">
            <PermissionGate permission="voyage.create"><button onClick={handleCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Create</button></PermissionGate>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      )}

      {disbursements.length === 0 ? (
        <p className="text-center py-8 text-gray-400">{t('voyage.financial.noDisbursements')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50 text-gray-500">
              <th className="text-left px-4 py-2">{t('voyage.financial.number')}</th>
              <th className="text-left px-4 py-2">{t('voyage.financial.category')}</th>
              <th className="text-left px-4 py-2">{t('voyage.financial.vendor')}</th>
              <th className="text-left px-4 py-2">{t('voyage.financial.invoice')}</th>
              <th className="text-right px-4 py-2">{t('voyage.financial.amountUsd')}</th>
              <th className="text-left px-4 py-2">{t('voyage.financial.scope')}</th>
              <th className="text-left px-4 py-2">{t('voyage.financial.status')}</th>
              <th className="text-right px-4 py-2">{t('voyage.financial.actions')}</th>
            </tr></thead>
            <tbody>
              {disbursements.map(d => (
                <tr key={d.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{d.disbursementNumber}</td>
                  <td className="px-4 py-2">{d.costCategory.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2">{d.vendorName || '—'}</td>
                  <td className="px-4 py-2">{d.invoiceNumber || '—'}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(d.amountUsd)}</td>
                  <td className="px-4 py-2">{d.allocationScope}</td>
                  <td className="px-4 py-2"><StatusBadge status={d.status} /></td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {!isClosed && d.status === 'RECORDED' && (
                        <PermissionGate permission="voyage.approve"><button onClick={() => handleTransition(d.id, 'VERIFIED')} className="p-1 text-indigo-600 hover:bg-indigo-50 rounded" title="Verify">
                          <Check className="w-4 h-4" />
                        </button></PermissionGate>
                      )}
                      {!isClosed && d.status === 'VERIFIED' && (
                        <PermissionGate permission="voyage.approve"><button onClick={() => handleTransition(d.id, 'PAID')} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Mark Paid">
                          <DollarSign className="w-4 h-4" />
                        </button></PermissionGate>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============================================================
// ACTUAL REVENUE SECTION
// ============================================================

function RevenueSection({ revenues, showForm, setShowForm, voyageId, onRefresh, isClosed }: {
  revenues: VoyageActualRevenue[]
  showForm: boolean
  setShowForm: (v: boolean) => void
  voyageId: string
  onRefresh: () => void
  isClosed: boolean
}) {
  const [form, setForm] = useState<CreateActualRevenueDto>({
    revenueCategory: 'FREIGHT', description: '', amount: 0, currency: 'USD', exchangeRate: 1,
  })

  const handleCreate = async () => {
    try {
      await voyageMgmtService.financial.createRevenue(voyageId, form)
      toast.success('Revenue recorded')
      setShowForm(false)
      setForm({ revenueCategory: 'FREIGHT', description: '', amount: 0, currency: 'USD', exchangeRate: 1 })
      onRefresh()
    } catch { toast.error('Failed to create revenue') }
  }

  const handleTransition = async (id: string, newStatus: string) => {
    try {
      await voyageMgmtService.financial.transitionRevenue(id, { newStatus })
      toast.success(`Revenue ${newStatus.toLowerCase()}`)
      onRefresh()
    } catch { toast.error('Failed to update status') }
  }

  const { t } = useTranslationSafe()

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-gray-800">{t('voyage.financial.actualRevenueTitle')} ({revenues.length})</h3>
        {!isClosed && (
          <PermissionGate permission="voyage.create"><button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> {t('voyage.financial.newRevenue')}
          </button></PermissionGate>
        )}
      </div>

      {showForm && (
        <div className="p-4 bg-blue-50 border-b space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select value={form.revenueCategory} onChange={e => setForm({ ...form, revenueCategory: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
              {REVENUE_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
            <input type="number" value={form.amount || ''} onChange={e => setForm({ ...form, amount: +e.target.value })} placeholder="Amount" className="border rounded-lg px-3 py-2 text-sm" />
            <input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} placeholder="Currency" className="border rounded-lg px-3 py-2 text-sm" />
            <input value={form.payerName || ''} onChange={e => setForm({ ...form, payerName: e.target.value })} placeholder="Payer" className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <PermissionGate permission="voyage.create"><button onClick={handleCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Create</button></PermissionGate>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      )}

      {revenues.length === 0 ? (
        <p className="text-center py-8 text-gray-400">{t('voyage.financial.noRevenue')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50 text-gray-500">
              <th className="text-left px-4 py-2">{t('voyage.financial.number')}</th>
              <th className="text-left px-4 py-2">{t('voyage.financial.category')}</th>
              <th className="text-left px-4 py-2">{t('voyage.financial.description')}</th>
              <th className="text-right px-4 py-2">{t('voyage.financial.amountUsd')}</th>
              <th className="text-left px-4 py-2">{t('voyage.financial.payer')}</th>
              <th className="text-left px-4 py-2">{t('voyage.financial.status')}</th>
              <th className="text-right px-4 py-2">{t('voyage.financial.actions')}</th>
            </tr></thead>
            <tbody>
              {revenues.map(r => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{r.revenueNumber}</td>
                  <td className="px-4 py-2">{r.revenueCategory.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 max-w-[200px] truncate">{r.description}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.amountUsd)}</td>
                  <td className="px-4 py-2">{r.payerName || '—'}</td>
                  <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {!isClosed && r.status === 'INVOICED' && (
                        <PermissionGate permission="voyage.approve"><button onClick={() => handleTransition(r.id, 'RECEIVED')} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Mark Received">
                          <Check className="w-4 h-4" />
                        </button></PermissionGate>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============================================================
// SETTLEMENTS SECTION
// ============================================================

function SettlementSection({ settlements, voyageId, overview, onRefresh, isClosed }: {
  settlements: VoyageSettlement[]
  voyageId: string
  overview: VoyageFinancialOverview
  onRefresh: () => void
  isClosed: boolean
}) {
  const handleCreate = async () => {
    try {
      await voyageMgmtService.financial.createSettlement(voyageId, { summary: 'Auto-generated settlement' })
      toast.success('Settlement created')
      onRefresh()
    } catch { toast.error('Failed to create settlement') }
  }

  const handleTransition = async (id: string, newStatus: string) => {
    try {
      await voyageMgmtService.financial.transitionSettlement(id, { newStatus })
      toast.success(`Settlement ${newStatus.toLowerCase()}`)
      onRefresh()
    } catch { toast.error('Failed to update status') }
  }

  const handleClose = async () => {
    toast('Close voyage financials?', {
      description: 'This action cannot be undone.',
      action: {
        label: t('common.confirm') || 'Confirm',
        onClick: async () => {
          try {
            await voyageMgmtService.financial.close(voyageId, { notes: 'Financial close' })
            toast.success('Voyage financials closed')
            onRefresh()
          } catch { toast.error('Failed to close financials') }
        }
      }
    })
  }

  const { t } = useTranslationSafe()

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-gray-800">{t('voyage.financial.settlementsTitle')} ({settlements.length})</h3>
          <div className="flex gap-2">
            {!isClosed && (
              <PermissionGate permission="voyage.create"><button onClick={handleCreate} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <Plus className="w-4 h-4" /> {t('voyage.financial.createSettlement')}
              </button></PermissionGate>
            )}
            {!isClosed && overview.financialStatus === 'SETTLED' && (
              <button onClick={handleClose} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
                <Lock className="w-4 h-4" /> {t('voyage.financial.closeFinancials')}
              </button>
            )}
          </div>
        </div>

        {settlements.length === 0 ? (
          <p className="text-center py-8 text-gray-400">{t('voyage.financial.noSettlements')}</p>
        ) : (
          <div className="divide-y">
            {settlements.map(s => (
              <div key={s.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold">{s.settlementNumber}</span>
                    <StatusBadge status={s.status} />
                  </div>
                  <span className="text-xs text-gray-500">
                    Prepared by {s.preparedBy} on {format(new Date(s.preparedAt), 'dd MMM yyyy')}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><span className="text-gray-500">{t('voyage.financial.expensesApproved')}</span> <span className="font-medium">{formatCurrency(s.totalExpenseApproved)}</span></div>
                  <div><span className="text-gray-500">{t('voyage.financial.totalAdvanced2')}</span> <span className="font-medium">{formatCurrency(s.totalAdvanced)}</span></div>
                  <div><span className="text-gray-500">{t('voyage.financial.totalDisbursed')}</span> <span className="font-medium">{formatCurrency(s.totalDisbursed)}</span></div>
                  <div><span className="text-gray-500">{t('voyage.financial.totalRevenue2')}</span> <span className="font-medium">{formatCurrency(s.totalRevenue)}</span></div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm font-semibold bg-gray-50 rounded-lg p-3">
                  <div>{t('voyage.financial.netResult')} <span className={s.netResult >= 0 ? 'text-green-600' : 'text-red-600'}>{formatCurrency(s.netResult)}</span></div>
                  <div>{t('voyage.financial.advanceBalance')} {formatCurrency(s.advanceBalance)}</div>
                  {s.finalSettlementAmount != null && <div>{t('voyage.financial.finalSettlement')} {formatCurrency(s.finalSettlementAmount)}</div>}
                </div>

                {!isClosed && (
                  <div className="flex gap-2">
                    {s.status === 'DRAFT' && (
                      <PermissionGate permission="voyage.approve"><button onClick={() => handleTransition(s.id, 'SUBMITTED')} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">{t('voyage.financial.submit')}</button></PermissionGate>
                    )}
                    {s.status === 'SUBMITTED' && (
                      <PermissionGate permission="voyage.approve"><button onClick={() => handleTransition(s.id, 'REVIEWED')} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{t('voyage.financial.review')}</button></PermissionGate>
                    )}
                    {s.status === 'REVIEWED' && (
                      <PermissionGate permission="voyage.approve"><button onClick={() => handleTransition(s.id, 'APPROVED')} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">{t('voyage.financial.approve')}</button></PermissionGate>
                    )}
                    {(s.status === 'SUBMITTED' || s.status === 'REVIEWED') && (
                      <PermissionGate permission="voyage.reject"><button onClick={() => handleTransition(s.id, 'REJECTED')} className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50">{t('voyage.financial.reject')}</button></PermissionGate>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
