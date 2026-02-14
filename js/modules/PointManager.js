/**
 * Manages feature points with screen coordinates and segment distances
 * @module modules/PointManager
 */

import { validateMemo, validatePointCount, validateDistance } from '../utils/validation.js';
import { pixelDistance } from '../utils/math.js';

export default class PointManager {
  constructor() {
    this.points = [];
    this._nextId = 1;
    this._listeners = [];
    this._calibration = { pixelsPerMeter: null, referenceSegment: null };
  }

  /**
   * Registers a callback invoked whenever points change
   * @param {Function} fn - Callback receiving the current points array
   */
  onChange(fn) {
    this._listeners.push(fn);
  }

  /** Notifies all registered listeners */
  _notify() {
    const snapshot = [...this.points];
    this._listeners.forEach(fn => fn(snapshot));
  }

  /**
   * Adds a new feature point from a screen tap
   * @param {number} screenX - Tap X position (CSS pixels)
   * @param {number} screenY - Tap Y position (CSS pixels)
   * @param {string} [memo='']
   * @returns {{ success: boolean, point?: Object, errors?: Object }}
   */
  addPoint(screenX, screenY, memo = '') {
    const countResult = validatePointCount(this.points.length);
    if (!countResult.valid) {
      return { success: false, errors: { count: countResult.error } };
    }

    const memoResult = validateMemo(memo);
    if (!memoResult.valid) {
      return { success: false, errors: { memo: memoResult.error } };
    }

    const point = {
      id: this._nextId++,
      screenX,
      screenY,
      memo: memo.trim(),
      createdAt: new Date().toISOString(),
      distanceToNext: null,
      heading: null,          // 0-360 degrees (CW from north), null = not set
      elevation: null,        // -90..+90 degrees, null = not set
      directionSource: null,  // 'fusion'|'compass'|'gyro'|'accel'|'manual'|null
      sensorLevel: null       // 1-5, null = not set
    };

    this.points.push(point);
    this._notify();
    return { success: true, point };
  }

  /**
   * Sets the distance from point at given index to the next point
   * @param {number} index - Index in the points array
   * @param {number|null} distance - Distance in meters, or null to clear
   * @returns {{ success: boolean, error?: string }}
   */
  setSegmentDistance(index, distance) {
    if (index < 0 || index >= this.points.length - 1) {
      return { success: false, error: '無効な区間です' };
    }
    if (distance !== null) {
      const result = validateDistance(distance);
      if (!result.valid) return { success: false, error: result.error };
    }
    this.points[index].distanceToNext = distance;
    this._notify();
    return { success: true };
  }

  /**
   * Sets direction data on a point (segment start point).
   * @param {number} index - Index in the points array
   * @param {number|null} heading - Horizontal heading 0-360
   * @param {number|null} elevation - Vertical angle -90..+90
   * @param {string|null} source - 'fusion'|'compass'|'gyro'|'accel'|'manual'
   * @param {number|null} level - Sensor level 1-5
   * @returns {{ success: boolean, error?: string }}
   */
  setPointDirection(index, heading, elevation, source, level) {
    if (index < 0 || index >= this.points.length) {
      return { success: false, error: '\u7121\u52B9\u306A\u30A4\u30F3\u30C7\u30C3\u30AF\u30B9' };
    }
    const p = this.points[index];
    p.heading = heading;
    p.elevation = elevation;
    p.directionSource = source;
    p.sensorLevel = level;
    this._notify();
    return { success: true };
  }

  /**
   * Updates memo for a point by ID
   * @param {number} id
   * @param {string} memo
   */
  updateMemo(id, memo) {
    const p = this.points.find(pt => pt.id === id);
    if (!p) return { success: false, error: '点が見つかりません' };
    const result = validateMemo(memo);
    if (!result.valid) return { success: false, error: result.error };
    p.memo = memo.trim();
    this._notify();
    return { success: true };
  }

