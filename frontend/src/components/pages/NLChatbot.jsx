import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Send, Trash2, Bot, User, Loader2, AlertCircle,
  MessageSquare, Sparkles, ChevronRight, WifiOff,
} from 'lucide-react'
import clsx from 'clsx'
import Header from '../layout/Header'
import { chatbot as chatbotApi } from '../../services/api'

// ── Markdown renderer ─────────────────────────────────────────────────────────
// Handles bold, inline code, bullet lists, numbered lists, headers.
// No external library required.
function renderMarkdown(text) {
  if (!text) return null
  const lines = text.split('\n')
  const elements = []
  let listItems = []
  let listType  = null   // 'ul' | 'ol'
  let key = 0

  const flushList = () => {
    if (!listItems.length) return
    const Tag = listType === 'ol' ? 'ol' : 'ul'
    elements.push(
      <Tag key={key++} className={clsx('my-2 space-y-0.5 pl-4', listType === 'ol' ? 'list-decimal' : 'list-disc')}>
        {listItems.map((li, i) => (
          <li key={i} className="text-sm leading-relaxed">{inlineFormat(li)}</li>
        ))}
      </Tag>
    )
    listItems = []
    listType  = null
  }

  lines.forEach(line => {
    // Header H2/H3
    if (/^#{1,3}\s/.test(line)) {
      flushList()
      const txt = line.replace(/^#{1,3}\s/, '')
      elements.push(
        <p key={key++} className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-3 mb-1">
          {inlineFormat(txt)}
        </p>
      )
      return
    }
    // Bullet list
    if (/^[•\-\*]\s/.test(line.trim())) {
      if (listType === 'ol') flushList()
      listType = 'ul'
      listItems.push(line.replace(/^[•\-\*]\s/, '').trim())
      return
    }
    // Numbered list
    if (/^\d+\.\s/.test(line.trim())) {
      if (listType === 'ul') flushList()
      listType = 'ol'
      listItems.push(line.replace(/^\d+\.\s/, '').trim())
      return
    }
    // Empty line
    if (!line.trim()) {
      flushList()
      elements.push(<div key={key++} className="h-1" />)
      return
    }
    // Normal line
    flushList()
    elements.push(
      <p key={key++} className="text-sm leading-relaxed">{inlineFormat(line)}</p>
    )
  })
  flushList()
  return elements
}

function inlineFormat(text) {
  // Bold **text** and inline `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="px-1 py-0.5 rounded text-[11px] font-mono bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">{part.slice(1, -1)}</code>
    return part
  })
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={clsx('flex gap-3 animate-fade-in', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div className={clsx(
        'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5',
        isUser
          ? 'bg-brand-600 text-white'
          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
      )}>
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Bubble */}
      <div className={clsx(
        'max-w-[78%] rounded-2xl px-4 py-3 shadow-sm',
        isUser
          ? 'bg-brand-600 text-white rounded-tr-sm'
          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-tl-sm'
      )}>
        {isUser
          ? <p className="text-sm leading-relaxed">{msg.content}</p>
          : <div className="space-y-0.5">{renderMarkdown(msg.content)}</div>
        }
        <p className={clsx(
          'text-[10px] mt-1.5',
          isUser ? 'text-blue-200 text-right' : 'text-slate-400 dark:text-slate-500'
        )}>
          {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </p>
      </div>
    </div>
  )
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex gap-3 animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
        <Bot size={14} className="text-slate-600 dark:text-slate-300" />
      </div>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-1.5">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Suggestion chip ───────────────────────────────────────────────────────────
function SuggestionChip({ text, onClick }) {
  return (
    <button
      onClick={() => onClick(text)}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 hover:shadow-sm transition-all duration-150 text-left"
    >
      <ChevronRight size={11} className="shrink-0 text-slate-400" />
      {text}
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NLChatbot() {
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [status, setStatus]       = useState(null)    // { available, providers }
  const [suggestions, setSuggestions] = useState([])
  const [error, setError]         = useState(null)

  const bottomRef   = useRef(null)
  const textareaRef = useRef(null)

  // Load status + suggestions on mount
  useEffect(() => {
    chatbotApi.status()
      .then(r => setStatus(r.data))
      .catch(() => setStatus({ available: false, providers: [] }))
    chatbotApi.suggestions()
      .then(r => setSuggestions(r.data?.suggestions || []))
      .catch(() => {})
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setError(null)

    const userMsg = { role: 'user', content: msg, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const r = await chatbotApi.message({ message: msg, session_id: sessionId })
      const { reply, session_id, provider_used } = r.data
      if (session_id) setSessionId(session_id)
      setMessages(prev => [...prev, {
        role: 'assistant', content: reply,
        timestamp: Date.now(),
        provider: provider_used,
      }])
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Failed to get a response.'
      setError(detail)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ ${detail}`,
        timestamp: Date.now(),
        isError: true,
      }])
    } finally {
      setLoading(false)
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [input, loading, sessionId])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = async () => {
    if (sessionId) {
      chatbotApi.clearSession(sessionId).catch(() => {})
    }
    setMessages([])
    setSessionId(null)
    setError(null)
    setTimeout(() => textareaRef.current?.focus(), 100)
  }

  const isAvailable = status?.available !== false

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="M5 NL Chatbot"
        subtitle="Conversational Q&A over your incident data"
        loading={loading}
      />

      {/* ── Status bar ──────────────────────────────────────────────────── */}
      <div className="px-6 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {status === null ? (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <Loader2 size={11} className="animate-spin" /> Checking LLM status …
            </span>
          ) : isAvailable ? (
            <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse-slow" />
              {status.providers?.[0] ? `${status.providers[0].name} · ${status.providers[0].model}` : 'LLM online'}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400 font-medium">
              <WifiOff size={11} /> LLM not configured — set CG_ACCESS_TOKEN in .env
            </span>
          )}
          {sessionId && (
            <span className="text-[10px] text-slate-400 font-mono hidden sm:block">
              session: {sessionId.slice(0, 8)}…
            </span>
          )}
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="btn-ghost text-xs flex items-center gap-1.5 text-red-500 hover:text-red-600 dark:text-red-400 px-2 py-1"
          >
            <Trash2 size={12} /> Clear chat
          </button>
        )}
      </div>

      {/* ── Messages area ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

        {/* Welcome / empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center text-center pt-6 pb-2 animate-fade-in">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-100 to-purple-200 dark:from-indigo-900/40 dark:to-purple-800/40 flex items-center justify-center mb-5">
              <Sparkles size={32} className="text-indigo-600" />
            </div>
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-200 mb-2">
              Ask anything about your incidents
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed mb-6">
              I have access to your full incident database. Ask about SLA compliance, MTTR,
              group workloads, volume trends, priority breakdowns, and more.
            </p>

            {!isAvailable && status !== null && (
              <div className="mb-5 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-3">
                <AlertCircle size={15} className="shrink-0" />
                <span>
                  LLM not configured. Add <code className="font-mono text-xs bg-white/60 px-1 rounded">CG_ACCESS_TOKEN</code> to your{' '}
                  <code className="font-mono text-xs bg-white/60 px-1 rounded">.env</code> file and restart the backend.
                </span>
              </div>
            )}

            {suggestions.length > 0 && (
              <div className="w-full max-w-2xl">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3">
                  Suggested questions
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {suggestions.map((s, i) => (
                    <SuggestionChip key={i} text={s} onClick={sendMessage} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Conversation messages */}
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}

        {/* Typing indicator */}
        {loading && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
        {/* Quick suggestions when conversation started */}
        {messages.length > 0 && suggestions.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-none">
            {suggestions.slice(0, 4).map((s, i) => (
              <button
                key={i}
                onClick={() => sendMessage(s)}
                disabled={loading}
                className="shrink-0 text-[11px] px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors whitespace-nowrap disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={handleKeyDown}
            placeholder={isAvailable ? 'Ask about your incidents … (Enter to send, Shift+Enter for new line)' : 'Configure LLM to use the chatbot …'}
            disabled={!isAvailable || loading}
            className={clsx(
              'flex-1 px-4 py-2.5 rounded-xl border bg-slate-50 dark:bg-slate-700/50 text-sm text-slate-700 dark:text-slate-200',
              'placeholder-slate-400 dark:placeholder-slate-500 resize-none overflow-hidden',
              'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-150',
              'min-h-[42px] max-h-[120px]',
              !isAvailable ? 'border-slate-200 dark:border-slate-600 opacity-60 cursor-not-allowed' : 'border-slate-200 dark:border-slate-600'
            )}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading || !isAvailable}
            className={clsx(
              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150',
              input.trim() && !loading && isAvailable
                ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm hover:shadow'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
            )}
          >
            {loading
              ? <Loader2 size={16} className="animate-spin" />
              : <Send size={16} />
            }
          </button>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-center">
          Powered by {status?.providers?.[0] ? `${status.providers[0].name}` : 'AI'} · Responses grounded in your incident data · Not for critical decisions
        </p>
      </div>
    </div>
  )
}
