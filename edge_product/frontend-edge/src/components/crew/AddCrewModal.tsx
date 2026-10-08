import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { X, User, Save, AlertCircle, Heart, GraduationCap, Phone, Briefcase } from 'lucide-react'
import { CrewMember } from '../../types/maritime.types'
import { maritimeService } from '../../services/maritime.service'

interface AddCrewModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (crew: Partial<CrewMember>) => Promise<void>
}

export function AddCrewModal({ isOpen, onClose, onSave }: AddCrewModalProps) {
  const [formData, setFormData] = useState<Partial<CrewMember>>({
    crewId: '',
    fullName: '',
    rankId: undefined,
    department: '',
    countryId: 1,
    dateOfBirth: '',
    embarkDate: new Date().toISOString().split('T')[0],
    isOnboard: true,
    emailAddress: '',
    phoneNumber: '',
    address: '',
    emergencyContact: '',
    // Bio-data fields
    placeOfBirth: '',
    idCardNumber: '',
    maritalStatus: '',
    height: undefined,
    weight: undefined,
    bloodGroup: '',
    clothingSize: '',
    shoeSize: '',
    cateringSize: '',
    isSmoker: false,
    isCovidVaccinated: false,
    // Next of Kin
    nextOfKinName: '',
    nextOfKinRelation: '',
    nextOfKinPhone: '',
    nextOfKinAddress: '',
    // Education
    educationInstitution: '',
    educationCourse: '',
    educationPeriodYears: undefined,
    educationGraduationYear: undefined,
    // Notes
    notes: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [ranks, setRanks] = useState<any[]>([])
  const [countries, setCountries] = useState<any[]>([])

  useEffect(() => {
    if (isOpen) {
      loadRanks()
      loadCountries()
    }
  }, [isOpen])

  const loadRanks = async () => {
    try {
      const data = await maritimeService.ranks.getAll()
      setRanks(data)
    } catch (error) {
      console.error('Failed to load ranks:', error)
    }
  }

  const loadCountries = async () => {
    try {
      const data = await maritimeService.countries.getAll()
      setCountries(data)
    } catch (error) {
      console.error('Failed to load countries:', error)
    }
  }

  if (!isOpen) return null

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.crewId?.trim()) {
      newErrors.crewId = 'Crew ID is required'
    }
    if (!formData.fullName?.trim()) {
      newErrors.fullName = 'Full name is required'
    }
    if (!formData.rankId) {
      newErrors.rankId = 'Rank is required'
    }
    if (!formData.countryId) {
      newErrors.countryId = 'Country is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      setSaving(true)
      setErrors({}) // Clear previous errors
      await onSave(formData)
      handleClose()
    } catch (error: any) {
      console.error('❌ Failed to add crew:', error)
      
      const errorMessage = error.message || 'Failed to add crew member. Please try again.'
      const errorDetails = error.details || ''
      
      if (error.status === 409) {
        setErrors({ crewId: errorMessage })
      } else if (error.status === 400) {
        toast.error(`Validation Error: ${errorMessage}`)
      } else {
        toast.error(`${errorMessage}${errorDetails ? ' - ' + errorDetails : ''}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setFormData({
      crewId: '',
      fullName: '',
      rankId: undefined,
      department: '',
      countryId: 1,
      dateOfBirth: '',
      embarkDate: new Date().toISOString().split('T')[0],
      isOnboard: true,
      emailAddress: '',
      phoneNumber: '',
      address: '',
      emergencyContact: '',
      placeOfBirth: '',
      idCardNumber: '',
      maritalStatus: '',
      height: undefined,
      weight: undefined,
      bloodGroup: '',
      clothingSize: '',
      shoeSize: '',
      cateringSize: '',
      isSmoker: false,
      isCovidVaccinated: false,
      nextOfKinName: '',
      nextOfKinRelation: '',
      nextOfKinPhone: '',
      nextOfKinAddress: '',
      educationInstitution: '',
      educationCourse: '',
      educationPeriodYears: undefined,
      educationGraduationYear: undefined,
      notes: '',
    })
    setErrors({})
    onClose()
  }

  const handleChange = (field: keyof CrewMember, value: string | boolean | number | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
  const inputErrorClass = "w-full px-3 py-2 text-sm border border-red-500 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
  const labelClass = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Add New Crew Member</h2>
              <p className="text-blue-100 text-xs mt-0.5">Fill in crew member details below</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            disabled={saving}
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5">
          <div className="space-y-5">
            
            {/* ========== SECTION 1: Basic Information ========== */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2 uppercase tracking-wide">
                <User className="w-4 h-4 text-blue-600" />
                Basic Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Crew ID <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formData.crewId}
                    onChange={(e) => handleChange('crewId', e.target.value)}
                    className={errors.crewId ? inputErrorClass : inputClass}
                    placeholder="e.g., CREW001"
                  />
                  {errors.crewId && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.crewId}
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Full Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => handleChange('fullName', e.target.value)}
                    className={errors.fullName ? inputErrorClass : inputClass}
                    placeholder="e.g., Nguyen Van A"
                  />
                  {errors.fullName && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.fullName}
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Rank <span className="text-red-500">*</span></label>
                  <select
                    value={formData.rankId || ''}
                    onChange={(e) => handleChange('rankId', e.target.value ? Number(e.target.value) : undefined)}
                    className={errors.rankId ? inputErrorClass : inputClass}
                  >
                    <option value="">Select rank</option>
                    {ranks.map((rank) => (
                      <option key={rank.id} value={rank.id}>
                        {rank.rankName} ({rank.rankCode})
                      </option>
                    ))}
                  </select>
                  {errors.rankId && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.rankId}
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Department</label>
                  <select
                    value={formData.department || ''}
                    onChange={(e) => handleChange('department', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select department</option>
                    <option value="Deck">Deck</option>
                    <option value="Engine">Engine</option>
                    <option value="Catering">Catering</option>
                    <option value="Radio">Radio</option>
                    <option value="Medical">Medical</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Country <span className="text-red-500">*</span></label>
                  <select
                    value={formData.countryId || ''}
                    onChange={(e) => handleChange('countryId', e.target.value ? Number(e.target.value) : undefined)}
                    className={errors.countryId ? inputErrorClass : inputClass}
                  >
                    <option value="">Select country</option>
                    {countries.map((country) => (
                      <option key={country.id} value={country.id}>
                        {country.countryName}
                      </option>
                    ))}
                  </select>
                  {errors.countryId && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.countryId}
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Date of Birth</label>
                  <input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => handleChange('dateOfBirth', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Place of Birth</label>
                  <input
                    type="text"
                    value={formData.placeOfBirth || ''}
                    onChange={(e) => handleChange('placeOfBirth', e.target.value)}
                    className={inputClass}
                    placeholder="e.g., Hai Phong"
                  />
                </div>
                <div>
                  <label className={labelClass}>ID Card Number</label>
                  <input
                    type="text"
                    value={formData.idCardNumber || ''}
                    onChange={(e) => handleChange('idCardNumber', e.target.value)}
                    className={inputClass}
                    placeholder="e.g., 034099001234"
                  />
                </div>
                <div>
                  <label className={labelClass}>Marital Status</label>
                  <select
                    value={formData.maritalStatus || ''}
                    onChange={(e) => handleChange('maritalStatus', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select...</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ========== SECTION 2: Physical Information ========== */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2 uppercase tracking-wide">
                <Heart className="w-4 h-4 text-red-500" />
                Physical Information
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className={labelClass}>Height (cm)</label>
                  <input
                    type="number"
                    value={formData.height || ''}
                    onChange={(e) => handleChange('height', e.target.value ? Number(e.target.value) : undefined)}
                    className={inputClass}
                    placeholder="170"
                  />
                </div>
                <div>
                  <label className={labelClass}>Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.weight || ''}
                    onChange={(e) => handleChange('weight', e.target.value ? Number(e.target.value) : undefined)}
                    className={inputClass}
                    placeholder="70"
                  />
                </div>
                <div>
                  <label className={labelClass}>Blood Group</label>
                  <select
                    value={formData.bloodGroup || ''}
                    onChange={(e) => handleChange('bloodGroup', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select...</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Clothing Size</label>
                  <select
                    value={formData.clothingSize || ''}
                    onChange={(e) => handleChange('clothingSize', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select...</option>
                    <option value="XS">XS</option>
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                    <option value="XL">XL</option>
                    <option value="XXL">XXL</option>
                    <option value="3XL">3XL</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Shoe Size</label>
                  <input
                    type="text"
                    value={formData.shoeSize || ''}
                    onChange={(e) => handleChange('shoeSize', e.target.value)}
                    className={inputClass}
                    placeholder="e.g., 42"
                  />
                </div>
                <div>
                  <label className={labelClass}>Catering Size</label>
                  <input
                    type="text"
                    value={formData.cateringSize || ''}
                    onChange={(e) => handleChange('cateringSize', e.target.value)}
                    className={inputClass}
                    placeholder="e.g., M"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer h-[38px]">
                    <input
                      type="checkbox"
                      checked={formData.isSmoker || false}
                      onChange={(e) => handleChange('isSmoker', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Smoker</span>
                  </label>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer h-[38px]">
                    <input
                      type="checkbox"
                      checked={formData.isCovidVaccinated || false}
                      onChange={(e) => handleChange('isCovidVaccinated', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Covid Vaccinated</span>
                  </label>
                </div>
              </div>
            </div>

            {/* ========== SECTION 3: Contact Information ========== */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2 uppercase tracking-wide">
                <Phone className="w-4 h-4 text-green-600" />
                Contact Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Email Address</label>
                  <input
                    type="email"
                    value={formData.emailAddress}
                    onChange={(e) => handleChange('emailAddress', e.target.value)}
                    className={inputClass}
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label className={labelClass}>Phone Number</label>
                  <input
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(e) => handleChange('phoneNumber', e.target.value)}
                    className={inputClass}
                    placeholder="+84 912 345 678"
                  />
                </div>
                <div>
                  <label className={labelClass}>Address</label>
                  <input
                    type="text"
                    value={formData.address || ''}
                    onChange={(e) => handleChange('address', e.target.value)}
                    className={inputClass}
                    placeholder="e.g., 123 Le Loi, Hai Phong"
                  />
                </div>
              </div>
            </div>

            {/* ========== SECTION 4: Next of Kin ========== */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2 uppercase tracking-wide">
                <AlertCircle className="w-4 h-4 text-orange-500" />
                Next of Kin / Emergency Contact
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Next of Kin Name</label>
                  <input
                    type="text"
                    value={formData.nextOfKinName || ''}
                    onChange={(e) => handleChange('nextOfKinName', e.target.value)}
                    className={inputClass}
                    placeholder="e.g., Nguyen Thi B"
                  />
                </div>
                <div>
                  <label className={labelClass}>Relationship</label>
                  <select
                    value={formData.nextOfKinRelation || ''}
                    onChange={(e) => handleChange('nextOfKinRelation', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select...</option>
                    <option value="Father">Father</option>
                    <option value="Mother">Mother</option>
                    <option value="Spouse">Spouse</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Child">Child</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Next of Kin Phone</label>
                  <input
                    type="tel"
                    value={formData.nextOfKinPhone || ''}
                    onChange={(e) => handleChange('nextOfKinPhone', e.target.value)}
                    className={inputClass}
                    placeholder="+84 912 345 678"
                  />
                </div>
                <div>
                  <label className={labelClass}>Next of Kin Address</label>
                  <input
                    type="text"
                    value={formData.nextOfKinAddress || ''}
                    onChange={(e) => handleChange('nextOfKinAddress', e.target.value)}
                    className={inputClass}
                    placeholder="e.g., 456 Tran Phu, Hai Phong"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Emergency Contact (Legacy)</label>
                  <textarea
                    value={formData.emergencyContact}
                    onChange={(e) => handleChange('emergencyContact', e.target.value)}
                    rows={2}
                    className={inputClass}
                    placeholder="Additional emergency contact info"
                  />
                </div>
              </div>
            </div>

            {/* ========== SECTION 5: Employment Details ========== */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2 uppercase tracking-wide">
                <Briefcase className="w-4 h-4 text-purple-600" />
                Employment Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Join Date</label>
                  <input
                    type="date"
                    value={formData.joinDate || ''}
                    onChange={(e) => handleChange('joinDate', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Embark Date</label>
                  <input
                    type="date"
                    value={formData.embarkDate}
                    onChange={(e) => handleChange('embarkDate', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Contract End</label>
                  <input
                    type="date"
                    value={formData.contractEnd || ''}
                    onChange={(e) => handleChange('contractEnd', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer h-[38px]">
                    <input
                      type="checkbox"
                      checked={formData.isOnboard}
                      onChange={(e) => handleChange('isOnboard', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Currently Onboard</span>
                  </label>
                </div>
              </div>
            </div>

            {/* ========== SECTION 6: Education ========== */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2 uppercase tracking-wide">
                <GraduationCap className="w-4 h-4 text-indigo-600" />
                Education
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className={labelClass}>Institution</label>
                  <input
                    type="text"
                    value={formData.educationInstitution || ''}
                    onChange={(e) => handleChange('educationInstitution', e.target.value)}
                    className={inputClass}
                    placeholder="e.g., Vietnam Maritime University"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Course / Major</label>
                  <input
                    type="text"
                    value={formData.educationCourse || ''}
                    onChange={(e) => handleChange('educationCourse', e.target.value)}
                    className={inputClass}
                    placeholder="e.g., Marine Engineering"
                  />
                </div>
                <div>
                  <label className={labelClass}>Period (Years)</label>
                  <input
                    type="number"
                    value={formData.educationPeriodYears || ''}
                    onChange={(e) => handleChange('educationPeriodYears', e.target.value ? Number(e.target.value) : undefined)}
                    className={inputClass}
                    placeholder="4"
                  />
                </div>
                <div>
                  <label className={labelClass}>Graduation Year</label>
                  <input
                    type="number"
                    value={formData.educationGraduationYear || ''}
                    onChange={(e) => handleChange('educationGraduationYear', e.target.value ? Number(e.target.value) : undefined)}
                    className={inputClass}
                    placeholder="2020"
                  />
                </div>
              </div>
            </div>

            {/* ========== SECTION 7: Notes ========== */}
            <div>
              <label className={labelClass}>Notes</label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => handleChange('notes', e.target.value)}
                rows={2}
                className={inputClass}
                placeholder="Additional notes about this crew member..."
              />
            </div>

          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Add Crew Member
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
