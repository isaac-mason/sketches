import type { Box3, Vec3 } from '@/common/maaths';
import { box3, vec2, vec3 } from '@/common/maaths';
import {
    closestPtSeg2d,
    distancePtSeg2dSqr,
    getHeightAtPoint,
    pointInPoly,
} from '../common/geometry';
import { type Result, ok } from '../result';
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
import { navMesh } from '.';

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
    getAreaCost?: (
        pa: number,
        pb: number,
        prevRef: string | undefined,
        prevTile: NavMeshTile | undefined,
        prevPoly: NavMeshPoly | undefined,
        curRef: string,
        curTile: NavMeshTile,
        curPoly: NavMeshPoly,
        nextRef: string | undefined,
        nextTile: NavMeshTile | undefined,
        nextPoly: NavMeshPoly | undefined,
    ) => number;
};

export const DEFAULT_QUERY_FILTER: QueryFilter = {
    includeFlags: 0xffffffff,
    excludeFlags: 0,
};

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
    const [tileId, polyIndex] = desPolyRef(ref);

    const tile = navMesh.tiles[tileId];
    if (!tile) {
        return null;
    }

    if (polyIndex >= tile.polys.length) {
        return null;
    }

    return {
        tile,
        poly: tile.polys[polyIndex],
        polyIndex,
    };
};

const _v0: Vec3 = [0, 0, 0];
const _v1: Vec3 = [0, 0, 0];
const _v2: Vec3 = [0, 0, 0];

/**
 * Gets the height of a polygon at a given point using detail mesh if available
 * @param tile The tile containing the polygon
 * @param poly The polygon
 * @param polyIndex The index of the polygon in the tile
 * @param pos The position to get height for
 * @param height Output parameter for the height
 * @returns True if height was found
 */
export const getPolyHeight = (
    tile: NavMeshTile,
    poly: NavMeshPoly,
    polyIndex: number,
    pos: Vec3,
): number => {
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
                v0[0] = tile.vertices[v0Index * 3];
                v0[1] = tile.vertices[v0Index * 3 + 1];
                v0[2] = tile.vertices[v0Index * 3 + 2];
            } else {
                // Use detail vertices
                const detailIndex = (v0Index - tile.vertices.length / 3) * 3;
                v0[0] = tile.detailVertices[detailIndex];
                v0[1] = tile.detailVertices[detailIndex + 1];
                v0[2] = tile.detailVertices[detailIndex + 2];
            }

            if (v1Index < tile.vertices.length / 3) {
                v1[0] = tile.vertices[v1Index * 3];
                v1[1] = tile.vertices[v1Index * 3 + 1];
                v1[2] = tile.vertices[v1Index * 3 + 2];
            } else {
                const detailIndex = (v1Index - tile.vertices.length / 3) * 3;
                v1[0] = tile.detailVertices[detailIndex];
                v1[1] = tile.detailVertices[detailIndex + 1];
                v1[2] = tile.detailVertices[detailIndex + 2];
            }

            if (v2Index < tile.vertices.length / 3) {
                v2[0] = tile.vertices[v2Index * 3];
                v2[1] = tile.vertices[v2Index * 3 + 1];
                v2[2] = tile.vertices[v2Index * 3 + 2];
            } else {
                const detailIndex = (v2Index - tile.vertices.length / 3) * 3;
                v2[0] = tile.detailVertices[detailIndex];
                v2[1] = tile.detailVertices[detailIndex + 1];
                v2[2] = tile.detailVertices[detailIndex + 2];
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
    ok: boolean;
    isOverPoly: boolean;
    closestPoint: Vec3;
};

export const createGetClosestPointOnPolyResult =
    (): GetClosestPointOnPolyResult => {
        return {
            ok: false,
            isOverPoly: false,
            closestPoint: [0, 0, 0],
        };
    };

const _detailClosestPoint: Vec3 = [0, 0, 0];

const _lineStart: Vec3 = [0, 0, 0];
const _lineEnd: Vec3 = [0, 0, 0];

export const getClosestPointOnPoly = (
    result: GetClosestPointOnPolyResult,
    navMesh: NavMesh,
    ref: PolyRef,
    point: Vec3,
): GetClosestPointOnPolyResult => {
    result.ok = false;
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

        result.ok = true;
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
            const detailDist = closestPointOnDetailEdges(
                tile,
                detailMesh,
                point,
                _detailClosestPoint,
            );

            // use detail mesh result if it's closer
            const currentDist = vec3.squaredDistance(
                result.closestPoint,
                point,
            );

            if (detailDist < currentDist) {
                vec3.copy(result.closestPoint, _detailClosestPoint);
            }
        }

        result.ok = true;
    }

    return result;
};

