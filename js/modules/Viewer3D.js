/**
 * Three.js 3D viewer - scene, camera, renderer, controls
 * Supports: wire/pipe display toggle, distance labels, grid size selection
 * @module modules/Viewer3D
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  VIEWER_FOV, VIEWER_NEAR, VIEWER_FAR,
  AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY,
  DIR_LIGHT_COLOR, DIR_LIGHT_INTENSITY, DIR_LIGHT_POSITION,
  GRID_SIZE, GRID_DIVISIONS, AXIS_LENGTH,
  VIEW_PRESETS
} from '../config.js';
import RouteGenerator from './RouteGenerator.js';
import { pointsToPositions } from '../utils/math.js';

export default class Viewer3D {
  constructor(containerId) {
    this._container = document.getElementById(containerId);
    if (!this._container) {
      throw new Error(`Container element '${containerId}' not found`);
    }
    this._routeGenerator = new RouteGenerator();
    this._routeGroup = null;
    this._animationId = null;
    this._hasControls = false;
    this._originMode = 'start';
    this._grid = null;
    this._axes = null;
    this._lastPositions = null;
    this._lastPoints = null;

    // Display options
    this._displayMode = 'wire'; // 'wire' | 'pipe'
    this._pipeRadius = 0.025;   // meters
    this._showLabels = false;
    this._labelGroup = null;
    this._gridSize = GRID_SIZE * GRID_DIVISIONS; // total grid size in meters

    this._initScene();
    this._initCamera();
    this._initRenderer();
    this._initLabelRenderer();
    this._initLights();
    this._initHelpers();
    this._initControls();
    this._startLoop();
    this._bindResize();
  }

  _initScene() {
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x1a1a2e);
  }

  _initCamera() {
    const w = this._container.clientWidth;
    const h = this._container.clientHeight || 300;
    this._camera = new THREE.PerspectiveCamera(VIEWER_FOV, w / h, VIEWER_NEAR, VIEWER_FAR);
    const iso = VIEW_PRESETS.iso;
    this._camera.position.set(iso.x, iso.y, iso.z);
    this._camera.lookAt(0, 0, 0);
  }

  _initRenderer() {
    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    const w = this._container.clientWidth;
    const h = this._container.clientHeight || 300;
    this._renderer.setSize(w, h);
    this._renderer.domElement.style.touchAction = 'none';
    this._container.appendChild(this._renderer.domElement);
  }

  _initLabelRenderer() {
    this._labelRenderer = new CSS2DRenderer();
    const w = this._container.clientWidth;
    const h = this._container.clientHeight || 300;
    this._labelRenderer.setSize(w, h);
    this._labelRenderer.domElement.style.position = 'absolute';
    this._labelRenderer.domElement.style.top = '0';
    this._labelRenderer.domElement.style.left = '0';
    this._labelRenderer.domElement.style.pointerEvents = 'none';
    this._container.appendChild(this._labelRenderer.domElement);
  }

  _initLights() {
    const ambient = new THREE.AmbientLight(AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY);
    this._scene.add(ambient);
    const dir = new THREE.DirectionalLight(DIR_LIGHT_COLOR, DIR_LIGHT_INTENSITY);
    dir.position.set(DIR_LIGHT_POSITION.x, DIR_LIGHT_POSITION.y, DIR_LIGHT_POSITION.z);
    this._scene.add(dir);
  }

  _initHelpers() {
    const totalSize = this._gridSize;
    const divs = GRID_DIVISIONS;
    this._grid = new THREE.GridHelper(totalSize, divs, 0x888888, 0x444444);
    this._scene.add(this._grid);
    this._axes = new THREE.AxesHelper(AXIS_LENGTH);
    this._scene.add(this._axes);
  }

  _initControls() {
    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
    this._controls.enableDamping = true;
    this._controls.dampingFactor = 0.1;
    this._controls.target.set(0, 0, 0);
    this._hasControls = true;
  }

  _startLoop() {
    const animate = () => {
      this._animationId = requestAnimationFrame(animate);
      this._controls.update();
      this._renderer.render(this._scene, this._camera);
      this._labelRenderer.render(this._scene, this._camera);
    };
    animate();
  }

  _bindResize() {
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(this._container);
  }

  _onResize() {
    const w = this._container.clientWidth;
    const h = this._container.clientHeight || 300;
    if (w === 0) return;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
    this._labelRenderer.setSize(w, h);
  }

  // ─── Route Display ────────────────────────────────────────

  updateRoute(points) {
    this._lastPoints = points;

    // Remove old route
    if (this._routeGroup) {
      this._scene.remove(this._routeGroup);
      this._disposeGroup(this._routeGroup);
    }

    this._routeGroup = this._routeGenerator.buildRouteGroup(
      points, this._displayMode, this._pipeRadius
    );
    this._scene.add(this._routeGroup);

    this._lastPositions = points.length > 0 ? pointsToPositions(points) : null;

    this._updateHelperOrigin();
    this._rebuildLabels();
    this._fitCameraToRoute(points);
  }

  _fitCameraToRoute(points) {
    if (!points || points.length === 0) return;
    const box = new THREE.Box3().setFromObject(this._routeGroup);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.5);
    const dist = maxDim * 2.5;
    this._camera.position.set(center.x + dist * 0.5, center.y + dist * 0.5, center.z + dist);
    this._camera.lookAt(center);
    this._controls.target.copy(center);
    this._controls.update();
  }

  // ─── Display Mode (wire / pipe) ───────────────────────────

  /**
   * Sets display mode and rebuilds route
   * @param {'wire'|'pipe'} mode
   */
  setDisplayMode(mode) {
    this._displayMode = mode;
    if (this._lastPoints) this.updateRoute(this._lastPoints);
  }

  /**
   * Sets pipe radius (meters) and rebuilds if in pipe mode
   * @param {number} radius
   */
  setPipeRadius(radius) {
    this._pipeRadius = radius;
    if (this._displayMode === 'pipe' && this._lastPoints) {
      this.updateRoute(this._lastPoints);
    }
  }

  // ─── Distance Labels ──────────────────────────────────────

  setShowLabels(show) {
    this._showLabels = show;
    this._rebuildLabels();
  }

  _rebuildLabels() {
    // Remove old labels
    if (this._labelGroup) {
      this._scene.remove(this._labelGroup);
      this._labelGroup.traverse((child) => {
        if (child instanceof CSS2DObject) {
          child.element.remove();
        }
      });
    }

    if (!this._showLabels || !this._lastPositions || this._lastPositions.length < 2) {
      this._labelGroup = null;
      return;
    }

    this._labelGroup = new THREE.Group();
    this._labelGroup.name = 'labelGroup';
    const points = this._lastPoints;
    const positions = this._lastPositions;

    for (let i = 0; i < positions.length - 1; i++) {
      const dist = points[i].distanceToNext;
      if (dist === null || dist === undefined) continue;

      const midX = (positions[i].x + positions[i + 1].x) / 2;
      const midY = (positions[i].y + positions[i + 1].y) / 2;
      const midZ = (positions[i].z + positions[i + 1].z) / 2;

      const div = document.createElement('div');
      div.textContent = `${dist.toFixed(2)}m`;
      div.style.cssText = 'background:rgba(0,0,0,0.7);color:#fff;padding:2px 6px;' +
        'border-radius:3px;font-size:11px;font-weight:bold;white-space:nowrap;';

      const label = new CSS2DObject(div);
      label.position.set(midX, midY + 0.05, midZ);
      this._labelGroup.add(label);
    }

    this._scene.add(this._labelGroup);
  }

  // ─── Grid Size ────────────────────────────────────────────

  /**
   * Changes grid total size
   * @param {number} totalSize - Grid size in meters (e.g. 5, 10, 20, 50)
   */
  setGridSize(totalSize) {
    this._gridSize = totalSize;
    // Remove old grid
    if (this._grid) {
      this._scene.remove(this._grid);
      this._grid.geometry.dispose();
    }
    const divs = GRID_DIVISIONS;
    this._grid = new THREE.GridHelper(totalSize, divs, 0x888888, 0x444444);
    this._scene.add(this._grid);
    this._updateHelperOrigin();
  }

  // ─── Origin Toggle ────────────────────────────────────────

  _updateHelperOrigin() {
    if (!this._lastPositions || this._lastPositions.length === 0) return;
    const pos = this._originMode === 'end'
      ? this._lastPositions[this._lastPositions.length - 1]
      : this._lastPositions[0];
    this._grid.position.set(pos.x, 0, pos.z);
    this._axes.position.set(pos.x, pos.y, pos.z);
  }

  toggleOrigin() {
    this._originMode = this._originMode === 'start' ? 'end' : 'start';
    return this._originMode;
  }

  _disposeGroup(group) {
    this._routeGenerator.disposeGroup(group);
  }

  setView(name) {
    const preset = VIEW_PRESETS[name];
    if (!preset) return;
    this._camera.position.set(preset.x, preset.y, preset.z);
    this._camera.lookAt(0, 0, 0);
    this._controls.target.set(0, 0, 0);
    this._controls.update();
  }

  getScene() { return this._scene; }

  forceResize() {
    this._onResize();
  }

  dispose() {
    if (this._animationId) cancelAnimationFrame(this._animationId);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._hasControls) this._controls.dispose();
    this._renderer.dispose();
    this._routeGenerator.dispose();
    if (this._routeGroup) this._disposeGroup(this._routeGroup);
    this._container.removeChild(this._renderer.domElement);
    this._container.removeChild(this._labelRenderer.domElement);
  }
}
