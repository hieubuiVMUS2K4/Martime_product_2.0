import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { LogbookGrid } from '../../components/common/LogbookGrid';
import { toast } from 'sonner';
import { logbookService } from '../../services/logbook.service';
import type { VoyageLogEntryResponseDto } from '../../types/logbook.types';
import { VOYAGE_LOG_EVENT_TYPES } from '../../types/logbook.types';
import { 
  ArrowLeft, 
  MapPin, 
  Clock, 
  User, 
  Ship, 
  Compass, 
  Anchor,
  FileSignature,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

export const VoyageLogDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<VoyageLogEntryResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSignature, setShowSignature] = useState(false);
  const [signing, setSigning] = useState(false);
  const [masterSignature, setMasterSignature] = useState('Captain');

  useEffect(() => {
    if (id) {
      fetchEntry();
    }
  }, [id]);

  const fetchEntry = async () => {
    try {
      setLoading(true);
      const data = await logbookService.getVoyageLogEntry(id!);
      setEntry(data);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load voyage log entry');
      navigate('/logbooks/voyage');
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async (signature: string) => {
    if (!id) return;
    
    try {
      setSigning(true);
      await logbookService.signVoyageLogEntry(id, { signature });
      toast.success('Entry signed successfully!');
      setShowSignature(false);
      fetchEntry();
    } catch (error) {
      console.error(error);
      toast.error('Failed to sign entry');
    } finally {
      setSigning(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      date: date.toLocaleDateString('en-GB', { 
        weekday: 'long',
        day: '2-digit', 
        month: 'long', 
        year: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
      }),
    };
  };

  const formatCoordinate = (value: number, type: 'lat' | 'lon') => {
    const abs = Math.abs(value);
    const deg = Math.floor(abs);
    const min = ((abs - deg) * 60).toFixed(3);
    const dir = type === 'lat' 
      ? (value >= 0 ? 'N' : 'S')
      : (value >= 0 ? 'E' : 'W');
    return `${deg}° ${min}' ${dir}`;
  };

  if (loading) {
    return (
      <LogbookGrid title="Loading...">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </LogbookGrid>
    );
  }

  if (!entry) {
    return (
      <LogbookGrid title="Entry Not Found">
        <div className="text-center py-20">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">The voyage log entry was not found.</p>
          <Link to="/logbooks/voyage" className="text-blue-600 hover:underline mt-4 inline-block">
            ← Back to Voyage Log
          </Link>
        </div>
      </LogbookGrid>
    );
  }

  const eventInfo = Object.values(VOYAGE_LOG_EVENT_TYPES).find(e => e.code === entry.eventType);
  const { date, time } = formatDateTime(entry.eventDateTime);

  return (
    <LogbookGrid 
      title="Voyage Log Entry Details"
      actions={
        <div className="flex gap-3">
          <Link
            to="/logbooks/voyage"
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          {!entry.masterSignature && (
            <button
              onClick={() => setShowSignature(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <FileSignature className="w-4 h-4" />
              Sign Entry
            </button>
          )}
        </div>
      }
    >
      <div className="w-full space-y-4">
        {/* Status Banner */}
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          entry.masterSignature 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-yellow-50 border border-yellow-200'
        }`}>
          {entry.masterSignature ? (
            <>
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <div className="font-semibold text-green-800">Entry Signed</div>
                <div className="text-sm text-green-600">
                  Signed on {entry.signedAt ? new Date(entry.signedAt).toLocaleString() : 'N/A'}
                </div>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="w-6 h-6 text-yellow-600" />
              <div>
                <div className="font-semibold text-yellow-800">Draft Entry</div>
                <div className="text-sm text-yellow-600">This entry requires Master's signature</div>
              </div>
            </>
          )}
        </div>

        {/* Event Header */}
        <div 
          className="bg-white rounded-lg border-l-4 p-4 shadow-sm"
          style={{ borderLeftColor: eventInfo?.color || '#6b7280' }}
        >
          <div className="flex items-start gap-4">
            <div 
              className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl shrink-0"
              style={{ backgroundColor: `${eventInfo?.color}20` }}
            >
              {eventInfo?.icon || '📍'}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span 
                  className="px-3 py-1 rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: eventInfo?.color || '#6b7280' }}
                >
                  {entry.eventType}
                </span>
                <h2 className="operations-section-title text-sm font-bold text-gray-900">
                  {eventInfo?.nameEn || entry.eventType}
                </h2>
              </div>
              <p className="text-gray-500">{eventInfo?.nameVi}</p>
            </div>
          </div>
        </div>

        {/* Main Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Date & Time Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Date & Time</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-gray-500">Date</div>
                <div className="text-lg font-medium text-gray-900">{date}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Time (UTC)</div>
                <div className="text-lg font-medium text-gray-900">{time}</div>
              </div>
              {entry.timeZone && (
                <div>
                  <div className="text-sm text-gray-500">Time Zone</div>
                  <div className="text-lg font-medium text-gray-900">{entry.timeZone}</div>
                </div>
              )}
            </div>
          </div>

          {/* Position Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <MapPin className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Position</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-gray-500">Latitude</div>
                <div className="text-lg font-medium text-gray-900 font-mono">
                  {formatCoordinate(entry.latitude, 'lat')}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Longitude</div>
                <div className="text-lg font-medium text-gray-900 font-mono">
                  {formatCoordinate(entry.longitude, 'lon')}
                </div>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                Decimal: {entry.latitude.toFixed(6)}°, {entry.longitude.toFixed(6)}°
              </div>
            </div>
          </div>

          {/* Port Information (if applicable) */}
          {(entry.portName || entry.portLocode) && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Anchor className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Port Information</h3>
              </div>
              <div className="space-y-3">
                {entry.portName && (
                  <div>
                    <div className="text-sm text-gray-500">Port Name</div>
                    <div className="text-lg font-medium text-gray-900">{entry.portName}</div>
                  </div>
                )}
                {entry.portLocode && (
                  <div>
                    <div className="text-sm text-gray-500">UN/LOCODE</div>
                    <div className="text-lg font-medium text-gray-900 font-mono">{entry.portLocode}</div>
                  </div>
                )}
                {entry.portCountry && (
                  <div>
                    <div className="text-sm text-gray-500">Country</div>
                    <div className="text-lg font-medium text-gray-900">{entry.portCountry}</div>
                  </div>
                )}
                {entry.berthNumber && (
                  <div>
                    <div className="text-sm text-gray-500">Berth / Terminal</div>
                    <div className="text-lg font-medium text-gray-900">{entry.berthNumber}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation Info (if applicable) */}
          {(entry.courseOverGround || entry.speedOverGround || entry.distanceToGo || entry.distanceFromLast) && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Compass className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Navigation</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {entry.courseOverGround !== undefined && entry.courseOverGround !== null && (
                  <div>
                    <div className="text-sm text-gray-500">Course (COG)</div>
                    <div className="text-lg font-medium text-gray-900">{entry.courseOverGround}°</div>
                  </div>
                )}
                {entry.speedOverGround !== undefined && entry.speedOverGround !== null && (
                  <div>
                    <div className="text-sm text-gray-500">Speed (SOG)</div>
                    <div className="text-lg font-medium text-gray-900">{entry.speedOverGround} kts</div>
                  </div>
                )}
                {entry.distanceFromLast !== undefined && entry.distanceFromLast !== null && (
                  <div>
                    <div className="text-sm text-gray-500">Distance from Last</div>
                    <div className="text-lg font-medium text-gray-900">{entry.distanceFromLast.toFixed(1)} NM</div>
                  </div>
                )}
                {entry.distanceToGo !== undefined && entry.distanceToGo !== null && (
                  <div>
                    <div className="text-sm text-gray-500">Distance to Go</div>
                    <div className="text-lg font-medium text-gray-900">{entry.distanceToGo.toFixed(1)} NM</div>
                  </div>
                )}
                {entry.totalVoyageDistance !== undefined && entry.totalVoyageDistance !== null && (
                  <div className="col-span-2">
                    <div className="text-sm text-gray-500">Total Voyage Distance</div>
                    <div className="text-lg font-medium text-gray-900">{entry.totalVoyageDistance.toFixed(1)} NM</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pilot Information (if applicable) */}
          {(entry.pilotName || entry.pilotStation) && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <User className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Pilot Information</h3>
              </div>
              <div className="space-y-3">
                {entry.pilotName && (
                  <div>
                    <div className="text-sm text-gray-500">Pilot Name</div>
                    <div className="text-lg font-medium text-gray-900">{entry.pilotName}</div>
                  </div>
                )}
                {entry.pilotStation && (
                  <div>
                    <div className="text-sm text-gray-500">Pilot Station</div>
                    <div className="text-lg font-medium text-gray-900">{entry.pilotStation}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Officer & Entry Info */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Ship className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Entry Information</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-gray-500">Officer on Watch</div>
                <div className="text-lg font-medium text-gray-900">{entry.officerOnWatch}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Created At</div>
                <div className="text-sm text-gray-600">
                  {new Date(entry.createdAt).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Origin Node</div>
                <div className="text-sm text-gray-600 font-mono">{entry.originNode}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Sync Status</div>
                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                  entry.isSynced 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {entry.isSynced ? '✓ Synced' : '⏳ Pending'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Remarks */}
        {entry.remarks && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Remarks</h3>
            <div className="bg-gray-50 rounded-lg p-4 text-gray-700 whitespace-pre-wrap">
              {entry.remarks}
            </div>
          </div>
        )}

        {/* Signature Section */}
        {entry.masterSignature && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Master's Signature</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <div className="font-medium text-gray-900">Digitally Signed</div>
                  <div className="text-sm text-gray-500">
                    {entry.signedAt && `Signed on ${new Date(entry.signedAt).toLocaleString()}`}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Entry ID Footer */}
        <div className="text-center text-xs text-gray-400 py-4">
          Entry ID: {entry.id}
        </div>
      </div>

      {/* Signature Modal */}
      {showSignature && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-4">
            <h3 className="text-xl font-bold text-gray-900 mb-4 font-sans">Sign Voyage Log Entry</h3>
            
            <div className="mb-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-800 font-sans">
              <strong>Note:</strong> By signing this entry, you confirm that all information 
              recorded is accurate and complete according to maritime regulations.
            </div>

            <div className="mb-6">
              <label className="text-blue-600 font-sans text-sm font-semibold block mb-2">
                Master Signature *
              </label>
              <input
                type="text"
                value={masterSignature}
                onChange={e => setMasterSignature(e.target.value)}
                className="w-full bg-white border border-gray-300 text-gray-900 font-sans p-3 rounded-lg focus:border-blue-500 focus:outline-none"
                placeholder="Enter master's name"
                autoFocus
              />
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowSignature(false);
                  setMasterSignature('Captain');
                }}
                className="px-6 py-1.5 border border-gray-300 text-gray-700 font-sans font-semibold rounded-lg hover:bg-gray-50"
                disabled={signing}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!masterSignature.trim()) {
                    toast.error("Master signature is required");
                    return;
                  }
                  handleSign(masterSignature.trim());
                }}
                className="px-6 py-1.5 bg-green-600 text-white font-sans font-semibold rounded-lg hover:bg-green-700"
                disabled={signing}
              >
                ✓ Sign Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </LogbookGrid>
  );
};
