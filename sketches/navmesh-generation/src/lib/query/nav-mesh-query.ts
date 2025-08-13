import type { Box3, Vec3 } from '@/common/maaths';
import { box3, vec2, vec3 } from '@/common/maaths';
import {
    type IntersectSegSeg2DResult,
    closestPtSeg2d,
    createIntersectSegSeg2DResult,
    createIntersectSegmentPoly2DResult,
    distancePtSeg2dSqr,
    getHeightAtPoint,
    intersectSegSeg2D,
    intersectSegmentPoly2D,
    pointInPoly,
    randomPointInConvexPoly,
    triArea2D,
} from '../common/geometry';
import {
    type NavMesh,
    type NavMeshLink,
    type NavMeshPoly,
    type NavMeshTile,
    type NodeRef,
    NodeType,
    OffMeshConnectionSide,
    desNodeRef,
    getNodeRefType,
    getTilesAt,
    serPolyNodeRef,
    worldToTilePosition,
} from './nav-mesh';
import {
    NODE_FLAG_CLOSED,
    NODE_FLAG_OPEN,
    type SearchNode,
    type SearchNodePool,
    type SearchNodeQueue,
    type SearchNodeRef,
    popNodeFromQueue,
    pushNodeToQueue,
    reindexNodeInQueue,
} from './search';

export type QueryFilter = {
    /**
     * Flags that nodes must include to be considered.
     */
    includeFlags: number;

    /**
     * Flags that nodes must not include to be considered.
     */
    excludeFlags: number;

    /**
     * Checks if a NavMesh node passes the filter.
     * @param ref The node reference.
     * @param navMesh The navmesh
     * @param filter The query filter.
     * @returns Whether the node reference passes the filter.
     */
    passFilter?: (nodeRef: NodeRef, navMesh: NavMesh, filter: QueryFilter) => boolean;

    /**
     * Calculates the cost of moving from one point to another.
     * @param pa The start position on the edge of the previous and current node. [(x, y, z)]
     * @param pb The end position on the edge of the current and next node. [(x, y, z)]
     * @param navMesh The navigation mesh
     * @param prevRef The reference id of the previous node. [opt]
     * @param curRef The reference id of the current node.
     * @param nextRef The reference id of the next node. [opt]
     * @returns The cost of moving from the start to the end position.
     */
    getCost?: (
        pa: Vec3,
        pb: Vec3,
        navMesh: NavMesh,
        prevRef: NodeRef | undefined,
        curRef: NodeRef,
        nextRef: NodeRef | undefined,
    ) => number;
};

export const DEFAULT_QUERY_FILTER = {
    includeFlags: 0xffffffff,
    excludeFlags: 0,
    getCost: (pa, pb, navMesh, _prevRef, _curRef, nextRef) => {
        if (nextRef && getNodeRefType(nextRef) === NodeType.OFFMESH_CONNECTION) {
            const [, offMeshConnectionId] = desNodeRef(nextRef);
            const offMeshConnection = navMesh.offMeshConnections[offMeshConnectionId];
            if (offMeshConnection.cost !== undefined) {
                return offMeshConnection.cost;
            }
        }

        return vec3.distance(pa, pb);
    },
    passFilter(nodeRef, navMesh, filter) {
        const nodeType = getNodeRefType(nodeRef);

        let flags = 0;

        if (nodeType === NodeType.GROUND_POLY) {
            const [, tileId, polyIndex] = desNodeRef(nodeRef);
            const poly = navMesh.tiles[tileId].polys[polyIndex];
            flags = poly.flags;
        } else if (nodeType === NodeType.OFFMESH_CONNECTION) {
            const [, offMeshConnectionId] = desNodeRef(nodeRef);
            const offMeshConnection = navMesh.offMeshConnections[offMeshConnectionId];
            flags = offMeshConnection.flags;
        }

        return (flags & filter.includeFlags) !== 0 && (flags & filter.excludeFlags) === 0;
    },
} satisfies QueryFilter;

export type GetNodeAreaAndFlagsResult = {
    success: boolean;
    area: number;
    flags: number;
};

export const getNodeAreaAndFlags = (nodeRef: NodeRef, navMesh: NavMesh): GetNodeAreaAndFlagsResult => {
    const result: GetNodeAreaAndFlagsResult = {
        success: false,
        flags: 0,
        area: 0,
    };

    const nodeType = getNodeRefType(nodeRef);

    if (nodeType === NodeType.GROUND_POLY) {
        const [, tileId, polyIndex] = desNodeRef(nodeRef);
        const poly = navMesh.tiles[tileId].polys[polyIndex];
        result.flags = poly.flags;
        result.area = poly.area;
        result.success = true;
    } else if (nodeType === NodeType.OFFMESH_CONNECTION) {
        const [, offMeshConnectionId] = desNodeRef(nodeRef);
        const offMeshConnection = navMesh.offMeshConnections[offMeshConnectionId];
        result.flags = offMeshConnection.flags;
        result.area = offMeshConnection.area;
        result.success = true;
    }

    return result;
};

export type GetTileAndPolyByRefResult =
    | {
          success: false;
          tile: NavMeshTile | null;
          poly: NavMeshPoly | null;
          polyIndex: number;
      }
    | {
          success: true;
          tile: NavMeshTile;
          poly: NavMeshPoly;
          polyIndex: number;
      };

/**
 * Gets the tile and polygon from a polygon reference
 * @param ref The polygon reference
 * @param navMesh The navigation mesh
 * @returns Object containing tile and poly, or null if not found
 */
export const getTileAndPolyByRef = (ref: NodeRef, navMesh: NavMesh): GetTileAndPolyByRefResult => {
    const result = {
        success: false,
        tile: null,
        poly: null,
        polyIndex: -1,
    } as GetTileAndPolyByRefResult;

    const [nodeType, tileId, nodeIndex] = desNodeRef(ref);

    if (nodeType !== NodeType.GROUND_POLY) return result;

    const tile = navMesh.tiles[tileId];

    if (!tile) {
        return result;
    }

    if (nodeIndex >= tile.polys.length) {
        return result;
    }

    result.poly = tile.polys[nodeIndex];
    result.tile = tile;
    result.polyIndex = nodeIndex;
    result.success = true;

    return result;
};

const _getPolyHeightV0 = vec3.create();
const _getPolyHeightV1 = vec3.create();
const _getPolyHeightV2 = vec3.create();

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
    // check if we have detail mesh data
    const detailMesh = tile.detailMeshes?.[polyIndex];

    if (detailMesh) {
        // use detail mesh for accurate height calculation
        for (let j = 0; j < detailMesh.trianglesCount; ++j) {
            const t = (detailMesh.trianglesBase + j) * 4;
            const detailTriangles = tile.detailTriangles;

            const v0Index = detailTriangles[t + 0];
            const v1Index = detailTriangles[t + 1];
            const v2Index = detailTriangles[t + 2];

            // get triangle vertices
            const v0 = _getPolyHeightV0;
            const v1 = _getPolyHeightV1;
            const v2 = _getPolyHeightV2;

            if (v0Index < tile.vertices.length / 3) {
                // use main tile vertices
                vec3.fromBuffer(v0, tile.vertices, v0Index * 3);
            } else {
                // use detail vertices
                const detailIndex = (v0Index - tile.vertices.length / 3) * 3;
                vec3.fromBuffer(v0, tile.detailVertices, detailIndex);
            }

            if (v1Index < tile.vertices.length / 3) {
                vec3.fromBuffer(v1, tile.vertices, v1Index * 3);
            } else {
                const detailIndex = (v1Index - tile.vertices.length / 3) * 3;
                vec3.fromBuffer(v1, tile.detailVertices, detailIndex);
            }

            if (v2Index < tile.vertices.length / 3) {
                vec3.fromBuffer(v2, tile.vertices, v2Index * 3);
            } else {
                const detailIndex = (v2Index - tile.vertices.length / 3) * 3;
                vec3.fromBuffer(v2, tile.detailVertices, detailIndex);
            }

            // check if point is inside triangle and calculate height
            const h = getHeightAtPoint(v0, v1, v2, pos);
            if (h !== null) {
                return h;
            }
        }
    }

    // fallback: use polygon vertices for height calculation
    if (poly.vertices.length >= 3) {
        const v0 = _getPolyHeightV0;
        const v1 = _getPolyHeightV1;
        const v2 = _getPolyHeightV2;

        vec3.fromBuffer(v0, tile.vertices, poly.vertices[0] * 3);
        vec3.fromBuffer(v1, tile.vertices, poly.vertices[1] * 3);
        vec3.fromBuffer(v2, tile.vertices, poly.vertices[2] * 3);

        const h = getHeightAtPoint(v0, v1, v2, pos);

        if (h !== null) {
            return h;
        }
    }

    return Number.NaN;
};

