import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import {
  Beer,
  LogOut,
  Clock,
  ChefHat,
  CheckCircle,
  Package,
  RefreshCw,
  ScanLine,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
} from 'lucide-react'
import OrderDetails from './OrderDetails'
import QRScanner from './QRScanner'
import type { UserProfile, Order } from '../types'

interface Props {
  profile: UserProfile
  onLogout: () => void
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pendiente',
    icon: Clock,
    color: 'bg-orange-50 border-orange-200 text-orange-700',
    badge: 'bg-orange-500',
  },
  preparing: {
    label: 'Preparando',
    icon: ChefHat,
    color: 'bg-violet-50 border-violet-200 text-violet-700',
    badge: 'bg-violet-500',
  },
  ready: {
    label: 'Listo',
    icon: CheckCircle,
    color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    badge: 'bg-emerald-500',
  },
  completed: {
    label: 'Entregado',
    icon: Package,
    color: 'bg-slate-50 border-slate-200 text-slate-500',
    badge: 'bg-slate-400',
  },
}

type FilterStatus = 'all' | 'pending' | 'preparing' | 'ready' | 'completed'

type SortKey =
  | 'created_at'
  | 'total'
  | 'alcohol'
  | 'items'
  | 'pickup_code'
  | 'client'

type SortDir = 'asc' | 'desc'

function safeDateMs(value: string | undefined) {
  const ms = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(ms) ? ms : 0
}

function normalizeText(value: string | undefined) {
  return (value || '').trim().toLocaleLowerCase('es-ES')
}

function isAlcoholicMenuItemName(name: string | undefined) {
  const normalized = normalizeText(name)
  if (!normalized) return false
  // Heurística simple para diferenciar “sin alcohol”
  if (normalized.includes('sin alcohol') || normalized.includes('0,0') || normalized.includes('0.0')) {
    return false
  }
  // Cervezas/cócteles típicamente son alcohólicas
  return (
    normalized.includes('cerveza') ||
    normalized.includes('caña') ||
    normalized.includes('jarra') ||
    normalized.includes('vino') ||
    normalized.includes('copa') ||
    normalized.includes('whisky') ||
    normalized.includes('ginebra') ||
    normalized.includes('ron') ||
    normalized.includes('vodka') ||
    normalized.includes('tequila')
  )
}

function isAlcoholicMenuItemCategory(category: string | undefined) {
  const normalized = normalizeText(category)
  if (!normalized) return false
  return normalized === 'cervezas' || normalized === 'alcohol' || normalized.includes('vino')
}

function getOrderItemCount(order: Order) {
  const items = order.items || []
  return items.reduce((sum, i) => sum + (i.quantity || 0), 0)
}

function getOrderAlcoholUnits(order: Order) {
  const items = order.items || []
  return items.reduce((sum, i) => {
    const ingredientType = (i.ingredient as { type?: string } | undefined)?.type
    const menuName = (i.menu_item as { name?: string } | undefined)?.name
    const menuCategory = (i.menu_item as { category?: string } | undefined)?.category
    const isAlcoholic =
      ingredientType === 'alcohol' ||
      isAlcoholicMenuItemCategory(menuCategory) ||
      isAlcoholicMenuItemName(menuName)
    return sum + (isAlcoholic ? i.quantity || 0 : 0)
  }, 0)
}

function compareNumbers(a: number, b: number, dir: SortDir) {
  const delta = a - b
  return dir === 'asc' ? delta : -delta
}

function compareText(a: string, b: string, dir: SortDir) {
  const delta = a.localeCompare(b, 'es-ES', { sensitivity: 'base' })
  return dir === 'asc' ? delta : -delta
}

function formatElapsedSince(createdAt: string, nowMs: number) {
  const createdMs = safeDateMs(createdAt)
  const diffMs = Math.max(0, nowMs - createdMs)
  const totalMinutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours <= 0) return `hace ${minutes}m`
  return `hace ${hours}h ${minutes.toString().padStart(2, '0')}m`
}

