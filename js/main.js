/**
 * Application entry point - connects Camera, Canvas, PointManager, UI, and Sensors.
 * Supports: Snapshot mode (all devices), WebXR AR (Android+ARCore).
 * Direction modes: Sensor auto (compass/gyro/accel) or Manual (preset buttons).
 * @module main
 */

import CameraManager from './modules/CameraManager.js';
import CanvasOverlay from './modules/CanvasOverlay.js';
import PointManager from './modules/PointManager.js';
import UIController from './modules/UIController.js';
import ProjectStorage from './modules/ProjectStorage.js';
import CSVExporter from './modules/CSVExporter.js';
import DXFExporter from './modules/DXFExporter.js';
import { $ } from './utils/dom.js';

class App {
  constructor() {
    this.pointManager = new PointManager();
    this.uiController = new UIController(this.pointManager);
    this.camera = new CameraManager($('camera-video'));
    this.canvas = new CanvasOverlay($('camera-overlay'), (x, y) => this._onTap(x, y));
    this.storage = new ProjectStorage();
    this.csvExporter = new CSVExporter();
    this.dxfExporter = new DXFExporter();

    this._projectName = '';
    this._metadata = { siteName: '', operator: '', pipeType: '' };
    this._frozen = false;
    this._mode = 'snapshot'; // 'snapshot' or 'ar'
    this._xrManager = null;
    this._arDistanceResolve = null;

    // Direction / sensor state
    this._directionMode = 'none'; // 'sensor' | 'manual' | 'none'
    this._directionModeSelected = false;
    this._sensorManager = null;
    this._compassUI = null;
    this._snapshotReading = null; // sensor reading captured at freeze
    this._lastHeading = 0;       // running heading for manual mode

    // Canvas overlay always updates
    this.pointManager.onChange((points) => {
      this.canvas.setPoints(points);
      if (this.viewer3D) {
        try { this.viewer3D.updateRoute(points); }
        catch (err) { console.error('3D updateRoute error:', err); }
      }
    });

    this._bindActions();
    this._selectMode();
    this._init3D();
  }

  // ─── Mode Selection ───────────────────────────────────────

  async _selectMode() {
    let arSupported = false;
    try {
      const { default: WebXRManager } = await import('./modules/WebXRManager.js');
      arSupported = await WebXRManager.isSupported();
    } catch { arSupported = false; }

    if (arSupported) {
      $('modal-mode-select').hidden = false;
      $('btn-mode-snapshot').addEventListener('click', () => {
        $('modal-mode-select').hidden = true;
        this._startSnapshotMode();
      });
      $('btn-mode-ar').addEventListener('click', () => {
        $('modal-mode-select').hidden = true;
        this._startARMode();
      });
    } else {
      this._startSnapshotMode();
    }
  }

  async _startSnapshotMode() {
    this._mode = 'snapshot';
    await this._startCamera();
    // Show direction mode dialog once
    if (!this._directionModeSelected) {
      await this._showDirectionModeDialog();
      this._directionModeSelected = true;
    }
    console.log('Mode: Snapshot, Direction:', this._directionMode);
  }

  // ─── Direction Mode Selection ─────────────────────────────

  _showDirectionModeDialog() {
    return new Promise((resolve) => {
      const dialog = $('modal-direction-mode');
      dialog.hidden = false;

      const onSensor = async () => {
        dialog.hidden = true;
        cleanup();
        await this._initSensors();
        resolve();
      };

      const onManual = () => {
        dialog.hidden = true;
        cleanup();
        this._directionMode = 'manual';
        resolve();
      };

      $('btn-direction-sensor').addEventListener('click', onSensor);
      $('btn-direction-manual').addEventListener('click', onManual);

      function cleanup() {
        $('btn-direction-sensor').removeEventListener('click', onSensor);
        $('btn-direction-manual').removeEventListener('click', onManual);
      }
    });
  }

  // ─── Sensor Initialization ────────────────────────────────

