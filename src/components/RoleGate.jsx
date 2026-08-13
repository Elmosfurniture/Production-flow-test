import { Navigate } from 'react-router-dom'
import { getCurrentUser } from '../lib/auth'

// Wrap a routed element to restrict it to specific roles. Anyone whose current
// session role isn't in `allow` (or who isn't signed in at all) is redirected
// to `fallback` (default /dashboard).
export default function RoleGate({ allow, children, fallback = '/dashboard' }) {
  const user = getCurrentUser()
  if (!user || !allow.includes(user.role)) {
    return <Navigate to={fallback} replace />
  }
  return children
}
