import type { Box3, Vec3 } from '@/common/maaths';
import { box3, vec2, vec3 } from '@/common/maaths';
import { closestPtSeg2d, distancePtSeg2dSqr, getHeightAtPoint, pointInPoly } from '../common/geometry';
import {
    type NavMesh,
    type NavMeshLink,
    type NavMeshPoly,
    type NavMeshTile,
    type PolyRef,
    desPolyRef,
    getTilesAt,
    serPolyRef,
    worldToTilePosition,
} from './nav-mesh';
import {
    reindexNodeInQueue,
    NODE_FLAG_CLOSED,
    NODE_FLAG_OPEN,
    popNodeFromQueue,
    pushNodeToQueue,
    type SearchNodePool,
    type SearchNode,
    type SearchNodeQueue,
    type SearchNodeRef,
} from './search';

type QueryFilter = {
    /**
     * Flags that polygons must include to be considered.
     */
    includeFlags: number;

    /**
     * Flags that polygons must not include to be considered.
     */
    excludeFlags: number;

    /**
     * Checks if a polygon passes the filter.
     * @param poly The polygon to check.
     * @param ref The reference id of the polygon.
     * @param tile The tile containing the polygon.
     * @returns Whether the polygon passes the filter.
     */
    passFilter?: (poly: NavMeshPoly, ref: string, tile: NavMeshTile) => boolean;

    /**
     * Calculates the cost of moving from one point to another within a polygon.
     * @param pa The start position on the edge of the previous and current polygon. [(x, y, z)]
     * @param pb The end position on the edge of the current and next polygon. [(x, y, z)]
     * @param prevRef The reference id of the previous polygon. [opt]
     * @param prevTile The tile containing the previous polygon. [opt]
     * @param prevPoly The previous polygon. [opt]
     * @param curRef The reference id of the current polygon.
     * @param curTile The tile containing the current polygon.
     * @param curPoly The current polygon.
     * @param nextRef The reference id of the next polygon. [opt]
     * @param nextTile The tile containing the next polygon. [opt]
     * @param nextPoly The next polygon. [opt]
     * @returns The cost of moving from the start to the end position.
     */
    getCost?: (
        pa: Vec3,
        pb: Vec3,
        prevRef: PolyRef | undefined,
        prevTile: NavMeshTile | undefined,
        prevPoly: NavMeshPoly | undefined,
        curRef: PolyRef,
        curTile: NavMeshTile,
        curPoly: NavMeshPoly,
        nextRef: string | undefined,
        nextTile: NavMeshTile | undefined,
        nextPoly: NavMeshPoly | undefined,
    ) => number;
};

export const DEFAULT_QUERY_FILTER = {
    includeFlags: 0xffffffff,
    excludeFlags: 0,
    getCost: (pa, pb, _prevRef, _prevTile, _prevPoly, _curRef, _curTile, _curPoly, _nextRef, _nextTile, _nextPoly) => {
        return vec3.distance(pa, pb);
    },
} satisfies QueryFilter;

/**
 * Gets the tile and polygon from a polygon reference
 * @param ref The polygon reference
 * @param navMesh The navigation mesh
 * @returns Object containing tile and poly, or null if not found
 */
export const getTileAndPolyByRef = (
    ref: PolyRef,
    navMesh: NavMesh,
): { tile: NavMeshTile; poly: NavMeshPoly; polyIndex: number } | null => {
    const [tileId, polyId] = desPolyRef(ref);

    const tile = navMesh.tiles[tileId];
    if (!tile) {
        return null;
    }

    // if (polyIndex >= tile.polys.length) {
    //     return null;
    // }

    return {
        tile,
        poly: tile.polys[polyId],
        polyIndex: polyId,
    };
};

const _v0 = vec3.create();
const _v1 = vec3.create();
const _v2 = vec3.create();

/**
 * Gets the height of a polygon at a given point using detail mesh if available
 * @param tile The tile containing the polygon
 * @param poly The polygon
 * @param polyIndex The index of the polygon in the tile
 * @param pos The position to get height for
 * @param height Output parameter for the height
 * @returns True if height was found
 */
