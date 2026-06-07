/**
 * Multi-Month Filter Component
 * Allows selection of multiple months with visual month picker
 */
import { useState, useEffect, useRef } from 'react'
import { Calendar, X, ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

export default function MultiMonthFilter({ onMonthsChange, disabled = false }) {
  const [selectedMonths, setSelectedMonths] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [pickerMonth, setPickerMonth] = useState(new Date())
  const pickerRef = useRef(null)

  // Generate list of months (past 12 + future 6)
  const generateMonthList = () => {
    const months = []
    const today = new Date()

    for (let i = -12; i <= 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleString('default', { month: 'short', year: 'numeric' })
      months.push({ key, label, date: d })
    }
    return months
  }

  const allMonths = generateMonthList()

  const toggleMonth = (monthKey) => {
    const newSelection = selectedMonths.includes(monthKey)
      ? selectedMonths.filter(m => m !== monthKey)
      : [...selectedMonths, monthKey]

    setSelectedMonths(newSelection)
    onMonthsChange?.(newSelection)
  }

  const selectRange = (startIdx, endIdx) => {
    const range = allMonths
      .slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1)
      .map(m => m.key)

    setSelectedMonths(range)
    onMonthsChange?.(range)
  }

  const clearSelection = () => {
    setSelectedMonths([])
    onMonthsChange?.([])
  }

  // Close picker on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="space-y-3">
      {/* Month Picker Button */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowPicker(!showPicker)}
          disabled={disabled}
          className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-lg border font-semibold text-sm transition',
            selectedMonths.length > 0
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
              : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-400'
          )}
        >
          <Calendar size={16} />
          <span>{selectedMonths.length > 0 ? `${selectedMonths.length} months` : 'Select months'}</span>
        </button>

        {/* Month Picker Popup */}
        {showPicker && (
          <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-4 w-80">
            <div className="space-y-4">
              {/* Quick Actions */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => selectRange(0, 2)}
                  className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 transition font-semibold"
                >
                  Last 3M
                </button>
                <button
                  onClick={() => selectRange(0, 5)}
                  className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 transition font-semibold"
                >
                  Last 6M
                </button>
                <button
                  onClick={() => setSelectedMonths(allMonths.map(m => m.key))}
                  className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 transition font-semibold"
                >
                  All
                </button>
                <button
                  onClick={clearSelection}
                  className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 hover:bg-red-200 text-red-700 dark:text-red-300 transition font-semibold ml-auto"
                >
                  Clear
                </button>
              </div>

              {/* Month Grid */}
              <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {allMonths.map((month) => (
                  <label
                    key={month.key}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs font-semibold transition border',
                      selectedMonths.includes(month.key)
                        ? 'bg-brand-100 dark:bg-brand-900/30 border-brand-400 dark:border-brand-600 text-brand-700 dark:text-brand-300'
                        : 'bg-slate-50 dark:bg-slate-700/30 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMonths.includes(month.key)}
                      onChange={() => toggleMonth(month.key)}
                      className="w-3 h-3 accent-brand-600"
                    />
                    <span className="truncate">{month.label}</span>
                  </label>
                ))}
              </div>

              {/* Selected Months Display */}
              {selectedMonths.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3 text-xs">
                  <p className="font-semibold text-slate-600 dark:text-slate-300 mb-2">Selected:</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedMonths.map(monthKey => {
                      const month = allMonths.find(m => m.key === monthKey)
                      return (
                        <span
                          key={monthKey}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded-full text-[11px] font-semibold"
                        >
                          {month?.label}
                          <button
                            onClick={() => toggleMonth(monthKey)}
                            className="hover:text-brand-900 dark:hover:text-brand-100"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selected Months Pills */}
      {selectedMonths.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedMonths.map(monthKey => {
            const month = allMonths.find(m => m.key === monthKey)
            return (
              <span
                key={monthKey}
                className="inline-flex items-center gap-1 px-3 py-1 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded-full text-xs font-semibold"
              >
                {month?.label}
                <button
                  onClick={() => toggleMonth(monthKey)}
                  className="hover:text-brand-900 dark:hover:text-brand-100 ml-1"
                >
                  <X size={14} />
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
