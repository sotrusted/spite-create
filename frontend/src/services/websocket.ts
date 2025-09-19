import { Post } from '../types';

export interface WebSocketMessage {
  type: 'new_post' | 'post_updated' | 'post_removed' | 'user_banned' | 'connection_established' | 'pong';
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

  constructor(baseUrl: string = 'ws://localhost:8000') {
    this.url = `${baseUrl}/ws/feed/`;
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connected', { type: 'connection_established' });
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.isConnected = false;
        this.emit('disconnected', { type: 'connection_established' });
        this.handleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', { type: 'connection_established', message: 'Connection error' });
      };
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      this.handleReconnect();
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
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.log('Max reconnection attempts reached');
      this.emit('max_reconnects_reached', { type: 'connection_established' });
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
