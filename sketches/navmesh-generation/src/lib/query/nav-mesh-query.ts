import { box3, vec2, vec3 } from "@/common/maaths";
import type { Box3, Vec3 } from "@/common/maaths";
import { getTilesAt, worldToTilePosition, type NavMesh, type NavMeshPoly, type NavMeshTile, type PolyRef } from './nav-mesh';
import { err, ok } from '../result';

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

type FindNearestPolyResult = {
    ok: boolean;
    nearestPolyRef: string;
    nearestPoint: Vec3;
};

export const createFindNearestPolyResult = (): FindNearestPolyResult => {
    return {
        ok: false,
        nearestPolyRef: '',
        nearestPoint: [0, 0, 0],
    };
};

export const findNearestPoly = (
    result: FindNearestPolyResult,
    navMesh: NavMesh,
    center: Vec3,
    halfExtents: Vec3,
    queryFilter: QueryFilter,
): FindNearestPolyResult => {
    // ...

    return result;
};

export const queryPolygonsInTile = (tile: NavMeshTile, bounds: Box3, filter: QueryFilter, out: PolyRef[]): void => {
    if (tile.bvTree) {
        const qmin = bounds[0];
        const qmax = bounds[1];
        
        let nodeIndex = 0;
        const endIndex = tile.bvTree.nodes.length;
        const tbmin = tile.bounds[0];
        const tbmax = tile.bounds[1];
        const qfac = tile.bvTree.quantFactor;

        // Calculate quantized box
        const bmin = new Uint16Array(3);
        const bmax = new Uint16Array(3);
        
        // Clamp query box to world box.
        const minx = Math.max(Math.min(qmin[0], tbmax[0]), tbmin[0]) - tbmin[0];
        const miny = Math.max(Math.min(qmin[1], tbmax[1]), tbmin[1]) - tbmin[1];
        const minz = Math.max(Math.min(qmin[2], tbmax[2]), tbmin[2]) - tbmin[2];
        const maxx = Math.max(Math.min(qmax[0], tbmax[0]), tbmin[0]) - tbmin[0];
        const maxy = Math.max(Math.min(qmax[1], tbmax[1]), tbmin[1]) - tbmin[1];
        const maxz = Math.max(Math.min(qmax[2], tbmax[2]), tbmin[2]) - tbmin[2];
        
        // Quantize
        bmin[0] = Math.floor(qfac * minx) & 0xfffe;
        bmin[1] = Math.floor(qfac * miny) & 0xfffe;
        bmin[2] = Math.floor(qfac * minz) & 0xfffe;
        bmax[0] = (Math.floor(qfac * maxx + 1)) | 1;
        bmax[1] = (Math.floor(qfac * maxy + 1)) | 1;
        bmax[2] = (Math.floor(qfac * maxz + 1)) | 1;

        // Traverse tree
        while (nodeIndex < endIndex) {
            const node = tile.bvTree.nodes[nodeIndex];
            
            // Check overlap - assuming node.bounds is Box3 format [min, max]
            const nodeBounds = node.bounds;
            const overlap = (
                bmin[0] <= nodeBounds[1][0] && bmax[0] >= nodeBounds[0][0] &&
                bmin[1] <= nodeBounds[1][1] && bmax[1] >= nodeBounds[0][1] &&
                bmin[2] <= nodeBounds[1][2] && bmax[2] >= nodeBounds[0][2]
            );
            
            const isLeafNode = node.i >= 0;

            if (isLeafNode && overlap) {
                const polyIndex = node.i;
                const poly = tile.polys[polyIndex];
                const ref: PolyRef = `${tile.id},0,${polyIndex}`;
                
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
        const bmin = vec3.create();
        const bmax = vec3.create();
        
        for (let i = 0; i < tile.polys.length; i++) {
            const poly = tile.polys[i];
            
            // Do not return off-mesh connection polygons.
            // TODO: uncomment when poly.type is available
            // if (poly.type === 'OFFMESH_CONNECTION') {
            //     continue;
            // }
            
            // Must pass filter
            const ref: PolyRef = `${tile.id},0,${i}`;
            if ((poly.flags & filter.includeFlags) === 0 || (poly.flags & filter.excludeFlags) !== 0) {
                continue;
            }
            
            if (filter.passFilter && !filter.passFilter(poly, ref, tile)) {
                continue;
            }
            
            // Calc polygon bounds.
            const firstVertexIndex = poly.vertices[0];
            const firstVertex = [
                tile.vertices[firstVertexIndex * 3],
                tile.vertices[firstVertexIndex * 3 + 1],
                tile.vertices[firstVertexIndex * 3 + 2]
            ] as Vec3;
            vec3.copy(bmin, firstVertex);
            vec3.copy(bmax, firstVertex);
            
            for (let j = 1; j < poly.vertices.length; j++) {
                const vertexIndex = poly.vertices[j];
                const vertex = [
                    tile.vertices[vertexIndex * 3],
                    tile.vertices[vertexIndex * 3 + 1],
                    tile.vertices[vertexIndex * 3 + 2]
                ] as Vec3;
                vec3.min(bmin, bmin, vertex);
                vec3.max(bmax, bmax, vertex);
            }
            
            // Check overlap with query bounds
            if (qmin[0] <= bmax[0] && qmax[0] >= bmin[0] &&
                qmin[1] <= bmax[1] && qmax[1] >= bmin[1] &&
                qmin[2] <= bmax[2] && qmax[2] >= bmin[2]) {
                
                out.push(ref);
            }
        }
    }
}

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

    // e.g.
    // if (error) {
    //     return err("Error querying polygons");
    // }

    return ok(result);
};
