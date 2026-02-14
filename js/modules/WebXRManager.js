/**
 * WebXR AR session manager - hit-test, anchors, dom-overlay
 * Only works on Android Chrome with ARCore
 * @module modules/WebXRManager
 */

import * as THREE from 'three';
import { POINT_DIAMETER, POINT_COLOR_3D, ROUTE_COLOR_3D } from '../config.js';

export default class WebXRManager {
  /**
   * @param {Function} onAnchorTap - Callback(anchorIndex) when a new anchor is placed
   */
  constructor(onAnchorTap) {
    this._onAnchorTap = onAnchorTap;
    this._session = null;
    this._renderer = null;
    this._scene = null;
    this._camera = null;
    this._refSpace = null;
    this._viewerSpace = null;
    this._hitTestSource = null;
    this._anchors = []; // { anchor: XRAnchor, mesh: THREE.Mesh }
    this._reticle = null;
    this._lineMesh = null;
    this._suppressSelect = false;
    this._sphereGeo = new THREE.SphereGeometry(POINT_DIAMETER / 2, 16, 12);
    this._sphereMat = new THREE.MeshStandardMaterial({ color: POINT_COLOR_3D });
    this._lineMat = new THREE.LineBasicMaterial({ color: ROUTE_COLOR_3D });

    // Distance labels
    this._distanceLabels = [];
    this._showDistanceLabels = true;
    this._scaleFactor = 1.0;
    this._labelsDirty = false;

    // Compass heading offset: aligns ARCore Z-axis to magnetic north
    this._compassOffset = 0;
  }

  /** Suppress or allow select (tap) events */
  set suppressSelect(val) { this._suppressSelect = !!val; }

  /** Show/hide distance labels in AR view */
  set showDistanceLabels(val) {
    this._showDistanceLabels = !!val;
    this._labelsDirty = true;
  }

  /** Set scale factor for distance display */
  set scaleFactor(val) {
    this._scaleFactor = val;
    this._labelsDirty = true;
  }

  /**
   * Checks if WebXR immersive-ar is supported
   * @returns {Promise<boolean>}
   */
  static async isSupported() {
    if (!navigator.xr) return false;
    try {
      return await navigator.xr.isSessionSupported('immersive-ar');
    } catch {
      return false;
    }
  }

  /**
   * Starts an immersive-ar session with hit-test, anchors, and dom-overlay
   * @param {HTMLElement} overlayRoot - DOM element to use as dom-overlay root
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async start(overlayRoot) {
    try {
      // Capture compass heading before AR session starts (for heading offset)
      this._compassOffset = await this._captureCompassHeading();

      this._session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test', 'anchors'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: overlayRoot }
      });

      this._initRenderer();
      this._initScene();

      this._refSpace = await this._session.requestReferenceSpace('local');
      this._viewerSpace = await this._session.requestReferenceSpace('viewer');
      this._hitTestSource = await this._session.requestHitTestSource({
        space: this._viewerSpace
      });

      this._session.addEventListener('select', (e) => this._onSelect(e));
      this._session.addEventListener('end', () => this._onSessionEnd());
      this._session.requestAnimationFrame((t, f) => this._onFrame(t, f));

      return { success: true };
    } catch (err) {
      return { success: false, error: `AR起動失敗: ${err.message}` };
    }
  }

  /** Ends the current AR session */
  async stop() {
    if (this._session) {
      await this._session.end();
    }
  }

  /** @returns {boolean} */
  get isActive() {
    return this._session !== null;
  }

  /** @returns {number} Number of placed anchors */
  get anchorCount() {
    return this._anchors.length;
  }

  _initRenderer() {
    this._renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._renderer.xr.enabled = true;
    this._renderer.xr.setReferenceSpaceType('local');
    this._renderer.xr.setSession(this._session);
  }

  _initScene() {
    this._scene = new THREE.Scene();
    this._camera = new THREE.PerspectiveCamera();

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    this._scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(1, 2, 1);
    this._scene.add(dir);

    // Reticle (ring shown at hit-test position)
    const reticleGeo = new THREE.RingGeometry(0.02, 0.04, 24);
    reticleGeo.rotateX(-Math.PI / 2);
    const reticleMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this._reticle = new THREE.Mesh(reticleGeo, reticleMat);
    this._reticle.visible = false;
    this._scene.add(this._reticle);
  }

