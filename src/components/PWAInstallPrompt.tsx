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
    <div className="fixed pwa-install-prompt bg-slate-800 border border-slate-600 rounded-lg p-4 shadow-lg z-50">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-slate-100">Install App</h3>
          {isIOS && !deferredPrompt ? (
            <div className="text-xs text-slate-400 mt-1">
              <p>To install this app on your iOS device:</p>
              <p className="mt-1">
                1. Tap the Share button <span className="inline-block">📤</span>
              </p>
              <p>2. Scroll down and tap "Add to Home Screen"</p>
              <p>3. Tap "Add" to confirm</p>
            </div>
          ) : (
            <p className="text-xs text-slate-400 mt-1">Install this app for a better experience</p>
          )}
        </div>
        <div className="flex gap-2 ml-4">
          <button
            onClick={() => setShowInstallPrompt(false)}
            className="px-3 py-1 text-xs text-slate-400 hover:text-slate-300 transition-colors"
          >
            Not now
          </button>
          {deferredPrompt && (
            <button
              onClick={handleInstallClick}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
