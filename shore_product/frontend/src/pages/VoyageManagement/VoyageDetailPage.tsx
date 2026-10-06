import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, Trash2, Ship, Anchor, MapPin, Clock, DollarSign, Package, Fuel, Users, FileText } from 'lucide-react';
import { voyageApi } from '../../services/voyage.service';
import type { VoyageDetail } from '../../types/voyage.types';
import './VoyageManagement.css';
import { toast } from 'sonner';
import { useConfirm } from '@/components/common/ConfirmDialog';

function fmt(v?: string) {
  if (!v) return '—';
  return new Date(v).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDate(v?: string) {
  if (!v) return '—';
  return new Date(v).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function usd(v?: number) {
  if (v === undefined || v === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function statusClass(s?: string) {
  const n = (s || '').toLowerCase();
  if (['underway', 'ready', 'approved', 'completed', 'arrived', 'settled'].includes(n)) return 'vm-badge vm-badge--success';
  if (['planning', 'open', 'pending'].includes(n)) return 'vm-badge vm-badge--warning';
  if (['cancelled', 'rejected', 'disputed'].includes(n)) return 'vm-badge vm-badge--danger';
  return 'vm-badge';
}

type Tab = 'overview' | 'legs' | 'ports' | 'cargo' | 'financial';

export const VoyageDetailPage: React.FC = () => {
  const ask = useConfirm();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<VoyageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    voyageApi.getVoyageDetail(id)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (!data || !id) return;
    if (!await ask(`Xóa hải trình ${data.voyageNumber}?`)) return;
    try {
      await voyageApi.deleteVoyage(id);
      navigate('/voyages');
    } catch { toast.error('Lỗi khi xóa'); }
  }

  if (loading) return <div className="vd-page"><div className="vm-loading">Đang tải...</div></div>;
  if (!data) return <div className="vd-page"><div className="vm-empty"><p>Không tìm thấy hải trình</p></div></div>;

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'overview', label: 'Tổng quan', icon: <Ship size={13} /> },
    { key: 'legs', label: 'Chặng', icon: <MapPin size={13} />, count: data.planLegs.length },
    { key: 'ports', label: 'Cảng ghé', icon: <Anchor size={13} />, count: data.portCalls.length },
    { key: 'cargo', label: 'Hàng hóa & Bunker', icon: <Package size={13} />, count: (data.cargoPlans?.length || 0) + (data.bunkerPlans?.length || 0) },
    { key: 'financial', label: 'Tài chính', icon: <DollarSign size={13} /> },
  ];

  return (
    <div className="vd-page">
      {/* Header */}
      <div className="vd-header">
        <div className="vd-header-left">
          <div className="vd-header-title">
            <button className="vm-btn vm-btn--ghost" onClick={() => navigate('/voyages')}>
              <ArrowLeft size={14} /> Danh sách
            </button>
            <h1>{data.voyageNumber}</h1>
            <span className={statusClass(data.voyageStatus)}>{data.voyageStatus}</span>
            {data.financialStatus && data.financialStatus !== 'OPEN' && (
              <span className={statusClass(data.financialStatus)}>{data.financialStatus}</span>
            )}
          </div>
          <div className="vd-header-meta">
            {data.vesselName && <span><strong>{data.vesselName}</strong></span>}
            {data.vesselIMO && <span>IMO: {data.vesselIMO}</span>}
            {data.charterType && <span>{data.charterType}</span>}
            <span>Tạo: {fmtDate(data.createdAt)}</span>
          </div>
        </div>
        <div className="vd-header-actions">
          <button className="vm-btn" onClick={() => navigate(`/voyages/${id}/edit?vesselIMO=${encodeURIComponent(data.vesselIMO || '')}&vesselName=${encodeURIComponent(data.vesselName || '')}`)}><Edit2 size={13} /> Sửa</button>
          <button className="vm-btn vm-btn--danger" onClick={handleDelete}><Trash2 size={13} /> Xóa</button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="vd-tab-bar">
        {tabs.map(t => (
          <button key={t.key} className={`vd-tab-btn ${tab === t.key ? 'is-active' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon} {t.label} {t.count !== undefined && t.count > 0 && <span className="vd-tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <>
          {/* KPI row */}
          <div className="vd-kpi-row">
            <div className="vd-kpi"><span>Tuyến đường</span><strong>{data.departurePort || '—'} → {data.arrivalPort || '—'}</strong></div>
            <div className="vd-kpi"><span>Khoảng cách</span><strong>{data.plannedDistance ? `${data.plannedDistance} NM` : '—'}</strong></div>
            <div className="vd-kpi"><span>Tốc độ TB</span><strong>{data.plannedAverageSpeed ? `${data.plannedAverageSpeed} kn` : '—'}</strong></div>
            <div className="vd-kpi"><span>Nhiên liệu DK</span><strong>{data.plannedFuelConsumption ? `${data.plannedFuelConsumption} MT` : '—'}</strong></div>
            <div className="vd-kpi"><span>Chi phí ước tính</span><strong>{usd(data.totalEstimatedCost)}</strong></div>
            <div className="vd-kpi"><span>Doanh thu ước tính</span><strong>{usd(data.totalEstimatedRevenue)}</strong></div>
          </div>

          <div className="vd-grid-2">
            {/* Vessel & Route info */}
            <div className="vd-panel">
              <div className="vd-panel__head">
                <h3 className="vd-panel__title"><Ship size={14} /> Thông tin tàu & Tuyến đường</h3>
              </div>
              <div className="vd-panel__body">
                <div className="vd-info-grid">
                  <InfoItem label="Tên tàu" value={data.vesselName} />
                  <InfoItem label="IMO" value={data.vesselIMO} />
                  <InfoItem label="Quốc tịch" value={data.vesselFlag} />
                  <InfoItem label="Hô hiệu" value={data.callSign} />
                  <InfoItem label="Loại thuê tàu" value={data.charterType} />
                  <InfoItem label="Loại hàng" value={data.cargoType} />
                  <InfoItem label="Trọng lượng" value={data.cargoWeight ? `${data.cargoWeight} MT` : undefined} />
                  <InfoItem label="Cảng trước" value={data.previousPortName} />
                  <InfoItem label="Cảng đi" value={data.departurePort} />
                  <InfoItem label="TG khởi hành" value={fmt(data.departureTime)} />
                  <InfoItem label="Cảng đến" value={data.arrivalPort} />
                  <InfoItem label="TG đến" value={fmt(data.arrivalTime)} />
                </div>
              </div>
            </div>

            {/* Timeline / status */}
            <div className="vd-panel">
              <div className="vd-panel__head">
                <h3 className="vd-panel__title"><Clock size={14} /> Lịch sử trạng thái</h3>
              </div>
              <div className="vd-panel__body">
                <div className="vd-info-grid">
                  <InfoItem label="Phê duyệt" value={fmt(data.approvedAt)} />
                  <InfoItem label="Sẵn sàng" value={fmt(data.readyAt)} />
                  <InfoItem label="Bắt đầu" value={fmt(data.commencedAt)} />
                  <InfoItem label="Đến nơi" value={fmt(data.arrivedAt)} />
                  <InfoItem label="Hoàn thành" value={fmt(data.completedAt)} />
                  <InfoItem label="Hủy" value={fmt(data.cancelledAt)} />
                </div>
                {data.statusHistory.length > 0 && (
                  <table className="vd-mini-table" style={{ marginTop: 10 }}>
                    <thead><tr><th>Từ</th><th>Đến</th><th>Người thay đổi</th><th>Thời gian</th></tr></thead>
                    <tbody>
                      {data.statusHistory.map(h => (
                        <tr key={h.id}>
                          <td>{h.fromStatus || '—'}</td>
                          <td><span className={statusClass(h.toStatus)}>{h.toStatus}</span></td>
                          <td>{h.changedBy}</td>
                          <td>{fmt(h.changedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Performance */}
          {(data.distanceTraveled || data.fuelConsumed || data.averageSpeed) && (
            <div className="vd-panel">
              <div className="vd-panel__head">
                <h3 className="vd-panel__title"><FileText size={14} /> Hiệu suất thực tế</h3>
              </div>
              <div className="vd-panel__body">
                <div className="vd-info-grid">
                  <InfoItem label="Quãng đường thực tế" value={data.distanceTraveled ? `${data.distanceTraveled} NM` : undefined} />
                  <InfoItem label="Nhiên liệu tiêu thụ" value={data.fuelConsumed ? `${data.fuelConsumed} MT` : undefined} />
                  <InfoItem label="Tốc độ TB thực" value={data.averageSpeed ? `${data.averageSpeed} kn` : undefined} />
                  <InfoItem label="Chi phí thực" value={usd(data.totalActualCost)} />
                  <InfoItem label="Doanh thu thực" value={usd(data.totalActualRevenue)} />
                  <InfoItem label="Lợi nhuận thực" value={data.actualProfitMargin !== undefined ? `${data.actualProfitMargin.toFixed(1)}%` : undefined} />
                </div>
              </div>
            </div>
          )}

          {data.voyageInstructions && (
            <div className="vd-panel">
              <div className="vd-panel__head"><h3 className="vd-panel__title">Chỉ thị hải trình</h3></div>
              <div className="vd-panel__body"><p style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{data.voyageInstructions}</p></div>
            </div>
          )}
        </>
      )}

      {/* Legs Tab */}
      {tab === 'legs' && (
        <div className="vd-panel">
          <div className="vd-panel__head">
            <h3 className="vd-panel__title"><MapPin size={14} /> Kế hoạch chặng ({data.planLegs.length})</h3>
          </div>
          <div className="vd-panel__body" style={{ padding: 0 }}>
            {data.planLegs.length === 0 ? (
              <div className="vm-empty"><p>Chưa có kế hoạch chặng nào.</p></div>
            ) : (
              <table className="vd-mini-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Loại</th>
                    <th>Từ cảng</th>
                    <th>Đến cảng</th>
                    <th>Khoảng cách</th>
                    <th>Thời gian</th>
                    <th>Tốc độ</th>
                    <th>Nhiên liệu</th>
                    <th>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {data.planLegs.map(l => (
                    <tr key={l.id}>
                      <td>{l.sequence}</td>
                      <td><span className="vm-badge">{l.legType}</span></td>
                      <td>{l.fromPortName || l.fromPortCode || '—'}</td>
                      <td>{l.toPortName || l.toPortCode || '—'}</td>
                      <td>{l.plannedDistance ? `${l.plannedDistance} NM` : '—'}</td>
                      <td>{l.plannedDurationHours ? `${l.plannedDurationHours}h` : '—'}</td>
                      <td>{l.plannedAverageSpeed ? `${l.plannedAverageSpeed} kn` : '—'}</td>
                      <td>{l.plannedFuelConsumption ? `${l.plannedFuelConsumption} MT` : '—'}</td>
                      <td>{l.notes || l.weatherRoutingNotes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Ports Tab */}
      {tab === 'ports' && (
        <div className="vd-panel">
          <div className="vd-panel__head">
            <h3 className="vd-panel__title"><Anchor size={14} /> Cảng ghé ({data.portCalls.length})</h3>
          </div>
          <div className="vd-panel__body" style={{ padding: 0 }}>
            {data.portCalls.length === 0 ? (
              <div className="vm-empty"><p>Chưa có cảng ghé nào.</p></div>
            ) : (
              <table className="vd-mini-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Loại</th>
                    <th>Cảng</th>
                    <th>Quốc gia</th>
                    <th>Đến</th>
                    <th>Rời</th>
                    <th>Bến</th>
                    <th>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {data.portCalls.map(p => (
                    <tr key={p.id}>
                      <td>{p.sequence}</td>
                      <td><span className="vm-badge">{p.callType}</span></td>
                      <td><strong>{p.portName}</strong> <span style={{ color: '#6b7c8f', fontSize: 11 }}>({p.portCode})</span></td>
                      <td>{p.country || '—'}</td>
                      <td>{fmt(p.arrivalTime)}</td>
                      <td>{fmt(p.departureTime)}</td>
                      <td>{p.berthNumber || '—'}</td>
                      <td>{p.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Cargo & Bunker Tab */}
      {tab === 'cargo' && (
        <>
          <div className="vd-panel">
            <div className="vd-panel__head">
              <h3 className="vd-panel__title"><Package size={14} /> Kế hoạch hàng hóa ({data.cargoPlans?.length || 0})</h3>
            </div>
            <div className="vd-panel__body" style={{ padding: 0 }}>
              {(!data.cargoPlans || data.cargoPlans.length === 0) ? (
                <div className="vm-empty"><p>Chưa có cargo plan.</p></div>
              ) : (
                <table className="vd-mini-table">
                  <thead>
                    <tr><th>#</th><th>Loại NV</th><th>Hàng hóa</th><th>SL kế hoạch</th><th>Đơn vị</th><th>Cảng</th><th>Shipper</th><th>Consignee</th></tr>
                  </thead>
                  <tbody>
                    {data.cargoPlans.map(cp => (
                      <tr key={cp.id}>
                        <td>{cp.sequence}</td>
                        <td><span className="vm-badge">{cp.operationType}</span></td>
                        <td>{cp.cargoType}</td>
                        <td>{cp.plannedQuantity.toLocaleString()}</td>
                        <td>{cp.unit}</td>
                        <td>{cp.portName || '—'}</td>
                        <td>{cp.shipperName || '—'}</td>
                        <td>{cp.consigneeName || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="vd-panel">
            <div className="vd-panel__head">
              <h3 className="vd-panel__title"><Fuel size={14} /> Kế hoạch Bunker ({data.bunkerPlans?.length || 0})</h3>
            </div>
            <div className="vd-panel__body" style={{ padding: 0 }}>
              {(!data.bunkerPlans || data.bunkerPlans.length === 0) ? (
                <div className="vm-empty"><p>Chưa có bunker plan.</p></div>
              ) : (
                <table className="vd-mini-table">
                  <thead>
                    <tr><th>#</th><th>Loại nhiên liệu</th><th>Nghiệp vụ</th><th>Số lượng</th><th>Cảng</th><th>CP ước tính</th><th>Nhà cung cấp</th></tr>
                  </thead>
                  <tbody>
                    {data.bunkerPlans.map(bp => (
                      <tr key={bp.id}>
                        <td>{bp.sequence}</td>
                        <td>{bp.fuelType}</td>
                        <td><span className="vm-badge">{bp.operationType}</span></td>
                        <td>{bp.plannedQuantity.toLocaleString()}</td>
                        <td>{bp.portName || '—'}</td>
                        <td>{bp.estimatedCostUsd ? usd(bp.estimatedCostUsd) : '—'}</td>
                        <td>{bp.supplierName || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {data.crewChangePlans && data.crewChangePlans.length > 0 && (
            <div className="vd-panel">
              <div className="vd-panel__head">
                <h3 className="vd-panel__title"><Users size={14} /> Kế hoạch thay đổi crew ({data.crewChangePlans.length})</h3>
              </div>
              <div className="vd-panel__body" style={{ padding: 0 }}>
                <table className="vd-mini-table">
                  <thead>
                    <tr><th>#</th><th>Loại</th><th>Cảng</th><th>Ngày dự kiến</th><th>Lý do</th></tr>
                  </thead>
                  <tbody>
                    {data.crewChangePlans.map(ccp => (
                      <tr key={ccp.id}>
                        <td>{ccp.sequence}</td>
                        <td><span className="vm-badge">{ccp.changeType}</span></td>
                        <td>{ccp.portName || '—'}</td>
                        <td>{fmtDate(ccp.plannedDate)}</td>
                        <td>{ccp.replacementReason || ccp.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Financial Tab */}
      {tab === 'financial' && (
        <>
          {/* Summary KPIs */}
          <div className="vd-kpi-row">
            <div className="vd-kpi"><span>CP ước tính</span><strong>{usd(data.totalEstimatedCost)}</strong></div>
            <div className="vd-kpi"><span>DT ước tính</span><strong>{usd(data.totalEstimatedRevenue)}</strong></div>
            <div className="vd-kpi"><span>LN ước tính</span><strong className={data.estimatedProfitMargin && data.estimatedProfitMargin >= 0 ? 'is-success' : 'is-danger'}>{data.estimatedProfitMargin !== undefined ? `${data.estimatedProfitMargin.toFixed(1)}%` : '—'}</strong></div>
            <div className="vd-kpi"><span>CP thực tế</span><strong>{usd(data.totalActualCost)}</strong></div>
            <div className="vd-kpi"><span>DT thực tế</span><strong>{usd(data.totalActualRevenue)}</strong></div>
            <div className="vd-kpi"><span>LN thực tế</span><strong className={data.actualProfitMargin && data.actualProfitMargin >= 0 ? 'is-success' : 'is-danger'}>{data.actualProfitMargin !== undefined ? `${data.actualProfitMargin.toFixed(1)}%` : '—'}</strong></div>
          </div>

          <div className="vd-grid-2">
            {/* Cost Estimates */}
            <div className="vd-panel">
              <div className="vd-panel__head"><h3 className="vd-panel__title">Chi phí ước tính ({data.costEstimates?.length || 0})</h3></div>
              <div className="vd-panel__body" style={{ padding: 0 }}>
                {(!data.costEstimates || data.costEstimates.length === 0) ? (
                  <div className="vm-empty"><p>Chưa có chi phí ước tính.</p></div>
                ) : (
                  <table className="vd-mini-table">
                    <thead><tr><th>Danh mục</th><th>Mô tả</th><th style={{textAlign:'right'}}>Số tiền</th></tr></thead>
                    <tbody>
                      {data.costEstimates.map(c => (
                        <tr key={c.id}><td>{c.costCategory}</td><td>{c.description || '—'}</td><td style={{textAlign:'right'}}>{usd(c.estimatedAmount)}</td></tr>
                      ))}
                      <tr style={{ fontWeight: 700, background: '#f4f8fc' }}>
                        <td colSpan={2}>Tổng</td>
                        <td style={{textAlign:'right'}}>{usd(data.costEstimates.reduce((s, c) => s + c.estimatedAmount, 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Revenue Estimates */}
            <div className="vd-panel">
              <div className="vd-panel__head"><h3 className="vd-panel__title">Doanh thu ước tính ({data.revenueEstimates?.length || 0})</h3></div>
              <div className="vd-panel__body" style={{ padding: 0 }}>
                {(!data.revenueEstimates || data.revenueEstimates.length === 0) ? (
                  <div className="vm-empty"><p>Chưa có doanh thu ước tính.</p></div>
                ) : (
                  <table className="vd-mini-table">
                    <thead><tr><th>Danh mục</th><th>Mô tả</th><th style={{textAlign:'right'}}>Số tiền</th></tr></thead>
                    <tbody>
                      {data.revenueEstimates.map(r => (
                        <tr key={r.id}><td>{r.revenueCategory}</td><td>{r.description || '—'}</td><td style={{textAlign:'right'}}>{usd(r.estimatedAmount)}</td></tr>
                      ))}
                      <tr style={{ fontWeight: 700, background: '#f4f8fc' }}>
                        <td colSpan={2}>Tổng</td>
                        <td style={{textAlign:'right'}}>{usd(data.revenueEstimates.reduce((s, r) => s + r.estimatedAmount, 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Actual financials */}
          {(data.expenseRequests?.length > 0 || data.disbursements?.length > 0 || data.actualRevenues?.length > 0) && (
            <>
              {data.disbursements?.length > 0 && (
                <div className="vd-panel">
                  <div className="vd-panel__head"><h3 className="vd-panel__title">Giải ngân thực tế ({data.disbursements.length})</h3></div>
                  <div className="vd-panel__body" style={{ padding: 0 }}>
                    <table className="vd-mini-table">
                      <thead><tr><th>Số</th><th>Danh mục</th><th>NCC</th><th>Hóa đơn</th><th>Trạng thái</th><th style={{textAlign:'right'}}>Số tiền</th></tr></thead>
                      <tbody>
                        {data.disbursements.map(d => (
                          <tr key={d.id}>
                            <td>{d.disbursementNumber}</td>
                            <td>{d.costCategory}</td>
                            <td>{d.vendorName || '—'}</td>
                            <td>{d.invoiceNumber || '—'}</td>
                            <td><span className={statusClass(d.status)}>{d.status}</span></td>
                            <td style={{textAlign:'right'}}>{usd(d.amountUsd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {data.actualRevenues?.length > 0 && (
                <div className="vd-panel">
                  <div className="vd-panel__head"><h3 className="vd-panel__title">Doanh thu thực tế ({data.actualRevenues.length})</h3></div>
                  <div className="vd-panel__body" style={{ padding: 0 }}>
                    <table className="vd-mini-table">
                      <thead><tr><th>Số</th><th>Danh mục</th><th>Người trả</th><th>Trạng thái</th><th style={{textAlign:'right'}}>Số tiền</th></tr></thead>
                      <tbody>
                        {data.actualRevenues.map(r => (
                          <tr key={r.id}>
                            <td>{r.revenueNumber}</td>
                            <td>{r.revenueCategory}</td>
                            <td>{r.payerName || '—'}</td>
                            <td><span className={statusClass(r.status)}>{r.status}</span></td>
                            <td style={{textAlign:'right'}}>{usd(r.amountUsd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {data.settlements?.length > 0 && (
                <div className="vd-panel">
                  <div className="vd-panel__head"><h3 className="vd-panel__title">Quyết toán ({data.settlements.length})</h3></div>
                  <div className="vd-panel__body">
                    {data.settlements.map(s => (
                      <div key={s.id} className="vd-info-grid" style={{ marginBottom: 8 }}>
                        <InfoItem label="Số quyết toán" value={s.settlementNumber} />
                        <InfoItem label="Trạng thái" value={s.status} />
                        <InfoItem label="Tổng CP duyệt" value={usd(s.totalExpenseApproved)} />
                        <InfoItem label="Tổng giải ngân" value={usd(s.totalDisbursed)} />
                        <InfoItem label="Tổng doanh thu" value={usd(s.totalRevenue)} />
                        <InfoItem label="Kết quả" value={usd(s.netResult)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

function InfoItem({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="vd-info-item">
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}
