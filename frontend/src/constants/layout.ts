import { Dimensions } from 'react-native';

export const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Design tokens live in ./space so they can be imported without react-native;
// re-exported here because layout is what screens already reach for.
export { SPACE, CHROME, CHROME_BAND, MIN_CARD_HEIGHT } from './space';

import { MIN_CARD_HEIGHT } from './space';

// The card chrome floor in canvas px. Bounds off the server are content
// extents in canvas space; k = canvasWidth / screenWidth converts a pt
// measurement into them, so the floor stays a real MIN_CARD_HEIGHT points
// regardless of device width.
export const minCropCanvasPx = (canvasWidth: number) =>
  MIN_CARD_HEIGHT * (canvasWidth / screenWidth);
