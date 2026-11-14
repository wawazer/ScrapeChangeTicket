import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { activateLicense, fetchLicenseStatus, request, type LicenseStatus } from '@/lib/http';

interface LicenseContextValue {
  license: LicenseStatus;
  deactivate: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextValue | null>(null);

export function useLicense() {
  const value = useContext(LicenseContext);
  if (!value) throw new Error('useLicense harus dipakai di dalam LicenseGate');
  return value;
}

type GateState =
  | { phase: 'checking' }
  | { phase: 'locked'; info: LicenseStatus }
  | { phase: 'ready'; info: LicenseStatus };

export function LicenseGate({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<GateState>({ phase: 'checking' });

  const check = useCallback(async () => {
    try {
      const info = await fetchLicenseStatus();
      setGate(info.valid ? { phase: 'ready', info } : { phase: 'locked', info });
    } catch (error) {
      setGate({
        phase: 'locked',
        info: { valid: false, reason: 'API_UNREACHABLE', message: error instanceof Error ? error.message : 'Server tidak dapat dihubungi.' },
      });
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    const handle = () => {
      setGate({ phase: 'checking' });
      void check();
    };
    window.addEventListener('zevn:license-required', handle);
    return () => window.removeEventListener('zevn:license-required', handle);
  }, [check]);

  const deactivate = useCallback(async () => {
    await request('/api/license/deactivate', { method: 'POST', body: '{}' }).catch(() => undefined);
    setGate({ phase: 'checking' });
    await check();
  }, [check]);

  if (gate.phase === 'checking') return <BootScreen />;
  if (gate.phase === 'locked') return <ActivationScreen info={gate.info} onActivated={(info) => setGate({ phase: 'ready', info })} />;

  return <LicenseContext.Provider value={{ license: gate.info, deactivate }}>{children}</LicenseContext.Provider>;
}

function BootScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Memeriksa lisensi...</p>
      </div>
    </div>
  );
}

function truncateDeviceId(deviceId?: string) {
  if (!deviceId) return '-';
  return deviceId.length > 20 ? `${deviceId.slice(0, 12)}…${deviceId.slice(-6)}` : deviceId;
}

function ActivationScreen({ info, onActivated }: { info: LicenseStatus; onActivated: (info: LicenseStatus) => void }) {
  const [licenseKey, setLicenseKey] = useState('');
  const [error, setError] = useState(info.reason && info.reason !== 'NO_LICENSE' ? info.message || '' : '');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = licenseKey.trim().toUpperCase();
    if (!key) {
      setError('Masukkan license key terlebih dahulu.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await activateLicense(key);
      if (result.valid) {
        onActivated(result);
        return;
      }
      setError(result.message || 'Lisensi ditolak oleh server.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aktivasi gagal.');
    } finally {
      setBusy(false);
    }
  }

  async function copyDeviceId() {
    try {
      await navigator.clipboard.writeText(info.deviceId || '');
      setCopied(true);
    } catch {
      setError('Device ID tidak dapat disalin otomatis, salin manual dari kotak di bawah.');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">S</span>
          <div className="flex flex-col">
            <strong className="text-sm font-semibold leading-tight">ScrapeChangeTicket</strong>
            <span className="text-xs text-muted-foreground">Automation</span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <h1 className="text-lg font-semibold leading-none">Aktivasi lisensi</h1>
            <CardDescription>
              Alat ini hanya berjalan dengan license key zevn.web.id yang terikat pada perangkat ini.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-2">
                <Label htmlFor="license-key">License key</Label>
                <Input
                  id="license-key"
                  ref={inputRef}
                  value={licenseKey}
                  onChange={(event) => setLicenseKey(event.target.value.toUpperCase())}
                  placeholder="ZEVN-XXXX-XXXX-XXXX"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'license-error' : undefined}
                  className="font-mono tracking-wider"
                />
              </div>

              {error && (
                <p
                  id="license-error"
                  role="alert"
                  className="rounded-md border border-[oklch(78%_0.16_25)]/20 bg-[oklch(20%_0.04_25)] px-3 py-2 text-sm text-[oklch(78%_0.16_25)]"
                >
                  {error}
                </p>
              )}

              <Button type="submit" className="h-11 w-full" disabled={busy}>
                {busy ? 'Memeriksa lisensi...' : 'Activate License'}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex-col items-stretch gap-3 border-t border-border pt-4">
            <div className="flex flex-col gap-1.5 rounded-md border border-border bg-[oklch(14%_0.018_220)] px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Hostname</span>
                <span className="font-mono">{info.hostname || '-'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Device ID</span>
                <span className="flex items-center gap-1">
                  <span className="font-mono">{truncateDeviceId(info.deviceId)}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={copyDeviceId} aria-label="Salin Device ID lengkap">
                    {copied ? 'Tersalin' : 'Salin'}
                  </Button>
                </span>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Kirim Hostname dan Device ID ke admin zevn.web.id bila perangkat ini perlu direset.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