  /**
   * Updates multiple fields of a point by index (for edit feature)
   * @param {number} index
   * @param {{ distance?: number|null, heading?: number|null, elevation?: number|null, memo?: string }} data
   */
  updatePointByIndex(index, data) {
    if (index < 0 || index >= this.points.length) return { success: false };
    const p = this.points[index];
    if (data.memo !== undefined) p.memo = data.memo.trim();
    if (data.distance !== undefined && index < this.points.length - 1) {
      p.distanceToNext = data.distance;
    }
    if (data.heading !== undefined) p.heading = data.heading;
    if (data.elevation !== undefined) p.elevation = data.elevation;
    if (data.directionSource !== undefined) p.directionSource = data.directionSource;
    this._notify();
    return { success: true };
  }

  /**
   * Removes the last point (undo)
   * @returns {{ success: boolean }}
   */
  undoLastPoint() {
    if (this.points.length === 0) return { success: false };
    // If removing point N, also clear distanceToNext of point N-1
    if (this.points.length >= 2) {
      this.points[this.points.length - 2].distanceToNext = null;
    }
    this.points.pop();
    this._notify();
    return { success: true };
  }

  /**
   * Removes a point by ID
   * @param {number} id
   */
  removePoint(id) {
    const index = this.points.findIndex(p => p.id === id);
    if (index === -1) return { success: false, error: '点が見つかりません' };

    this.points.splice(index, 1);
    // Fix distanceToNext of predecessor if it exists
    if (index > 0 && index <= this.points.length) {
      this.points[index - 1].distanceToNext = null;
    }
    this._notify();
    return { success: true };
  }

  /**
   * Estimates distance for a segment using calibration
   * @param {number} index - Segment index (point[index] → point[index+1])
   * @returns {number|null} Estimated distance in meters, or null if not calibrated
   */
  estimateDistance(index) {
    if (!this._calibration.pixelsPerMeter) return null;
    if (index < 0 || index >= this.points.length - 1) return null;
    const p1 = this.points[index];
    const p2 = this.points[index + 1];
    const px = pixelDistance(p1.screenX, p1.screenY, p2.screenX, p2.screenY);
    return px / this._calibration.pixelsPerMeter;
  }

  /**
   * Sets calibration from a reference segment
   * @param {number} segmentIndex - Which segment was measured
   * @param {number} realDistance - Real-world distance in meters
   */
  calibrate(segmentIndex, realDistance) {
    if (segmentIndex < 0 || segmentIndex >= this.points.length - 1) return;
    if (realDistance <= 0) return;
    const p1 = this.points[segmentIndex];
    const p2 = this.points[segmentIndex + 1];
    const px = pixelDistance(p1.screenX, p1.screenY, p2.screenX, p2.screenY);
    this._calibration = {
      pixelsPerMeter: px / realDistance,
      referenceSegment: segmentIndex
    };
  }

  /** @returns {{ pixelsPerMeter: number|null, referenceSegment: number|null }} */
  get calibration() {
    return { ...this._calibration };
  }

  /** Returns total route length from distanceToNext values */
  getTotalLength() {
    let total = 0;
    for (const p of this.points) {
      if (p.distanceToNext !== null) total += p.distanceToNext;
    }
    return total;
  }

  getNextId() { return this._nextId; }
  getCount() { return this.points.length; }
  getPoint(id) { return this.points.find(p => p.id === id) || null; }

  /**
   * Replaces all points (for project load)
   * @param {Array} points
   * @param {{ pixelsPerMeter?: number, referenceSegment?: number }} [calibration]
   */
  loadPoints(points, calibration) {
    this.points = points.map(p => ({
      id: p.id,
      screenX: p.screenX || 0,
      screenY: p.screenY || 0,
      memo: p.memo || '',
      createdAt: p.createdAt || new Date().toISOString(),
      distanceToNext: p.distanceToNext ?? null,
      heading: p.heading ?? null,
      elevation: p.elevation ?? null,
      directionSource: p.directionSource || null,
      sensorLevel: p.sensorLevel ?? null
    }));
    const maxId = this.points.reduce((max, p) => Math.max(max, p.id), 0);
    this._nextId = maxId + 1;
    if (calibration) {
      this._calibration = {
        pixelsPerMeter: calibration.pixelsPerMeter || null,
        referenceSegment: calibration.referenceSegment ?? null
      };
    }
    this._notify();
  }

  clear() {
    this.points = [];
    this._nextId = 1;
    this._calibration = { pixelsPerMeter: null, referenceSegment: null };
    this._notify();
  }
}