  async _initSensors() {
    try {
      const { default: SensorManager } = await import('./modules/SensorManager.js');
      const { default: CompassUI } = await import('./modules/CompassUI.js');

      this._sensorManager = new SensorManager();
      this._compassUI = new CompassUI();

      // init() triggers iOS permission (called from user-gesture context)
      const info = await this._sensorManager.init();
      console.log('Sensors:', info.description);

      if (info.level >= 5) {
        alert('\u30BB\u30F3\u30B5\u30FC\u304C\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002\u624B\u52D5\u5165\u529B\u30E2\u30FC\u30C9\u3067\u52D5\u4F5C\u3057\u307E\u3059\u3002');
        this._directionMode = 'manual';
        return;
      }

      this._directionMode = 'sensor';

      // Level 3 (gyro only, no compass): prompt initial heading
      if (info.level === 3) {
        const heading = await this._compassUI.promptInitialHeading();
        this._sensorManager.setInitialHeading(heading);
        this._lastHeading = heading;
      }

      // Start live display
      this._sensorManager.onChange((data) => {
        this._compassUI.update(data.heading, data.elevation, data.level,
          this._sensorManager._compassAccuracy);
      });

      // Show initial reading
      const r = this._sensorManager.captureReading();
      this._compassUI.update(r.heading, r.elevation, r.level, r.accuracy);

    } catch (err) {
      console.error('Sensor init failed:', err);
      alert('\u30BB\u30F3\u30B5\u30FC\u521D\u671F\u5316\u5931\u6557\u3002\u624B\u52D5\u5165\u529B\u30E2\u30FC\u30C9\u3067\u52D5\u4F5C\u3057\u307E\u3059\u3002');
      this._directionMode = 'manual';
    }
  }

  // ─── AR Mode ──────────────────────────────────────────────

  async _startARMode() {
    this._mode = 'ar';
    try {
      const { default: WebXRManager } = await import('./modules/WebXRManager.js');
      this._xrManager = new WebXRManager((anchorIdx) => this._onARTap(anchorIdx));
      $('app-main').hidden = true;
      $('app-header').hidden = true;
      const arOverlay = $('ar-overlay');
      arOverlay.hidden = false;
      this._bindARActions();
      const result = await this._xrManager.start(arOverlay);
      if (!result.success) { alert(result.error); this._exitARMode(); return; }
      console.log('Mode: WebXR AR');
    } catch (err) {
      alert(`AR\u30E2\u30FC\u30C9\u306E\u8D77\u52D5\u306B\u5931\u6557: ${err.message}`);
      this._exitARMode();
    }
  }

  _exitARMode() {
    if (this._xrManager) {
      this._xrManager.stop();
      this._xrManager.dispose();
      this._xrManager = null;
    }
    $('ar-overlay').hidden = true;
    $('app-main').hidden = false;
    $('app-header').hidden = false;
    this._mode = 'snapshot';
    if (this.viewer3D) {
      this.viewer3D.forceResize();
      if (this.pointManager.points.length > 0) {
        this.viewer3D.updateRoute(this.pointManager.points);
      }
    }
    this._startSnapshotMode();
  }

  // ─── AR Mode Handlers ─────────────────────────────────────

  _bindARActions() {
    $('btn-ar-undo').addEventListener('click', () => {
      if (this._xrManager) {
        this._xrManager.undoLastAnchor();
        this.pointManager.undoLastPoint();
        $('ar-point-count').textContent = `${this._xrManager.anchorCount}\u70B9`;
      }
    });
    $('btn-ar-done').addEventListener('click', () => this._exitARMode());
    $('btn-ar-distance-ok').addEventListener('click', () => this._submitARDistance());
    $('btn-ar-distance-skip').addEventListener('click', () => {
      this._resolveARDistance({ distance: null, memo: '' });
    });
  }

  async _onARTap(anchorIdx) {
    const addResult = this.pointManager.addPoint(0, 0);
    if (!addResult.success) return;
    $('ar-point-count').textContent = `${this._xrManager.anchorCount}\u70B9`;
    if (anchorIdx >= 1) {
      const segIndex = anchorIdx - 1;
      const measured = this._xrManager.getAnchorDistance(segIndex);
      const result = await this._promptARDistance(segIndex, measured);
      const dist = result.distance !== null ? result.distance : measured;
      if (dist !== null) this.pointManager.setSegmentDistance(segIndex, dist);
      if (result.memo) this.pointManager.updateMemo(addResult.point.id, result.memo);
    }
  }

  _promptARDistance(segIndex, measured) {
    return new Promise((resolve) => {
      this._arDistanceResolve = resolve;
      $('ar-distance-title').textContent = `\u533A\u9593 ${segIndex + 1}`;
      $('ar-distance-measured').textContent = measured !== null
        ? `AR\u8A08\u6E2C: ${measured.toFixed(3)}m` : 'AR\u8A08\u6E2C: --';
      $('ar-input-distance').value = '';
      $('ar-input-memo').value = '';
      $('ar-distance-dialog').hidden = false;
    });
  }

  _submitARDistance() {
    const rawVal = $('ar-input-distance').value.trim();
    const memo = $('ar-input-memo').value.trim();
    let distance = null;
    if (rawVal !== '') {
      distance = parseFloat(rawVal);
      if (isNaN(distance) || distance < 0) {
        alert('\u6709\u52B9\u306A\u8DDD\u96E2\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044');
        return;
      }
    }
    this._resolveARDistance({ distance, memo });
  }

