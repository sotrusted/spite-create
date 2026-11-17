import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api, endpoints } from '../config/api';

// Push notifications: someone quoted you, or (if asked for in Settings) any
// new post. The server sends them through Expo; this registers the phone's
// token with the account and reports what a tapped notification points at.

// With the app open nothing is shown by the system: a quote already raises a
// toast over the live connection, and a new post raises the feed's own pill.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const allowed = (status: Notifications.NotificationPermissionsStatus) =>
  status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

// Whether notifications may be shown, asking the first time when `ask` is
// set. iOS asks once only: after a "Don't Allow" this stays false until the
// user changes it in the Settings app.
export const pushAllowed = async (ask: boolean): Promise<boolean> => {
  try {
    let status = await Notifications.getPermissionsAsync();
    if (!allowed(status) && ask && status.canAskAgain) {
      status = await Notifications.requestPermissionsAsync();
    }
    return allowed(status);
  } catch {
    return false;
  }
};

// Hands this phone's push token to the server (when allowed). Called at
// every launch, since a token can change; `ask` raises the system prompt if
// it has never been answered. Resolves to whether pushes can arrive.
export const registerForPush = async (ask = false): Promise<boolean> => {
  if (!Device.isDevice) return false; // simulators have no push token
  if (!(await pushAllowed(ask))) return false;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.patch(endpoints.getUserProfile, { push_token: token.data });
    return true;
  } catch (error) {
    console.log('Push registration failed (non-critical):', error);
    return false;
  }
};

const postIdOf = (response: Notifications.NotificationResponse | null) => {
  const id = response?.notification.request.content.data?.post_id;
  return typeof id === 'string' ? id : null;
};

// Calls back with the post a tapped notification is about: the one that
// launched the app, and every one tapped while it runs.
export const onNotificationOpened = (open: (postId: string) => void) => {
  Notifications.getLastNotificationResponseAsync()
    .then(response => {
      const id = postIdOf(response);
      if (id) {
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
        open(id);
      }
    })
    .catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(response => {
    const id = postIdOf(response);
    if (id) open(id);
  });
  return () => sub.remove();
};
