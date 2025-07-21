import { vec3, type Vec3 } from "@/common/maaths";
import type { NavMesh, NavMeshPoly, NavMeshTile, PolyRef } from './nav-mesh';
import { err, ok } from '../result';

type PolyQuery = {
    process: (
        tile: NavMeshTile,
        polys: NavMeshPoly[],
        refs: string[],
        count: number,
    ) => void;
};

type QueryFilter = {
    includeFlags: number;
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

const DEFAULT_QUERY_FILTER: QueryFilter = {
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

export const queryPolygons = (
    navMesh: NavMesh,
    center: Vec3,
    halfExtents: Vec3,
    filter: QueryFilter,
    maxPolys: number,
) => {
    const result: PolyRef[] = [];

    // Perform the query and populate the result array
    
    // e.g.
    // if (error) {
    //     return err("Error querying polygons");
    // }

    return ok(result);
};