  _resolveARDistance(result) {
    $('ar-distance-dialog').hidden = true;
    if (this._arDistanceResolve) {
      this._arDistanceResolve(result);
      this._arDistanceResolve = null;
    }
  }

  // ─── 3D Viewer ────────────────────────────────────────────

  async _init3D() {
    const container = $('viewer-container');
    const statusEl = document.createElement('p');
    statusEl.id = 'viewer-status';
    statusEl.style.cssText = 'color:#888;text-align:center;padding:16px;margin:0;';
    statusEl.textContent = '3D\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D...';
    container.appendChild(statusEl);

    try {
      const { default: Viewer3D } = await import('./modules/Viewer3D.js');
      this.viewer3D = new Viewer3D('viewer-container');
      if (statusEl.parentElement) statusEl.remove();

      const { default: GLBExporter } = await import('./modules/GLBExporter.js');
      const { default: OBJExporter } = await import('./modules/OBJExporter.js');
      this.glbExporter = new GLBExporter();
      this.objExporter = new OBJExporter();

      $('btn-export-glb').addEventListener('click', () => {
        this.glbExporter.export(this.viewer3D.getScene(), this.pointManager.points);
      });
      $('btn-export-obj').addEventListener('click', () => {
        this.objExporter.export(this.pointManager.points);
      });
      document.querySelectorAll('.btn-view').forEach(btn => {
        if (btn.dataset.view) {
          btn.addEventListener('click', () => this.viewer3D.setView(btn.dataset.view));
        }
      });

      // Origin toggle (start point / end point)
      const originBtn = $('btn-origin-toggle');
      if (originBtn) {
        originBtn.addEventListener('click', () => {
          const mode = this.viewer3D.toggleOrigin();
          originBtn.textContent = mode === 'start' ? '\u539F\u70B9:\u59CB\u70B9' : '\u539F\u70B9:\u7D42\u70B9';
          if (this.pointManager.points.length > 0) {
            this.viewer3D.updateRoute(this.pointManager.points);
          }
        });
      }

      if (this.pointManager.points.length > 0) {
        this.viewer3D.updateRoute(this.pointManager.points);
      }

      console.log('3D viewer initialized (importmap)');
    } catch (err) {
      console.error('3D viewer init failed:', err);
      statusEl.textContent = `3D\u30D7\u30EC\u30D3\u30E5\u30FC: \u521D\u671F\u5316\u30A8\u30E9\u30FC (${err.message})`;
      statusEl.style.color = '#f44336';
    }
  }

  // ─── Camera (Snapshot Mode) ───────────────────────────────

  async _startCamera() {
    const errorEl = $('camera-error');
    const msgEl = $('camera-error-msg');
    msgEl.textContent = '\u30AB\u30E1\u30E9\u3092\u8D77\u52D5\u4E2D...';
    errorEl.hidden = false;
    const result = await this.camera.start();
    if (result.success) {
      errorEl.hidden = true;
      this.canvas.syncSize();
    } else {
      msgEl.textContent = result.error;
      errorEl.hidden = false;
    }
  }

  // ─── Tap Handler (Snapshot Mode) ──────────────────────────

  async _onTap(screenX, screenY) {
    // Freeze camera on first tap
    if (!this._frozen && this.camera.isStarted) {
      const frame = this.camera.captureFrame();
      if (frame) {
        this.canvas.setSnapshot(frame);
        this._frozen = true;
        // Capture sensor reading at snapshot time
        if (this._directionMode === 'sensor' && this._sensorManager) {
          this._snapshotReading = this._sensorManager.captureReading();
        }
        $('btn-camera-resume').hidden = false;
      }
    }

    const prevCount = this.pointManager.getCount();
    const addResult = this.pointManager.addPoint(screenX, screenY);
    if (!addResult.success) {
      if (addResult.errors?.count) alert(addResult.errors.count);
      return;
    }

    if (prevCount >= 1) {
      const segIndex = prevCount - 1;
      const isFirst = segIndex === 0 && this.pointManager.calibration.pixelsPerMeter === null;

      // Build direction options for dialog
      const dirOptions = this._buildDirOptions();

      const result = await this.uiController.promptDistance(segIndex, isFirst, dirOptions);

      if (result.distance !== null) {
        this.pointManager.setSegmentDistance(segIndex, result.distance);
        if (isFirst) this.pointManager.calibrate(segIndex, result.distance);
      }

      // Set direction on segment start point
      if (result.heading != null) {
        this.pointManager.setPointDirection(
          segIndex, result.heading, result.elevation || 0,
          result.directionSource || 'manual',
          this._sensorManager?.level || 5
        );
        this._lastHeading = result.heading;
      }

      if (result.memo) {
        this.pointManager.updateMemo(addResult.point.id, result.memo);
      }

      // Auto-resume camera after distance dialog
      await this._resumeCamera();
    }

    // Update camera point count overlay
    this._updateCameraPointCount();
  }