export const getPolyHeight = (tile: NavMeshTile, poly: NavMeshPoly, polyIndex: number, pos: Vec3): number => {
    // Check if we have detail mesh data
    const detailMesh = tile.detailMeshes?.[polyIndex];

    if (detailMesh) {
        // Use detail mesh for accurate height calculation
        for (let j = 0; j < detailMesh.trianglesCount; ++j) {
            const t = (detailMesh.trianglesBase + j) * 4;
            const detailTriangles = tile.detailTriangles;

            const v0Index = detailTriangles[t + 0];
            const v1Index = detailTriangles[t + 1];
            const v2Index = detailTriangles[t + 2];

            // Get triangle vertices
            const v0 = _v0;
            const v1 = _v1;
            const v2 = _v2;

            if (v0Index < tile.vertices.length / 3) {
                // Use main tile vertices
                vec3.fromArray(v0, tile.vertices, v0Index * 3);
            } else {
                // Use detail vertices
                const detailIndex = (v0Index - tile.vertices.length / 3) * 3;
                vec3.fromArray(v0, tile.detailVertices, detailIndex);
            }

            if (v1Index < tile.vertices.length / 3) {
                vec3.fromArray(v1, tile.vertices, v1Index * 3);
            } else {
                const detailIndex = (v1Index - tile.vertices.length / 3) * 3;
                vec3.fromArray(v1, tile.detailVertices, detailIndex);
            }

            if (v2Index < tile.vertices.length / 3) {
                vec3.fromArray(v2, tile.vertices, v2Index * 3);
            } else {
                const detailIndex = (v2Index - tile.vertices.length / 3) * 3;
                vec3.fromArray(v2, tile.detailVertices, detailIndex);
            }

            // Check if point is inside triangle and calculate height
            const h = getHeightAtPoint(v0, v1, v2, pos);
            if (h !== null) {
                return h;
            }
        }
    }

    // Fallback: use polygon vertices for height calculation
    if (poly.vertices.length >= 3) {
        const v0 = _v0;
        const v1 = _v1;
        const v2 = _v2;

        vec3.fromArray(v0, tile.vertices, poly.vertices[0] * 3);
        vec3.fromArray(v1, tile.vertices, poly.vertices[1] * 3);
        vec3.fromArray(v2, tile.vertices, poly.vertices[2] * 3);

        const h = getHeightAtPoint(v0, v1, v2, pos);

        if (h !== null) {
            return h;
        }
    }

    return Number.NaN;
};

const _closestOnDetailEdges: Vec3 = [0, 0, 0];
const _vi: Vec3 = [0, 0, 0];
const _vk: Vec3 = [0, 0, 0];

/**
 * Finds the closest point on detail mesh edges to a given point
 * @param tile The tile containing the detail mesh
 * @param detailMesh The detail mesh
 * @param pos The position to find closest point for
 * @param closest Output parameter for the closest point
 * @returns The squared distance to the closest point
 */
const closestPointOnDetailEdges = (
    tile: NavMeshTile,
    detailMesh: {
        verticesBase: number;
        verticesCount: number;
        trianglesBase: number;
        trianglesCount: number;
    },
    pos: Vec3,
    closest: Vec3,
): number => {
    let dmin = Number.MAX_VALUE;

    for (let i = 0; i < detailMesh.trianglesCount; ++i) {
        const t = (detailMesh.trianglesBase + i) * 4;
        const detailTriangles = tile.detailTriangles;

        for (let j = 0; j < 3; ++j) {
            const k = (j + 1) % 3;

            const viIndex = detailTriangles[t + j];
            const vkIndex = detailTriangles[t + k];

            // Get vertices
            const vi = _vi;
            const vk = _vk;

            if (viIndex < tile.vertices.length / 3) {
                vec3.fromArray(vi, tile.vertices, viIndex * 3);
            } else {
                const detailIndex = (viIndex - tile.vertices.length / 3) * 3;

                vec3.fromArray(vi, tile.detailVertices, detailIndex);
            }

            if (vkIndex < tile.vertices.length / 3) {
                vec3.fromArray(vk, tile.vertices, vkIndex * 3);
            } else {
                const detailIndex = (vkIndex - tile.vertices.length / 3) * 3;
                vec3.fromArray(vk, tile.detailVertices, detailIndex);
            }

            closestPtSeg2d(_closestOnDetailEdges, pos, vi, vk);
            const d = distancePtSeg2dSqr(pos, vi, vk);

            if (d < dmin) {
                dmin = d;
                vec3.copy(closest, _closestOnDetailEdges);
            }
        }
    }

    return dmin;
};

