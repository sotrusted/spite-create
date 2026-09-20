import { WS_BASE_URL, ensureDeviceId } from '../config/api';
import { Post } from '../types';

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
  actor_handle?: string;
  snippet?: string;
}

export type WebSocketEventHandler = (message: WebSocketMessage) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnected = false;
  private eventHandlers: { [key: string]: WebSocketEventHandler[] } = {};

  constructor(baseUrl: string = WS_BASE_URL) {
    this.url = `${baseUrl}/ws/feed/`;
  }

  async connect() {
    try {
      // The device id identifies this client for targeted notifications
      const deviceId = await ensureDeviceId();
      this.ws = new WebSocket(`${this.url}?device=${encodeURIComponent(deviceId)}`);
      
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
        console.log('📡 WebSocket disconnected - using polling fallback');
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
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

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`📡 Attempting WebSocket reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) - feed continues normally`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.log('📡 WebSocket reconnection stopped - feed will use refresh for updates');
      this.isConnected = false;
      // Don't emit error - just silently fall back to polling
    }
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