  _buildDirOptions() {
    if (this._directionMode === 'sensor') {
      const reading = this._snapshotReading || this._sensorManager?.captureReading();
      return { mode: 'sensor', reading };
    }
    if (this._directionMode === 'manual') {
      return { mode: 'manual', prevHeading: this._lastHeading };
    }
    return null;
  }

  _updateCameraPointCount() {
    const el = $('camera-point-count');
    if (el) el.textContent = `${this.pointManager.getCount()}\u70B9`;
  }

  // ─── Global Button Actions ────────────────────────────────

  _bindActions() {
    $('btn-camera-toggle').addEventListener('click', async () => {
      const result = await this.camera.toggleCamera();
      if (!result.success) alert(result.error);
    });

    $('btn-camera-retry').addEventListener('click', () => this._startCamera());

    $('btn-camera-resume').addEventListener('click', () => this._resumeCamera());

    $('btn-undo').addEventListener('click', () => this.pointManager.undoLastPoint());
    $('btn-calibrate').addEventListener('click', () => this._recalibrate());

    $('btn-save').addEventListener('click', () => this._saveProject());
    $('btn-load').addEventListener('click', () => this._loadProject());
    $('btn-new').addEventListener('click', () => this._newProject());

    $('btn-settings').addEventListener('click', () => this._openSettings());
    $('btn-settings-close').addEventListener('click', () => this._closeSettings());
    $('form-settings').addEventListener('submit', (e) => {
      e.preventDefault();
      this._saveSettings();
    });
    $('modal-settings').addEventListener('click', (e) => {
      if (e.target.id === 'modal-settings') this._closeSettings();
    });

    $('btn-export-csv').addEventListener('click', () => {
      this.csvExporter.export(this.pointManager.points);
    });
    $('btn-export-dxf').addEventListener('click', () => {
      this.dxfExporter.export(this.pointManager.points);
    });
  }

  async _resumeCamera() {
    this.canvas.setSnapshot(null);
    this._frozen = false;
    this._snapshotReading = null;
    $('btn-camera-resume').hidden = true;
    // Restart camera stream if it has stopped
    const v = this.camera.videoElement;
    if (!this.camera.isStarted || v.paused || v.ended || v.readyState < 2) {
      await this._startCamera();
    }
  }

  async _recalibrate() {
    if (this.pointManager.getCount() < 2) {
      alert('\u6821\u6B63\u306B\u306F2\u70B9\u4EE5\u4E0A\u304C\u5FC5\u8981\u3067\u3059');
      return;
    }
    const result = await this.uiController.promptDistance(0, true);
    if (result.distance !== null) {
      this.pointManager.calibrate(0, result.distance);
      this.pointManager.setSegmentDistance(0, result.distance);
    }
  }

  _openSettings() {
    $('input-project-name').value = this._projectName;
    $('input-site-name').value = this._metadata.siteName;
    $('input-operator').value = this._metadata.operator;
    $('input-pipe-type').value = this._metadata.pipeType;
    $('modal-settings').hidden = false;
  }

  _closeSettings() { $('modal-settings').hidden = true; }

  _saveSettings() {
    this._projectName = $('input-project-name').value.trim();
    this._metadata = {
      siteName: $('input-site-name').value.trim(),
      operator: $('input-operator').value.trim(),
      pipeType: $('input-pipe-type').value.trim()
    };
    this._closeSettings();
  }

  _saveProject() {
    const result = this.storage.save(
      this._projectName, this._metadata,
      this.pointManager.points, this.pointManager.calibration
    );
    alert(result.success ? '\u4FDD\u5B58\u3057\u307E\u3057\u305F' : result.error);
  }

  _loadProject() {
    const result = this.storage.load();
    if (!result.success) { alert(result.error); return; }
    const { data } = result;
    this._projectName = data.projectName || '';
    this._metadata = {
      siteName: data.metadata?.siteName || '',
      operator: data.metadata?.operator || '',
      pipeType: data.metadata?.pipeType || ''
    };
    this.pointManager.loadPoints(data.points, data.calibration);
    alert('\u8AAD\u307F\u8FBC\u307F\u307E\u3057\u305F');
  }

  _newProject() {
    if (!confirm('\u73FE\u5728\u306E\u30C7\u30FC\u30BF\u3092\u7834\u68C4\u3057\u3066\u65B0\u898F\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u3092\u4F5C\u6210\u3057\u307E\u3059\u304B\uFF1F')) return;
    this.pointManager.clear();
    this._projectName = '';
    this._metadata = { siteName: '', operator: '', pipeType: '' };
    this._lastHeading = 0;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  console.log('PipeScanner Web v2.3 initialized');
});
