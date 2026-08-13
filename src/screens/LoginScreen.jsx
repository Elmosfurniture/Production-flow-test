import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Hammer, Axe, Scissors, Truck, Delete, Shield, Clock } from 'lucide-react'
import { signIn, getCurrentUser } from '../lib/auth'

/* ──────────────── Icons (Lucide-style, hand-tuned) ──────────────── */
const Icon = ({ name, size = 22, stroke = 2 }) => {
  const props = {
    width: size, height: size, viewBox: "0 0 24 24",
    fill: "none", stroke: "currentColor", strokeWidth: stroke,
    strokeLinecap: "round", strokeLinejoin: "round"
  };
  switch (name) {
    case 'hammer': return <Hammer {...props} />;
    case 'saw': return <Axe {...props} />;
    case 'thread': return <Scissors {...props} />;
    case 'truck': return <Truck {...props} />;
    case 'arrow': return (
      <svg {...props}><path d="M5 12h14M13 5l7 7-7 7"/></svg>
    );
    case 'face-id': return (
      <svg {...props}>
        <path d="M4 8V6a2 2 0 0 1 2-2h2"/>
        <path d="M16 4h2a2 2 0 0 1 2 2v2"/>
        <path d="M20 16v2a2 2 0 0 1-2 2h-2"/>
        <path d="M8 20H6a2 2 0 0 1-2-2v-2"/>
        <path d="M9 9v2"/>
        <path d="M15 9v2"/>
        <path d="M9 16s1 1.5 3 1.5S15 16 15 16"/>
      </svg>
    );
    case 'delete-key': return <Delete {...props} />;
    case 'shield': return <Shield {...props} />;
    case 'clock': return <Clock {...props} />;
    default: return null;
  }
};

/* ──────────────── Logo (variant 4 — geometric peak/valley silhouette) ──────────────── */
function LogoMark({ size = 64 }) {
  // Soft white tile with navy peak/valley silhouette + warm amber sun dot.
  const r = 18 * (size/64);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="ProductionFlow logo">
      <defs>
        <linearGradient id="lg-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff"/>
          <stop offset="100%" stopColor="#f6f3ec"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx={r} fill="url(#lg-tile)" stroke="rgba(26,29,36,0.10)"/>
      <circle cx="44" cy="22" r="5" fill="#e89a3c"/>
      <path d="M6 46 L20 28 L28 38 L40 22 L52 46 Z" fill="#1f2a44"/>
      <rect x="6" y="46" width="46" height="2" rx="1" fill="#1f2a44" opacity="0.25"/>
    </svg>
  );
}

/* ──────────────── PIN pad ──────────────── */
const PIN_LENGTH = 4;
function PinPad({ value, onChange, onSubmit, error }) {
  const press = (n) => {
    if (value.length >= PIN_LENGTH) return;
    onChange(value + n);
  };
  const del = () => onChange(value.slice(0, -1));

  // auto-submit when filled
  useEffect(() => {
    if (value.length === PIN_LENGTH) {
      const t = setTimeout(() => onSubmit && onSubmit(), 180);
      return () => clearTimeout(t);
    }
  }, [value]);

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') del();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [value]);

  const letters = { '2':'ABC','3':'DEF','4':'GHI','5':'JKL','6':'MNO','7':'PQRS','8':'TUV','9':'WXYZ' };

  return (
    <div>
      <div style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 0 4px'
      }}>
        {[0,1,2,3].map(i => (
          <span key={i} style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: i < value.length ? '#1f2a44' : '#ece8e0',
            border: `1.5px solid ${i < value.length ? '#1f2a44' : 'rgba(26,29,36,0.12)'}`,
            transition: 'background 180ms ease, transform 180ms ease, border-color 180ms ease',
            transform: i < value.length ? 'scale(1.05)' : 'scale(1)',
            animation: error ? 'shake 360ms' : 'none'
          }} />
        ))}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        marginTop: '4px'
      }}>
        {['1','2','3','4','5','6','7','8','9'].map(n => (
          <button key={n} style={{
            appearance: 'none',
            border: '1px solid rgba(26,29,36,0.08)',
            background: '#ece8e0',
            color: '#1a1d24',
            height: '56px',
            borderRadius: '16px',
            fontFamily: 'inherit',
            fontSize: '22px',
            fontWeight: '500',
            letterSpacing: '-0.02em',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 100ms ease, background 180ms ease'
          }} onClick={() => press(n)} aria-label={`Digit ${n}`}>
            <span>{n}</span>
            {letters[n] ? <small style={{
              fontSize: '9px',
              fontWeight: '600',
              letterSpacing: '0.18em',
              color: '#8a8e99',
              marginTop: '2px'
            }}>{letters[n]}</small> : <small>&nbsp;</small>}
          </button>
        ))}
        <button style={{
          appearance: 'none',
          border: '1px solid transparent',
          background: 'transparent',
          height: '56px',
          borderRadius: '16px',
          cursor: 'default'
        }} tabIndex={-1} aria-hidden="true"></button>
        <button style={{
          appearance: 'none',
          border: '1px solid rgba(26,29,36,0.08)',
          background: '#ece8e0',
          color: '#1a1d24',
          height: '56px',
          borderRadius: '16px',
          fontFamily: 'inherit',
          fontSize: '22px',
          fontWeight: '500',
          letterSpacing: '-0.02em',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 100ms ease, background 180ms ease'
        }} onClick={() => press('0')} aria-label="Digit 0">
          <span>0</span><small>&nbsp;</small>
        </button>
        <button style={{
          appearance: 'none',
          border: '1px solid rgba(26,29,36,0.08)',
          background: '#ece8e0',
          color: '#4a4e5a',
          height: '56px',
          borderRadius: '16px',
          fontFamily: 'inherit',
          fontSize: '22px',
          fontWeight: '500',
          letterSpacing: '-0.02em',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 100ms ease, background 180ms ease'
        }} onClick={del} aria-label="Delete">
          <Icon name="delete-key" size={22} />
        </button>
      </div>
    </div>
  );
}

