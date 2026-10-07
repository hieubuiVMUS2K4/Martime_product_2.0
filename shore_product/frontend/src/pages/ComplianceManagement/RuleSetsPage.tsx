import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useComplianceRuleSets, useComplianceRules } from '../../hooks/useCompliance';
import { complianceRuleSetApi, complianceRuleApi } from '../../services/compliance.service';
import type { CreateRuleSetRequest, ComplianceRuleSet, ComplianceRule } from '../../types/compliance.types';
import { RuleSeverity } from '../../types/compliance.types';
import './RuleSetsPage.css';
import { useConfirm } from '@/components/common/ConfirmDialog';

const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

const severityClass = (s: string) => {
  if (s === RuleSeverity.BLOCKER) return 'blocker';
  if (s === RuleSeverity.WARNING) return 'warning';
  return 'info';
};

// ============================================================
// RuleSetCard — expandable card showing rules inside
// ============================================================

const RuleSetCard: React.FC<{
  ruleSet: ComplianceRuleSet;
  onDeleted: () => void;
}> = ({ ruleSet, onDeleted }) => {
  const ask = useConfirm();
  const [expanded, setExpanded] = useState(false);
  const { data: rules, loading } = useComplianceRules(expanded ? ruleSet.id : undefined);

  const handleDelete = async () => {
    if (!await ask(`Xóa bộ quy tắc "${ruleSet.name}"?`)) return;
    await complianceRuleSetApi.delete(ruleSet.id);
    onDeleted();
  };

  const handleDeleteRule = async (rule: ComplianceRule) => {
    if (!await ask(`Xóa quy tắc "${rule.title}"?`)) return;
    await complianceRuleApi.delete(rule.id);
    onDeleted();
  };

  return (
    <div className={`ruleset-card ${ruleSet.isActive ? '' : 'inactive'}`}>
      <div className="ruleset-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="ruleset-info">
          <h3>{ruleSet.name}</h3>
          {ruleSet.code && <span className="ruleset-code">{ruleSet.code}</span>}
          {ruleSet.authority && <span className="ruleset-authority">{ruleSet.authority}</span>}
          {!ruleSet.isActive && <span className="badge-inactive">Inactive</span>}
        </div>
        <div className="ruleset-meta">
          <span className="rule-count">{ruleSet.ruleCount} rules</span>
          <span className="dates">{fmt(ruleSet.effectiveFrom)} → {fmt(ruleSet.effectiveTo)}</span>
          <button className="icon-btn danger" onClick={e => { e.stopPropagation(); handleDelete(); }} title="Xóa">
            <Trash2 size={14} />
          </button>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {expanded && (
        <div className="ruleset-card-body">
          {ruleSet.description && <p className="ruleset-desc">{ruleSet.description}</p>}
          {loading ? (
            <p className="loading-inline">Đang tải rules...</p>
          ) : rules.length === 0 ? (
            <p className="empty-inline">Chưa có rule nào.</p>
          ) : (
            <table className="rules-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Stage</th>
                  <th>Waiver</th>
                  <th>Dimensions</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id}>
                    <td>
                      <strong>{rule.title}</strong>
                      {rule.description && <div className="rule-desc">{rule.description}</div>}
                    </td>
                    <td>{rule.requirementType}</td>
                    <td>
                      <span className={`severity-badge ${severityClass(rule.severity)}`}>
                        {rule.severity}
                      </span>
                    </td>
                    <td>{rule.evaluationStage}</td>
                    <td>{rule.waiverAllowed ? 'Có' : 'Không'}</td>
                    <td>{rule.dimensions.length}</td>
                    <td>
                      <button className="icon-btn danger" onClick={() => handleDeleteRule(rule)} title="Xóa">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// CreateRuleSetForm — inline form
// ============================================================

const CreateRuleSetForm: React.FC<{ onCreated: () => void; onCancel: () => void }> = ({ onCreated, onCancel }) => {
  const [form, setForm] = useState<CreateRuleSetRequest>({ name: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await complianceRuleSetApi.create(form);
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="create-form" onSubmit={handleSubmit}>
      <h3>Tạo Rule Set mới</h3>
      <div className="form-grid">
        <div className="form-group">
          <label>Tên *</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="form-group">
          <label>Mã (Code)</label>
          <input value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Cơ quan ban hành</label>
          <input value={form.authority || ''} onChange={e => setForm({ ...form, authority: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Hiệu lực từ</label>
          <input type="date" value={form.effectiveFrom || ''} onChange={e => setForm({ ...form, effectiveFrom: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Hiệu lực đến</label>
          <input type="date" value={form.effectiveTo || ''} onChange={e => setForm({ ...form, effectiveTo: e.target.value })} />
        </div>
      </div>
      <div className="form-group full">
        <label>Mô tả</label>
        <textarea value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
      </div>
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Hủy</button>
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Tạo'}</button>
      </div>
    </form>
  );
};

// ============================================================
// RuleSetsPage — main page
// ============================================================

export const RuleSetsPage: React.FC = () => {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const { data: ruleSets, loading, error, refetch } = useComplianceRuleSets(includeInactive);

  if (loading) return <div className="loading-state">Đang tải rule sets...</div>;
  if (error) return <div className="error-state">Lỗi: {error}</div>;

  return (
    <div className="rulesets-page">
      <div className="rulesets-header">
        <button className="btn-back" onClick={() => navigate('/compliance')}>
          <ArrowLeft size={16} /> Quay lại
        </button>
        <h1>Compliance Rule Sets</h1>
        <div className="rulesets-header-actions">
          <label className="toggle-label">
            <input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} />
            Hiện inactive
          </label>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Tạo Rule Set
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateRuleSetForm
          onCreated={() => { setShowCreate(false); refetch(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="rulesets-list">
        {ruleSets.length === 0 ? (
          <div className="empty-state">
            <p>Chưa có rule set nào.</p>
          </div>
        ) : (
          ruleSets.map(rs => (
            <RuleSetCard key={rs.id} ruleSet={rs} onDeleted={refetch} />
          ))
        )}
      </div>
    </div>
  );
};
