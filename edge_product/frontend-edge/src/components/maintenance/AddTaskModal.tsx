import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface AddTaskModalProps {
  isOpen: boolean
  onClose: () => void
  onTaskAdded: () => void
}

interface CrewMember {
  id: number
  crewId: string
  fullName: string
  rank?: string | { rankName?: string }
}

interface TaskType {
  id: number
  typeCode: string
  typeName: string
  category: string
  defaultPriority: string
  description?: string
}

const PRIORITIES = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'LOW', label: 'Low' }
]

export const AddTaskModal: React.FC<AddTaskModalProps> = ({ isOpen, onClose, onTaskAdded }) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([])
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([])
  const [selectedTaskType, setSelectedTaskType] = useState<TaskType | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    taskTypeId: 0,
    taskDescription: '',
    intervalDays: 7,
    nextDueAt: '',
    priority: 'NORMAL',
    assignedTo: '',
    notes: ''
  })

  // Load crew members and task types
  useEffect(() => {
    if (isOpen) {
      loadCrewMembers()
      loadTaskTypes()
      // Set default due date to 7 days from now
      const nextWeek = new Date()
      nextWeek.setDate(nextWeek.getDate() + 7)
      setFormData(prev => ({
        ...prev,
        nextDueAt: nextWeek.toISOString().split('T')[0]
      }))
    }
  }, [isOpen])

  const loadCrewMembers = async () => {
    try {
      // Fetch all crew members (no pagination limit for dropdown)
      const response = await fetch('/api/crew?pageSize=1000')
      if (!response.ok) throw new Error('Failed to load crew members')
      const result = await response.json()
      
      // Handle paginated response format
      const data = result.data || result
      setCrewMembers(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Error loading crew members:', err)
    }
  }

  const loadTaskTypes = async () => {
    try {
      const response = await fetch('/api/maintenance/task-types')
      if (!response.ok) throw new Error('Failed to load task types')
      const data = await response.json()
      setTaskTypes(data)
    } catch (err) {
      console.error('Error loading task types:', err)
      setError('Failed to load task types')
    }
  }

  const handleTaskTypeChange = (taskTypeId: number) => {
    const taskType = taskTypes.find(t => t.id === taskTypeId)
    setSelectedTaskType(taskType || null)
    setFormData({
      ...formData,
      taskTypeId,
      priority: taskType?.defaultPriority || 'NORMAL',
      taskDescription: taskType?.description || ''
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validation
    if (!formData.taskTypeId || formData.taskTypeId === 0) {
      setError('Task Type is required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/maintenance/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskTypeId: formData.taskTypeId,
          taskDescription: formData.taskDescription || null,
          intervalDays: formData.intervalDays || null,
          nextDueAt: formData.nextDueAt ? new Date(formData.nextDueAt).toISOString() : null,
          priority: formData.priority,
          assignedTo: formData.assignedTo || null,
          notes: formData.notes || null
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create task')
      }

      // Success
      onTaskAdded()
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFormData({
      taskTypeId: 0,
      taskDescription: '',
      intervalDays: 7,
      nextDueAt: '',
      priority: 'NORMAL',
      assignedTo: '',
      notes: ''
    })
    setSelectedTaskType(null)
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={handleClose} />

        {/* Modal */}
        <div className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white flex items-center justify-between border-b border-gray-200 px-6 py-4 z-10">
            <h2 className="text-xl font-semibold text-gray-900">Add New Maintenance Task</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Task Type Selection */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Task Information</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Task Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.taskTypeId}
                  onChange={(e) => handleTaskTypeChange(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value={0}>-- Select Task Type --</option>
                  {taskTypes.map(taskType => (
                    <option key={taskType.id} value={taskType.id}>
                      [{taskType.category}] {taskType.typeName}
                    </option>
                  ))}
                </select>
                {selectedTaskType?.description && (
                  <p className="mt-1 text-xs text-gray-500">{selectedTaskType.description}</p>
                )}
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Task Description
                </label>
                <textarea
                  value={formData.taskDescription}
                  onChange={(e) => setFormData({ ...formData, taskDescription: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="Additional details about this task..."
                />
              </div>
            </div>

            {/* Schedule Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Schedule Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    {PRIORITIES.map(priority => (
                      <option key={priority.value} value={priority.value}>
                        {priority.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Interval (days)
                  </label>
                  <input
                    type="number"
                    value={formData.intervalDays}
                    onChange={(e) => setFormData({ ...formData, intervalDays: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="1"
                    placeholder="7"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Next Due Date
                  </label>
                  <input
                    type="date"
                    value={formData.nextDueAt}
                    onChange={(e) => setFormData({ ...formData, nextDueAt: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assign To
                  </label>
                  <select
                    value={formData.assignedTo}
                    onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">-- Unassigned --</option>
                    {crewMembers.map(crew => (
                      <option key={crew.id} value={crew.fullName}>
                        {crew.fullName} - {typeof crew.rank === 'object' ? crew.rank?.rankName : crew.rank}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
                placeholder="Additional notes"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