const _closestOnDetailEdges: Vec3 = [0, 0, 0];
const _closestPointOnDetailEdgesVi: Vec3 = [0, 0, 0];
const _closestPointOnDetailEdgesVk: Vec3 = [0, 0, 0];

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

            // get vertices
            const vi = _closestPointOnDetailEdgesVi;
            const vk = _closestPointOnDetailEdgesVk;

            if (viIndex < tile.vertices.length / 3) {
                vec3.fromBuffer(vi, tile.vertices, viIndex * 3);
            } else {
                const detailIndex = (viIndex - tile.vertices.length / 3) * 3;

                vec3.fromBuffer(vi, tile.detailVertices, detailIndex);
            }

            if (vkIndex < tile.vertices.length / 3) {
                vec3.fromBuffer(vk, tile.vertices, vkIndex * 3);
            } else {
                const detailIndex = (vkIndex - tile.vertices.length / 3) * 3;
                vec3.fromBuffer(vk, tile.detailVertices, detailIndex);
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

const _getClosestPointOnPolyLineStart = vec3.create();
const _getClosestPointOnPolyLineEnd = vec3.create();

// TODO: should this be renamed to closestPointOnNode and handle off-mesh connections? TBD
export const getClosestPointOnPoly = (
    result: GetClosestPointOnPolyResult,
    navMesh: NavMesh,
    ref: NodeRef,
    point: Vec3,
): GetClosestPointOnPolyResult => {
    result.success = false;
    result.isOverPoly = false;
    vec3.copy(result.closestPoint, point);

    const tileAndPoly = getTileAndPolyByRef(ref, navMesh);
    if (!tileAndPoly.success) {
        return result;
    }

    const { tile, poly, polyIndex } = tileAndPoly;

    const lineStart = _getClosestPointOnPolyLineStart;
    const lineEnd = _getClosestPointOnPolyLineEnd;

    // get polygon vertices
    const nv = poly.vertices.length;
    const verts = new Array(nv * 3);

    for (let i = 0; i < nv; ++i) {
        const vertIndex = poly.vertices[i] * 3;
        verts[i * 3] = tile.vertices[vertIndex];
        verts[i * 3 + 1] = tile.vertices[vertIndex + 1];
        verts[i * 3 + 2] = tile.vertices[vertIndex + 2];
    }

    // check if point is over polygon
    if (pointInPoly(nv, verts, point)) {
        result.isOverPoly = true;

        // find height at the position
        const height = getPolyHeight(tile, poly, polyIndex, point);
        if (!Number.isNaN(height)) {
            result.closestPoint[0] = point[0];
            result.closestPoint[1] = height;
            result.closestPoint[2] = point[2];
        } else {
            // fallback to polygon center height
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

    // point is outside polygon, find closest point on polygon boundary
    let dmin = Number.MAX_VALUE;
    let imin = -1;

    for (let i = 0; i < nv; ++i) {
        const j = (i + 1) % nv;
        lineStart[0] = verts[i * 3];
        lineStart[1] = verts[i * 3 + 1];
        lineStart[2] = verts[i * 3 + 2];

        lineEnd[0] = verts[j * 3];
        lineEnd[1] = verts[j * 3 + 1];
        lineEnd[2] = verts[j * 3 + 2];

        const d = distancePtSeg2dSqr(point, lineStart, lineEnd);
        if (d < dmin) {
            dmin = d;
            imin = i;
        }
    }

    if (imin >= 0) {
        const j = (imin + 1) % nv;

        lineStart[0] = verts[imin * 3];
        lineStart[1] = verts[imin * 3 + 1];
        lineStart[2] = verts[imin * 3 + 2];

        lineEnd[0] = verts[j * 3];
        lineEnd[1] = verts[j * 3 + 1];
        lineEnd[2] = verts[j * 3 + 2];

        closestPtSeg2d(result.closestPoint, point, lineStart, lineEnd);

        // try to get more accurate height from detail mesh if available
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

const _closestPointOnPolyBoundaryLineStart = vec3.create();
const _closestPointOnPolyBoundaryLineEnd = vec3.create();

export const getClosestPointOnPolyBoundary = (
    navMesh: NavMesh,
    polyRef: NodeRef,
    point: Vec3,
    outClosestPoint: Vec3,
): boolean => {
    const tileAndPoly = getTileAndPolyByRef(polyRef, navMesh);

    if (!tileAndPoly.success || !vec3.finite(point) || !outClosestPoint) {
        return false;
    }

    const { tile, poly } = tileAndPoly;

    const lineStart = _closestPointOnPolyBoundaryLineStart;
    const lineEnd = _closestPointOnPolyBoundaryLineEnd;

    // collect vertices
    const nv = poly.vertices.length;
    const verts = new Array<number>(nv * 3);
    for (let i = 0; i < nv; ++i) {
        const vIndex = poly.vertices[i] * 3;
        verts[i * 3 + 0] = tile.vertices[vIndex + 0];
        verts[i * 3 + 1] = tile.vertices[vIndex + 1];
        verts[i * 3 + 2] = tile.vertices[vIndex + 2];
    }

    // if inside polygon, return the point as-is
    if (pointInPoly(nv, verts, point)) {
        vec3.copy(outClosestPoint, point);
        return true;
    }

    // otherwise clamp to nearest edge
    let dmin = Number.MAX_VALUE;
    let imin = 0;
    for (let i = 0; i < nv; ++i) {
        const j = (i + 1) % nv;
        const vaIndex = i * 3;
        const vbIndex = j * 3;
        lineStart[0] = verts[vaIndex + 0];
        lineStart[1] = verts[vaIndex + 1];
        lineStart[2] = verts[vaIndex + 2];
        lineEnd[0] = verts[vbIndex + 0];
        lineEnd[1] = verts[vbIndex + 1];
        lineEnd[2] = verts[vbIndex + 2];
        const d = distancePtSeg2dSqr(point, lineStart, lineEnd);
        if (d < dmin) {
            dmin = d;
            imin = i;
        }
    }

    const j = (imin + 1) % nv;
    const vaIndex = imin * 3;
    const vbIndex = j * 3;
    const va0 = verts[vaIndex + 0];
    const va1 = verts[vaIndex + 1];
    const va2 = verts[vaIndex + 2];
    const vb0 = verts[vbIndex + 0];
    const vb1 = verts[vbIndex + 1];
    const vb2 = verts[vbIndex + 2];

    // compute t on segment (xz plane)
    const pqx = vb0 - va0;
    const pqz = vb2 - va2;
    const dx = point[0] - va0;
    const dz = point[2] - va2;
    const denom = pqx * pqx + pqz * pqz;
    let t = denom > 0 ? (pqx * dx + pqz * dz) / denom : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    outClosestPoint[0] = va0 + (vb0 - va0) * t;
    outClosestPoint[1] = va1 + (vb1 - va1) * t;
    outClosestPoint[2] = va2 + (vb2 - va2) * t;

    return true;
};

export type FindNearestPolyResult = {
    success: boolean;
    nearestPolyRef: NodeRef;
    nearestPoint: Vec3;
};

export const createFindNearestPolyResult = (): FindNearestPolyResult => {
    return {
        success: false,
        nearestPolyRef: '' as NodeRef,
        nearestPoint: [0, 0, 0],
    };
};

const _findNearestPolyClosestPointResult = createGetClosestPointOnPolyResult();

export const findNearestPoly = (
    result: FindNearestPolyResult,
    navMesh: NavMesh,
    center: Vec3,
    halfExtents: Vec3,
    queryFilter: QueryFilter,
): FindNearestPolyResult => {
    result.success = false;
    result.nearestPolyRef = '' as NodeRef;
    vec3.copy(result.nearestPoint, center);

    // query polygons in the area
    const polys = queryPolygons(navMesh, center, halfExtents, queryFilter);

    let nearestDistSqr = Number.MAX_VALUE;

    // find the closest polygon
    for (const polyRef of polys) {
        const closestPoint = getClosestPointOnPoly(_findNearestPolyClosestPointResult, navMesh, polyRef, center);

        if (closestPoint.success) {
            const distSqr = vec3.squaredDistance(center, closestPoint.closestPoint);

            if (distSqr < nearestDistSqr) {
                nearestDistSqr = distSqr;
                result.nearestPolyRef = polyRef;
                vec3.copy(result.nearestPoint, closestPoint.closestPoint);
                result.success = true;
            }
        }
    }

    return result;
};

const _queryPolygonsInTileBmax = vec3.create();
const _queryPolygonsInTileBmin = vec3.create();
const _queryPolygonsInTileVertex = vec3.create();

export const queryPolygonsInTile = (
    out: NodeRef[],
    navMesh: NavMesh,
    tile: NavMeshTile,
    bounds: Box3,
    filter: QueryFilter,
): void => {
    if (tile.bvTree) {
        const qmin = bounds[0];
        const qmax = bounds[1];

        let nodeIndex = 0;
        const endIndex = tile.bvTree.nodes.length;
        const tbmin = tile.bounds[0];
        const tbmax = tile.bounds[1];
        const qfac = tile.bvTree.quantFactor;

        // clamp query box to world box.
        const minx = Math.max(Math.min(qmin[0], tbmax[0]), tbmin[0]) - tbmin[0];
        const miny = Math.max(Math.min(qmin[1], tbmax[1]), tbmin[1]) - tbmin[1];
        const minz = Math.max(Math.min(qmin[2], tbmax[2]), tbmin[2]) - tbmin[2];
        const maxx = Math.max(Math.min(qmax[0], tbmax[0]), tbmin[0]) - tbmin[0];
        const maxy = Math.max(Math.min(qmax[1], tbmax[1]), tbmin[1]) - tbmin[1];
        const maxz = Math.max(Math.min(qmax[2], tbmax[2]), tbmin[2]) - tbmin[2];

        // quantize
        _queryPolygonsInTileBmin[0] = Math.floor(qfac * minx) & 0xfffe;
        _queryPolygonsInTileBmin[1] = Math.floor(qfac * miny) & 0xfffe;
        _queryPolygonsInTileBmin[2] = Math.floor(qfac * minz) & 0xfffe;
        _queryPolygonsInTileBmax[0] = Math.floor(qfac * maxx + 1) | 1;
        _queryPolygonsInTileBmax[1] = Math.floor(qfac * maxy + 1) | 1;
        _queryPolygonsInTileBmax[2] = Math.floor(qfac * maxz + 1) | 1;

        // traverse tree
        while (nodeIndex < endIndex) {
            const node = tile.bvTree.nodes[nodeIndex];

            const nodeBounds = node.bounds;
            const overlap =
                _queryPolygonsInTileBmin[0] <= nodeBounds[1][0] &&
                _queryPolygonsInTileBmax[0] >= nodeBounds[0][0] &&
                _queryPolygonsInTileBmin[1] <= nodeBounds[1][1] &&
                _queryPolygonsInTileBmax[1] >= nodeBounds[0][1] &&
                _queryPolygonsInTileBmin[2] <= nodeBounds[1][2] &&
                _queryPolygonsInTileBmax[2] >= nodeBounds[0][2];

            const isLeafNode = node.i >= 0;

            if (isLeafNode && overlap) {
                const polyId = node.i;
                const poly = tile.polys[polyId];
                const ref: NodeRef = serPolyNodeRef(tile.id, polyId);

                if ((poly.flags & filter.includeFlags) !== 0 && (poly.flags & filter.excludeFlags) === 0) {
                    if (!filter.passFilter || filter.passFilter(ref, navMesh, filter)) {
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

        for (let polyIndex = 0; polyIndex < tile.polys.length; polyIndex++) {
            const poly = tile.polys[polyIndex];
            const polyRef = serPolyNodeRef(tile.id, polyIndex);

            // must pass filter
            if ((poly.flags & filter.includeFlags) === 0 || (poly.flags & filter.excludeFlags) !== 0) {
                continue;
            }

            if (filter.passFilter && !filter.passFilter(polyRef, navMesh, filter)) {
                continue;
            }

            // calc polygon bounds
            const firstVertexIndex = poly.vertices[0];
            vec3.set(
                _queryPolygonsInTileVertex,
                tile.vertices[firstVertexIndex * 3],
                tile.vertices[firstVertexIndex * 3 + 1],
                tile.vertices[firstVertexIndex * 3 + 2],
            );
            vec3.copy(_queryPolygonsInTileBmax, _queryPolygonsInTileVertex);
            vec3.copy(_queryPolygonsInTileBmin, _queryPolygonsInTileVertex);

            for (let j = 1; j < poly.vertices.length; j++) {
                const vertexIndex = poly.vertices[j];
                vec3.set(
                    _queryPolygonsInTileVertex,
                    tile.vertices[vertexIndex * 3],
                    tile.vertices[vertexIndex * 3 + 1],
                    tile.vertices[vertexIndex * 3 + 2],
                );
                vec3.min(_queryPolygonsInTileBmax, _queryPolygonsInTileBmax, _queryPolygonsInTileVertex);
                vec3.max(_queryPolygonsInTileBmin, _queryPolygonsInTileBmin, _queryPolygonsInTileVertex);
            }

            // check overlap with query bounds
            if (
                qmin[0] <= _queryPolygonsInTileBmin[0] &&
                qmax[0] >= _queryPolygonsInTileBmax[0] &&
                qmin[1] <= _queryPolygonsInTileBmin[1] &&
                qmax[1] >= _queryPolygonsInTileBmax[1] &&
                qmin[2] <= _queryPolygonsInTileBmin[2] &&
                qmax[2] >= _queryPolygonsInTileBmax[2]
            ) {
                out.push(polyRef);
            }
        }
    }
};

const _queryPolygonsBounds = box3.create();
const _queryPolygonsMinTile = vec2.create();
const _queryPolygonsMaxTile = vec2.create();

export const queryPolygons = (navMesh: NavMesh, center: Vec3, halfExtents: Vec3, filter: QueryFilter): NodeRef[] => {
    const result: NodeRef[] = [];

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
                queryPolygonsInTile(result, navMesh, tile, bounds, filter);
            }
        }
    }

    return result;
};

const _getPortalPointsStart = vec3.create();
const _getPortalPointsEnd = vec3.create();

const getPortalPoints = (navMesh: NavMesh, fromNodeRef: NodeRef, toNodeRef: NodeRef, outLeft: Vec3, outRight: Vec3): boolean => {
    // find the link that points to the 'to' polygon.
    let toLink: NavMeshLink | undefined = undefined;

    const fromPolyLinks = navMesh.nodes[fromNodeRef];

    for (const linkIndex of fromPolyLinks) {
        const link = navMesh.links[linkIndex];
        if (link?.neighbourRef === toNodeRef) {
            // found the link to the target polygon.
            toLink = link;
            break;
        }
    }

    if (!toLink) {
        // no link found to the target polygon.
        return false;
    }

    const fromNodeType = getNodeRefType(fromNodeRef);
    const toNodeType = getNodeRefType(toNodeRef);

    // assume either:
    // - poly to poly
    // - offmesh to poly
    // - poly to offmesh
    // offmesh to offmesh is not supported

    // handle from offmesh connection to poly
    if (fromNodeType === NodeType.OFFMESH_CONNECTION) {
        const [, offMeshConnectionId, offMeshConnectionSide] = desNodeRef(fromNodeRef);
        const offMeshConnection = navMesh.offMeshConnections[offMeshConnectionId];
        if (!offMeshConnection) return false;

        const position = offMeshConnectionSide === OffMeshConnectionSide.START ? offMeshConnection.start : offMeshConnection.end;

        vec3.copy(outLeft, position);
        vec3.copy(outRight, position);
        return true;
    }

    // handle from poly to offmesh connection
    if (toNodeType === NodeType.OFFMESH_CONNECTION) {
        const [, offMeshConnectionId, offMeshConnectionSide] = desNodeRef(toNodeRef);
        const offMeshConnection = navMesh.offMeshConnections[offMeshConnectionId];
        if (!offMeshConnection) return false;

        const position = offMeshConnectionSide === OffMeshConnectionSide.START ? offMeshConnection.start : offMeshConnection.end;

        vec3.copy(outLeft, position);
        vec3.copy(outRight, position);
        return true;
    }

    // handle from poly to poly

    // get the 'from' and 'to' tiles
    const [, fromTileId, fromPolyIndex] = desNodeRef(fromNodeRef);
    const fromTile = navMesh.tiles[fromTileId];
    const fromPoly = fromTile.polys[fromPolyIndex];

    // find portal vertices
    const v0Index = fromPoly.vertices[toLink.edge];
    const v1Index = fromPoly.vertices[(toLink.edge + 1) % fromPoly.vertices.length];

    vec3.fromBuffer(outLeft, fromTile.vertices, v0Index * 3);
    vec3.fromBuffer(outRight, fromTile.vertices, v1Index * 3);

    // if the link is at tile boundary, clamp the vertices to the link width.
    if (toLink.side !== 0xff) {
        // unpack portal limits.
        if (toLink.bmin !== 0 || toLink.bmax !== 255) {
            const s = 1.0 / 255.0;
            const tmin = toLink.bmin * s;
            const tmax = toLink.bmax * s;

            vec3.fromBuffer(_getPortalPointsStart, fromTile.vertices, v0Index * 3);
            vec3.fromBuffer(_getPortalPointsEnd, fromTile.vertices, v1Index * 3);
            vec3.lerp(outLeft, _getPortalPointsStart, _getPortalPointsEnd, tmin);
            vec3.lerp(outRight, _getPortalPointsStart, _getPortalPointsEnd, tmax);
        }
    }

    return true;
};

const _edgeMidPointPortalLeft = vec3.create();
const _edgeMidPointPortalRight = vec3.create();

const getEdgeMidPoint = (navMesh: NavMesh, fromNodeRef: NodeRef, toNodeRef: NodeRef, outMidPoint: Vec3): boolean => {
    if (!getPortalPoints(navMesh, fromNodeRef, toNodeRef, _edgeMidPointPortalLeft, _edgeMidPointPortalRight)) {
        return false;
    }

    outMidPoint[0] = (_edgeMidPointPortalLeft[0] + _edgeMidPointPortalRight[0]) * 0.5;
    outMidPoint[1] = (_edgeMidPointPortalLeft[1] + _edgeMidPointPortalRight[1]) * 0.5;
    outMidPoint[2] = (_edgeMidPointPortalLeft[2] + _edgeMidPointPortalRight[2]) * 0.5;

    return true;
};

const isValidNodeRef = (navMesh: NavMesh, nodeRef: NodeRef): boolean => {
    const nodeType = getNodeRefType(nodeRef);

    if (nodeType === NodeType.GROUND_POLY) {
        const [, tileId, polyIndex] = desNodeRef(nodeRef);

        const tile = navMesh.tiles[tileId];

        if (!tile) {
            return false;
        }

        if (polyIndex < 0 || polyIndex >= tile.polys.length) {
            return false;
        }

        const poly = tile.polys[polyIndex];

        if (!poly) {
            return false;
        }

        return true;
    }

    if (nodeType === NodeType.OFFMESH_CONNECTION) {
        const [, offMeshConnectionId] = desNodeRef(nodeRef);
        const offMeshConnection = navMesh.offMeshConnections[offMeshConnectionId];
        // TODO: check if off mesh connection is connected?
        return !!offMeshConnection;
    }

    return false;
};

export enum FindNodePathStatus {
    INVALID_INPUT = 0,
    PARTIAL_PATH = 1,
    COMPLETE_PATH = 2,
}

export type FindNodePathResult = {
    /** whether the search completed successfully, with either a partial or complete path */
    success: boolean;

    /** the result status for the operation */
    status: FindNodePathStatus;

    /** the path, consisting of polygon node and offmesh link node references */
    path: NodeRef[];

    /** intermediate data used for the search, typically only needed for debugging */
    intermediates?: {
        nodes: SearchNodePool;
        openList: SearchNodeQueue;
    };
};

const HEURISTIC_SCALE = 0.999; // Search heuristic scale

/**
 * Find a path between two nodes.
 *
 * If the end node cannot be reached through the navigation graph,
 * the last node in the path will be the nearest the end node.
 *
 * If the path array is to small to hold the full result, it will be filled as
 * far as possible from the start node toward the end node.
 *
 * The start and end positions are used to calculate traversal costs.
 * (The y-values impact the result.)
 *
 * @param startRef The reference ID of the starting node.
 * @param endRef The reference ID of the ending node.
 * @param startPos The starting position in world space.
 * @param endPos The ending position in world space.
 * @param filter The query filter.
 * @returns The result of the pathfinding operation.
 */
export const findNodePath = (
    navMesh: NavMesh,
    startRef: NodeRef,
    endRef: NodeRef,
    startPos: Vec3,
    endPos: Vec3,
    filter: QueryFilter,
): FindNodePathResult => {
    // validate input
    if (
        !isValidNodeRef(navMesh, startRef) ||
        !isValidNodeRef(navMesh, endRef) ||
        !vec3.finite(startPos) ||
        !vec3.finite(endPos)
    ) {
        return {
            status: FindNodePathStatus.INVALID_INPUT,
            success: false,
            path: [],
        };
    }

    // early exit if start and end are the same
    if (startRef === endRef) {
        return {
            status: FindNodePathStatus.COMPLETE_PATH,
            success: true,
            path: [startRef],
        };
    }

    // prepare search
    const getCost = filter.getCost ?? DEFAULT_QUERY_FILTER.getCost;

    const nodes: SearchNodePool = {};
    const openList: SearchNodeQueue = [];

    const startNode: SearchNode = {
        cost: 0,
        total: vec3.distance(startPos, endPos) * HEURISTIC_SCALE,
        parent: null,
        nodeRef: startRef,
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
        const currentNodeRef = currentNode.nodeRef;
        if (currentNodeRef === endRef) {
            lastBestNode = currentNode;
            break;
        }

        // get current node
        const currentNodeLinks = navMesh.nodes[currentNodeRef];

        // get parent node ref
        let parentNodeRef: NodeRef | undefined = undefined;
        if (currentNode.parent) {
            const [nodeRef, _state] = currentNode.parent.split(':');
            parentNodeRef = nodeRef as NodeRef;
        }

        // expand the search with node links
        for (const linkIndex of currentNodeLinks) {
            const link = navMesh.links[linkIndex];
            const neighbourNodeRef = link.neighbourRef;

            // skip invalid ids and do not expand back to where we came from
            if (!neighbourNodeRef || neighbourNodeRef === parentNodeRef) {
                continue;
            }

            // check whether neighbour passes the filter
            if (filter.passFilter && filter.passFilter(neighbourNodeRef, navMesh, filter) === false) {
                continue;
            }

            // deal explicitly with crossing tile boundaries by partitioning the search node refs by crossing side
            let crossSide = 0;
            if (link.side !== 0xff) {
                crossSide = link.side >> 1;
            }

            // get the neighbour node
            const neighbourSearchNodeRef: SearchNodeRef = `${neighbourNodeRef}:${crossSide}`;
            let neighbourNode = nodes[neighbourSearchNodeRef];
            if (!neighbourNode) {
                neighbourNode = {
                    cost: 0,
                    total: 0,
                    parent: null,
                    nodeRef: neighbourNodeRef,
                    state: crossSide,
                    flags: 0,
                    position: structuredClone(endPos),
                };
                nodes[neighbourSearchNodeRef] = neighbourNode;
            }

            // if this node is being visited for the first time, calculate the node position
            if (neighbourNode.flags === 0) {
                getEdgeMidPoint(navMesh, currentNodeRef, neighbourNodeRef, neighbourNode.position);
            }

            // calculate cost and heuristic
            let cost = 0;
            let heuristic = 0;

            // special case for last node
            if (neighbourNodeRef === endRef) {
                const curCost = getCost(
                    currentNode.position,
                    neighbourNode.position,
                    navMesh,
                    neighbourNodeRef,
                    currentNodeRef,
                    undefined,
                );

                const endCost = getCost(neighbourNode.position, endPos, navMesh, neighbourNodeRef, currentNodeRef, undefined);

                cost = currentNode.cost + curCost + endCost;
                heuristic = 0;
            } else {
                const curCost = getCost(
                    currentNode.position,
                    neighbourNode.position,
                    navMesh,
                    parentNodeRef,
                    currentNodeRef,
                    neighbourNodeRef,
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
            neighbourNode.parent = `${currentNode.nodeRef}:${currentNode.state}`;
            neighbourNode.nodeRef = neighbourNodeRef;
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

    // assemble the path to the node
    const path: NodeRef[] = [];
    let currentNode: SearchNode | null = lastBestNode;

    while (currentNode) {
        path.push(currentNode.nodeRef);

        if (currentNode.parent) {
            currentNode = nodes[currentNode.parent];
        } else {
            currentNode = null;
        }
    }

    path.reverse();

    // if the end node was not reached, return with the partial result status
    if (lastBestNode.nodeRef !== endRef) {
        return {
            status: FindNodePathStatus.PARTIAL_PATH,
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
        status: FindNodePathStatus.COMPLETE_PATH,
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

export type StraightPathPoint = {
    position: Vec3;
    type: NodeType;
    nodeRef: NodeRef | null;
};

const appendVertex = (pt: Vec3, ref: NodeRef | null, outPoints: StraightPathPoint[], nodeType: NodeType): void => {
    // dedupe last
    if (outPoints.length > 0 && vec3.equals(outPoints[outPoints.length - 1].position, pt)) {
        return;
    }
    outPoints.push({ position: [pt[0], pt[1], pt[2]], type: nodeType, nodeRef: ref });
};

const _intersectSegSeg2DResult: IntersectSegSeg2DResult = createIntersectSegSeg2DResult();

const _appendPortalsPoint = vec3.create();
const _appendPortalsLeft = vec3.create();
const _appendPortalsRight = vec3.create();

const appendPortals = (
    navMesh: NavMesh,
    startIdx: number,
    endIdx: number,
    endPos: Vec3,
    path: NodeRef[],
    outPoints: StraightPathPoint[],
    options: number,
): void => {
    const startPos = outPoints[outPoints.length - 1].position;

    for (let i = startIdx; i < endIdx; i++) {
        const from = path[i];
        const to = path[i + 1];

        // skip intersection if only area crossings requested and areas equal.
        if (options & FIND_STRAIGHT_PATH_AREA_CROSSINGS) {
            const a = getNodeAreaAndFlags(from, navMesh);
            const b = getNodeAreaAndFlags(to, navMesh);

            if (a.success && b.success) {
                if (a.area === b.area) continue;
            }
        }

        if (!getPortalPoints(navMesh, from, to, _appendPortalsLeft, _appendPortalsRight)) break;

        intersectSegSeg2D(_intersectSegSeg2DResult, startPos, endPos, _appendPortalsLeft, _appendPortalsRight);

        if (_intersectSegSeg2DResult.hit) {
            vec3.lerp(_appendPortalsPoint, _appendPortalsLeft, _appendPortalsRight, _intersectSegSeg2DResult.t);
            const toType = getNodeRefType(to);
            appendVertex(_appendPortalsPoint, to, outPoints, toType);
        }
    }
};

export type FindStraightPathResult = {
    success: boolean;
    path: StraightPathPoint[];
};

const _findStraightPathLeftPortalPoint = vec3.create();
const _findStraightPathRightPortalPoint = vec3.create();

/**
 * This method peforms what is often called 'string pulling'.
 *
 * The start position is clamped to the first polygon node in the path, and the
 * end position is clamped to the last. So the start and end positions should
 * normally be within or very near the first and last polygons respectively.
 *
 * @param navMesh The navigation mesh to use for the search.
 * @param start The start position in world space.
 * @param end The end position in world space.
 * @param pathNodeRefs The list of polygon node references that form the path, generally obtained from `findNodePath`
 * @param straightPathOptions
 * @returns The straight path
 */
export const findStraightPath = (
    navMesh: NavMesh,
    start: Vec3,
    end: Vec3,
    pathNodeRefs: NodeRef[],
    straightPathOptions = 0,
): FindStraightPathResult => {
    const path: StraightPathPoint[] = [];
    if (!vec3.finite(start) || !vec3.finite(end) || pathNodeRefs.length === 0) {
        return { success: false, path };
    }

    // clamp start & end to poly boundaries
    const closestStartPos = vec3.create();
    if (!getClosestPointOnPolyBoundary(navMesh, pathNodeRefs[0], start, closestStartPos)) return { success: false, path };

    const closestEndPos = vec3.create();
    if (!getClosestPointOnPolyBoundary(navMesh, pathNodeRefs[pathNodeRefs.length - 1], end, closestEndPos))
        return { success: false, path };

    // add start point
    appendVertex(closestStartPos, pathNodeRefs[0], path, getNodeRefType(pathNodeRefs[0]));

    const portalApex = vec3.create();
    const portalLeft = vec3.create();
    const portalRight = vec3.create();

    const pathSize = pathNodeRefs.length;

    if (pathSize > 1) {
        vec3.copy(portalApex, closestStartPos);
        vec3.copy(portalLeft, portalApex);
        vec3.copy(portalRight, portalApex);

        let apexIndex = 0;
        let leftIndex = 0;
        let rightIndex = 0;

        let leftPolyRef: NodeRef | null = pathNodeRefs[0];
        let rightPolyRef: NodeRef | null = pathNodeRefs[0];
        let leftPolyType: NodeType = NodeType.GROUND_POLY;
        let rightPolyType: NodeType = NodeType.GROUND_POLY;

        for (let i = 0; i < pathSize; ++i) {
            let toType: NodeType = NodeType.GROUND_POLY;

            const left = _findStraightPathLeftPortalPoint;
            const right = _findStraightPathRightPortalPoint;

            if (i + 1 < pathSize) {
                const toRef = pathNodeRefs[i + 1];
                toType = getNodeRefType(toRef);

                // next portal
                if (!getPortalPoints(navMesh, pathNodeRefs[i], toRef, left, right)) {
                    // failed to get portal points, clamp end to current poly and return partial
                    const endClamp = vec3.create();

                    // this should only happen when the first polygon is invalid.
                    if (!getClosestPointOnPolyBoundary(navMesh, pathNodeRefs[i], end, endClamp)) return { success: false, path };

                    // append portals along the current straight path segment.
                    if (straightPathOptions & (FIND_STRAIGHT_PATH_AREA_CROSSINGS | FIND_STRAIGHT_PATH_ALL_CROSSINGS)) {
                        appendPortals(navMesh, apexIndex, i, endClamp, pathNodeRefs, path, straightPathOptions);
                    }

                    appendVertex(endClamp, pathNodeRefs[i], path, getNodeRefType(pathNodeRefs[i]));

                    return { success: true, path };
                }

                if (i === 0) {
                    // if starting really close to the portal, advance
                    const d2 = distancePtSeg2dSqr(portalApex, left, right);
                    if (d2 < 1e-6) continue;
                }
            } else {
                // end of path
                vec3.copy(left, closestEndPos);
                vec3.copy(right, closestEndPos);
                toType = NodeType.GROUND_POLY;
            }

            // right vertex
            if (triArea2D(portalApex, portalRight, right) <= 0.0) {
                if (vec3.equals(portalApex, portalRight) || triArea2D(portalApex, portalLeft, right) > 0.0) {
                    vec3.copy(portalRight, right);
                    rightPolyRef = i + 1 < pathSize ? pathNodeRefs[i + 1] : null;
                    rightPolyType = toType;
                    rightIndex = i;
                } else {
                    // append portals along current straight segment
                    if (straightPathOptions & (FIND_STRAIGHT_PATH_AREA_CROSSINGS | FIND_STRAIGHT_PATH_ALL_CROSSINGS)) {
                        appendPortals(navMesh, apexIndex, leftIndex, portalLeft, pathNodeRefs, path, straightPathOptions);
                    }

                    vec3.copy(portalApex, portalLeft);
                    apexIndex = leftIndex;

                    // add/update vertex
                    appendVertex(portalApex, leftPolyRef, path, leftPolyRef ? leftPolyType : NodeType.GROUND_POLY);

                    vec3.copy(portalLeft, portalApex);
                    vec3.copy(portalRight, portalApex);
                    leftIndex = apexIndex;
                    rightIndex = apexIndex;

                    // restart
                    i = apexIndex;

                    continue;
                }
            }

            // left vertex
            if (triArea2D(portalApex, portalLeft, _findStraightPathLeftPortalPoint) >= 0.0) {
                if (
                    vec3.equals(portalApex, portalLeft) ||
                    triArea2D(portalApex, portalRight, _findStraightPathLeftPortalPoint) < 0.0
                ) {
                    vec3.copy(portalLeft, _findStraightPathLeftPortalPoint);
                    leftPolyRef = i + 1 < pathSize ? pathNodeRefs[i + 1] : null;
                    leftPolyType = toType;
                    leftIndex = i;
                } else {
                    // append portals along current straight segment
                    if (straightPathOptions & (FIND_STRAIGHT_PATH_AREA_CROSSINGS | FIND_STRAIGHT_PATH_ALL_CROSSINGS)) {
                        appendPortals(navMesh, apexIndex, rightIndex, portalRight, pathNodeRefs, path, straightPathOptions);
                    }

                    vec3.copy(portalApex, portalRight);
                    apexIndex = rightIndex;

                    // add/update vertex
                    appendVertex(portalApex, rightPolyRef, path, rightPolyRef ? rightPolyType : NodeType.GROUND_POLY);

                    vec3.copy(portalLeft, portalApex);
                    vec3.copy(portalRight, portalApex);
                    leftIndex = apexIndex;
                    rightIndex = apexIndex;

                    // restart
                    i = apexIndex;

                    // biome-ignore lint/correctness/noUnnecessaryContinue: defensive against later code changes
                    continue;
                }
            }
        }

        // append portals along the current straight path segment
        if (straightPathOptions & (FIND_STRAIGHT_PATH_AREA_CROSSINGS | FIND_STRAIGHT_PATH_ALL_CROSSINGS)) {
            appendPortals(navMesh, apexIndex, pathSize - 1, closestEndPos, pathNodeRefs, path, straightPathOptions);
        }
    }

    // append end point
    // attach the last poly ref if available for the end point for easier identification
    const endRef = pathNodeRefs.length > 0 ? pathNodeRefs[pathNodeRefs.length - 1] : null;
    appendVertex(closestEndPos, endRef, path, NodeType.GROUND_POLY);

    return { success: true, path };
};

export type MoveAlongSurfaceResult = {
    success: boolean;
    resultPosition: Vec3;
    visited: NodeRef[];
};

/**
 * Moves from start position towards end position along the navigation mesh surface.
 *
 * This method is optimized for small delta movement and a small number of
 * polygons. If used for too great a distance, the result set will form an
 * incomplete path.
 *
 * The resultPosition will equal the endPosition if the end is reached.
 * Otherwise the closest reachable position will be returned.
 *
 * The resultPosition is not projected onto the surface of the navigation
 * mesh. Use getPolyHeight if this is needed.
 *
 * This method treats the end position in the same manner as
 * the raycast method. (As a 2D point.)
 *
 * @param result The result object to populate
 * @param navMesh The navigation mesh
 * @param startRef The reference ID of the starting polygon
 * @param startPosition The starting position [(x, y, z)]
 * @param endPosition The ending position [(x, y, z)]
 * @param filter The query filter.
 * @returns Result containing status, final position, and visited polygons
 */
export const moveAlongSurface = (
    navMesh: NavMesh,
    startRef: NodeRef,
    startPosition: Vec3,
    endPosition: Vec3,
    filter: QueryFilter,
): MoveAlongSurfaceResult => {
    const result: MoveAlongSurfaceResult = {
        success: false,
        resultPosition: vec3.create(),
        visited: [],
    };

    if (!isValidNodeRef(navMesh, startRef) || !vec3.finite(startPosition) || !vec3.finite(endPosition) || !filter) {
        return result;
    }

    result.success = true;

    const nodes: SearchNodePool = {};
    const visited: NodeRef[] = [];

    const startNode: SearchNode = {
        cost: 0,
        total: 0,
        parent: null,
        nodeRef: startRef,
        state: 0,
        flags: NODE_FLAG_CLOSED,
        position: structuredClone(startPosition),
    };
    nodes[`${startRef}:0`] = startNode;

    const bestPos = vec3.clone(startPosition);
    let bestDist = Number.MAX_VALUE;
    let bestNode: SearchNode | null = startNode;

    // search constraints
    const searchPos = vec3.create();
    vec3.lerp(searchPos, startPosition, endPosition, 0.5);
    const searchRadSqr = (vec3.distance(startPosition, endPosition) / 2.0 + 0.001) ** 2;

    // breadth-first search queue (no priority needed for this algorithm)
    const queue: SearchNodeQueue = [startNode];

    while (queue.length > 0) {
        // pop front (breadth-first)
        const curNode = queue.shift()!;

        // get poly and tile
        const curRef = curNode.nodeRef;
        const tileAndPoly = getTileAndPolyByRef(curRef, navMesh);

        if (!tileAndPoly.success) continue;

        const { tile, poly } = tileAndPoly;

        // collect vertices
        const nverts = poly.vertices.length;
        const verts: number[] = [];
        for (let i = 0; i < nverts; ++i) {
            const vertIndex = poly.vertices[i] * 3;
            verts.push(tile.vertices[vertIndex]);
            verts.push(tile.vertices[vertIndex + 1]);
            verts.push(tile.vertices[vertIndex + 2]);
        }

        // if target is inside the poly, stop search
        if (pointInPoly(nverts, verts, endPosition)) {
            bestNode = curNode;
            vec3.copy(bestPos, endPosition);
            break;
        }

        // find wall edges and find nearest point inside the walls
        for (let i = 0, j = nverts - 1; i < nverts; j = i++) {
            // find links to neighbours
            const neis: NodeRef[] = [];

            // expand search with neighbours
            const linkIndices = navMesh.nodes[curRef] || [];

            for (const linkIndex of linkIndices) {
                const link = navMesh.links[linkIndex];
                if (!link) continue;

                const neighbourRef = link.neighbourRef;
                if (!neighbourRef) continue;

                // check if this link corresponds to edge j
                if (link.edge === j) {
                    // check filter
                    if (filter.passFilter && !filter.passFilter(neighbourRef, navMesh, filter)) {
                        continue;
                    }

                    neis.push(neighbourRef);
                }
            }

            if (neis.length === 0) {
                // wall edge, calc distance
                const vj = [verts[j * 3], verts[j * 3 + 1], verts[j * 3 + 2]] as Vec3;
                const vi = [verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]] as Vec3;
                const distSqr = distancePtSeg2dSqr(endPosition, vj, vi);
                if (distSqr < bestDist) {
                    // update nearest distance
                    closestPtSeg2d(bestPos, endPosition, vj, vi);
                    bestDist = distSqr;
                    bestNode = curNode;
                }
            } else {
                for (const neighbourRef of neis) {
                    // handle tile boundary crossings like findNodePath
                    let crossSide = 0;
                    const linkIndex = linkIndices.find((idx) => navMesh.links[idx]?.neighbourRef === neighbourRef);
                    if (linkIndex !== undefined) {
                        const link = navMesh.links[linkIndex];
                        if (link.side !== 0xff) {
                            crossSide = link.side >> 1;
                        }
                    }

                    const neighbourSearchNodeRef: SearchNodeRef = `${neighbourRef}:${crossSide}`;
                    let neighbourNode = nodes[neighbourSearchNodeRef];

                    if (!neighbourNode) {
                        neighbourNode = {
                            cost: 0,
                            total: 0,
                            parent: null,
                            nodeRef: neighbourRef,
                            state: crossSide,
                            flags: 0,
                            position: structuredClone(endPosition),
                        };
                        nodes[neighbourSearchNodeRef] = neighbourNode;
                    }

                    // skip if already visited
                    if (neighbourNode.flags & NODE_FLAG_CLOSED) continue;

                    // skip the link if it is too far from search constraint
                    const vj = [verts[j * 3], verts[j * 3 + 1], verts[j * 3 + 2]] as Vec3;
                    const vi = [verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]] as Vec3;
                    const distSqr = distancePtSeg2dSqr(searchPos, vj, vi);
                    if (distSqr > searchRadSqr) continue;

                    // calculate node position if first visit
                    if (neighbourNode.flags === 0) {
                        getEdgeMidPoint(navMesh, curRef, neighbourRef, neighbourNode.position);
                    }

                    // mark as visited and add to queue
                    neighbourNode.parent = `${curNode.nodeRef}:${curNode.state}`;
                    neighbourNode.flags = NODE_FLAG_CLOSED;
                    queue.push(neighbourNode);
                }
            }
        }
    }

    if (bestNode) {
        let currentNode: SearchNode | null = bestNode;
        while (currentNode) {
            visited.push(currentNode.nodeRef);

            if (currentNode.parent) {
                currentNode = nodes[currentNode.parent];
            } else {
                currentNode = null;
            }
        }

        visited.reverse();
    }

    vec3.copy(result.resultPosition, bestPos);
    result.visited = visited;

    return result;
};

export type RaycastResult = {
    /** The hit parameter along the segment. A value of Number.MAX_VALUE indicates no wall hit. */
    t: number;
    /** Normal vector of the hit wall. */
    hitNormal: Vec3;
    /** Index of the edge hit. */
    hitEdgeIndex: number;
    /** Visited polygon references. */
    path: NodeRef[];
};

/**
 * Casts a 'walkability' ray along the surface of the navigation mesh from
 * the start position toward the end position.
 *
 * This method is meant to be used for quick, short distance checks.
 * The raycast ignores the y-value of the end position (2D check).
 *
 * @param navMesh The navigation mesh to use for the raycast.
 * @param startRef The NodeRef for the start polygon
 * @param startPosition The starting position in world space.
 * @param endPosition The ending position in world space.
 * @param filter The query filter to apply.
 */
export const raycast = (
    navMesh: NavMesh,
    startRef: NodeRef,
    startPosition: Vec3,
    endPosition: Vec3,
    filter: QueryFilter,
): RaycastResult => {
    const result: RaycastResult = {
        t: 0,
        hitNormal: vec3.create(),
        hitEdgeIndex: -1,
        path: [],
    };

    // validate input
    if (!isValidNodeRef(navMesh, startRef) || !vec3.finite(startPosition) || !vec3.finite(endPosition) || !filter) {
        return result;
    }

    let curRef: NodeRef | null = startRef;

    const intersectSegmentPoly2DResult = createIntersectSegmentPoly2DResult();

    while (curRef) {
        // get current tile and poly
        const tileAndPolyResult = getTileAndPolyByRef(curRef, navMesh);
        if (!tileAndPolyResult.success) break;
        const { tile, poly } = tileAndPolyResult;

        // collect current poly vertices
        const polyVerts: number[] = [];
        for (let i = 0; i < poly.vertices.length; i++) {
            const vertIndex = poly.vertices[i] * 3;
            polyVerts.push(tile.vertices[vertIndex]);
            polyVerts.push(tile.vertices[vertIndex + 1]);
            polyVerts.push(tile.vertices[vertIndex + 2]);
        }

        // cast ray against current polygon
        intersectSegmentPoly2D(intersectSegmentPoly2DResult, startPosition, endPosition, polyVerts);
        if (!intersectSegmentPoly2DResult.intersects) {
            // could not hit the polygon, keep the old t and report hit
            return result;
        }

        result.hitEdgeIndex = intersectSegmentPoly2DResult.segMax;

        // keep track of furthest t so far
        if (intersectSegmentPoly2DResult.tmax > result.t) {
            result.t = intersectSegmentPoly2DResult.tmax;
        }

        // add polygon to visited
        result.path.push(curRef);

        // ray end is completely inside the polygon
        if (intersectSegmentPoly2DResult.segMax === -1) {
            result.t = Number.MAX_VALUE;

            return result;
        }

        // follow neighbors
        let nextRef: NodeRef | null = null;

        const polyLinks: number[] = navMesh.nodes[curRef];

        for (const linkIndex of polyLinks) {
            const link = navMesh.links[linkIndex];

            // find link which contains this edge
            if (link.edge !== intersectSegmentPoly2DResult.segMax) continue;

            // skip off-mesh connections
            if (getNodeRefType(link.neighbourRef) === NodeType.OFFMESH_CONNECTION) continue;

            // get pointer to the next polygon
            const nextTileAndPolyResult = getTileAndPolyByRef(link.neighbourRef, navMesh);
            if (!nextTileAndPolyResult.success) continue;

            // skip links based on filter
            if (filter.passFilter && !filter.passFilter(link.neighbourRef, navMesh, filter)) continue;

            // if the link is internal, just return the ref
            if (link.side === 0xff) {
                nextRef = link.neighbourRef;
                break;
            }

            // if the link is at tile boundary, check if the link spans the whole edge
            if (link.bmin === 0 && link.bmax === 255) {
                nextRef = link.neighbourRef;
                break;
            }

            // check for partial edge links
            const v0 = poly.vertices[link.edge];
            const v1 = poly.vertices[(link.edge + 1) % poly.vertices.length];
            const left = [tile.vertices[v0 * 3], tile.vertices[v0 * 3 + 1], tile.vertices[v0 * 3 + 2]] as Vec3;
            const right = [tile.vertices[v1 * 3], tile.vertices[v1 * 3 + 1], tile.vertices[v1 * 3 + 2]] as Vec3;

            // check that the intersection lies inside the link portal
            if (link.side === 0 || link.side === 4) {
                // calculate link size
                const s = 1.0 / 255.0;
                let lmin = left[2] + (right[2] - left[2]) * (link.bmin * s);
                let lmax = left[2] + (right[2] - left[2]) * (link.bmax * s);
                if (lmin > lmax) [lmin, lmax] = [lmax, lmin];

                // find Z intersection
                const z = startPosition[2] + (endPosition[2] - startPosition[2]) * intersectSegmentPoly2DResult.tmax;
                if (z >= lmin && z <= lmax) {
                    nextRef = link.neighbourRef;
                    break;
                }
            } else if (link.side === 2 || link.side === 6) {
                // calculate link size
                const s = 1.0 / 255.0;
                let lmin = left[0] + (right[0] - left[0]) * (link.bmin * s);
                let lmax = left[0] + (right[0] - left[0]) * (link.bmax * s);
                if (lmin > lmax) [lmin, lmax] = [lmax, lmin];

                // find X intersection
                const x = startPosition[0] + (endPosition[0] - startPosition[0]) * intersectSegmentPoly2DResult.tmax;
                if (x >= lmin && x <= lmax) {
                    nextRef = link.neighbourRef;
                    break;
                }
            }
        }

        if (!nextRef) {
            // no neighbor, we hit a wall

            // calculate hit normal
            if (intersectSegmentPoly2DResult.segMax >= 0) {
                const a = intersectSegmentPoly2DResult.segMax;
                const b =
                    intersectSegmentPoly2DResult.segMax + 1 < poly.vertices.length ? intersectSegmentPoly2DResult.segMax + 1 : 0;
                const va = vec3.fromBuffer(vec3.create(), polyVerts, a * 3);
                const vb = vec3.fromBuffer(vec3.create(), polyVerts, b * 3);
                const dx = vb[0] - va[0];
                const dz = vb[2] - va[2];
                result.hitNormal[0] = dz;
                result.hitNormal[1] = 0;
                result.hitNormal[2] = -dx;
                vec3.normalize(result.hitNormal, result.hitNormal);
            }

            return result;
        }

        // no hit, advance to neighbor polygon
        curRef = nextRef;
    }

    return result;
};

export type FindRandomPointResult = {
    success: boolean;
    ref: NodeRef;
    position: Vec3;
};

/**
 * Finds a random point on the navigation mesh.
 *
 * @param navMesh - The navigation mesh
 * @param filter - Query filter to apply to polygons
 * @param rand - Function that returns random values [0,1]
 * @returns The result object with success flag, random point, and polygon reference
 */
export const findRandomPoint = (navMesh: NavMesh, filter: QueryFilter, rand: () => number): FindRandomPointResult => {
    const result: FindRandomPointResult = {
        success: false,
        ref: '' as NodeRef,
        position: [0, 0, 0],
    };

    // randomly pick one tile using reservoir sampling
    let selectedTile: NavMeshTile | null = null;
    let tileSum = 0;

    const tiles = Object.values(navMesh.tiles);
    for (const tile of tiles) {
        if (!tile || !tile.polys) continue;

        // choose random tile using reservoir sampling
        const area = 1.0; // could be tile area, but we use uniform weighting
        tileSum += area;
        const u = rand();
        if (u * tileSum <= area) {
            selectedTile = tile;
        }
    }

    if (!selectedTile) {
        return result;
    }

    // randomly pick one polygon weighted by polygon area
    let selectedPoly: NavMeshPoly | null = null;
    let selectedPolyRef: NodeRef | null = null;
    let areaSum = 0;

    for (let i = 0; i < selectedTile.polys.length; i++) {
        const poly = selectedTile.polys[i];

        // do not return off-mesh connection polygons
        if (poly.type !== NodeType.GROUND_POLY) {
            continue;
        }

        // construct the polygon reference
        const polyRef = serPolyNodeRef(selectedTile.id, i);

        // must pass filter
        if (filter.passFilter && !filter.passFilter(polyRef, navMesh, filter)) {
            continue;
        }

        // calculate area of the polygon using triangulation
        let polyArea = 0;
        const va = vec3.create();
        const vb = vec3.create();
        const vc = vec3.create();
        for (let j = 2; j < poly.vertices.length; j++) {
            vec3.fromBuffer(va, selectedTile.vertices, poly.vertices[0] * 3);
            vec3.fromBuffer(vb, selectedTile.vertices, poly.vertices[j - 1] * 3);
            vec3.fromBuffer(vc, selectedTile.vertices, poly.vertices[j] * 3);
            polyArea += triArea2D(va, vb, vc);
        }

        // choose random polygon weighted by area, using reservoir sampling
        areaSum += polyArea;
        const u = rand();
        if (u * areaSum <= polyArea) {
            selectedPoly = poly;
            selectedPolyRef = polyRef;
        }
    }

    if (!selectedPoly || !selectedPolyRef) {
        return result;
    }

    // randomly pick point on polygon
    const verts: number[] = [];
    for (let j = 0; j < selectedPoly.vertices.length; j++) {
        const vertexIndex = selectedPoly.vertices[j] * 3;
        verts.push(selectedTile.vertices[vertexIndex]);
        verts.push(selectedTile.vertices[vertexIndex + 1]);
        verts.push(selectedTile.vertices[vertexIndex + 2]);
    }

    const s = rand();
    const t = rand();
    const areas = new Array(selectedPoly.vertices.length);
    const pt: Vec3 = [0, 0, 0];

    randomPointInConvexPoly(pt, verts, areas, s, t);

    // project point onto polygon surface to ensure it's exactly on the mesh
    const closestPointResult = createGetClosestPointOnPolyResult();
    getClosestPointOnPoly(closestPointResult, navMesh, selectedPolyRef, pt);

    if (closestPointResult.success) {
        vec3.copy(result.position, closestPointResult.closestPoint);
    } else {
        vec3.copy(result.position, pt);
    }

    result.ref = selectedPolyRef;
    result.success = true;

    return result;
};

export type FindRandomPointAroundCircleResult = {
    success: boolean;
    randomRef: NodeRef;
    position: Vec3;
};

/**
 * Finds a random point within a circle around a center position on the navigation mesh.
 * This is a port of dtNavMeshQuery::findRandomPointAroundCircle from Detour.
 *
 * Uses Dijkstra-like search to explore reachable polygons within the circle,
 * then selects a random polygon weighted by area, and finally generates
 * a random point within that polygon.
 *
 * @param result - Result object to store the random point and polygon reference
 * @param navMesh - The navigation mesh
 * @param startRef - Reference to the polygon to start the search from
 * @param centerPosition - Center position of the search circle
 * @param maxRadius - Maximum radius of the search circle
 * @param filter - Query filter to apply to polygons
 * @param rand - Function that returns random values [0,1]
 * @returns The result object with success flag, random point, and polygon reference
 */
export const findRandomPointAroundCircle = (
    navMesh: NavMesh,
    startRef: NodeRef,
    centerPosition: Vec3,
    maxRadius: number,
    filter: QueryFilter,
    rand: () => number,
): FindRandomPointAroundCircleResult => {
    const result: FindRandomPointAroundCircleResult = {
        success: false,
        randomRef: '' as NodeRef,
        position: [0, 0, 0],
    };

    // validate input
    if (!isValidNodeRef(navMesh, startRef) || !vec3.finite(centerPosition) || maxRadius < 0 || !Number.isFinite(maxRadius)) {
        return result;
    }

    const startTileAndPoly = getTileAndPolyByRef(startRef, navMesh);
    if (!startTileAndPoly.success) {
        return result;
    }

    // check if start polygon passes filter
    if (filter.passFilter && !filter.passFilter(startRef, navMesh, filter)) {
        return result;
    }

    // prepare search
    const nodes: SearchNodePool = {};
    const openList: SearchNodeQueue = [];

    const startNode: SearchNode = {
        cost: 0,
        total: 0,
        parent: null,
        nodeRef: startRef,
        state: 0,
        flags: NODE_FLAG_OPEN,
        position: structuredClone(centerPosition),
    };
    nodes[`${startRef}:0`] = startNode;
    pushNodeToQueue(openList, startNode);

    const radiusSqr = maxRadius * maxRadius;
    let areaSum = 0;

    let randomTile: NavMeshTile | null = null;
    let randomPoly: NavMeshPoly | null = null;
    let randomPolyRef: NodeRef | null = null;

    const va = vec3.create();
    const vb = vec3.create();

    while (openList.length > 0) {
        // remove node from the open list and put it in the closed list
        const bestNode = popNodeFromQueue(openList)!;
        bestNode.flags &= ~NODE_FLAG_OPEN;
        bestNode.flags |= NODE_FLAG_CLOSED;

        // get poly and tile
        const bestRef = bestNode.nodeRef;
        const bestTileAndPoly = getTileAndPolyByRef(bestRef, navMesh);
        if (!bestTileAndPoly.success) continue;

        const { tile: bestTile, poly: bestPoly } = bestTileAndPoly;

        // place random locations on ground polygons
        if (bestPoly.type === NodeType.GROUND_POLY) {
            // calculate area of the polygon
            let polyArea = 0;
            const v0 = vec3.create();
            const v1 = vec3.create();
            const v2 = vec3.create();
            for (let j = 2; j < bestPoly.vertices.length; j++) {
                vec3.fromBuffer(v0, bestTile.vertices, bestPoly.vertices[0] * 3);
                vec3.fromBuffer(v1, bestTile.vertices, bestPoly.vertices[j - 1] * 3);
                vec3.fromBuffer(v2, bestTile.vertices, bestPoly.vertices[j] * 3);
                polyArea += triArea2D(v0, v1, v2);
            }

            // choose random polygon weighted by area, using reservoir sampling
            areaSum += polyArea;
            const u = rand();
            if (u * areaSum <= polyArea) {
                randomTile = bestTile;
                randomPoly = bestPoly;
                randomPolyRef = bestRef;
            }
        }

        // get parent reference for preventing backtracking
        let parentRef: NodeRef | null = null;
        if (bestNode.parent) {
            const [nodeRef, _state] = bestNode.parent.split(':');
            parentRef = nodeRef as NodeRef;
        }

        // iterate through all links from the current polygon
        const polyLinks: number[] = navMesh.nodes[bestRef] ?? [];
        for (const linkIndex of polyLinks) {
            const link = navMesh.links[linkIndex];
            if (!link) continue;

            const neighbourRef = link.neighbourRef;

            // skip invalid neighbours and do not follow back to parent
            if (!neighbourRef || neighbourRef === parentRef) {
                continue;
            }

            // expand to neighbour
            const neighbourTileAndPoly = getTileAndPolyByRef(neighbourRef, navMesh);
            if (!neighbourTileAndPoly.success) continue;

            // do not advance if the polygon is excluded by the filter
            if (filter.passFilter && !filter.passFilter(neighbourRef, navMesh, filter)) {
                continue;
            }

            // find edge and calc distance to the edge
            if (!getPortalPoints(navMesh, bestRef, neighbourRef, va, vb)) {
                continue;
            }

            // if the circle is not touching the next polygon, skip it
            const distSqr = distancePtSeg2dSqr(centerPosition, va, vb);
            if (distSqr > radiusSqr) {
                continue;
            }

            // get or create neighbour node
            const neighbourNodeKey: SearchNodeRef = `${neighbourRef}:0`;
            let neighbourNode = nodes[neighbourNodeKey];

            if (!neighbourNode) {
                neighbourNode = {
                    cost: 0,
                    total: 0,
                    parent: null,
                    nodeRef: neighbourRef,
                    state: 0,
                    flags: 0,
                    position: [0, 0, 0],
                };
                nodes[neighbourNodeKey] = neighbourNode;
            }

            if (neighbourNode.flags & NODE_FLAG_CLOSED) {
                continue;
            }

            // set position if this is the first time we visit this node
            if (neighbourNode.flags === 0) {
                vec3.lerp(neighbourNode.position, va, vb, 0.5);
            }

            const total = bestNode.total + vec3.distance(bestNode.position, neighbourNode.position);

            // the node is already in open list and the new result is worse, skip
            if (neighbourNode.flags & NODE_FLAG_OPEN && total >= neighbourNode.total) {
                continue;
            }

            neighbourNode.parent = `${bestRef}:0` as SearchNodeRef;
            neighbourNode.flags = neighbourNode.flags & ~NODE_FLAG_CLOSED;
            neighbourNode.total = total;

            if (neighbourNode.flags & NODE_FLAG_OPEN) {
                reindexNodeInQueue(openList, neighbourNode);
            } else {
                neighbourNode.flags = NODE_FLAG_OPEN;
                pushNodeToQueue(openList, neighbourNode);
            }
        }
    }

    if (!randomPoly || !randomTile || !randomPolyRef) {
        return result;
    }

    // randomly pick point on polygon
    const verts: number[] = [];
    for (let j = 0; j < randomPoly.vertices.length; j++) {
        const vertexIndex = randomPoly.vertices[j] * 3;
        verts.push(randomTile.vertices[vertexIndex]);
        verts.push(randomTile.vertices[vertexIndex + 1]);
        verts.push(randomTile.vertices[vertexIndex + 2]);
    }

    const s = rand();
    const t = rand();
    const areas = new Array(randomPoly.vertices.length);
    const pt: Vec3 = [0, 0, 0];

    randomPointInConvexPoly(pt, verts, areas, s, t);

    // project point onto polygon surface to ensure it's exactly on the mesh
    const closestPointResult = createGetClosestPointOnPolyResult();
    getClosestPointOnPoly(closestPointResult, navMesh, randomPolyRef, pt);

    if (closestPointResult.success) {
        vec3.copy(result.position, closestPointResult.closestPoint);
    } else {
        vec3.copy(result.position, pt);
    }

    result.randomRef = randomPolyRef;
    result.success = true;

    return result;
};
