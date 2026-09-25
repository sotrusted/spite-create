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

// Single in-flight promise: app launch fires profile + feed + notifications
// concurrently, and without this they each raced to mint a DIFFERENT uuid.
// The losers became orphan accounts and the winner's handle PATCH failed with
// "that handle is taken" - by the user's own shadow account.
let deviceIdPromise: Promise<string> | null = null;

const loadOrMintDeviceId = async (): Promise<string> => {
  try {
    const info = await LegacyFS.getInfoAsync(DEVICE_ID_FILE);
    if (info.exists) {
      const stored = (await LegacyFS.readAsStringAsync(DEVICE_ID_FILE)).trim();
      if (stored) {
        cachedDeviceId = stored;
        return stored;
      }
    }
  } catch {}
  const minted = mintUuid();
  try {
    await LegacyFS.writeAsStringAsync(DEVICE_ID_FILE, minted);
  } catch {}
  cachedDeviceId = minted;
  return minted;
};

export const ensureDeviceId = async (): Promise<string> => {
  if (cachedDeviceId) return cachedDeviceId;
  if (!deviceIdPromise) deviceIdPromise = loadOrMintDeviceId();
  return deviceIdPromise;
};

// First-run flag: when absent, the feed opens the handle picker
export const ONBOARD_FLAG = LegacyFS.documentDirectory + 'onboarded.flag';

// After account deletion: the old id must never be sent again, or the next
// request would quietly recreate an empty account under it. A fresh id and
// no onboarding flag make the next launch a first launch.
export const resetIdentity = async () => {
  const minted = mintUuid();
  await LegacyFS.writeAsStringAsync(DEVICE_ID_FILE, minted);
  cachedDeviceId = minted;
  deviceIdPromise = null;
  await LegacyFS.deleteAsync(ONBOARD_FLAG, { idempotent: true });
};

// Synchronous accessor for callers that run after startup (WS URL);
// ensureDeviceId() must have resolved at least once first
export const getDeviceId = () => cachedDeviceId || 'pending-device-id';

// API base URL. In development, derive the host from Expo's own connection
// to the dev machine so it keeps working when the LAN IP changes. An explicit
// apiUrl in app.json extra takes precedence (for production builds).
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
// The extra.apiUrl override exists ONLY for dev tunnel sessions. It is
// ignored outside __DEV__ because app.json gets snapshotted into builds
// and OTA updates: a tunnel URL left behind by a dead dev session once
// shipped inside a TestFlight build and pointed real phones at nothing.
const devOverride = __DEV__ ? Constants.expoConfig?.extra?.apiUrl : undefined;
// Standalone builds have no dev-server hostUri: they land on production
export const API_BASE_URL =
  devOverride ||
  (devHost ? `http://${devHost}:8001` : 'https://api.creativemindsideasmagazine.com');

// WebSocket URL derived from the same host
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws');

// Resolve a server-relative path (e.g. /media/...) to an absolute URL
// Anything already carrying a scheme is left alone. Optimistic posts use a
// local file:// snapshot, and prefixing that with the API base turned it into
// a 404 - the snapshot was rendering as a blank card.
export const absoluteUrl = (path?: string | null) =>
  !path ? undefined : /^[a-z][a-z0-9+.-]*:/i.test(path) ? path : `${API_BASE_URL}${path}`;

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
  deleteAccount: '/users/me/',
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
