import { useState, useEffect } from 'react'
import { Sun, Moon, RefreshCw, Bell, User, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'
import clsx from 'clsx'

export default function Header({ title, subtitle, onRefresh, loading }) {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [now, setNow]   = useState(new Date())

  useEffect(() => {
    const root = document.documentElement
    dark ? root.classList.add('dark') : root.classList.remove('dark')
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="h-14 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 shrink-0">
      <div>
        <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 hidden sm:block">
          {format(now, 'EEE dd MMM yyyy HH:mm')}
        </span>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="btn-ghost text-slate-500 dark:text-slate-400 p-2"
          title="Refresh data"
        >
          <RefreshCw size={15} className={clsx(loading && 'animate-spin')} />
        </button>

        <button
          onClick={() => setDark(d => !d)}
          className="btn-ghost text-slate-500 dark:text-slate-400 p-2"
          title="Toggle theme"
        >
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <button className="btn-ghost text-slate-500 dark:text-slate-400 p-2 relative" title="Notifications">
          <Bell size={15} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-600">
          <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center">
            <User size={13} className="text-white" />
          </div>
          <span className="text-xs font-medium text-slate-700 dark:text-slate-200 hidden sm:block">Admin</span>
          <ChevronDown size={12} className="text-slate-400" />
        </div>
      </div>
    </header>
  )
}
