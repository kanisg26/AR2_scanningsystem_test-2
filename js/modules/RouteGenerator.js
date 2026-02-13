/**
 * Converts point data into Three.js 3D objects (spheres + tube route)
 * Uses distance-based X-axis layout from v2 point data
 * @module modules/RouteGenerator
 */

import * as THREE from 'three';
import { POINT_DIAMETER, POINT_COLOR_3D, ROUTE_COLOR_3D } from '../config.js';
import { pointsToPositions } from '../utils/math.js';

/** Tube radius for the route pipe (meters) */
const TUBE_RADIUS = 0.025;
const TUBE_RADIAL_SEGMENTS = 8;

export default class RouteGenerator {
  constructor() {
    this._pointMaterial = new THREE.MeshStandardMaterial({ color: POINT_COLOR_3D });
    this._tubeMaterial = new THREE.MeshStandardMaterial({ color: ROUTE_COLOR_3D });
    this._sphereGeometry = new THREE.SphereGeometry(POINT_DIAMETER / 2, 16, 12);
  }

  /**
   * Builds a THREE.Group from distance-based point data
   * @param {Array<{ id: number, distanceToNext: number|null }>} points
   * @returns {THREE.Group}
   */
  buildRouteGroup(points) {
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

    // Route tube (visible 3D pipe between points)
    if (positions.length >= 2) {
      const vecs = positions.map(p => new THREE.Vector3(p.x, p.y, p.z));
      const curve = new THREE.CatmullRomCurve3(vecs, false);
      const segments = Math.max(vecs.length * 4, 8);
      const tubeGeometry = new THREE.TubeGeometry(
        curve, segments, TUBE_RADIUS, TUBE_RADIAL_SEGMENTS, false
      );
      const tubeMesh = new THREE.Mesh(tubeGeometry, this._tubeMaterial);
      tubeMesh.name = 'routeTube';
      group.add(tubeMesh);
    }

    return group;
  }

  /** Disposes a previously built route group's unique geometries */
  disposeGroup(group) {
    group.traverse((child) => {
      if (child.geometry && child.name === 'routeTube') {
        child.geometry.dispose();
      }
    });
  }

  dispose() {
    this._pointMaterial.dispose();
    this._tubeMaterial.dispose();
    this._sphereGeometry.dispose();
  }
}