export type GetClosestPointOnPolyResult = {
    success: boolean;
    isOverPoly: boolean;
    closestPoint: Vec3;
};

export const createGetClosestPointOnPolyResult = (): GetClosestPointOnPolyResult => {
    return {
        success: false,
        isOverPoly: false,
        closestPoint: [0, 0, 0],
    };
};

const _detailClosestPoint = vec3.create();

const _lineStart = vec3.create();
const _lineEnd = vec3.create();

export const getClosestPointOnPoly = (
    result: GetClosestPointOnPolyResult,
    navMesh: NavMesh,
    ref: PolyRef,
    point: Vec3,
): GetClosestPointOnPolyResult => {
    result.success = false;
    result.isOverPoly = false;
    vec3.copy(result.closestPoint, point);

    const tileAndPoly = getTileAndPolyByRef(ref, navMesh);
    if (!tileAndPoly) {
        return result;
    }

    const { tile, poly, polyIndex } = tileAndPoly;

    // TODO: Handle off-mesh connections
    // if (poly.getType() === DT_POLYTYPE_OFFMESH_CONNECTION) {
    //     const v0 = poly.verts[0] * 3;
    //     const v1 = poly.verts[1] * 3;
    //     // ... off-mesh connection logic
    //     return result;
    // }

    // Get polygon vertices
    const nv = poly.vertices.length;
    const verts = new Array(nv * 3);

    for (let i = 0; i < nv; ++i) {
        const vertIndex = poly.vertices[i] * 3;
        verts[i * 3] = tile.vertices[vertIndex];
        verts[i * 3 + 1] = tile.vertices[vertIndex + 1];
        verts[i * 3 + 2] = tile.vertices[vertIndex + 2];
    }

    // Check if point is over polygon
    if (pointInPoly(nv, verts, point)) {
        result.isOverPoly = true;

        // Find height at the position
        const height = getPolyHeight(tile, poly, polyIndex, point);
        if (!Number.isNaN(height)) {
            result.closestPoint[0] = point[0];
            result.closestPoint[1] = height;
            result.closestPoint[2] = point[2];
        } else {
            // Fallback to polygon center height
            let avgY = 0;
            for (let i = 0; i < nv; ++i) {
                avgY += verts[i * 3 + 1];
            }
            result.closestPoint[0] = point[0];
            result.closestPoint[1] = avgY / nv;
            result.closestPoint[2] = point[2];
        }

        result.success = true;
        return result;
    }

    // Point is outside polygon, find closest point on polygon boundary
    let dmin = Number.MAX_VALUE;
    let imin = -1;

    for (let i = 0; i < nv; ++i) {
        const j = (i + 1) % nv;
        _lineStart[0] = verts[i * 3];
        _lineStart[1] = verts[i * 3 + 1];
        _lineStart[2] = verts[i * 3 + 2];

        _lineEnd[0] = verts[j * 3];
        _lineEnd[1] = verts[j * 3 + 1];
        _lineEnd[2] = verts[j * 3 + 2];

        const d = distancePtSeg2dSqr(point, _lineStart, _lineEnd);
        if (d < dmin) {
            dmin = d;
            imin = i;
        }
    }

    if (imin >= 0) {
        const j = (imin + 1) % nv;

        _lineStart[0] = verts[imin * 3];
        _lineStart[1] = verts[imin * 3 + 1];
        _lineStart[2] = verts[imin * 3 + 2];

        _lineEnd[0] = verts[j * 3];
        _lineEnd[1] = verts[j * 3 + 1];
        _lineEnd[2] = verts[j * 3 + 2];

        closestPtSeg2d(result.closestPoint, point, _lineStart, _lineEnd);

        // Try to get more accurate height from detail mesh if available
        const detailMesh = tile.detailMeshes?.[polyIndex];

        if (detailMesh) {
            const detailDist = closestPointOnDetailEdges(tile, detailMesh, point, _detailClosestPoint);

            // use detail mesh result if it's closer
            const currentDist = vec3.squaredDistance(result.closestPoint, point);

            if (detailDist < currentDist) {
                vec3.copy(result.closestPoint, _detailClosestPoint);
            }
        }

        result.success = true;
    }

    return result;
};

export const CLOSEST_POINT_ON_POLY_BOUNDARY_ERROR_INVALID_INPUT = 0 as const;
export const CLOSEST_POINT_ON_POLY_BOUNDARY_SUCCESS = 1 as const;

