import { input } from './ui'

const groups = [
  { name: 'Nhiệt độ', units: ['°C', '°F', 'K'] },
  { name: 'Áp suất', units: ['bar', 'mbar', 'Pa', 'kPa', 'MPa', 'psi', 'kgf/cm²', 'mmHg'] },
  { name: 'Kích thước / chuyển động', units: ['mm', 'cm', 'm', 'µm', 'rpm', 'Hz', 'mm/s', 'm/s', 'm/s²', '°'] },
  { name: 'Điện', units: ['V', 'mV', 'kV', 'A', 'mA', 'Ω', 'kΩ', 'MΩ', 'W', 'kW', 'MW', 'kWh'] },
  { name: 'Khối lượng / thể tích / lưu lượng', units: ['g', 'kg', 't', 'mL', 'L', 'm³', 'L/min', 'L/h', 'm³/h', 'kg/h', 'kg/m³'] },
  { name: 'Khác', units: ['%', 'ppm', 'pH', 'cSt', 'N', 'N·m', 'dB', 's', 'min', 'giờ', 'lần'] },
] as const

/** Keep historical/imported units intact without allowing new free-text values. */
export function MeasurementUnitSelect({ value, onChange, label }: { value?: string | null; onChange: (value: string) => void; label: string }) {
  const known = groups.some(group => group.units.some(unit => unit === value))
  return <select aria-label={label} className={input} value={value || ''} onChange={event => onChange(event.target.value)}>
    <option value="">Chọn đơn vị</option>
    {value && !known && <option value={value}>{value} (đã lưu)</option>}
    {groups.map(group => <optgroup key={group.name} label={group.name}>{group.units.map(unit => <option key={unit} value={unit}>{unit}</option>)}</optgroup>)}
  </select>
}
