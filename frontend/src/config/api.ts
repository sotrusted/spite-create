import axios from 'axios';
import Constants from 'expo-constants';
import * as LegacyFS from 'expo-file-system/legacy';

// Anonymous identity = a UUID minted once per install and persisted.
// (The old brand_yearClass_model scheme collided: every phone of the same
// model was the same user.)
const DEVICE_ID_FILE = LegacyFS.documentDirectory + 'device-id';
let cachedDeviceId: string | null = null;

const mintUuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export const ensureDeviceId = async (): Promise<string> => {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const info = await LegacyFS.getInfoAsync(DEVICE_ID_FILE);
    if (info.exists) {
      cachedDeviceId = (await LegacyFS.readAsStringAsync(DEVICE_ID_FILE)).trim();
      if (cachedDeviceId) return cachedDeviceId;
    }
  } catch {}
  cachedDeviceId = mintUuid();
  try {
    await LegacyFS.writeAsStringAsync(DEVICE_ID_FILE, cachedDeviceId);
  } catch {}
  return cachedDeviceId;
};

// Synchronous accessor for callers that run after startup (WS URL);
// ensureDeviceId() must have resolved at least once first
export const getDeviceId = () => cachedDeviceId || 'pending-device-id';

// API base URL. In development, derive the host from Expo's own connection
// to the dev machine so it keeps working when the LAN IP changes. An explicit
// apiUrl in app.json extra takes precedence (for production builds).
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
// Standalone builds have no dev-server hostUri: they land on production
export const API_BASE_URL =
  Constants.expoConfig?.extra?.apiUrl ||
  (devHost ? `http://${devHost}:8001` : 'https://api.creativemindsideasmagazine.com');

// WebSocket URL derived from the same host
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws');

// Resolve a server-relative path (e.g. /media/...) to an absolute URL
export const absoluteUrl = (path?: string | null) =>
  !path ? undefined : path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

// Create axios instance with default config
export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'X-Device-ID': getDeviceId(),
  },
});

// API endpoints
export const endpoints = {
  // Posts
  createPost: '/posts/',
  getFeed: '/feed/',
  getPost: (id: string) => `/posts/${id}/`,
  uploadSticker: '/stickers/upload/',
  uploadBackground: '/backgrounds/upload/',
  
  // Notifications
  getNotifications: '/notifications/',
  markNotificationsRead: '/notifications/read/',

  // Moderation
  reportPost: (id: string) => `/posts/${id}/report/`,
  reportUser: (handle: string) => `/users/${handle}/report/`,
  muteUser: (handle: string) => `/users/${handle}/mute/`,
  unmuteUser: (handle: string) => `/users/${handle}/unmute/`,
  blockUser: (handle: string) => `/users/${handle}/block/`,
  unblockUser: (handle: string) => `/users/${handle}/unblock/`,
  
  // User
  createUser: '/users/create/',
  getUserProfile: '/users/profile/',
};

// Request interceptor to add device ID and logging
api.interceptors.request.use(
  async (config) => {
    const deviceId = await ensureDeviceId();
    config.headers['X-Device-ID'] = deviceId;
    
    console.log('🔵 API Request:', {
      method: config.method?.toUpperCase(),
      url: `${config.baseURL}${config.url}`,
      deviceId: deviceId,
      headers: config.headers,
    });
    
    return config;
  },
  (error) => {
    console.error('🔴 Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling and logging
api.interceptors.response.use(
  (response) => {
    console.log('🟢 API Success:', {
      status: response.status,
      url: response.config.url,
      data: response.data,
    });
    return response;
  },
  (error) => {
    console.error('🔴 API Error Details:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      baseURL: error.config?.baseURL,
      fullURL: `${error.config?.baseURL}${error.config?.url}`,
      responseData: error.response?.data,
      headers: error.config?.headers,
    });
    return Promise.reject(error);
  }
);

export default api;