export type ClosestPointOnPolyBoundaryStatus =
    | typeof CLOSEST_POINT_ON_POLY_BOUNDARY_ERROR_INVALID_INPUT
    | typeof CLOSEST_POINT_ON_POLY_BOUNDARY_SUCCESS;

export const closestPointOnPolyBoundary = (
    navMesh: NavMesh,
    polyRef: PolyRef,
    point: Vec3,
    outClosestPoint: Vec3,
): ClosestPointOnPolyBoundaryStatus => {
    // TODO...
    return CLOSEST_POINT_ON_POLY_BOUNDARY_SUCCESS;
};

export type FindNearestPolyResult = {
    success: boolean;
    nearestPolyRef: PolyRef;
    nearestPoint: Vec3;
};

export const createFindNearestPolyResult = (): FindNearestPolyResult => {
    return {
        success: false,
        nearestPolyRef: '' as PolyRef,
        nearestPoint: [0, 0, 0],
    };
};

const _closestPointResult = createGetClosestPointOnPolyResult();

const _nearestPoint: Vec3 = [0, 0, 0];

export const findNearestPoly = (
    result: FindNearestPolyResult,
    navMesh: NavMesh,
    center: Vec3,
    halfExtents: Vec3,
    queryFilter: QueryFilter,
): FindNearestPolyResult => {
    result.success = false;
    result.nearestPolyRef = '' as PolyRef;
    vec3.copy(result.nearestPoint, center);

    // query polygons in the area
    const polys = queryPolygons(navMesh, center, halfExtents, queryFilter);

    let nearestDistSqr = Number.MAX_VALUE;
    let nearestPoly: PolyRef | null = null;

    // find the closest polygon
    for (const polyRef of polys) {
        getClosestPointOnPoly(_closestPointResult, navMesh, polyRef, center);

        if (_closestPointResult.success) {
            const distSqr = vec3.squaredDistance(center, _closestPointResult.closestPoint);

            if (distSqr < nearestDistSqr) {
                nearestDistSqr = distSqr;
                nearestPoly = polyRef;
                vec3.copy(_nearestPoint, _closestPointResult.closestPoint);
            }
        }
    }

    if (nearestPoly) {
        result.success = true;
        result.nearestPolyRef = nearestPoly;
        vec3.copy(result.nearestPoint, _nearestPoint);
    }

    return result;
};

const _bmax = vec3.create();
const _bmin = vec3.create();
const _vertex = vec3.create();

