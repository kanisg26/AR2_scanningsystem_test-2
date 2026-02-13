/**
 * Three.js 3D viewer - scene, camera, renderer, controls
 * @module modules/Viewer3D
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  VIEWER_FOV, VIEWER_NEAR, VIEWER_FAR,
  AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY,
  DIR_LIGHT_COLOR, DIR_LIGHT_INTENSITY, DIR_LIGHT_POSITION,
  GRID_SIZE, GRID_DIVISIONS, AXIS_LENGTH,
  VIEW_PRESETS
} from '../config.js';
import RouteGenerator from './RouteGenerator.js';

export default class Viewer3D {
  /**
   * @param {string} containerId - DOM id of the viewer container
   */
  constructor(containerId) {
    this._container = document.getElementById(containerId);
    if (!this._container) {
      throw new Error(`Container element '${containerId}' not found`);
    }
    this._routeGenerator = new RouteGenerator();
    this._routeGroup = null;
    this._animationId = null;
    this._hasControls = false;

    this._initScene();
    this._initCamera();
    this._initRenderer();
    this._initLights();
    this._initHelpers();
    this._initControls();
    this._startLoop();
    this._bindResize();
    console.log('Viewer3D: constructor complete, hasControls=' + this._hasControls);
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
    // Enable touch gestures (rotate/zoom/pan) on mobile
    this._renderer.domElement.style.touchAction = 'none';
    this._container.appendChild(this._renderer.domElement);
  }

  _initLights() {
    const ambient = new THREE.AmbientLight(AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY);
    this._scene.add(ambient);
    const dir = new THREE.DirectionalLight(DIR_LIGHT_COLOR, DIR_LIGHT_INTENSITY);
    dir.position.set(DIR_LIGHT_POSITION.x, DIR_LIGHT_POSITION.y, DIR_LIGHT_POSITION.z);
    this._scene.add(dir);
  }

  _initHelpers() {
    const grid = new THREE.GridHelper(GRID_SIZE * GRID_DIVISIONS, GRID_DIVISIONS, 0x888888, 0x444444);
    this._scene.add(grid);
    const axes = new THREE.AxesHelper(AXIS_LENGTH);
    this._scene.add(axes);
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
    if (w === 0) return; // container is hidden (e.g. AR mode)
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
  }

  /**
   * Rebuilds the 3D route from distance-based point data
   * @param {Array<{ id: number, distanceToNext: number|null }>} points
   */
  updateRoute(points) {
    if (this._routeGroup) {
      this._scene.remove(this._routeGroup);
      this._disposeGroup(this._routeGroup);
    }
    this._routeGroup = this._routeGenerator.buildRouteGroup(points);
    this._scene.add(this._routeGroup);
    this._fitCameraToRoute(points);
  }

  /** Adjusts camera and controls target to fit the current route */
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

  _disposeGroup(group) {
    this._routeGenerator.disposeGroup(group);
  }

  /**
   * Sets camera to a named preset view
   * @param {'front'|'top'|'side'|'iso'} name
   */
  setView(name) {
    const preset = VIEW_PRESETS[name];
    if (!preset) return;
    this._camera.position.set(preset.x, preset.y, preset.z);
    this._camera.lookAt(0, 0, 0);
    this._controls.target.set(0, 0, 0);
    this._controls.update();
  }

  /** @returns {THREE.Scene} */
  getScene() { return this._scene; }

  /** Forces a resize recalculation (call after container becomes visible) */
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
  }
}
