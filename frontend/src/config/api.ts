import axios from 'axios';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

// Get the device ID for anonymous user identification
export const getDeviceId = () => {
  return Device.deviceYearClass ? `${Device.brand}_${Device.deviceYearClass}_${Device.modelId}` : 'unknown_device';
};

// API base URL - you can configure this via app.json or environment
const API_BASE_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:8001';

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
  
  // Moderation
  reportPost: (id: string) => `/posts/${id}/report/`,
  reportUser: (handle: string) => `/users/${handle}/report/`,
  muteUser: (handle: string) => `/users/${handle}/mute/`,
  unmuteUser: (handle: string) => `/users/${handle}/unmute/`,
  
  // User
  createUser: '/users/create/',
  getUserProfile: '/users/profile/',
};

// Request interceptor to add device ID and logging
api.interceptors.request.use(
  (config) => {
    const deviceId = getDeviceId();
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