function OrderList({ profile, onLogout }: Props) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [scanError, setScanError] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())

  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [optionsOpen, setOptionsOpen] = useState(false)
  const [bulkUpdating, setBulkUpdating] = useState(false)

  const fetchOrders = useCallback(async () => {
    const query = supabase
      .from('orders')
      .select(
        '*, items:order_items(*, menu_item:menu_items(*), ingredient:drink_ingredients(*))'
      )
      .in('status', ['pending', 'preparing', 'ready', 'completed'])
      .order('created_at', { ascending: false })

    const { data, error } = await query
    if (!error && data) {
      setOrders(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 5000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 30000)
    return () => clearInterval(interval)
  }, [])

  const updateOrderStatus = async (
    orderId: string,
    newStatus: 'preparing' | 'ready' | 'completed'
  ) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)

    if (!error) {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      )
      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus } : null))
      }
    }
  }

  const markAllAsCompleted = async () => {
    if (bulkUpdating) return
    const active = orders.filter((o) => o.status !== 'completed')
    if (active.length === 0) return

    const ok = window.confirm(
      `¿Marcar como entregados todos los pedidos activos? (Total: ${active.length})`
    )
    if (!ok) return

    setBulkUpdating(true)
    const { error } = await supabase
      .from('orders')
      .update({ status: 'completed' })
      .in('status', ['pending', 'preparing', 'ready'])

    if (!error) {
      setOrders((prev) =>
        prev.map((o) => (o.status === 'completed' ? o : { ...o, status: 'completed' }))
      )
      setSelectedOrder((prev) => (prev ? { ...prev, status: 'completed' } : null))
      setOptionsOpen(false)
    }
    setBulkUpdating(false)
  }

  const handleQRScan = async (data: string) => {
    setScanError('')

    // Código manual: buscar pedido por pickup_code
    if (data.startsWith('MANUAL:')) {
      const code = data.replace('MANUAL:', '')
      const order = orders.find((o) => o.pickup_code === code && o.status === 'ready')
      if (!order) {
        setScanError('Código incorrecto o el pedido no está listo.')
        return false
      }

      await updateOrderStatus(order.id, 'completed')
      await fetchOrders()
      return true
    }

    // QR escaneado con cámara
    try {
      const parsed = JSON.parse(data)
      if (!parsed.orderId) {
        setScanError('QR inválido.')
        return false
      }

      await updateOrderStatus(parsed.orderId, 'completed')
      await fetchOrders()
      return true
    } catch {
      setScanError('QR inválido.')
      return false
    }
  }

  const activeOrders = orders.filter((o) => o.status !== 'completed')
  const filteredOrders =
    filter === 'all' ? activeOrders : orders.filter((o) => o.status === filter)

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    let primary = 0
    switch (sortKey) {
      case 'created_at':
        primary = compareNumbers(safeDateMs(a.created_at), safeDateMs(b.created_at), sortDir)
        break
      case 'total':
        primary = compareNumbers(a.total || 0, b.total || 0, sortDir)
        break
      case 'alcohol':
        primary = compareNumbers(getOrderAlcoholUnits(a), getOrderAlcoholUnits(b), sortDir)
        break
      case 'items':
        primary = compareNumbers(getOrderItemCount(a), getOrderItemCount(b), sortDir)
        break
      case 'pickup_code':
        primary = compareText(normalizeText(a.pickup_code), normalizeText(b.pickup_code), sortDir)
        break
      case 'client':
        primary = compareText(normalizeText(a.user_name), normalizeText(b.user_name), sortDir)
        break
      default:
        primary = 0
    }

    if (primary !== 0) return primary
    // Desempate estable: más nuevo primero
    const byDate = safeDateMs(b.created_at) - safeDateMs(a.created_at)
    if (byDate !== 0) return byDate
    return (a.id || '').localeCompare(b.id || '')
  })

  const counts = {
    all: activeOrders.length,
    pending: orders.filter((o) => o.status === 'pending').length,
    preparing: orders.filter((o) => o.status === 'preparing').length,
    ready: orders.filter((o) => o.status === 'ready').length,
    completed: orders.filter((o) => o.status === 'completed').length,
  }

  if (showScanner) {
    return (
      <QRScanner
        onScan={handleQRScan}
        onClose={() => { setShowScanner(false); setScanError('') }}
        externalError={scanError}
      />
    )
  }

  if (selectedOrder) {
    return (
      <OrderDetails
        order={selectedOrder}
        onBack={() => setSelectedOrder(null)}
        onUpdateStatus={updateOrderStatus}
        onOpenScanner={() => { setScanError(''); setSelectedOrder(null); setShowScanner(true) }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Beer className="w-7 h-7 text-primary-600" />
            <span className="font-bold text-lg text-gray-800">BarApp</span>
            <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-medium">
              Camarero
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setScanError(''); setSelectedOrder(null); setShowScanner(true) }}
              className="p-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition"
              title="Escanear QR"
            >
              <ScanLine className="w-5 h-5" />
            </button>
            <button
              onClick={fetchOrders}
              className="p-2 text-gray-400 hover:text-primary-600 transition"
              title="Actualizar"
            >
              <RefreshCw className="w-5 h-5" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setOptionsOpen((v) => !v)}
                className={`p-2 rounded-xl transition ${
                  optionsOpen ? 'text-primary-600 bg-primary-50' : 'text-gray-400 hover:text-primary-600'
                }`}
                title="Opciones"
              >
                <SlidersHorizontal className="w-5 h-5" />
              </button>

              {optionsOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default"
                    aria-label="Cerrar opciones"
                    onClick={() => setOptionsOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-[320px] z-50 bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden">
                    <div className="p-4 border-b border-gray-100">
                      <div className="flex items-center gap-2 mb-3">
                        <ArrowUpDown className="w-4 h-4 text-gray-400" />
                        <p className="text-sm font-semibold text-gray-700">Ordenación</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={sortKey}
                          onChange={(e) => setSortKey(e.target.value as SortKey)}
                          className="flex-1 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="created_at">Antigüedad</option>
                          <option value="total">Precio</option>
                          <option value="alcohol">Alcohol</option>
                          <option value="items">Cantidad</option>
                          <option value="client">Cliente</option>
                          <option value="pickup_code">Código</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                          className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
                          title={sortDir === 'asc' ? 'Ascendente' : 'Descendente'}
                        >
                          {sortDir === 'asc' ? (
                            <ArrowUp className="w-4 h-4 text-gray-600" />
                          ) : (
                            <ArrowDown className="w-4 h-4 text-gray-600" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="p-4">
                      <p className="text-sm font-semibold text-gray-700 mb-3">Acciones</p>
                      <button
                        type="button"
                        onClick={markAllAsCompleted}
                        disabled={bulkUpdating || orders.every((o) => o.status === 'completed')}
                        className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 disabled:hover:bg-white flex items-center justify-between"
                        title="Marca como entregados todos los pedidos activos"
                      >
                        <span className="text-sm font-medium">Marcar todos como entregados</span>
                        {bulkUpdating ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
                        ) : (
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        )}
                      </button>
                      <p className="mt-2 text-xs text-gray-400">
                        Afecta a los pedidos no entregados.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={onLogout}
              className="p-2 text-gray-400 hover:text-red-500 transition"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          👨‍🍳 Panel de Pedidos
        </h2>

        {/* Filtros */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
          {(
            [
              { key: 'all', label: 'Todos', active: 'bg-primary-600 text-white', inactive: 'text-primary-600 border-primary-200' },
              { key: 'pending', label: 'Pendientes', active: 'bg-orange-500 text-white', inactive: 'text-orange-600 border-orange-200' },
              { key: 'preparing', label: 'Preparando', active: 'bg-violet-500 text-white', inactive: 'text-violet-600 border-violet-200' },
              { key: 'ready', label: 'Listos', active: 'bg-emerald-500 text-white', inactive: 'text-emerald-600 border-emerald-200' },
              { key: 'completed', label: 'Entregados', active: 'bg-slate-500 text-white', inactive: 'text-slate-500 border-slate-200' },
            ] as { key: FilterStatus; label: string; active: string; inactive: string }[]
          ).map(({ key, label, active, inactive }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition flex items-center gap-2 shadow-sm ${
                filter === key
                  ? `${active} shadow-md`
                  : `bg-white ${inactive} hover:bg-gray-50 border`
              }`}
            >
              {label}
              <span
                className={`w-5 h-5 flex items-center justify-center rounded-full text-xs ${
                  filter === key
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
          </div>
        ) : sortedOrders.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-500">
              No hay pedidos {filter !== 'all' ? 'con este estado' : ''}
            </h3>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedOrders.map((order) => {
              const config =
                STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG]
              if (!config) return null
              const StatusIcon = config.icon

              return (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition text-left"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${config.badge}`}
                      ></span>
                      <span className="font-semibold text-gray-800">
                        #{order.pickup_code}
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${config.color}`}
                    >
                      <StatusIcon className="w-3.5 h-3.5" />
                      {config.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      {order.user_name || 'Cliente'} •{' '}
                      {new Date(order.created_at).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' '}
                      <span className="inline-flex items-center gap-1 ml-2 text-gray-400">
                        <Clock className="w-3.5 h-3.5" />
                        {formatElapsedSince(order.created_at, nowMs)}
                      </span>
                    </span>
                    <span className="font-bold text-primary-600">
                      {order.total.toFixed(2)}€
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

export default function WaiterView(props: Props) {
  return (
    <Routes>
      <Route index element={<OrderList {...props} />} />
      <Route path="*" element={<Navigate to="/waiter" replace />} />
    </Routes>
  )
}