export const queryPolygonsInTile = (tile: NavMeshTile, bounds: Box3, filter: QueryFilter, out: PolyRef[]): void => {
    if (tile.bvTree) {
        const qmin = bounds[0];
        const qmax = bounds[1];

        let nodeIndex = 0;
        const endIndex = tile.bvTree.nodes.length;
        const tbmin = tile.bounds[0];
        const tbmax = tile.bounds[1];
        const qfac = tile.bvTree.quantFactor;

        // Clamp query box to world box.
        const minx = Math.max(Math.min(qmin[0], tbmax[0]), tbmin[0]) - tbmin[0];
        const miny = Math.max(Math.min(qmin[1], tbmax[1]), tbmin[1]) - tbmin[1];
        const minz = Math.max(Math.min(qmin[2], tbmax[2]), tbmin[2]) - tbmin[2];
        const maxx = Math.max(Math.min(qmax[0], tbmax[0]), tbmin[0]) - tbmin[0];
        const maxy = Math.max(Math.min(qmax[1], tbmax[1]), tbmin[1]) - tbmin[1];
        const maxz = Math.max(Math.min(qmax[2], tbmax[2]), tbmin[2]) - tbmin[2];

        // Quantize
        _bmin[0] = Math.floor(qfac * minx) & 0xfffe;
        _bmin[1] = Math.floor(qfac * miny) & 0xfffe;
        _bmin[2] = Math.floor(qfac * minz) & 0xfffe;
        _bmax[0] = Math.floor(qfac * maxx + 1) | 1;
        _bmax[1] = Math.floor(qfac * maxy + 1) | 1;
        _bmax[2] = Math.floor(qfac * maxz + 1) | 1;

        // Traverse tree
        while (nodeIndex < endIndex) {
            const node = tile.bvTree.nodes[nodeIndex];

            const nodeBounds = node.bounds;
            const overlap =
                _bmin[0] <= nodeBounds[1][0] &&
                _bmax[0] >= nodeBounds[0][0] &&
                _bmin[1] <= nodeBounds[1][1] &&
                _bmax[1] >= nodeBounds[0][1] &&
                _bmin[2] <= nodeBounds[1][2] &&
                _bmax[2] >= nodeBounds[0][2];

            const isLeafNode = node.i >= 0;

            if (isLeafNode && overlap) {
                const polyId = node.i;
                const poly = tile.polys[polyId];
                const ref: PolyRef = serPolyRef(tile.id, polyId);

                if ((poly.flags & filter.includeFlags) !== 0 && (poly.flags & filter.excludeFlags) === 0) {
                    if (!filter.passFilter || filter.passFilter(poly, ref, tile)) {
                        out.push(ref);
                    }
                }
            }

            if (overlap || isLeafNode) {
                nodeIndex++;
            } else {
                const escapeIndex = -node.i;
                nodeIndex += escapeIndex;
            }
        }
    } else {
        const qmin = bounds[0];
        const qmax = bounds[1];

        for (const polyId in tile.polys) {
            const poly = tile.polys[polyId];

            // Do not return off-mesh connection polygons.
            // TODO: uncomment when poly.type is available
            // if (poly.type === 'OFFMESH_CONNECTION') {
            //     continue;
            // }

            // Must pass filter
            const ref: PolyRef = serPolyRef(tile.id, polyId);
            if ((poly.flags & filter.includeFlags) === 0 || (poly.flags & filter.excludeFlags) !== 0) {
                continue;
            }

            if (filter.passFilter && !filter.passFilter(poly, ref, tile)) {
                continue;
            }

            // calc polygon bounds
            const firstVertexIndex = poly.vertices[0];
            vec3.set(
                _vertex,
                tile.vertices[firstVertexIndex * 3],
                tile.vertices[firstVertexIndex * 3 + 1],
                tile.vertices[firstVertexIndex * 3 + 2],
            );
            vec3.copy(_bmax, _vertex);
            vec3.copy(_bmin, _vertex);

            for (let j = 1; j < poly.vertices.length; j++) {
                const vertexIndex = poly.vertices[j];
                vec3.set(
                    _vertex,
                    tile.vertices[vertexIndex * 3],
                    tile.vertices[vertexIndex * 3 + 1],
                    tile.vertices[vertexIndex * 3 + 2],
                );
                vec3.min(_bmax, _bmax, _vertex);
                vec3.max(_bmin, _bmin, _vertex);
            }

            // Check overlap with query bounds
            if (
                qmin[0] <= _bmin[0] &&
                qmax[0] >= _bmax[0] &&
                qmin[1] <= _bmin[1] &&
                qmax[1] >= _bmax[1] &&
                qmin[2] <= _bmin[2] &&
                qmax[2] >= _bmax[2]
            ) {
                out.push(ref);
            }
        }
    }
};

const _queryPolygonsBounds = box3.create();
const _queryPolygonsMinTile = vec2.create();
const _queryPolygonsMaxTile = vec2.create();

export const queryPolygons = (navMesh: NavMesh, center: Vec3, halfExtents: Vec3, filter: QueryFilter): PolyRef[] => {
    const result: PolyRef[] = [];

    // set the bounds for the query
    const bounds = _queryPolygonsBounds;
    vec3.sub(bounds[0], center, halfExtents);
    vec3.add(bounds[1], center, halfExtents);

    // find min and max tile positions
    const minTile = worldToTilePosition(_queryPolygonsMinTile, navMesh, bounds[0]);
    const maxTile = worldToTilePosition(_queryPolygonsMaxTile, navMesh, bounds[1]);

    // iterate through the tiles in the query bounds
    for (let x = minTile[0]; x <= maxTile[0]; x++) {
        for (let y = minTile[1]; y <= maxTile[1]; y++) {
            const tiles = getTilesAt(navMesh, x, y);

            for (const tile of tiles) {
                queryPolygonsInTile(tile, bounds, filter, result);
            }
        }
    }

    return result;
};

const _start = vec3.create();
const _end = vec3.create();

