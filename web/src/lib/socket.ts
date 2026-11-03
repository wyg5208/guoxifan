import { API_BASE } from './api'

export type SocketMessage = { type: string } & Record<string, unknown>

type Handler = (message: SocketMessage) => void
type StatusHandler = (status: SocketStatus) => void

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'closed'

const HEARTBEAT_INTERVAL = 25_000
const MAX_RETRY_DELAY = 20_000

function socketUrl(token: string): string {
  const base = API_BASE
    ? API_BASE.replace(/^http/, 'ws')
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
  return `${base}/ws?token=${encodeURIComponent(token)}`
}

/**
 * 单一 WebSocket 连接：自动重连 + 心跳 + 订阅分发。
 * 断线期间收到的 join_room 请求会在重连后重放。
 */
class VillageSocket {
  private ws: WebSocket | null = null
  private token: string | null = null
  private retry = 0
  private retryTimer: number | null = null
  private heartbeatTimer: number | null = null
  private handlers = new Set<Handler>()
  private statusHandlers = new Set<StatusHandler>()
  private pendingRooms = new Set<string>()
  private status: SocketStatus = 'idle'
  private manualClose = false

  getStatus(): SocketStatus {
    return this.status
  }

  private setStatus(status: SocketStatus) {
    this.status = status
    this.statusHandlers.forEach((handler) => handler(status))
  }

  onMessage(handler: Handler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler)
    return () => this.statusHandlers.delete(handler)
  }

  connect(token: string) {
    if (this.token === token && (this.status === 'open' || this.status === 'connecting')) return
    this.token = token
    this.manualClose = false
    this.open()
  }

  private open() {
    if (!this.token) return
    this.clearTimers()
    this.setStatus('connecting')
    let ws: WebSocket
    try {
      ws = new WebSocket(socketUrl(this.token))
    } catch {
      this.scheduleRetry()
      return
    }
    this.ws = ws

    ws.onopen = () => {
      this.retry = 0
      this.setStatus('open')
      this.startHeartbeat()
      this.pendingRooms.forEach((roomId) => this.send({ type: 'join', room_id: roomId }))
    }

    ws.onmessage = (event) => {
      let payload: SocketMessage
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }
      if (payload.type === 'pong') return
      this.handlers.forEach((handler) => handler(payload))
    }

    ws.onclose = () => {
      this.ws = null
      this.clearTimers()
      this.setStatus('closed')
      if (!this.manualClose) this.scheduleRetry()
    }

    ws.onerror = () => {
      ws.close()
    }
  }

  private scheduleRetry() {
    if (this.manualClose || !this.token) return
    const delay = Math.min(1000 * 2 ** this.retry, MAX_RETRY_DELAY)
    this.retry += 1
    this.retryTimer = window.setTimeout(() => this.open(), delay)
  }

  private startHeartbeat() {
    this.heartbeatTimer = window.setInterval(() => this.send({ type: 'ping' }), HEARTBEAT_INTERVAL)
  }

  private clearTimers() {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer)
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer)
    this.retryTimer = null
    this.heartbeatTimer = null
  }

  send(message: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify(message))
    return true
  }

  join(roomId: string) {
    this.pendingRooms.add(roomId)
    this.send({ type: 'join', room_id: roomId })
  }

  leave(roomId: string) {
    this.pendingRooms.delete(roomId)
    this.send({ type: 'leave', room_id: roomId })
  }

  typing(roomId: string) {
    this.send({ type: 'typing', room_id: roomId })
  }

  disconnect() {
    this.manualClose = true
    this.token = null
    this.pendingRooms.clear()
    this.clearTimers()
    this.ws?.close()
    this.ws = null
    this.setStatus('idle')
  }
}

export const socket = new VillageSocket()
