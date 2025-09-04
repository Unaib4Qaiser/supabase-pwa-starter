import { Link } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { supabase } from '../lib/supabase';

export default function Header() {
  const { session } = useSession();

  return (
    <header className="sticky top-0 z-50 glass-card border-b border-gray-800/50 pt-safe animate-slide-in">
      <div className="max-w-7xl mx-auto px-6 px-safe py-2">
        <div className="flex items-center justify-between">
          {/* Logo/Brand */}
          <Link
            to="/"
            className="group flex items-center space-x-3 text-xl font-bold text-gradient hover:scale-105 transition-transform duration-200"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center group-hover:animate-glow">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="hidden sm:block">Supabase PWA</span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center space-x-3 sm:space-x-4">
            {session ? (
              <button
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-gray-800/50 hover:bg-gray-700/50 rounded-lg border border-gray-700/50 hover:border-gray-600/50 transition-all duration-200 hover:scale-105"
                onClick={async () => {
                  await supabase.auth.signOut();
                }}
              >
                Sign out
              </button>
            ) : (
              <Link
                to="/auth"
                className="modern-button px-4 py-2 sm:px-6 sm:py-2.5 text-sm font-medium rounded-lg hover:scale-105 transition-all duration-200"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
