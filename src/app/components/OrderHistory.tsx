import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../utils/supabase'
import { Clock, ChefHat, CheckCircle, Package, QrCode, ChevronDown, ChevronUp } from 'lucide-react'
import QRCode from 'qrcode'
import type { Order } from '../types'

interface Props {
  userId: string
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pendiente',
    icon: Clock,
    color: 'text-orange-600 bg-orange-50 border-orange-200',
  },
  preparing: {
    label: 'Preparando',
    icon: ChefHat,
    color: 'text-violet-600 bg-violet-50 border-violet-200',
  },
  ready: {
    label: 'Listo',
    icon: CheckCircle,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  },
  completed: {
    label: 'Completado',
    icon: Package,
    color: 'text-slate-500 bg-slate-50 border-slate-200',
  },
}

export default function OrderHistory({ userId }: Props) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [qrImages, setQrImages] = useState<Record<string, string>>({})
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, items:order_items(*, menu_item:menu_items(*), ingredient:drink_ingredients(*))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setOrders(data)
      // Generar QR para pedidos listos
      for (const order of data) {
        if (order.status === 'ready' && !qrImages[order.id]) {
          const qrData = JSON.stringify({
            orderId: order.id,
            userId: order.user_id,
            userName: order.user_name,
            total: order.total,
          })
          const url = await QRCode.toDataURL(qrData, { width: 200, margin: 2 })
          setQrImages((prev) => ({ ...prev, [order.id]: url }))
        }
      }
    }
    setLoading(false)
  }, [userId, qrImages])

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 5000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  const toggleOrder = (orderId: string) => {
    setExpandedOrder(expandedOrder === orderId ? null : orderId)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-16">
        <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-500">Sin pedidos todavía</h3>
        <p className="text-sm text-gray-400 mt-1">
          Cuando hagas tu primer pedido aparecerá aquí
        </p>
      </div>
    )
  }

  const activeOrders = orders.filter((o) => o.status !== 'completed')
  const completedOrders = orders.filter((o) => o.status === 'completed')

  const renderOrder = (order: Order) => {
    const config = STATUS_CONFIG[order.status]
    const StatusIcon = config.icon

    return (
      <div
        key={order.id}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
      >
        <button
          onClick={() => toggleOrder(order.id)}
          className="w-full p-4 text-left"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">
              {new Date(order.created_at).toLocaleString('es-ES')}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${config.color}`}
            >
              <StatusIcon className="w-3.5 h-3.5" />
              {config.label}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-800">Pedido #{order.pickup_code}</p>
            <span className="text-lg font-bold text-primary-600">
              {order.total.toFixed(2)}€
            </span>
          </div>
        </button>

        {expandedOrder === order.id && (
          <div className="border-t border-gray-100 p-4">
            {order.items && order.items.length > 0 ? (
              <div className="space-y-2">
                {(() => {
                  const menuItems = order.items!.filter((i) => i.menu_item_id)
                  const ingredientItems = order.items!.filter((i) => i.ingredient_id)
                  return (
                    <>
                      {menuItems.map((item) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            {item.quantity}x {item.menu_item?.name || 'Producto'}
                          </span>
                          <span className="text-gray-800 font-medium">
                            {(item.price * item.quantity).toFixed(2)}€
                          </span>
                        </div>
                      ))}
                      {ingredientItems.length > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            🧪 {ingredientItems.map((i) => i.ingredient?.name || 'Ingrediente').join(' + ')}
                          </span>
                          <span className="text-gray-800 font-medium">
                            {ingredientItems.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2)}€
                          </span>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center">Sin productos</p>
            )}

            {order.status === 'ready' && (
              <div className="mt-4 text-center p-4 bg-green-50 rounded-xl border border-green-200">
                <p className="text-sm font-medium text-green-700 mb-3 flex items-center justify-center gap-2">
                  <QrCode className="w-5 h-5" />
                  ¡Tu pedido está listo! Muestra este código
                </p>
                {qrImages[order.id] && (
                  <img
                    src={qrImages[order.id]}
                    alt="Código QR del pedido"
                    className="mx-auto rounded-lg"
                  />
                )}
                <p className="mt-3 text-2xl font-bold text-green-800 tracking-widest">
                  {order.pickup_code}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">📜 Mis Pedidos</h2>

      {/* Pedidos activos */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-3">
          Pedidos activos
        </h3>
        {activeOrders.length === 0 ? (
          <p className="text-sm text-blue-400 text-center py-4">No tienes pedidos en curso</p>
        ) : (
          <div className="space-y-3">
            {activeOrders.map(renderOrder)}
          </div>
        )}
      </div>

      {/* Pedidos completados */}
      {completedOrders.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted((prev) => !prev)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <span>Ver pedidos completados ({completedOrders.length})</span>
            {showCompleted ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {showCompleted && (
            <div className="mt-3 space-y-3">
              {completedOrders.map(renderOrder)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
