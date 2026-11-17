import { WS_BASE_URL, ensureDeviceId } from '../config/api';
import { Post } from '../types';
import { AppState } from 'react-native';

export interface WebSocketMessage {
  type: 'new_post' | 'post_updated' | 'post_removed' | 'user_banned' | 'connection_established' | 'pong' | 'repost_notification';
  post?: Post;
  post_data?: Post;
  count?: number;
  post_id?: string;
  changes?: any;
  reason?: string;
  user_handle?: string;
  post_ids?: string[];
  message?: string;
  timestamp?: string;
  notification_id?: number;
  actor_handle?: string | null;
  snippet?: string;
}

export type WebSocketEventHandler = (message: WebSocketMessage) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  // closed on purpose (disconnect): no reconnecting until connect() again
  private wanted = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private appState: { remove: () => void } | null = null;
  private isConnected = false;
  private eventHandlers: { [key: string]: WebSocketEventHandler[] } = {};

  constructor(baseUrl: string = WS_BASE_URL) {
    this.url = `${baseUrl}/ws/feed/`;
  }

  async connect() {
    this.wanted = true;
    // Back in the foreground: connect at once rather than wait out a backoff
    // (iOS drops the socket while the app is in the background)
    this.appState ??= AppState.addEventListener('change', state => {
      if (state === 'active' && this.wanted && !this.ws) {
        this.reconnectAttempts = 0;
        this.open();
      }
    });
    await this.open();
  }

  private async open() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) return;
    try {
      // The device id identifies this client for targeted notifications
      const deviceId = await ensureDeviceId();
      // (closed, or opened by another call, while the id was read)
      if (!this.wanted || this.ws) return;
      const ws = new WebSocket(`${this.url}?device=${encodeURIComponent(deviceId)}`);
      this.ws = ws;

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected - real-time updates enabled');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connected', { type: 'connection_established' });
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.log('WebSocket message parsing error (non-critical):', error);
        }
      };

      this.ws.onclose = () => {
        if (this.ws !== ws) return; // an old socket, already replaced or closed on purpose
        this.ws = null;
        this.isConnected = false;
        this.emit('disconnected', { type: 'connection_established' });
        this.handleReconnect();
      };

      this.ws.onerror = (error) => {
        console.log('📡 WebSocket unavailable - feed works normally without real-time updates');
        this.isConnected = false;
        this.emit('error', { type: 'connection_established', message: 'Connection error' });
      };
    } catch (error) {
      console.log('WebSocket initialization failed (non-critical):', error);
      this.isConnected = false;
      this.emit('error', { type: 'connection_established', message: 'Connection failed' });
    }
  }

  disconnect() {
    this.wanted = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.appState?.remove();
    this.appState = null;
    const ws = this.ws;
    this.ws = null; // first: its onclose must not reconnect
    ws?.close();
    this.isConnected = false;
    this.reconnectAttempts = 0;
  }

  send(message: any) {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(message));
    }
  }

  ping() {
    this.send({
      type: 'ping',
      timestamp: new Date().toISOString(),
    });
  }

  joinFeed() {
    this.send({
      type: 'join_feed',
    });
  }

  on(event: string, handler: WebSocketEventHandler) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  off(event: string, handler: WebSocketEventHandler) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
    }
  }

  private handleMessage(message: WebSocketMessage) {
    console.log('WebSocket message received:', message);
    
    switch (message.type) {
      case 'new_post':
        this.emit('new_post', message);
        break;
      case 'repost_notification':
        this.emit('repost_notification', message);
        break;
      case 'post_updated':
        this.emit('post_updated', message);
        break;
      case 'post_removed':
        this.emit('post_removed', message);
        break;
      case 'user_banned':
        this.emit('user_banned', message);
        break;
      case 'connection_established':
        this.emit('connected', message);
        break;
      case 'pong':
        this.emit('pong', message);
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  private emit(event: string, message: WebSocketMessage) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach(handler => handler(message));
    }
  }

  // Never gives up: it used to stop after five tries (about 15 seconds
  // offline) and stay off until the app was restarted. Backs off to one try
  // every 30 seconds.
  private handleReconnect() {
    if (!this.wanted || this.reconnectTimer) return;
    this.reconnectAttempts++;
    const delay = Math.min(this.maxReconnectDelay, this.reconnectDelay * 2 ** Math.min(this.reconnectAttempts - 1, 5));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
export default websocketService;
