import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'

interface AddCustomTaskModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (task: { title: string; description: string; tag: string }) => void
  columnTitle: string
}

const TAG_OPTIONS = [
  { value: 'in-research', label: 'In Research', color: 'bg-orange-100 text-orange-700' },
  { value: 'review', label: 'Review', color: 'bg-purple-100 text-purple-700' },
  { value: 'on-track', label: 'On Track', color: 'bg-pink-100 text-pink-700' },
  { value: 'blocked', label: 'Blocked', color: 'bg-red-100 text-red-700' },
  { value: 'planning', label: 'Planning', color: 'bg-blue-100 text-blue-700' },
  { value: 'testing', label: 'Testing', color: 'bg-yellow-100 text-yellow-700' },
]

export function AddCustomTaskModal({ isOpen, onClose, onAdd, columnTitle }: AddCustomTaskModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tag, setTag] = useState('in-research')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim()) {
      toast.error('Please enter a title')
      return
    }

    onAdd({
      title: title.trim(),
      description: description.trim(),
      tag
    })

    // Reset form
    setTitle('')
    setDescription('')
    setTag('in-research')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Add Task to "{columnTitle}"
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Nội dung
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter task description..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            />
          </div>

          {/* Tag */}
          <div>
            <label htmlFor="tag" className="block text-sm font-medium text-gray-700 mb-2">
              Mức độ nghiêm trọng
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TAG_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTag(option.value)}
                  className={`
                    px-3 py-2 rounded-lg text-sm font-medium transition-all
                    ${tag === option.value 
                      ? `${option.color} ring-2 ring-offset-1 ring-blue-500` 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }
                  `}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add Task
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