const getPortalPoints = (
    navMesh: NavMesh,
    fromTile: NavMeshTile,
    fromPolyRef: PolyRef,
    fromPoly: NavMeshPoly,
    toTile: NavMeshTile,
    toPolyRef: PolyRef,
    toPoly: NavMeshPoly,
    outLeft: Vec3,
    outRight: Vec3,
): boolean => {
    // Find the link that points to the 'to' polygon.
    let toLink: NavMeshLink | undefined = undefined;

    for (const linkIndex of fromPoly.links) {
        const link = fromTile.links[linkIndex];
        if (link?.neighbourRef === toPolyRef) {
            // Found the link to the target polygon.
            toLink = link;
            break;
        }
    }

    if (!toLink) {
        // No link found to the target polygon.
        return false;
    }

    // TODO: off-mesh connection handling
    // ...

    // Find portal vertices
    const v0Index = fromPoly.vertices[toLink.edge];
    const v1Index = fromPoly.vertices[(toLink.edge + 1) % fromPoly.vertices.length];

    vec3.fromArray(outLeft, fromTile.vertices, v0Index * 3);
    vec3.fromArray(outRight, fromTile.vertices, v1Index * 3);

    // If the link is at tile boundary, clamp the vertices to the link width.
    if (toLink.side !== 0xff) {
        // Unpack portal limits.
        if (toLink.bmin !== 0 || toLink.bmax !== 255) {
            const s = 1.0 / 255.0;
            const tmin = toLink.bmin * s;
            const tmax = toLink.bmax * s;

            vec3.fromArray(_start, fromTile.vertices, v0Index * 3);
            vec3.fromArray(_end, fromTile.vertices, v1Index * 3);
            vec3.lerp(outLeft, _start, _end, tmin);
            vec3.lerp(outRight, _start, _end, tmax);
        }
    }

    return true;
};

const _portalLeft = vec3.create();
const _portalRight = vec3.create();

const getEdgeMidPoint = (
    navMesh: NavMesh,
    fromTile: NavMeshTile,
    fromPolyRef: PolyRef,
    fromPoly: NavMeshPoly,
    toTile: NavMeshTile,
    toPolyRef: PolyRef,
    toPoly: NavMeshPoly,
    outMidPoint: Vec3,
): boolean => {
    if (!getPortalPoints(navMesh, fromTile, fromPolyRef, fromPoly, toTile, toPolyRef, toPoly, _portalLeft, _portalRight)) {
        return false;
    }

    outMidPoint[0] = (_portalLeft[0] + _portalRight[0]) * 0.5;
    outMidPoint[1] = (_portalLeft[1] + _portalRight[1]) * 0.5;
    outMidPoint[2] = (_portalLeft[2] + _portalRight[2]) * 0.5;

    return true;
};

const isValidPolyRef = (navMesh: NavMesh, polyRef: PolyRef): boolean => {
    const [tileId, polyIndex] = desPolyRef(polyRef);

    const tile = navMesh.tiles[tileId];

    if (!tile) {
        return false;
    }

    // if (polyIndex < 0 || polyIndex >= tile.polys.length) {
    //     return false;
    // }

    const poly = tile.polys[polyIndex];

    if (!poly) {
        return false;
    }

    return true;
};

export const FIND_PATH_STATUS_INVALID_INPUT = 0 as const;
export const FIND_PATH_STATUS_PARTIAL_PATH = 1 as const;
export const FIND_PATH_STATUS_COMPLETE_PATH = 2 as const;

export type FindPathStatus =
    | typeof FIND_PATH_STATUS_INVALID_INPUT
    | typeof FIND_PATH_STATUS_PARTIAL_PATH
    | typeof FIND_PATH_STATUS_COMPLETE_PATH;

export type FindPathResult = {
    /** whether the search completed successfully, with either a partial or complete path */
    success: boolean;

    /** the result status for the operation */
    status: FindPathStatus;

    /** the polygon path */
    path: PolyRef[];

    /** intermediate data used for the search, typically only needed for debugging */
    intermediates?: {
        nodes: SearchNodePool;
        openList: SearchNodeQueue;
    };
};

const HEURISTIC_SCALE = 0.999; // Search heuristic scale

/**
 * Find a path between two polygons.
 *
 * If the end polygon cannot be reached through the navigation graph,
 * the last polygon in the path will be the nearest the end polygon.
 *
 * If the path array is to small to hold the full result, it will be filled as
 * far as possible from the start polygon toward the end polygon.
 *
 * The start and end positions are used to calculate traversal costs.
 * (The y-values impact the result.)
 *
 * @param startRef The reference ID of the starting polygon.
 * @param endRef The reference ID of the ending polygon.
 * @param startPos The starting position in world space.
 * @param endPos The ending position in world space.
 * @param filter Query filter to apply.
 * @returns The result of the pathfinding operation.
 */
