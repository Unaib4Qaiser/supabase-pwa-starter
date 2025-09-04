import { Link } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { supabase } from '../lib/supabase';

export default function Header() {
  const { session } = useSession();

  return (
    <header className="sticky top-0 bg-slate-900/80 backdrop-blur border-b border-slate-800 pt-safe">
      <div className="max-w-3xl mx-auto px-4 px-safe py-3 flex items-center justify-between">
        <Link to="/" className="font-semibold tracking-wide">
          Supabase PWA
        </Link>
        <nav className="flex gap-3 items-center">
          {session ? (
            <button
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700"
              onClick={async () => {
                await supabase.auth.signOut();
              }}
            >
              Sign out
            </button>
          ) : (
            <Link to="/auth" className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
