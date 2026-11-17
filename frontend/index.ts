import { registerRootComponent } from 'expo';

import App from './App';

// Nothing is logged in a release build: the request log carried the device
// id (the account's only credential) and whole responses, and the composer's
// the text being typed. Warnings and errors still go to the console.
if (!__DEV__) {
  const quiet = () => {};
  console.log = quiet;
  console.debug = quiet;
  console.info = quiet;
  console.trace = quiet;
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
