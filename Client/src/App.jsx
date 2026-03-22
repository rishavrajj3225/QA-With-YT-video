import { useMemo, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function App() {
  const [videoId, setVideoId] = useState('')
  const [threadId, setThreadId] = useState('web-thread-1')
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const canSend = useMemo(() => query.trim().length > 0 && !isLoading, [query, isLoading])

  const handleSubmit = async (event) => {
    event.preventDefault()
    const text = query.trim()
    if (!text || isLoading) {
      return
    }

    setError('')
    setIsLoading(true)
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setQuery('')

    try {
      const response = await fetch(`${API_URL}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: text,
          video_id: videoId.trim() || undefined,
          thread_id: threadId.trim() || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error('Request failed')
      }

      const data = await response.json()
      const answer = data?.answer ? String(data.answer) : 'No answer received.'
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }])
    } catch {
      setError('Unable to reach server. Make sure backend is running on port 4000.')
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I could not fetch a response right now.' },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#cffafe_0%,_#fefce8_45%,_#f8fafc_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-white/60 bg-white/70 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">YouTube QA Chat</h1>
          <p className="mt-2 text-sm text-slate-600">Ask questions and get answers from your server agent.</p>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Video ID (optional)
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none ring-cyan-500 transition focus:ring"
              value={videoId}
              onChange={(event) => setVideoId(event.target.value)}
              placeholder="dQw4w9WgXcQ"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Thread ID
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none ring-cyan-500 transition focus:ring"
              value={threadId}
              onChange={(event) => setThreadId(event.target.value)}
              placeholder="web-thread-1"
            />
          </label>
        </div>

        <div className="mb-4 h-[50vh] min-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-500">No messages yet. Ask your first question below.</p>
          ) : (
            <ul className="space-y-3">
              {messages.map((message, index) => (
                <li
                  key={`${message.role}-${index}`}
                  className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm sm:text-base ${
                    message.role === 'user'
                      ? 'ml-auto bg-cyan-600 text-white'
                      : 'bg-amber-100 text-slate-800'
                  }`}
                >
                  {message.content}
                </li>
              ))}
              {isLoading ? <li className="text-sm text-slate-500">Thinking...</li> : null}
            </ul>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            className="min-h-24 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-cyan-500 transition focus:ring"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask something about the video..."
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">API: {API_URL}/query</p>
            <button
              type="submit"
              disabled={!canSend}
              className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Send
            </button>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </form>
      </section>
    </main>
  )
}

export default App