/* ──────────────── Login Screen ──────────────── */
export default function LoginScreen() {
  const navigate = useNavigate();
  const [dept, setDept] = useState('upholstery');
  const [role, setRole] = useState('worker');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const greeting = useMemo(() => {
    const h = now.getHours();
    if (h < 5) return "still up,";
    if (h < 12) return "good morning,";
    if (h < 17) return "good afternoon,";
    if (h < 21) return "good evening,";
    return "good night,";
  }, [now]);

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const shift = useMemo(() => {
    const h = now.getHours();
    if (h >= 6 && h < 14) return 'Shift A · Plant 2';
    if (h >= 14 && h < 22) return 'Shift B · Plant 2';
    return 'Night · Plant 2';
  }, [now]);

  // Auto-skip the login screen if we already have a saved session.
  useEffect(() => {
    if (getCurrentUser()) navigate('/dashboard');
  }, []);

  const submit = async () => {
    if (pin.length !== PIN_LENGTH || loading) return;
    setLoading(true);
    try {
      const session = await signIn({ dept, role, pin });
      if (!session) {
        setError(true);
        setTimeout(() => { setError(false); setPin(''); setLoading(false); }, 600);
        return;
      }
      navigate('/dashboard');
    } catch (e) {
      alert(`Sign-in failed: ${e?.message || e}`);
      setLoading(false);
    }
  };

  const depts = [
    { id: 'steel',       label: 'Steel',       icon: 'hammer' },
    { id: 'wood',        label: 'Wood',        icon: 'saw' },
    { id: 'upholstery',  label: 'Upholstery',  icon: 'thread' },
    { id: 'dispatching', label: 'Dispatching', icon: 'truck' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '22px 14px',
      position: 'relative',
      overflow: 'hidden',
      background: 'radial-gradient(120% 80% at 50% 0%, #fbf9f5 0%, #f4f2ee 40%, #ece8e0 100%)'
    }}>
      <div style={{
        width: 'min(420px, 100%)',
        maxHeight: '100vh',
        background: '#ffffff',
        borderRadius: '44px',
        boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(26,29,36,0.04), 0 8px 24px rgba(26,29,36,0.06), 0 24px 48px rgba(26,29,36,0.06)',
        border: '1px solid rgba(26,29,36,0.08)',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          flex: '1',
          padding: '18px 14px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          {/* Hero */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: '6px',
            marginBottom: '14px'
          }}>
            <div style={{
              width: '90px',
              height: '90px',
              borderRadius: '18px',
              background: '#ffffff',
              border: '1px solid rgba(26,29,36,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(26,29,36,0.06), 0 6px 14px rgba(26,29,36,0.06)',
              marginBottom: '14px'
            }}>
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="ProductionFlow logo"
                style={{ width: '54px', height: '54px', objectFit: 'contain' }}
              />
            </div>
            <div style={{
              marginTop: '10px',
              textAlign: 'center'
            }}>
              <div style={{
                fontSize: '26px',
                fontWeight: '600',
                letterSpacing: '-0.025em',
                color: '#1a1d24',
                lineHeight: '1.15'
              }}>{greeting}</div>
              <div style={{
                fontSize: '15px',
                color: '#4a4e5a',
                marginTop: '4px',
                lineHeight: '1.35'
              }}>
                Brought to you by - ProductionFlow
              </div>
            </div>
          </div>

          {/* Sheet */}
          <div style={{
            background: '#ffffff',
            border: '1px solid rgba(26,29,36,0.08)',
            borderRadius: '28px',
            padding: '16px 14px 18px',
            boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(26,29,36,0.04), 0 8px 24px rgba(26,29,36,0.06), 0 24px 48px rgba(26,29,36,0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            marginTop: '4px'
          }}>
            <div>
              <div style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#8a8e99',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginLeft: '4px',
                marginBottom: '8px'
              }}>Department</div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px'
              }}>
                {depts.map(d => (
                  <button key={d.id} style={{
                    appearance: 'none',
                    border: '0',
                    cursor: 'pointer',
                    width: '100%',
                    background: dept === d.id ? '#1f2a44' : '#ece8e0',
                    border: `1px solid ${dept === d.id ? '#1f2a44' : 'rgba(26,29,36,0.08)'}`,
                    borderRadius: '14px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: dept === d.id ? '#ffffff' : '#1a1d24',
                    fontFamily: 'inherit',
                    fontSize: '15px',
                    fontWeight: '500',
                    letterSpacing: '-0.01em',
                    transition: 'transform 120ms ease, background 200ms ease, border-color 200ms ease, color 200ms ease, box-shadow 200ms ease',
                    textAlign: 'left'
                  }} aria-pressed={dept === d.id} onClick={() => setDept(d.id)}>
                    <span style={{
                      width: '24px',
                      height: '24px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: dept === d.id ? '#e89a3c' : '#4a4e5a',
                      flex: '0 0 24px'
                    }}>
                      <Icon name={d.icon} size={20} />
                    </span>
                    <span>{d.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#8a8e99',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginLeft: '4px',
                marginBottom: '8px'
              }}>I am a…</div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                background: '#ece8e0',
                border: '1px solid rgba(26,29,36,0.08)',
                borderRadius: '14px',
                padding: '4px',
                gap: '2px',
                position: 'relative'
              }}>
                {['boss','manager','worker'].map(r => (
                  <button key={r} style={{
                    appearance: 'none',
                    border: '0',
                    background: role === r ? '#ffffff' : 'transparent',
                    padding: '9px 8px',
                    fontFamily: 'inherit',
                    fontSize: '14px',
                    fontWeight: role === r ? '600' : '500',
                    color: role === r ? '#1a1d24' : '#4a4e5a',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    letterSpacing: '-0.01em',
                    transition: 'color 200ms ease',
                    boxShadow: role === r ? '0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(26,29,36,0.06), 0 2px 6px rgba(26,29,36,0.06)' : 'none'
                  }} aria-pressed={role === r} onClick={() => setRole(r)}>
                    {r[0].toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#8a8e99',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginLeft: '4px',
                marginBottom: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>Enter PIN</span>
                <span style={{
                  display: 'inline-flex',
                  gap: '4px',
                  alignItems: 'center',
                  textTransform: 'none',
                  letterSpacing: '0',
                  fontWeight: '500',
                  color: '#8a8e99',
                  fontSize: '11px'
                }}>
                  <Icon name="shield" size={11} /> 4-digit
                </span>
              </div>
              <PinPad value={pin} onChange={setPin} onSubmit={submit} error={error} />
            </div>

            <button style={{
              appearance: 'none',
              border: '0',
              width: '100%',
              background: '#1f2a44',
              color: '#ffffff',
              padding: '16px 18px',
              borderRadius: '18px',
              fontFamily: 'inherit',
              fontSize: '17px',
              fontWeight: '600',
              letterSpacing: '-0.01em',
              cursor: pin.length !== PIN_LENGTH || loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 16px rgba(31,42,68,0.28), 0 2px 4px rgba(31,42,68,0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              transition: 'transform 120ms ease, background 200ms ease, opacity 200ms ease',
              opacity: pin.length !== PIN_LENGTH || loading ? '0.4' : '1'
            }} disabled={pin.length !== PIN_LENGTH || loading} onClick={submit}>
              {loading ? 'Signing in…' : (
                <>
                  Sign In
                  <span style={{
                    transition: 'transform 240ms ease'
                  }}>
                    <Icon name="arrow" size={18} />
                  </span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
