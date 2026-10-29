import { translateMessage as tx, useMessageLocale } from '@/i18n/messages'
import { input } from './ui'

const getGroups = () => [
  { name: tx("pmsRework.temperature"), units: ['°C', '°F', 'K'] },
  { name: tx("pmsRework.pressure"), units: ['bar', 'mbar', 'Pa', 'kPa', 'MPa', 'psi', 'kgf/cm²', 'mmHg'] },
  { name: tx("pmsRework.dimensionsMotion"), units: ['mm', 'cm', 'm', 'µm', 'rpm', 'Hz', 'mm/s', 'm/s', 'm/s²', '°'] },
  { name: tx("pmsRework.electrical"), units: ['V', 'mV', 'kV', 'A', 'mA', 'Ω', 'kΩ', 'MΩ', 'W', 'kW', 'MW', 'kWh'] },
  { name: tx("pmsRework.massVolumeFlow"), units: ['g', 'kg', 't', 'mL', 'L', 'm³', 'L/min', 'L/h', 'm³/h', 'kg/h', 'kg/m³'] },
  { name: tx("pmsRework.other"), units: ['%', 'ppm', 'pH', 'cSt', 'N', 'N·m', 'dB', 's', 'min', 'giờ', 'lần'] },
] as const

/** Keep historical/imported units intact without allowing new free-text values. */
export function MeasurementUnitSelect({ value, onChange, label }: { value?: string | null; onChange: (value: string) => void; label: string }) {
  useMessageLocale()

  const groups = getGroups()
  const known = groups.some(group => group.units.some(unit => unit === value))
  return <select aria-label={label} className={input} value={value || ''} onChange={event => onChange(event.target.value)}>
    <option value="">{tx("pmsRework.selectUnit")}</option>
    {value && !known && <option value={value}>{value}{" " + tx("pmsRework.saved")}</option>}
    {groups.map(group => <optgroup key={group.name} label={group.name}>{group.units.map(unit => <option key={unit} value={unit}>{unit === 'giờ' ? tx('pmsRework.hours349') : unit === 'lần' ? tx('pmsRework.times') : unit}</option>)}</optgroup>)}
  </select>
}
