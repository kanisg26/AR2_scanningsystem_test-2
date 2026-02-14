/**
 * Manages device sensors (compass, gyroscope, accelerometer)
 * with 5-level fallback and complementary filter fusion.
 *
 * Level 1: Compass + Gyro + Accelerometer (full fusion)
 * Level 2: Compass + Accelerometer
 * Level 3: Gyro + Accelerometer (relative heading, no compass)
 * Level 4: Accelerometer only (elevation only)
 * Level 5: No sensors / permission denied (manual input)
 *
 * @module modules/SensorManager
 */

export default class SensorManager {
  constructor() {
    this._heading = null;       // absolute heading 0-360 (clockwise from north)
    this._elevation = null;     // camera pitch -90..+90 (positive = up)
    this._level = 5;
    this._hasCompass = false;
    this._hasGyro = false;
    this._hasAccel = false;
    this._compassAccuracy = null;
    this._permissionGranted = false;

    // Complementary filter state
    this._gyroHeading = null;
    this._lastGyroTime = null;
    this._filterAlpha = 0.96;   // gyro weight (short-term trust)

    this._listeners = [];
    this._handlers = {};
  }

  /**
   * Request permissions and start listening.
   * MUST be called from a user-gesture handler (click/tap) for iOS.
   * @returns {Promise<{ level: number, description: string }>}
   */
  async init() {
    await this._requestPermission();
    this._startListening();
    await this._waitMs(800);    // allow first readings to arrive
    this._level = this._determineLevel();
    return { level: this._level, description: this.levelDescription };
  }

  /* ── iOS 13+ Permission ──────────────────────────────── */

  async _requestPermission() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { console.warn('Sensor: orientation denied'); return; }
      }
      if (typeof DeviceMotionEvent !== 'undefined' &&
          typeof DeviceMotionEvent.requestPermission === 'function') {
        const r = await DeviceMotionEvent.requestPermission();
        if (r !== 'granted') { console.warn('Sensor: motion denied'); return; }
      }
      this._permissionGranted = true;
    } catch (e) {
      console.warn('Sensor: permission error', e);
    }
  }

  /* ── Event Listeners ─────────────────────────────────── */

  _startListening() {
    // On iOS without permission we cannot listen
    if (!this._permissionGranted &&
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') return;

    this._handlers.absOri = (e) => this._onAbsoluteOrientation(e);
    this._handlers.ori    = (e) => this._onOrientation(e);
    this._handlers.motion = (e) => this._onMotion(e);

    window.addEventListener('deviceorientationabsolute', this._handlers.absOri);
    window.addEventListener('deviceorientation', this._handlers.ori);
    window.addEventListener('devicemotion', this._handlers.motion);
  }

  /** Android: deviceorientationabsolute gives absolute compass alpha */
  _onAbsoluteOrientation(e) {
    if (e.alpha == null) return;
    this._hasCompass = true;
    const compass = (360 - e.alpha) % 360;   // CW from north
    this._applyCompass(compass);
    if (e.beta != null) {
      this._elevation = this._clamp(90 - e.beta, -90, 90);
    }
  }

  /** iOS: webkitCompassHeading is already CW from north */
  _onOrientation(e) {
    if (e.webkitCompassHeading != null) {
      this._hasCompass = true;
      this._compassAccuracy = e.webkitCompassAccuracy ?? null;
      this._applyCompass(e.webkitCompassHeading);
    }
    if (e.beta != null && this._elevation == null) {
      this._elevation = this._clamp(90 - e.beta, -90, 90);
    }
  }

  /** Gyro (rotationRate) + Accelerometer (gravity) */
  _onMotion(e) {
    // Gyroscope
    const rr = e.rotationRate;
    if (rr && rr.alpha != null) {
      this._hasGyro = true;
      const now = performance.now();
      if (this._lastGyroTime != null && this._gyroHeading != null) {
        const dt = (now - this._lastGyroTime) / 1000;
        this._gyroHeading = (this._gyroHeading + rr.alpha * dt + 360) % 360;
      }
      this._lastGyroTime = now;
    }

    // Accelerometer → elevation
    const g = e.accelerationIncludingGravity;
    if (g && g.y != null && g.z != null) {
      this._hasAccel = true;
      // Portrait: y ≈ -9.8 vertical, z ≈ 0 forward
      this._elevation = this._clamp(
        Math.atan2(-g.z, Math.abs(g.y)) * (180 / Math.PI), -90, 90
      );
    }
  }

  /* ── Complementary Filter ────────────────────────────── */

  _applyCompass(compassHeading) {
    if (this._gyroHeading != null && this._hasGyro) {
      this._heading = this._fuse(compassHeading, this._gyroHeading);
    } else {
      this._heading = compassHeading;
    }
    // Keep gyro synced to avoid drift
    this._gyroHeading = this._heading;
    this._notify();
  }

  /** Fuse compass (long-term stable) with gyro (short-term precise) */
  _fuse(compass, gyro) {
    const diff = ((gyro - compass + 540) % 360) - 180;
    return (compass + this._filterAlpha * diff + 360) % 360;
  }

  /* ── Level Detection ─────────────────────────────────── */

  _determineLevel() {
    if (this._hasCompass && this._hasGyro && this._hasAccel) return 1;
    if (this._hasCompass && this._hasAccel) return 2;
    if (this._hasGyro   && this._hasAccel) return 3;
    if (this._hasAccel) return 4;
    return 5;
  }

  /* ── Public API ──────────────────────────────────────── */

  /**
   * Snapshot current reading (call at tap / freeze moment).
   * @returns {{ heading: number|null, elevation: number|null,
   *             source: string, level: number, accuracy: number|null }}
   */
  captureReading() {
    return {
      heading:   this._heading   != null ? Math.round(this._heading * 10) / 10   : null,
      elevation: this._elevation != null ? Math.round(this._elevation * 10) / 10 : null,
      source:    this._sourceName,
      level:     this._level,
      accuracy:  this._compassAccuracy
    };
  }

  /** Sets initial heading for Level 3 (gyro-only, no compass) */
  setInitialHeading(deg) {
    this._heading = ((deg % 360) + 360) % 360;
    this._gyroHeading = this._heading;
  }

  get level()       { return this._level; }
  get heading()     { return this._heading; }
  get elevation()   { return this._elevation; }
  get hasCompass()   { return this._hasCompass; }

  get levelDescription() {
    return {
      1: 'フル精度 (コンパス+ジャイロ+加速度)',
      2: 'コンパス+加速度',
      3: '相対方位 (ジャイロ+加速度)',
      4: '傾きのみ (加速度)',
      5: '手動入力'
    }[this._level] || '不明';
  }

  get _sourceName() {
    if (this._hasCompass && this._hasGyro) return 'fusion';
    if (this._hasCompass) return 'compass';
    if (this._hasGyro)   return 'gyro';
    if (this._hasAccel)  return 'accel';
    return 'manual';
  }

  onChange(fn) { this._listeners.push(fn); }

  _notify() {
    const data = { heading: this._heading, elevation: this._elevation, level: this._level };
    this._listeners.forEach(fn => fn(data));
  }

  dispose() {
    for (const [evt, fn] of [
      ['deviceorientationabsolute', this._handlers.absOri],
      ['deviceorientation', this._handlers.ori],
      ['devicemotion', this._handlers.motion]
    ]) { if (fn) window.removeEventListener(evt, fn); }
    this._listeners = [];
  }

  /* ── Helpers ─────────────────────────────────────────── */
  _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  _waitMs(ms) { return new Promise(r => setTimeout(r, ms)); }
}
