"""Limits the API enforces on a post. They match shared/limits.json, which
the frontend's src/constants/limits.ts also follows (a test on each side
compares them with it)."""

CANVAS_WIDTH = 1080
# The composer's canvas follows the phone's aspect: a tall phone is ~2.2x
CANVAS_HEIGHT_MIN = 1080
CANVAS_HEIGHT_MAX = 4000
# Canvas px: the size slider times a pinch of up to 5x on a small phone
FONT_SIZE_MIN = 4
FONT_SIZE_MAX = 2000
MAX_TEXT_ELEMENTS = 30
MAX_POST_LENGTH = 500  # all elements' text together
GRADIENT_STOPS_MIN = 2
GRADIENT_STOPS_MAX = 8
MAX_COLOR_RUNS = 200

# Text border (shared/style.json): stroke width per 1 of font size
OUTLINE_WIDTH_EM = 0.07
