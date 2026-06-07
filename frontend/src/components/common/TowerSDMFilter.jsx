/**
 * Tower & SDM Filter Components
 * Multi-select filters for organizational hierarchy
 */
import { useState, useRef, useEffect } from 'react'
import { Building2, Users, ChevronDown, X } from 'lucide-react'
import clsx from 'clsx'

function MultiSelectDropdown({ icon: Icon, label, options, value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const toggle = v => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])
  const toggleAll = () => onChange(value.length === options.length ? [] : options)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className={clsx(
          'flex items-center gap-2 px-3 py-2 rounded-lg border font-semibold text-sm transition',
          value.length
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-400'
        )}
      >
        <Icon size={16} />
        <span>{label}</span>
        {value.length > 0 && <span className="ml-auto text-xs bg-brand-600 text-white rounded-full w-5 h-5 flex items-center justify-center">{value.length}</span>}
        <ChevronDown size={14} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl min-w-56 py-2">
          {/* Select All / Clear */}
          <label className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700 font-semibold text-xs">
            <input
              type="checkbox"
              checked={value.length === options.length && options.length > 0}
              onChange={toggleAll}
              className="accent-brand-600 w-3.5 h-3.5"
            />
            <span>{value.length === options.length ? 'Deselect All' : 'Select All'}</span>
          </label>

          {/* Options */}
          {options.map(opt => (
            <label
              key={opt}
              className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={value.includes(opt)}
                onChange={() => toggle(opt)}
                className="accent-brand-600 w-3.5 h-3.5"
              />
              <span className="text-xs text-slate-700 dark:text-slate-200">{opt}</span>
            </label>
          ))}
        </div>
      )}

      {/* Selected pills */}
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {value.map(v => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2 py-1 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded-full text-xs font-semibold"
            >
              {v}
              <button
                onClick={() => toggle(v)}
                className="hover:text-brand-900 dark:hover:text-brand-100"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function TowerFilter({ towers = [], value, onChange, disabled = false }) {
  return (
    <MultiSelectDropdown
      icon={Building2}
      label="Towers"
      options={towers}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  )
}

export function SDMFilter({ sdms = [], value, onChange, disabled = false }) {
  return (
    <MultiSelectDropdown
      icon={Users}
      label="SDMs"
      options={sdms}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  )
}

export function AssignmentGroupFilter({ groups = [], value, onChange, disabled = false }) {
  return (
    <MultiSelectDropdown
      icon={Building2}
      label="Assignment Groups"
      options={groups}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  )
}