  /**
   * XR frame loop
   * @param {DOMHighResTimeStamp} time
   * @param {XRFrame} frame
   */
  _onFrame(time, frame) {
    const session = frame.session;
    session.requestAnimationFrame((t, f) => this._onFrame(t, f));

    const pose = frame.getViewerPose(this._refSpace);
    if (!pose) return;

    // Update reticle from hit-test
    if (this._hitTestSource) {
      const results = frame.getHitTestResults(this._hitTestSource);
      if (results.length > 0) {
        const hitPose = results[0].getPose(this._refSpace);
        this._reticle.visible = true;
        this._reticle.matrix.fromArray(hitPose.transform.matrix);
        this._reticle.matrixAutoUpdate = false;
        this._lastHitResult = results[0];
      } else {
        this._reticle.visible = false;
        this._lastHitResult = null;
      }
    }

    // Update anchor meshes' positions
    for (const entry of this._anchors) {
      const anchorPose = frame.getPose(entry.anchor.anchorSpace, this._refSpace);
      if (anchorPose) {
        entry.mesh.matrix.fromArray(anchorPose.transform.matrix);
        entry.mesh.matrixAutoUpdate = false;
      }
    }

    // Update route line and distance labels
    this._updateLine();
    this._updateDistanceLabels();

    this._renderer.render(this._scene, this._camera);
  }

  /**
   * Handles tap (select) event - places anchor at hit-test position
   * @param {XRInputSourceEvent} event
   */
  async _onSelect(event) {
    if (this._suppressSelect) return;
    if (!this._lastHitResult) return;

    const frame = event.frame;
    try {
      const anchor = await frame.createAnchor(
        this._lastHitResult.getPose(this._refSpace).transform,
        this._refSpace
      );

      const mesh = new THREE.Mesh(this._sphereGeo, this._sphereMat);
      mesh.matrixAutoUpdate = false;
      this._scene.add(mesh);

      this._anchors.push({ anchor, mesh });
      this._labelsDirty = true;
      this._onAnchorTap(this._anchors.length - 1);
    } catch (err) {
      console.warn('Anchor creation failed:', err.message);
    }
  }

  /** Updates the line connecting all anchor meshes */
  _updateLine() {
    if (this._lineMesh) {
      this._scene.remove(this._lineMesh);
      this._lineMesh.geometry.dispose();
      this._lineMesh = null;
    }

    if (this._anchors.length < 2) return;

    const points = this._anchors.map(e => {
      const pos = new THREE.Vector3();
      pos.setFromMatrixPosition(e.mesh.matrix);
      return pos;
    });

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    this._lineMesh = new THREE.Line(geo, this._lineMat);
    this._scene.add(this._lineMesh);
  }

  /**
   * Gets the real-world distance between two consecutive anchors
   * @param {number} index - Index of the first anchor (distance to index+1)
   * @returns {number|null} Distance in meters, or null if not available
   */
  getAnchorDistance(index) {
    if (index < 0 || index >= this._anchors.length - 1) return null;
    const p1 = new THREE.Vector3().setFromMatrixPosition(this._anchors[index].mesh.matrix);
    const p2 = new THREE.Vector3().setFromMatrixPosition(this._anchors[index + 1].mesh.matrix);
    return p1.distanceTo(p2);
  }

  /**
   * Gets direction (heading/elevation) between consecutive anchors.
   * Derived from AR anchor 3D coordinates (ARCore SLAM-fused).
   * @param {number} index - Index of the first anchor
   * @returns {{ heading: number, elevation: number }|null}
   */
  getAnchorDirection(index) {
    if (index < 0 || index >= this._anchors.length - 1) return null;
    const p1 = new THREE.Vector3().setFromMatrixPosition(this._anchors[index].mesh.matrix);
    const p2 = new THREE.Vector3().setFromMatrixPosition(this._anchors[index + 1].mesh.matrix);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    const horiz = Math.sqrt(dx * dx + dz * dz);
    let heading = Math.atan2(dx, dz) * (180 / Math.PI);
    // Apply compass offset to align ARCore Z-axis with magnetic north
    heading = (heading + this._compassOffset) % 360;
    if (heading < 0) heading += 360;
    const elevation = Math.atan2(dy, horiz) * (180 / Math.PI);
    return { heading, elevation };
  }

