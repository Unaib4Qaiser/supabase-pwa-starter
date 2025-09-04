import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface NavigatorExtended extends Navigator {
  standalone?: boolean;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if app is already installed (running in standalone mode)
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as NavigatorExtended).standalone ||
        document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!isStandalone) {
        setShowInstallPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler as EventListener);

    // For iOS Safari, show manual install instructions
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isInStandaloneMode = (window.navigator as NavigatorExtended).standalone;

    if (isIOS && !isInStandaloneMode && !isStandalone) {
      // Show iOS install instructions after a delay
      setTimeout(() => {
        setShowInstallPrompt(true);
      }, 3000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler as EventListener);
    };
  }, [isStandalone]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }

      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    }
  };

  if (!showInstallPrompt || isStandalone) return null;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div className="fixed bottom-6 left-6 right-6 glass-card p-6 rounded-2xl shadow-glow z-50 animate-slide-in max-w-md mx-auto">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-white mb-2">Install Supabase PWA</h3>

          {isIOS && !deferredPrompt ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-300">Install on your iOS device:</p>
              <div className="space-y-1 text-xs text-gray-400">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 bg-blue-500/20 rounded flex items-center justify-center text-blue-400 text-[10px] font-bold">1</span>
                  <span>Tap the Share button</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 bg-blue-500/20 rounded flex items-center justify-center text-blue-400 text-[10px] font-bold">2</span>
                  <span>Scroll down and tap "Add to Home Screen"</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 bg-blue-500/20 rounded flex items-center justify-center text-blue-400 text-[10px] font-bold">3</span>
                  <span>Tap "Add" to confirm</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-300">
              Install this app for offline access, faster loading, and a native app experience.
            </p>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={() => setShowInstallPrompt(false)}
          className="w-8 h-8 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-300 transition-all duration-200 flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Action buttons */}
      {deferredPrompt && (
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => setShowInstallPrompt(false)}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-300 bg-gray-700/50 hover:bg-gray-600/50 rounded-xl transition-all duration-200"
          >
            Not now
          </button>
          <button
            onClick={handleInstallClick}
            className="flex-1 modern-button px-4 py-2.5 text-sm font-medium rounded-xl"
          >
            Install App
          </button>
        </div>
      )}
    </div>
  );
}