export type FindNearestPolyResult = {
    ok: boolean;
    nearestPolyRef: PolyRef;
    nearestPoint: Vec3;
};

export const createFindNearestPolyResult = (): FindNearestPolyResult => {
    return {
        ok: false,
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
    result.ok = false;
    result.nearestPolyRef = '' as PolyRef;
    vec3.copy(result.nearestPoint, center);

    // Query polygons in the area
    const polys = queryPolygons(navMesh, center, halfExtents, queryFilter);

    let nearestDistSqr = Number.MAX_VALUE;
    let nearestPoly: PolyRef | null = null;

    // Find the closest polygon
    for (const polyRef of polys) {
        getClosestPointOnPoly(_closestPointResult, navMesh, polyRef, center);

        if (_closestPointResult.ok) {
            const distSqr = vec3.squaredDistance(
                center,
                _closestPointResult.closestPoint,
            );

            if (distSqr < nearestDistSqr) {
                nearestDistSqr = distSqr;
                nearestPoly = polyRef;
                vec3.copy(_nearestPoint, _closestPointResult.closestPoint);
            }
        }
    }

    if (nearestPoly) {
        result.ok = true;
        result.nearestPolyRef = nearestPoly;
        vec3.copy(result.nearestPoint, _nearestPoint);
    }

    return result;
};

const _bmax = vec3.create();
const _bmin = vec3.create();
const _vertex = vec3.create();

export const queryPolygonsInTile = (
    tile: NavMeshTile,
    bounds: Box3,
    filter: QueryFilter,
    out: PolyRef[],
): void => {
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
                const polyIndex = node.i;
                const poly = tile.polys[polyIndex];
                const ref: PolyRef = serPolyRef(tile.id, polyIndex);

                if (
                    (poly.flags & filter.includeFlags) !== 0 &&
                    (poly.flags & filter.excludeFlags) === 0
                ) {
                    if (
                        !filter.passFilter ||
                        filter.passFilter(poly, ref, tile)
                    ) {
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

        for (let i = 0; i < tile.polys.length; i++) {
            const poly = tile.polys[i];

            // Do not return off-mesh connection polygons.
            // TODO: uncomment when poly.type is available
            // if (poly.type === 'OFFMESH_CONNECTION') {
            //     continue;
            // }

            // Must pass filter
            const ref: PolyRef = serPolyRef(tile.id, i);
            if (
                (poly.flags & filter.includeFlags) === 0 ||
                (poly.flags & filter.excludeFlags) !== 0
            ) {
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

export const queryPolygons = (
    navMesh: NavMesh,
    center: Vec3,
    halfExtents: Vec3,
    filter: QueryFilter,
) => {
    const result: PolyRef[] = [];

    // set the bounds for the query
    const bounds = _queryPolygonsBounds;
    vec3.sub(bounds[0], center, halfExtents);
    vec3.add(bounds[1], center, halfExtents);

    // find min and max tile positions
    const minTile = _queryPolygonsMinTile;
    const maxTile = _queryPolygonsMaxTile;
    worldToTilePosition(minTile, navMesh, bounds[0][0], bounds[0][2]);
    worldToTilePosition(maxTile, navMesh, bounds[1][0], bounds[1][2]);

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
        if (link?.ref === toPolyRef) {
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
    const v1Index =
        fromPoly.vertices[(toLink.edge + 1) % fromPoly.vertices.length];

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
 * @param maxPath Maximum number of polygons in the path.
 * @returns The result of the pathfinding operation.
 */
export const findPath = (
    startRef: PolyRef,
    endRef: PolyRef,
    startPos: Vec3,
    endPos: Vec3,
    filter: QueryFilter,
    maxPath = 256,
): Result<PolyRef[], string> => {
    return ok([]);
};

export const FIND_STRAIGHT_PATH_AREA_CROSSINGS = 1;
export const FIND_STRAIGHT_PATH_ALL_CROSSINGS = 2;

export const findStraightPath = (
    start: Vec3,
    end: Vec3,
    pathPolyRefs: PolyRef[],
    maxStraightPathPoints = 256,
    straightPathOptions = 0,
): Result<Vec3[], string> => {
    return ok([]);
};
