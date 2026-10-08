import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { format, parseISO } from 'date-fns'

interface CustomTask {
  id: string
  title: string
  description: string
  tag: string
  createdAt: string
}

interface CustomKanbanCardProps {
  task: CustomTask
  onClick: () => void
  isDragging?: boolean
}

const TAG_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  'in-research': {
    label: 'In Research',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    dot: 'bg-orange-500'
  },
  'review': {
    label: 'Review',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    dot: 'bg-purple-500'
  },
  'on-track': {
    label: 'On Track',
    bg: 'bg-pink-50',
    text: 'text-pink-700',
    dot: 'bg-pink-500'
  },
  'blocked': {
    label: 'Blocked',
    bg: 'bg-red-50',
    text: 'text-red-700',
    dot: 'bg-red-500'
  },
  'planning': {
    label: 'Planning',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    dot: 'bg-blue-500'
  },
  'testing': {
    label: 'Testing',
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    dot: 'bg-yellow-500'
  }
}

export function CustomKanbanCard({ task, onClick, isDragging = false }: CustomKanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ 
    id: task.id,
    disabled: false
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const tagConfig = TAG_CONFIG[task.tag] || TAG_CONFIG['planning']

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
      title="Click to view details • Drag to move between custom columns"
    >
      {/* Tag Badge */}
      <div className="mb-2">
        <span className={`inline-flex items-center gap-1 ${tagConfig.bg} ${tagConfig.text} px-2 py-0.5 rounded text-xs font-medium`}>
          <div className={`w-1 h-1 rounded-full ${tagConfig.dot}`} />
          {tagConfig.label}
        </span>
      </div>

      {/* Title */}
      <h4 className="font-semibold text-gray-900 text-sm leading-tight mb-2 line-clamp-2">
        {task.title}
      </h4>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}

      {/* Footer - Created Date */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
        <div className="flex items-center gap-1 text-gray-500">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-medium">
            {format(parseISO(task.createdAt), 'dd MMM yyyy')}
          </span>
        </div>
        
        <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded">
          CUSTOM
        </span>
      </div>
    </div>
  )
}
