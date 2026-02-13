/**
 * Converts point data into Three.js 3D objects (spheres + line/tube route)
 * Supports wire mode (thin line) and pipe mode (tube with custom radius)
 * @module modules/RouteGenerator
 */

import * as THREE from 'three';
import { POINT_DIAMETER, POINT_COLOR_3D, ROUTE_COLOR_3D } from '../config.js';
import { pointsToPositions } from '../utils/math.js';

const DEFAULT_TUBE_RADIUS = 0.025;
const TUBE_RADIAL_SEGMENTS = 8;

export default class RouteGenerator {
  constructor() {
    this._pointMaterial = new THREE.MeshStandardMaterial({ color: POINT_COLOR_3D });
    this._tubeMaterial = new THREE.MeshStandardMaterial({ color: ROUTE_COLOR_3D });
    this._lineMaterial = new THREE.LineBasicMaterial({ color: ROUTE_COLOR_3D, linewidth: 2 });
    this._sphereGeometry = new THREE.SphereGeometry(POINT_DIAMETER / 2, 16, 12);
  }

  /**
   * Builds a THREE.Group from distance-based point data
   * @param {Array<{ id: number, distanceToNext: number|null }>} points
   * @param {'wire'|'pipe'} displayMode
   * @param {number} pipeRadius - Pipe outer radius in meters (pipe mode only)
   * @returns {THREE.Group}
   */
  buildRouteGroup(points, displayMode = 'wire', pipeRadius = DEFAULT_TUBE_RADIUS) {
    const group = new THREE.Group();
    group.name = 'routeGroup';
    if (points.length === 0) return group;

    const positions = pointsToPositions(points);

    // Feature point spheres
    positions.forEach((pos, i) => {
      const mesh = new THREE.Mesh(this._sphereGeometry, this._pointMaterial);
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.userData = { pointId: points[i].id };
      group.add(mesh);
    });

    // Route segments
    if (positions.length >= 2) {
      if (displayMode === 'pipe') {
        this._buildPipeSegments(group, positions, pipeRadius);
      } else {
        this._buildWireSegments(group, positions);
      }
    }

    return group;
  }

  /** Wire mode: THREE.Line between consecutive points */
  _buildWireSegments(group, positions) {
    const vecs = positions.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const geo = new THREE.BufferGeometry().setFromPoints(vecs);
    const line = new THREE.Line(geo, this._lineMaterial);
    line.name = 'routeLine';
    group.add(line);
  }

  /** Pipe mode: TubeGeometry straight segments */
  _buildPipeSegments(group, positions, radius) {
    for (let i = 0; i < positions.length - 1; i++) {
      const p1 = new THREE.Vector3(positions[i].x, positions[i].y, positions[i].z);
      const p2 = new THREE.Vector3(positions[i + 1].x, positions[i + 1].y, positions[i + 1].z);
      const path = new THREE.LineCurve3(p1, p2);
      const tubeGeo = new THREE.TubeGeometry(path, 1, radius, TUBE_RADIAL_SEGMENTS, false);
      const tubeMesh = new THREE.Mesh(tubeGeo, this._tubeMaterial);
      tubeMesh.name = 'routeTube';
      group.add(tubeMesh);
    }
  }

  /** Disposes a previously built route group's unique geometries */
  disposeGroup(group) {
    group.traverse((child) => {
      if (child.geometry && (child.name === 'routeTube' || child.name === 'routeLine')) {
        child.geometry.dispose();
      }
    });
  }

  dispose() {
    this._pointMaterial.dispose();
    this._tubeMaterial.dispose();
    this._lineMaterial.dispose();
    this._sphereGeometry.dispose();
  }
}
