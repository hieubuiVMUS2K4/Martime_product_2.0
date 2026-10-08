import { memo, useCallback } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MaintenanceTask, parseTaskScheduleInfo, CrewMember } from '../../types/maritime.types'
import { format, parseISO } from 'date-fns'
import { Calendar, Package, UserCircle, ListChecks, AlertTriangle, Clock, Shield, RotateCcw, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

interface KanbanCardProps {
  task: MaintenanceTask
  onClick: () => void
  isDragging?: boolean
  onAssignChange?: (taskId: string, crewId: string | null) => Promise<void>
  crewList?: CrewMember[]  // Receive from parent to avoid N+1 API calls
  isLoadingCrew?: boolean
}

// Memoized component to prevent unnecessary re-renders
export const KanbanCard = memo(function KanbanCard({ 
  task, 
  onClick, 
  isDragging = false, 
  onAssignChange,
  crewList = [],
  isLoadingCrew = false
}: KanbanCardProps) {
  const navigate = useNavigate()
  const scheduleInfo = parseTaskScheduleInfo(task)
  const [isAssigning, setIsAssigning] = useState(false)
  const [showAssignDropdown, setShowAssignDropdown] = useState(false)

  const handleAssignChange = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation() // Prevent card click
    const crewId = e.target.value || null
    if (onAssignChange) {
      setIsAssigning(true)
      try {
        await onAssignChange(task.id, crewId)
      } finally {
        setIsAssigning(false)
      }
    }
  }, [onAssignChange, task.id])
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ 
    id: task.id,
    disabled: false // Allow all cards to be dragged, validation handles restrictions
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const getStatusConfig = () => {
    switch (task.status) {
      case 'SCHEDULED': return {
        bg: 'bg-slate-50',
        text: 'text-slate-700',
        dot: 'bg-slate-500',
        label: 'Scheduled'
      }
      case 'DUE': return { 
        bg: 'bg-blue-50', 
        text: 'text-blue-700',
        dot: 'bg-blue-500',
        label: 'Due' 
      }
      case 'MISSING_BOTH': return {
        bg: 'bg-red-50',
        text: 'text-red-700',
        dot: 'bg-red-600',
        label: '⚠️ Missing Checklist & PIC'
      }
      case 'MISSING_CHECKLIST': return {
        bg: 'bg-red-50',
        text: 'text-red-700',
        dot: 'bg-red-500',
        label: '⚠️ Missing Checklist'
      }
      case 'MISSING_PIC': return {
        bg: 'bg-orange-50',
        text: 'text-orange-700',
        dot: 'bg-orange-500',
        label: '⚠️ Missing PIC'
      }
      case 'PENDING_APPROVAL': return {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        dot: 'bg-amber-500',
        label: 'Pending Approval'
      }
      case 'PENDING': return { 
        bg: 'bg-blue-50', 
        text: 'text-blue-700',
        dot: 'bg-blue-500',
        label: 'Pending' 
      }
      case 'REJECTED': return {
        bg: 'bg-yellow-50',
        text: 'text-yellow-700',
        dot: 'bg-yellow-500',
        label: 'Rejected'
      }
      case 'RECTIFY': return {
        bg: 'bg-pink-50',
        text: 'text-pink-700',
        dot: 'bg-pink-500',
        label: 'Rectify'
      }
      case 'OVERDUE': return { 
        bg: 'bg-red-50', 
        text: 'text-red-700',
        dot: 'bg-red-500',
        label: 'Overdue' 
      }
      case 'IN_PROGRESS': return { 
        bg: 'bg-purple-50', 
        text: 'text-purple-700',
        dot: 'bg-purple-500',
        label: 'In Progress' 
      }
      case 'COMPLETED': return { 
        bg: 'bg-green-50', 
        text: 'text-green-700',
        dot: 'bg-green-500',
        label: 'Complete' 
      }
      case 'CANCELLED': return {
        bg: 'bg-gray-50',
        text: 'text-gray-700',
        dot: 'bg-gray-500',
        label: 'Cancelled'
      }
      default: return { 
        bg: 'bg-gray-50', 
        text: 'text-gray-700',
        dot: 'bg-gray-500',
        label: 'Unknown' 
      }
    }
  }

  const getPriorityConfig = () => {
    switch (task.priority) {
      case 'CRITICAL': return { badge: 'bg-red-500 text-white', label: 'High' }
      case 'HIGH': return { badge: 'bg-orange-500 text-white', label: 'High' }
      case 'NORMAL': return { badge: 'bg-yellow-100 text-yellow-800', label: 'Medium' }
      case 'LOW': return { badge: 'bg-blue-100 text-blue-800', label: 'Low' }
      default: return { badge: 'bg-gray-100 text-gray-800', label: 'Low' }
    }
  }

  const status = getStatusConfig()
  const priority = getPriorityConfig()

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`
        bg-white rounded-lg p-3 
        border border-indigo-300
        shadow
        transition-all duration-200
        cursor-grab active:cursor-grabbing 
        hover:shadow-lg hover:border-indigo-400
        ${isDragging ? 'shadow-xl scale-105 opacity-60 rotate-2' : ''}
      `}
    >
      {/* Status Badge */}
      <div className="mb-2 flex flex-wrap gap-1">
        <span className={`inline-flex items-center gap-1 ${status.bg} ${status.text} px-2 py-0.5 rounded text-xs font-medium`}>
          <div className={`w-1 h-1 rounded-full ${status.dot}`} />
          {status.label}
        </span>
        
        {/* PMS Workflow v2.0 Indicators */}
        {task.hasPendingDeferral && (
          <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs font-medium">
            <Clock className="w-2.5 h-2.5" />
            Deferral
          </span>
        )}
        
        {task.isCms && (
          <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-medium">
            <Shield className="w-2.5 h-2.5" />
            CMS
          </span>
        )}
        
        {task.rejectionCount > 0 && (
          <span className="inline-flex items-center gap-1 bg-pink-100 text-pink-800 px-2 py-0.5 rounded text-xs font-medium">
            <RotateCcw className="w-2.5 h-2.5" />
            ×{task.rejectionCount}
          </span>
        )}
      </div>

      {/* Schedule Info (if auto-generated) */}
      {scheduleInfo.isAutoGenerated && scheduleInfo.scheduleCode && (
        <div className="mb-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              navigate('/pms/work-planning')
            }}
            className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-xs font-medium hover:bg-purple-100 transition-colors max-w-full"
            title={scheduleInfo.scheduleCode}
          >
            <Package className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="truncate">{scheduleInfo.scheduleCode}</span>
          </button>
        </div>
      )}

      {/* Title - Show Group Name if available, otherwise Equipment Name */}
      <h4 className="font-semibold text-gray-900 text-sm leading-tight mb-1 line-clamp-2">
        {task.equipmentGroupName || task.equipmentName}
      </h4>

      {/* Checklist Badge for Group Tasks */}
      {task.equipmentGroupId && task.checklistItems && (
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-medium">
            <ListChecks className="w-3 h-3" />
            {task.checklistItems.filter(item => item.isCompleted).length}/{task.checklistItems.length} assets
          </span>
          {task.checklistItems.some(item => item.isAbnormal && !item.isCompleted) && (
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-xs font-medium">
              <AlertTriangle className="w-3 h-3" />
              Abnormal
            </span>
          )}
        </div>
      )}

      {/* Subtitle - Show legacy equipment name if exists (backward compat) */}
      {task.equipmentGroupId && task.equipmentName && (
        <p className="text-xs text-gray-600 mb-2 flex items-center gap-1">
          <Package className="w-3 h-3 flex-shrink-0" />
          <span className="truncate" title={task.equipmentName}>Legacy: {task.equipmentName}</span>
        </p>
      )}

      {/* Description */}
      <p className="text-xs text-gray-500 mb-3 line-clamp-2 leading-relaxed">
        {task.taskDescription}
      </p>

      {/* Assignees with Quick Assign Dropdown */}
      <div className="flex items-center gap-1.5 mb-3 min-w-0">
        <UserCircle className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
        <span className="text-xs text-gray-600 font-medium flex-shrink-0">Assigned:</span>
        {isLoadingCrew ? (
          <span className="text-xs text-gray-400 italic">Loading...</span>
        ) : (
          <div className="relative flex-1 min-w-0 group">
            {task.assignedTo ? (
              <>
                {/* Display selected crew with truncate */}
                <button
                  type="button"
                  className="text-xs text-gray-900 font-medium truncate hover:text-indigo-600 flex items-center gap-0.5 w-full text-left transition-all group-hover:opacity-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowAssignDropdown(!showAssignDropdown)
                  }}
                  title={`${crewList.find(c => c.crewId === task.assignedTo)?.fullName || ''} (${(() => { const r = crewList.find(c => c.crewId === task.assignedTo)?.rank; return r ? (typeof r === 'object' ? r.rankName : r) : ''; })()}) - Click to change`}
                >
                  <span className="truncate">
                    {crewList.find(c => c.crewId === task.assignedTo)?.fullName || task.assignedTo} ({(() => { const r = crewList.find(c => c.crewId === task.assignedTo)?.rank; return r ? (typeof r === 'object' ? r.rankName : r) : ''; })()})
                  </span>
                  <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
                {/* Scrolling text on hover - replaces truncated text */}
                <div className="absolute left-0 top-0 bottom-0 bg-white overflow-hidden whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 w-full flex items-center pointer-events-none">
                  <div className="inline-block text-xs text-indigo-600 font-medium">
                    <span className="inline-block animate-marquee">
                      {crewList.find(c => c.crewId === task.assignedTo)?.fullName} ({(() => { const r = crewList.find(c => c.crewId === task.assignedTo)?.rank; return r ? (typeof r === 'object' ? r.rankName : r) : ''; })()})
                      &nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;
                      {crewList.find(c => c.crewId === task.assignedTo)?.fullName} ({(() => { const r = crewList.find(c => c.crewId === task.assignedTo)?.rank; return r ? (typeof r === 'object' ? r.rankName : r) : ''; })()})
                    </span>
                  </div>
                </div>
                {/* Dropdown menu */}
                {showAssignDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowAssignDropdown(false)
                      }}
                    />
                    <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-20 max-h-48 overflow-y-auto">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAssignChange({ target: { value: '' } } as any)
                          setShowAssignDropdown(false)
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 text-gray-400 italic"
                      >
                        Unassign
                      </button>
                      {crewList.map((crew) => (
                        <button
                          key={crew.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAssignChange({ target: { value: crew.crewId } } as any)
                            setShowAssignDropdown(false)
                          }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 transition-colors ${
                            crew.crewId === task.assignedTo ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                          }`}
                        >
                          {crew.fullName} ({typeof crew.rank === 'object' ? crew.rank?.rankName : crew.rank})
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <select
                value=""
                onChange={handleAssignChange}
                onClick={(e) => e.stopPropagation()}
                disabled={isAssigning}
                className="text-xs text-gray-400 italic bg-transparent border-0 p-0 pr-4 focus:ring-0 focus:outline-none cursor-pointer hover:text-indigo-600 disabled:opacity-50 w-full appearance-none"
              >
                <option value="">Select crew...</option>
                {crewList.map((crew) => (
                  <option key={crew.id} value={crew.crewId}>
                    {crew.fullName} ({typeof crew.rank === 'object' ? crew.rank?.rankName : crew.rank})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
        {/* Due Date */}
        <div className="flex items-center gap-1 text-gray-600">
          <Calendar className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">
            {format(parseISO(task.nextDueAt), 'dd MMM yyyy')}
          </span>
        </div>

        {/* Priority Badge */}
        <span className={`${priority.badge} px-2 py-0.5 rounded text-xs font-semibold`}>
          {priority.label}
        </span>
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison for memo - only re-render if these change
  return (
    prevProps.task.id === nextProps.task.id &&
    prevProps.task.status === nextProps.task.status &&
    prevProps.task.assignedTo === nextProps.task.assignedTo &&
    prevProps.task.priority === nextProps.task.priority &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isLoadingCrew === nextProps.isLoadingCrew &&
    (prevProps.crewList?.length || 0) === (nextProps.crewList?.length || 0)
  )
})
