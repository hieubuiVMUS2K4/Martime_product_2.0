import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, AlertOctagon, BrainCircuit } from 'lucide-react';
import { ENV } from '../../config/env';

interface IAiInsight {
  status: 'Normal' | 'Warning' | 'Critical' | 'Unavailable';
  contentVi: string;
}

export const AIInsights = ({ reportId }: { reportId: string }) => {
  const [insight, setInsight] = useState<IAiInsight | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setInsight(null);
    fetch(`${ENV.API_BASE_URL}/reports/${reportId}/ai-insights`)
      .then(res => res.ok ? res.json() : null)
      .then((data: IAiInsight | null) => setInsight(data && typeof data.contentVi === 'string' ? data : null))
      .catch(() => setInsight(null))
      .finally(() => setLoading(false));
  }, [reportId]);

  if (loading) return <div className="animate-pulse bg-gray-200 h-16 rounded-md mb-4 w-full max-w-2xl"></div>;
  if (!insight) return null;

  const getStyle = () => {
    switch(insight.status) {
      case 'Unavailable': return { color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', icon: <AlertTriangle size={20} /> };
      case 'Critical': return { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: <AlertOctagon size={20} /> };
      case 'Warning': return { color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', icon: <AlertTriangle size={20} /> };
      case 'Normal': return { color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: <CheckCircle size={20} /> };
      default: return { color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', icon: <AlertTriangle size={20} /> };
    }
  };

  const style = getStyle();

  return (
    <div className={`flex items-start gap-4 p-4 rounded-lg border ${style.border} ${style.bg} mb-4 shadow-sm w-full max-w-4xl`}>
      <div className={`mt-1 ${style.color}`}>
        {style.icon}
      </div>
      <div className="flex-1">
        <h4 className={`font-semibold flex items-center gap-2 ${style.color} mb-1`}>
          <BrainCircuit size={18}/> Phân tích từ AI Hệ thống bờ (Shore)
        </h4>
        <p className="text-gray-700 text-sm leading-relaxed">{insight.contentVi}</p>
      </div>
    </div>
  );
};
