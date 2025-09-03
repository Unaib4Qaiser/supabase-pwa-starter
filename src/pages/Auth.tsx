import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold mb-4">{mode === 'signup' ? 'Create account' : 'Welcome back'}</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          disabled={loading}
          className="w-full px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? 'Please wait…' : (mode === 'signup' ? 'Sign up' : 'Sign in')}
        </button>
      </form>

      {error && <p className="text-red-400 mt-3">{error}</p>}

      <div className="text-sm mt-4 text-slate-400">
        {mode === 'signup' ? (
          <span>
            Already have an account?{' '}
            <button onClick={() => setMode('signin')} className="text-indigo-400 hover:underline">Sign in</button>
          </span>
        ) : (
          <span>
            New here?{' '}
            <button onClick={() => setMode('signup')} className="text-indigo-400 hover:underline">Create an account</button>
          </span>
        )}
      </div>
    </div>
  )
}
