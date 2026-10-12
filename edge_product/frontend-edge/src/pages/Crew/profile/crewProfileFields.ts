import type { CrewMember } from '../../../types/maritime.types'

/*
  Cấu hình các trường hồ sơ thuyền viên trên tàu — CÙNG nhóm, thứ tự và nhãn với hồ sơ bên bờ
  (shore_product/.../CrewManagement/profile/crewProfileFields.ts) để hai bên nhìn như nhau.
  Chế độ XEM và chế độ SỬA cùng đọc cấu hình này nên hai bên luôn khớp nhau.

  Danh sách lựa chọn chỉ dịch NHÃN; GIÁ TRỊ lưu giữ nguyên ("Single", "Father", "ENGINE"...)
  để không đổi dữ liệu đã lưu và dữ liệu đồng bộ với bờ.
*/

export type FieldKey = keyof CrewMember & string

export type FieldKind = 'text' | 'email' | 'number' | 'date' | 'select' | 'textarea' | 'bool'

export interface Option { value: string; label: string }

export interface FieldDef {
  key: FieldKey
  label: string
  kind: FieldKind
  /** Số cột chiếm trên lưới 4 cột (mặc định 1). */
  span?: 1 | 2 | 3 | 4
  options?: Option[]
  placeholder?: string
  /** Đơn vị hiển thị sau giá trị ở chế độ xem, ví dụ "cm". */
  unit?: string
  /** Trường do quy trình lên/xuống tàu quản lý: chỉ sửa khi bật "Sửa thủ công". */
  managed?: boolean
}

export interface SectionDef {
  id: string
  title: string
  fields: FieldDef[]
  /** Mục trong bảng kiểm tra khi duyệt thuyền viên (reviewChecklist) ứng với nhóm này. */
  reviewKeys: string[]
}

export const MARITAL_OPTIONS: Option[] = [
  { value: 'Single', label: 'Độc thân' },
  { value: 'Married', label: 'Đã kết hôn' },
  { value: 'Divorced', label: 'Ly hôn' },
  { value: 'Widowed', label: 'Góa' },
]

export const RELATION_OPTIONS: Option[] = [
  { value: 'Father', label: 'Bố' },
  { value: 'Mother', label: 'Mẹ' },
  { value: 'Spouse', label: 'Vợ / Chồng' },
  { value: 'Sibling', label: 'Anh / Chị / Em' },
  { value: 'Child', label: 'Con' },
  { value: 'Other', label: 'Khác' },
]