  /**
   * Captures compass heading once for ARCore→magnetic north offset.
   * Returns heading in degrees (0-360) or 0 if unavailable.
   */
  _captureCompassHeading() {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('deviceorientationabsolute', onOrientation);
        window.removeEventListener('deviceorientation', onFallback);
        console.warn('Compass heading unavailable, using offset=0');
        resolve(0);
      }, 2000);

      const onOrientation = (e) => {
        if (e.alpha == null) return;
        clearTimeout(timeout);
        window.removeEventListener('deviceorientationabsolute', onOrientation);
        window.removeEventListener('deviceorientation', onFallback);
        // alpha: 0-360, compass heading = 360 - alpha (or webkitCompassHeading on iOS)
        const heading = e.webkitCompassHeading ?? (360 - e.alpha) % 360;
        console.log('Compass offset captured:', heading.toFixed(1) + '°');
        resolve(heading);
      };

      const onFallback = (e) => {
        if (e.alpha == null || !e.absolute) return;
        onOrientation(e);
      };

      window.addEventListener('deviceorientationabsolute', onOrientation);
      window.addEventListener('deviceorientation', onFallback);
    });
  }

  _onSessionEnd() {
    this._session = null;
    this._hitTestSource = null;
    this._lastHitResult = null;
  }

  /** Removes the last anchor (undo) */
  undoLastAnchor() {
    if (this._anchors.length === 0) return;
    const entry = this._anchors.pop();
    this._scene.remove(entry.mesh);
    entry.anchor.delete();
    this._updateLine();
    this._labelsDirty = true;
  }

  /** Removes all anchors (clear) */
  clearAllAnchors() {
    for (const entry of this._anchors) {
      this._scene.remove(entry.mesh);
      entry.anchor.delete();
    }
    this._anchors = [];
    this._updateLine();
    this._labelsDirty = true;
  }

  // ─── Distance Labels ──────────────────────────────────────

  /** Updates distance label sprites (called each frame) */
  _updateDistanceLabels() {
    if (!this._scene) return;

    const targetCount = this._showDistanceLabels
      ? Math.max(0, this._anchors.length - 1) : 0;

    // Rebuild labels if count changed or dirty
    if (this._distanceLabels.length !== targetCount || this._labelsDirty) {
      this._clearDistanceLabels();
      this._labelsDirty = false;

      for (let i = 0; i < targetCount; i++) {
        const p1 = new THREE.Vector3().setFromMatrixPosition(this._anchors[i].mesh.matrix);
        const p2 = new THREE.Vector3().setFromMatrixPosition(this._anchors[i + 1].mesh.matrix);
        const dist = p1.distanceTo(p2) * this._scaleFactor;
        const mid = new THREE.Vector3().lerpVectors(p1, p2, 0.5);
        mid.y += 0.04;

        const sprite = this._createDistanceSprite(dist);
        sprite.position.copy(mid);
        this._scene.add(sprite);
        this._distanceLabels.push(sprite);
      }
      return;
    }

    // Just update positions (cheap, no texture rebuild)
    for (let i = 0; i < this._distanceLabels.length; i++) {
      const p1 = new THREE.Vector3().setFromMatrixPosition(this._anchors[i].mesh.matrix);
      const p2 = new THREE.Vector3().setFromMatrixPosition(this._anchors[i + 1].mesh.matrix);
      const mid = new THREE.Vector3().lerpVectors(p1, p2, 0.5);
      mid.y += 0.04;
      this._distanceLabels[i].position.copy(mid);
    }
  }

  /** Creates a Sprite with distance text on canvas texture */
  _createDistanceSprite(distance) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Rounded rect background
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    const r = 10;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(256 - r, 0);
    ctx.quadraticCurveTo(256, 0, 256, r);
    ctx.lineTo(256, 64 - r);
    ctx.quadraticCurveTo(256, 64, 256 - r, 64);
    ctx.lineTo(r, 64);
    ctx.quadraticCurveTo(0, 64, 0, 64 - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();

    // Distance text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${distance.toFixed(3)}m`, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.15, 0.0375, 1);
    return sprite;
  }

  /** Removes all distance labels from scene */
  _clearDistanceLabels() {
    for (const label of this._distanceLabels) {
      this._scene.remove(label);
      if (label.material.map) label.material.map.dispose();
      label.material.dispose();
    }
    this._distanceLabels = [];
  }

  /** Cleans up all resources */
  dispose() {
    this._clearDistanceLabels();
    for (const entry of this._anchors) {
      this._scene.remove(entry.mesh);
      entry.anchor.delete();
    }
    this._anchors = [];
    if (this._lineMesh) {
      this._scene.remove(this._lineMesh);
      this._lineMesh.geometry.dispose();
    }
    this._sphereGeo.dispose();
    this._sphereMat.dispose();
    this._lineMat.dispose();
    if (this._renderer) this._renderer.dispose();
  }
}
