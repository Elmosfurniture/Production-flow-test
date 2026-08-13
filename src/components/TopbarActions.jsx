import { useState } from 'react'
import { Moon, Printer, Search, Sun } from 'lucide-react'
import { useTheme } from '../lib/useTheme'
import FindOrderModal from './FindOrderModal'

// Shared topbar action row — Find Order, Print, theme toggle.
// Drop into every screen's `.topbar-actions` div so the three primary actions
// are consistent. Each consumer screen still styles `.ibtn` locally.

export default function TopbarActions({ iconSize = 13 }) {
  const { isDark, toggle } = useTheme()
  const [findOpen, setFindOpen] = useState(false)

  return (
    <>
      <button type="button" className="ibtn" onClick={() => setFindOpen(true)}>
        <Search size={iconSize} strokeWidth={2} className="ic" /> Find Order
      </button>
      <button type="button" className="ibtn" onClick={() => window.print()}>
        <Printer size={iconSize} strokeWidth={2} className="ic" /> Print
      </button>
      <button type="button" className="ibtn" onClick={toggle}>
        {isDark ? <Sun size={iconSize} strokeWidth={2} className="ic" /> : <Moon size={iconSize} strokeWidth={2} className="ic" />}
        {isDark ? 'Light' : 'Dark'}
      </button>
      <FindOrderModal open={findOpen} onClose={() => setFindOpen(false)} />
    </>
  )
}
