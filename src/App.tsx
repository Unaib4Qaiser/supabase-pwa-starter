import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useSession } from './hooks/useSession';
import Header from './components/Header';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';

export default function App() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading) {
      if (!session && location.pathname !== '/auth') {
        navigate('/auth');
      }
      if (session && location.pathname === '/auth') {
        navigate('/');
      }
    }
  }, [session, loading, location.pathname, navigate]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>
      <PWAInstallPrompt />
    </div>
  );
}
