import { useMemo } from 'react'
import { useAppData } from './AppDataContext'
import { buildWoodConveyor } from '../lib/woodDayEngine'
import { loadWoodStartOverrides } from '../lib/orderDeptStart'

// Shared wood day-conveyor computation. Every wood view (Schedule, Priority,
// Week Plan, Tracking) is a different projection of this ONE result, so they
// all agree on start dates, lead days, urgency and over-capacity flags.
//
// Pure + read-only: buildWoodConveyor never touches the database. It runs off
// the already-cached AppDataContext maps, so switching to a wood tab does no
// network I/O and cannot corrupt live data.
//
// Returns:
//   result    — { machines, weeks, orders, warnings, unassigned } (see woodDayEngine)
//   woodSetup — { total, set } wood machines vs those with a route rank
//   loading, error, machines — passthrough from AppDataContext
export function useWoodConveyor() {
  const {
    orders, machines, loading, error,
    productByCode, partsByProduct, stepsByPart, machineByName, customerByCode,
    holidaySet, bufferDaysByDept,
  } = useAppData()

  // Only orders still in production — completed / shipped ones have left the
  // floor and shouldn't be re-planned onto the conveyor.
  const activeOrders = useMemo(
    () => (orders || []).filter((o) => o.status !== 'completed' && !o.shipped_at),
    [orders],
  )

  const result = useMemo(() => buildWoodConveyor({
    orders: activeOrders,
    productByCode, partsByProduct, stepsByPart, machineByName, customerByCode,
    holidaySet, bufferDaysByDept,
    deptStartOverrides: loadWoodStartOverrides(),
  }), [activeOrders, productByCode, partsByProduct, stepsByPart, machineByName, customerByCode, holidaySet, bufferDaysByDept])

  const woodSetup = useMemo(() => {
    const wood = (machines || []).filter((m) => m.department === 'wood')
    return { total: wood.length, set: wood.filter((m) => m.wood_day != null).length }
  }, [machines])

  return { result, woodSetup, loading, error, machines }
}
