/**
 * PipeScanner Web - Configuration & Constants
 * @module config
 */

/** Application version */
export const APP_VERSION = '2.0.0';

/** Application name */
export const APP_NAME = 'PipeScanner Web';

// ─── Point Constraints ───────────────────────────────────────

/** Maximum number of feature points */
export const MAX_POINTS = 100;

/** Maximum memo length */
export const MEMO_MAX_LENGTH = 50;

// ─── Camera Settings ─────────────────────────────────────────

/** Preferred camera resolution */
export const CAMERA_WIDTH = 1280;
export const CAMERA_HEIGHT = 720;

// ─── Canvas Overlay Settings ─────────────────────────────────

/** Marker radius (pixels) */
export const MARKER_RADIUS = 14;

/** Marker fill color (yellow) */
export const MARKER_COLOR = '#FFD700';

/** Marker stroke color */
export const MARKER_STROKE = '#B8860B';

/** Marker stroke width */
export const MARKER_STROKE_WIDTH = 2;

/** Route line color (red) */
export const ROUTE_COLOR = '#FF0000';

/** Route line width (pixels) */
export const ROUTE_LINE_WIDTH = 3;

/** Distance label font */
export const DISTANCE_FONT = 'bold 14px sans-serif';

/** Distance label text color */
export const DISTANCE_LABEL_COLOR = '#FFFFFF';

/** Distance label background color */
export const DISTANCE_LABEL_BG = 'rgba(0, 0, 0, 0.6)';

/** Distance label padding (pixels) */
export const DISTANCE_LABEL_PADDING = 4;

// ─── 3D Viewer Settings ──────────────────────────────────────

/** Feature point sphere diameter (meters) */
export const POINT_DIAMETER = 0.12;

/** Feature point color - orange (Three.js hex) */
export const POINT_COLOR_3D = 0xFF6600;

/** Route line color - cyan (distinct from red X-axis) */
export const ROUTE_COLOR_3D = 0x00E5FF;

/** Camera field of view */
export const VIEWER_FOV = 60;

/** Camera near/far planes */
export const VIEWER_NEAR = 0.1;
export const VIEWER_FAR = 1000;

/** Ambient light */
export const AMBIENT_LIGHT_COLOR = 0xffffff;
export const AMBIENT_LIGHT_INTENSITY = 0.6;

/** Directional light */
export const DIR_LIGHT_COLOR = 0xffffff;
export const DIR_LIGHT_INTENSITY = 0.8;
export const DIR_LIGHT_POSITION = { x: 5, y: 5, z: 5 };

/** Grid settings (10m x 10m, 1m intervals) */
export const GRID_SIZE = 0.5;
export const GRID_DIVISIONS = 10;

/** Axis helper length */
export const AXIS_LENGTH = 2;

/** View presets */
export const VIEW_PRESETS = {
  front: { x: 0, y: 0, z: 5 },
  top:   { x: 0, y: 5, z: 0 },
  side:  { x: 5, y: 0, z: 0 },
  iso:   { x: 3, y: 3, z: 3 }
};

// ─── Calibration ─────────────────────────────────────────────

/** Distance decimal precision (meters) */
export const DISTANCE_PRECISION = 2;

// ─── LocalStorage ────────────────────────────────────────────

/** LocalStorage key for project data */
export const STORAGE_KEY = 'pipe_scanner_project';

// ─── Export Settings ─────────────────────────────────────────

/** CSV character encoding (UTF-8 BOM for Excel) */
export const CSV_BOM = '\uFEFF';

/** DXF layer name */
export const DXF_LAYER_NAME = 'PIPE_ROUTE';

/** Export filename prefix */
export const EXPORT_FILENAME_PREFIX = 'pipe_route';
