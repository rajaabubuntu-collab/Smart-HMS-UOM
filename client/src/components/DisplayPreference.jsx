import { createContext, useContext, useEffect, useState } from 'react';
import { Contrast } from 'lucide-react';

const DisplayContext = createContext(null);
const storageKey = 'smart-hms-solid-surfaces';

export function DisplayProvider({ children }) {
  const [solid, setSolid] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.dataset.surfaces = solid ? 'solid' : 'glass';
    try {
      localStorage.setItem(storageKey, String(solid));
    } catch {
      // The preference still works for this session when browser storage is blocked.
    }
  }, [solid]);
  return <DisplayContext.Provider value={{ solid, setSolid }}>{children}</DisplayContext.Provider>;
}

export function DisplayPreference() {
  const { solid, setSolid } = useContext(DisplayContext);
  return (
    <button
      type="button"
      className="surface-toggle"
      aria-pressed={solid}
      title="Use opaque surfaces for easier reading"
      onClick={() => setSolid((value) => !value)}
    >
      <Contrast size={17} aria-hidden="true" />
      <span>Solid surfaces</span>
    </button>
  );
}
