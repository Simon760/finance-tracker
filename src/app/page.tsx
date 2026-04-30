'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppProvider';

export default function LoginPage() {
  const [id, setId] = useState('');
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isLoggedIn } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (isLoggedIn) {
      router.push('/tracker');
      return;
    }
    // Auto-login
    const uid = localStorage.getItem('fdxb_uid');
    const savedPin = localStorage.getItem('fdxb_pin');
    if (uid && savedPin) {
      setLoading(true);
      login(uid, savedPin).then(ok => {
        if (ok) router.push('/tracker');
        else setLoading(false);
      });
    }
  }, [isLoggedIn, login, router]);

  const handleLogin = async () => {
    if (!id.trim() || !pin.trim()) return;
    setLoading(true);
    setStatus('Connexion...');
    const ok = await login(id.trim().toLowerCase(), pin);
    if (ok) {
      router.push('/tracker');
    } else {
      setStatus('Identifiant ou PIN incorrect');
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg">
      <div className="text-center max-w-[380px] w-full px-10">
        <div className="w-[52px] h-[52px] rounded-md bg-accent flex items-center justify-center font-extrabold text-lg text-black mx-auto mb-6 shadow-glow">
          FH
        </div>
        <h1 className="text-[22px] font-bold tracking-tight mb-1.5">FinanceHQ</h1>
        <p className="text-t-3 text-[13px] mb-8 leading-relaxed">
          Connecte-toi pour accéder à ton cockpit financier
        </p>

        <div className="mb-3.5 text-left">
          <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">
            Identifiant
          </label>
          <input
            className="w-full px-3.5 py-2.5 bg-bg-2 border border-border rounded-sm text-t-1 text-[13px] outline-none focus:border-accent focus:shadow-[0_0_0_2px_rgba(16,185,129,0.1)] transition-all text-center"
            value={id}
            onChange={e => setId(e.target.value)}
            placeholder="Ex: simon"
          />
        </div>

        <div className="mb-5 text-left">
          <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">
            Code PIN
          </label>
          <input
            className="w-full px-3.5 py-2.5 bg-bg-2 border border-border rounded-sm text-t-1 text-[13px] outline-none focus:border-accent focus:shadow-[0_0_0_2px_rgba(16,185,129,0.1)] transition-all text-center"
            type="password"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="••••"
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-3 bg-accent text-black font-semibold text-sm rounded-sm hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer"
        >
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>

        {status && <p className="mt-4 text-xs text-t-3">{status}</p>}
      </div>
    </div>
  );
}
