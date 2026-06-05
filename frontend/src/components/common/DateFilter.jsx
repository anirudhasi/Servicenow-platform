/**
 * Global Date Range Filter Component
 * Used across all dashboards for consistent month/date filtering
 */
import { useState, useEffect } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

export default function DateFilter({ onDateChange, disabled = false }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [presetMode, setPresetMode] = useState('all') // all | 3m | 6m | custom

  useEffect(() => {
    const today = new Date()
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, 1)
    const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1)

    // Default to 6 months
    setDateFrom(sixMonthsAgo.toISOString().split('T')[0])
    setDateTo(today.toISOString().split('T')[0])
    onDateChange?.({
      from: sixMonthsAgo.toISOString().split('T')[0],
      to: today.toISOString().split('T')[0],
    })
  }, [])

  const handlePreset = (preset) => {
    const today = new Date()
    let from, to

    to = today.toISOString().split('T')[0]

    if (preset === 'all') {
      from = '2025-11-01' // Start of data range
    } else if (preset === '3m') {
      const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1)
      from = threeMonthsAgo.toISOString().split('T')[0]
    } else if (preset === '6m') {
      const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, 1)
      from = sixMonthsAgo.toISOString().split('T')[0]
    }

    setDateFrom(from)
    setDateTo(to)
    setPresetMode(preset)
    onDateChange?.({ from, to })
  }

  const handleCustomChange = (from, to) => {
    setDateFrom(from)
    setDateTo(to)
    setPresetMode('custom')
    if (from && to) {
      onDateChange?.({ from, to })
    }
  }

  const moveMonth = (direction) => {
    const from = new Date(dateFrom)
    const to = new Date(dateTo)
    const monthCount = direction > 0 ? 1 : -1

    from.setMonth(from.getMonth() + monthCount)
    to.setMonth(to.getMonth() + monthCount)

    const newFrom = from.toISOString().split('T')[0]
    const newTo = to.toISOString().split('T')[0]

    setDateFrom(newFrom)
    setDateTo(newTo)
    setPresetMode('custom')
    onDateChange?.({ from: newFrom, to: newTo })
  }

  return (
    <div className="card p-4 flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <Calendar size={18} className="text-slate-500" />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Date Range:</span>
      </div>

      {/* Preset buttons */}
      <div className="flex items-center gap-2">
        {[
          { id: 'all', label: 'All Data' },
          { id: '6m', label: 'Last 6M' },
          { id: '3m', label: 'Last 3M' },
        ].map(preset => (
          <button
            key={preset.id}
            onClick={() => handlePreset(preset.id)}
            disabled={disabled}
            className={clsx(
              'text-xs px-2 py-1 rounded-lg font-semibold transition',
              presetMode === preset.id
                ? 'bg-brand-600 text-white shadow'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Month navigation */}
      <button
        onClick={() => moveMonth(-1)}
        disabled={disabled}
        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
        title="Previous month"
      >
        <ChevronLeft size={16} className="text-slate-600 dark:text-slate-400" />
      </button>

      {/* Custom date inputs */}
      <div className="flex items-center gap-2 text-xs">
        <input
          type="date"
          value={dateFrom}
          onChange={e => handleCustomChange(e.target.value, dateTo)}
          disabled={disabled}
          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-xs"
        />
        <span className="text-slate-400">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => handleCustomChange(dateFrom, e.target.value)}
          disabled={disabled}
          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-xs"
        />
      </div>

      {/* Next month button */}
      <button
        onClick={() => moveMonth(1)}
        disabled={disabled}
        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
        title="Next month"
      >
        <ChevronRight size={16} className="text-slate-600 dark:text-slate-400" />
      </button>

      {/* Display label */}
      <div className="text-xs text-slate-500 dark:text-slate-400 ml-auto">
        {dateFrom && dateTo && `${dateFrom} → ${dateTo}`}
      </div>
    </div>
  )
}