export const findPath = (
    navMesh: NavMesh,
    startRef: PolyRef,
    endRef: PolyRef,
    startPos: Vec3,
    endPos: Vec3,
    filter: QueryFilter,
): FindPathResult => {
    // validate input
    if (
        !isValidPolyRef(navMesh, startRef) ||
        !isValidPolyRef(navMesh, endRef) ||
        !vec3.finite(startPos) ||
        !vec3.finite(endPos)
    ) {
        return {
            status: FIND_PATH_STATUS_INVALID_INPUT,
            success: false,
            path: [],
        };
    }

    // early exit if start and end are the same
    if (startRef === endRef) {
        return {
            status: FIND_PATH_STATUS_COMPLETE_PATH,
            success: true,
            path: [startRef],
        };
    }

    // prepare search
    const getCost = filter.getCost ?? DEFAULT_QUERY_FILTER.getCost;

    const nodes: { [polyRefAndState: SearchNodeRef]: SearchNode } = {};
    const openList: SearchNodeQueue = [];

    const startNode: SearchNode = {
        cost: 0,
        total: vec3.distance(startPos, endPos) * HEURISTIC_SCALE,
        parent: null,
        polyRef: startRef,
        state: 0,
        flags: NODE_FLAG_OPEN,
        position: structuredClone(startPos),
    };
    nodes[`${startRef}:0`] = startNode;
    pushNodeToQueue(openList, startNode);

    let lastBestNode: SearchNode = startNode;
    let lastBestNodeCost = startNode.total;

    while (openList.length > 0) {
        // remove node from the open list and put it in the closed list
        const currentNode = popNodeFromQueue(openList)!;
        currentNode.flags &= ~NODE_FLAG_OPEN;
        currentNode.flags |= NODE_FLAG_CLOSED;

        // if we have reached the goal, stop searching
        const currentPolyRef = currentNode.polyRef;
        if (currentPolyRef === endRef) {
            lastBestNode = currentNode;
            break;
        }

        // get current poly and tile
        const [currentTileId, currentPolyIndex] = desPolyRef(currentPolyRef);
        const currentTile = navMesh.tiles[currentTileId];
        const currentPoly = currentTile.polys[currentPolyIndex];

        // get parent poly ref
        let parentPolyRef: PolyRef | undefined = undefined;
        let parentTile: NavMeshTile | undefined = undefined;
        let parentPoly: NavMeshPoly | undefined = undefined;
        if (currentNode.parent) {
            const [polyRef, _polyState] = currentNode.parent.split(':');
            parentPolyRef = polyRef as PolyRef;

            const [parentTileId, parentPolyIndex] = desPolyRef(parentPolyRef);
            parentTile = navMesh.tiles[parentTileId];
            parentPoly = parentTile.polys[parentPolyIndex];
        }

        // expand the search with poly links
        for (const link of currentPoly.links) {
            const neighbourPolyRef = currentTile.links[link].neighbourRef;

            // skip invalid ids and do not expand back to where we came from
            if (!neighbourPolyRef || neighbourPolyRef === parentPolyRef) {
                continue;
            }

            // get the neighbour poly and tile
            const [neighbourTileId, neighbourPolyIndex] = desPolyRef(neighbourPolyRef);
            const neighbourTile = navMesh.tiles[neighbourTileId];
            const neighbourPoly = neighbourTile.polys[neighbourPolyIndex];

            // check whether neighbour passes the filter
            if (filter.passFilter && filter.passFilter(neighbourPoly, neighbourPolyRef, neighbourTile) === false) {
                continue;
            }

            // deal explicitly with crossing tile boundaries by partitioning the search node refs by crossing side
            let crossSide = 0;
            if (currentTile.links[link].side !== 0xff) {
                crossSide = currentTile.links[link].side >> 1;
            }

            // get the neighbour node
            const neighbourSearchNodeRef: SearchNodeRef = `${neighbourPolyRef}:${crossSide}`;
            let neighbourNode = nodes[neighbourSearchNodeRef];
            if (!neighbourNode) {
                neighbourNode = {
                    cost: 0,
                    total: 0,
                    parent: null,
                    polyRef: neighbourPolyRef,
                    state: crossSide,
                    flags: 0,
                    position: structuredClone(endPos),
                };
                nodes[neighbourSearchNodeRef] = neighbourNode;
            }

            // if this node is being visited for the first time, calculate the node position
            if (neighbourNode.flags === 0) {
                getEdgeMidPoint(
                    navMesh,
                    currentTile,
                    currentPolyRef,
                    currentPoly,
                    neighbourTile,
                    neighbourPolyRef,
                    neighbourPoly,
                    neighbourNode.position,
                );
            }

            // calculate cost and heuristic
            let cost = 0;
            let heuristic = 0;

            // special case for last node
            if (neighbourPolyRef === endRef) {
                const curCost = getCost(
                    currentNode.position,
                    neighbourNode.position,
                    neighbourPolyRef,
                    neighbourTile,
                    neighbourPoly,
                    currentPolyRef,
                    currentTile,
                    currentPoly,
                    undefined,
                    undefined,
                    undefined,
                );

                const endCost = getCost(
                    neighbourNode.position,
                    endPos,
                    neighbourPolyRef,
                    neighbourTile,
                    neighbourPoly,
                    currentPolyRef,
                    currentTile,
                    currentPoly,
                    undefined,
                    undefined,
                    undefined,
                );

                cost = currentNode.cost + curCost + endCost;
                heuristic = 0;
            } else {
                const curCost = getCost(
                    currentNode.position,
                    neighbourNode.position,
                    parentPolyRef,
                    parentTile,
                    parentPoly,
                    currentPolyRef,
                    currentTile,
                    currentPoly,
                    neighbourPolyRef,
                    neighbourTile,
                    neighbourPoly,
                );
                cost = currentNode.cost + curCost;
                heuristic = vec3.distance(neighbourNode.position, endPos) * HEURISTIC_SCALE;
            }

            const total = cost + heuristic;

            // if the node is already in the open list, and the new result is worse, skip
            if (neighbourNode.flags & NODE_FLAG_OPEN && total >= neighbourNode.total) {
                continue;
            }

            // if the node is already visited and in the closed list, and the new result is worse, skip
            if (neighbourNode.flags & NODE_FLAG_CLOSED && total >= neighbourNode.total) {
                continue;
            }

            // add or update the node
            neighbourNode.parent = `${currentNode.polyRef}:${currentNode.state}`;
            neighbourNode.polyRef = neighbourPolyRef;
            neighbourNode.flags = neighbourNode.flags & ~NODE_FLAG_CLOSED;
            neighbourNode.cost = cost;
            neighbourNode.total = total;

            if (neighbourNode.flags & NODE_FLAG_OPEN) {
                // already in open list, update node location
                reindexNodeInQueue(openList, neighbourNode);
            } else {
                // put the node in the open list
                neighbourNode.flags |= NODE_FLAG_OPEN;
                pushNodeToQueue(openList, neighbourNode);
            }

            // update nearest node to target so far
            if (heuristic < lastBestNodeCost) {
                lastBestNode = neighbourNode;
                lastBestNodeCost = heuristic;
            }
        }
    }

    // assemble the polygon path to the node
    const path: PolyRef[] = [];
    let currentNode: SearchNode | null = lastBestNode;

    while (currentNode) {
        path.push(currentNode.polyRef);

        if (currentNode.parent) {
            currentNode = nodes[currentNode.parent];
        } else {
            currentNode = null;
        }
    }

    path.reverse();

    // if the end polygon was not reached, return with the partial result status
    if (lastBestNode.polyRef !== endRef) {
        return {
            status: FIND_PATH_STATUS_PARTIAL_PATH,
            success: true,
            path,
            intermediates: {
                nodes,
                openList,
            },
        };
    }

    // the path is complete, return with the complete path status
    return {
        status: FIND_PATH_STATUS_COMPLETE_PATH,
        success: true,
        path,
        intermediates: {
            nodes,
            openList,
        },
    };
};

export const FIND_STRAIGHT_PATH_AREA_CROSSINGS = 1;
export const FIND_STRAIGHT_PATH_ALL_CROSSINGS = 2;

export const findStraightPath = (
    navMesh: NavMesh,
    start: Vec3,
    end: Vec3,
    pathPolyRefs: PolyRef[],
    maxStraightPathPoints = 256,
    straightPathOptions = 0,
): Vec3[] => {
    return [];
};
