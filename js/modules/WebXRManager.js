/**
 * WebXR AR session manager - hit-test, anchors, dom-overlay
 * Only works on Android Chrome with ARCore
 * @module modules/WebXRManager
 */

/* global THREE */

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
    this._sphereGeo = new THREE.SphereGeometry(POINT_DIAMETER / 2, 16, 12);
    this._sphereMat = new THREE.MeshStandardMaterial({ color: POINT_COLOR_3D });
    this._lineMat = new THREE.LineBasicMaterial({ color: ROUTE_COLOR_3D });
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

    // Update route line
    this._updateLine();

    this._renderer.render(this._scene, this._camera);
  }

  /**
   * Handles tap (select) event - places anchor at hit-test position
   * @param {XRInputSourceEvent} event
   */
  async _onSelect(event) {
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
  }

  /** Cleans up all resources */
  dispose() {
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
