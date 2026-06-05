import { useState, useEffect, useRef } from 'react'

/**
 * Persists a page's form + result state in localStorage so it survives
 * navigation away and back. Call clearMemory() to wipe and reset to defaults.
 *
 * Usage:
 *   const [mem, setMem, clearMemory] = usePageMemory('triage', { form: {...}, result: null })
 *   const setForm   = (v) => setMem({ form: typeof v === 'function' ? v(mem.form) : v })
 *   const setResult = (v) => setMem({ result: v })
 */
export function usePageMemory(pageKey, defaults) {
  const storageKey = `slb_page_mem_${pageKey}`

  const [memory, setMemoryRaw] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return { ...defaults, ...JSON.parse(saved) }
    } catch {}
    return defaults
  })

  // Skip writing on first render so we never overwrite restored data
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    try { localStorage.setItem(storageKey, JSON.stringify(memory)) } catch {}
  }, [memory, storageKey])

  const setMemory = (updates) =>
    setMemoryRaw(prev => ({ ...prev, ...(typeof updates === 'function' ? updates(prev) : updates) }))

  const clearMemory = () => {
    try { localStorage.removeItem(storageKey) } catch {}
    setMemoryRaw(defaults)
  }

  return [memory, setMemory, clearMemory]
}