export const BLOOD_OPTIONS: Option[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(v => ({ value: v, label: v }))

/** Bộ phận: dữ liệu cũ có cả "Engine" lẫn "ENGINE" nên so khớp không phân biệt hoa thường. */
export const DEPARTMENT_OPTIONS: Option[] = [
  { value: 'DECK', label: 'Boong' },
  { value: 'ENGINE', label: 'Máy' },
  { value: 'CATERING', label: 'Phục vụ' },
  { value: 'OTHER', label: 'Khác' },
]

export const departmentLabel = (value?: string | null) =>
  DEPARTMENT_OPTIONS.find(o => o.value === (value ?? '').toUpperCase())?.label ?? value ?? ''

/** Giá trị đang lưu không khớp chữ hoa (vd. "Engine") thì giữ nguyên làm một lựa chọn, để lưu không tự đổi dữ liệu. */
export const departmentOptions = (current?: string | null): Option[] => {
  if (!current || DEPARTMENT_OPTIONS.some(o => o.value === current)) return DEPARTMENT_OPTIONS
  return [{ value: current, label: departmentLabel(current) }, ...DEPARTMENT_OPTIONS.filter(o => o.value !== current.toUpperCase())]
}

/** Nhãn của một lựa chọn, so không phân biệt hoa thường ("MARRIED" lẫn "Married"). */
export const optionLabel = (options: Option[] | undefined, value: unknown) => {
  const v = String(value ?? '')
  return options?.find(o => o.value === v || o.value.toUpperCase() === v.toUpperCase())?.label ?? v
}

export const calcAge = (dob?: string | null) => {
  if (!dob) return null
  const diff = Date.now() - new Date(dob).getTime()
  return Number.isNaN(diff) ? null : Math.floor(diff / (365.25 * 86400000))
}

export const formatDateVi = (d?: string | null) => (d ? new Date(d).toLocaleDateString('vi-VN') : '')

/** Các nhóm trường, theo thứ tự hiển thị (giống bờ). Chức danh / quốc tịch / bộ phận cần danh mục nên trang tự gắn options. */
export const SECTIONS: SectionDef[] = [
  {
    id: 'personal',
    title: 'Thông tin cá nhân & liên hệ',
    reviewKeys: ['personalInfo', 'contactInfo'],
    fields: [
      { key: 'fullName', label: 'Họ và tên', kind: 'text' },
      { key: 'dateOfBirth', label: 'Ngày sinh', kind: 'date' },
      { key: 'countryId', label: 'Quốc tịch', kind: 'select' },
      { key: 'maritalStatus', label: 'Tình trạng hôn nhân', kind: 'select', options: MARITAL_OPTIONS },
      { key: 'placeOfBirth', label: 'Nơi sinh', kind: 'text' },
      { key: 'idCardNumber', label: 'Số CMND/CCCD', kind: 'text' },
      { key: 'phoneNumber', label: 'Số điện thoại', kind: 'text' },
      { key: 'emailAddress', label: 'Email', kind: 'email' },
      { key: 'address', label: 'Địa chỉ', kind: 'text', span: 4 },
    ],
  },
  {
    id: 'employment',
    title: 'Công việc',
    reviewKeys: ['employmentDates'],
    fields: [
      { key: 'crewId', label: 'Mã thuyền viên', kind: 'text' },
      { key: 'rankId', label: 'Chức danh', kind: 'select' },
      { key: 'department', label: 'Bộ phận', kind: 'select' },
      { key: 'seamanBookNumber', label: 'Số sổ thuyền viên', kind: 'text' },
      { key: 'joinDate', label: 'Ngày gia nhập', kind: 'date' },
      { key: 'contractEnd', label: 'Hết hạn hợp đồng', kind: 'date' },
      { key: 'embarkDate', label: 'Ngày lên tàu', kind: 'date', managed: true },
      { key: 'disembarkDate', label: 'Ngày xuống tàu', kind: 'date', managed: true },
    ],
  },
  {
    id: 'physical',
    title: 'Thể chất & sở thích',
    reviewKeys: ['physicalDetails'],
    fields: [
      { key: 'height', label: 'Chiều cao', kind: 'number', unit: 'cm' },
      { key: 'weight', label: 'Cân nặng', kind: 'number', unit: 'kg' },
      { key: 'bloodGroup', label: 'Nhóm máu', kind: 'select', options: BLOOD_OPTIONS },
      { key: 'clothingSize', label: 'Cỡ quần áo', kind: 'text', placeholder: 'VD: L, XL' },
      { key: 'shoeSize', label: 'Cỡ giày', kind: 'text', placeholder: 'VD: 42' },
      { key: 'cateringSize', label: 'Cỡ bữa ăn', kind: 'text', placeholder: 'VD: M' },
      { key: 'isSmoker', label: 'Hút thuốc', kind: 'bool' },
      { key: 'isCovidVaccinated', label: 'Đã tiêm COVID-19', kind: 'bool' },
    ],
  },
  {
    id: 'kin',
    title: 'Thân nhân / liên hệ khẩn cấp',
    reviewKeys: ['nextOfKin'],
    fields: [
      { key: 'nextOfKinName', label: 'Họ và tên', kind: 'text' },
      { key: 'nextOfKinRelation', label: 'Mối quan hệ', kind: 'select', options: RELATION_OPTIONS },
      { key: 'nextOfKinPhone', label: 'Số điện thoại', kind: 'text' },
      { key: 'nextOfKinAddress', label: 'Địa chỉ', kind: 'text' },
    ],
  },
  {
    id: 'education',
    title: 'Học vấn',
    reviewKeys: ['education'],
    fields: [
      { key: 'educationInstitution', label: 'Trường / cơ sở đào tạo', kind: 'text', placeholder: 'VD: Đại học Hàng hải Việt Nam' },
      { key: 'educationCourse', label: 'Chuyên ngành', kind: 'text', placeholder: 'VD: Điều khiển tàu biển' },
      { key: 'educationGraduationYear', label: 'Năm tốt nghiệp', kind: 'number', placeholder: 'VD: 2020' },
      { key: 'educationPeriodYears', label: 'Số năm học', kind: 'number', unit: 'năm', placeholder: 'VD: 4' },
    ],
  },
  {
    id: 'notes',
    title: 'Ghi chú',
    reviewKeys: [],
    fields: [{ key: 'notes', label: 'Ghi chú', kind: 'textarea', span: 4 }],
  },
]

/** Mọi trường hồ sơ có thể sửa — dùng để so "có thay đổi chưa lưu". */
export const ALL_FIELD_KEYS: FieldKey[] = SECTIONS.flatMap(s => s.fields.map(f => f.key))
