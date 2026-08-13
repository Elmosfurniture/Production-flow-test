import { supabase } from './supabase'

// Order-level write helpers — anything that touches a single row on the
// `orders` table sits here so screens don't talk to Supabase directly.

// Mark an order as ready for the dispatch team to load out. This is the
// "final tick" on Part Tracking — once it's set, the order leaves Tracking
// and appears in Dashboard's Ready-for-Dispatch section + the Dispatch
// calendar's ready-to-go state.
export async function markReadyForDispatch(orderId) {
  if (!orderId) throw new Error('Order id required')
  const { data, error } = await supabase
    .from('orders')
    .update({ ready_for_dispatch_at: new Date().toISOString() })
    .eq('id', orderId)
    .select('id, ready_for_dispatch_at')
    .single()
  if (error) throw new Error(`Marking ready for dispatch: ${error.message}`)
  return data
}

// Undo the final tick — puts the order back on Tracking and clears the
// ready flag. Useful when the boss ticked the wrong order.
export async function unmarkReadyForDispatch(orderId) {
  if (!orderId) throw new Error('Order id required')
  const { data, error } = await supabase
    .from('orders')
    .update({ ready_for_dispatch_at: null })
    .eq('id', orderId)
    .select('id, ready_for_dispatch_at')
    .single()
  if (error) throw new Error(`Unmarking ready for dispatch: ${error.message}`)
  return data
}

// Dispatch team's final action: the truck left, the order is gone. Flips
// status='completed' + shipped_at=now. Order disappears from the Dispatch
// calendar and joins the Completed Orders section on Dashboard.
export async function markShipped(orderId) {
  if (!orderId) throw new Error('Order id required')
  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'completed', shipped_at: new Date().toISOString() })
    .eq('id', orderId)
    .select('id, status, shipped_at')
    .single()
  if (error) throw new Error(`Marking shipped: ${error.message}`)
  return data
}

// Undo a ship — clears shipped_at and reverts status to in_progress so the
// order pops back onto the Dispatch calendar.
export async function unmarkShipped(orderId) {
  if (!orderId) throw new Error('Order id required')
  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'in_progress', shipped_at: null })
    .eq('id', orderId)
    .select('id, status, shipped_at')
    .single()
  if (error) throw new Error(`Unmarking shipped: ${error.message}`)
  return data
}
