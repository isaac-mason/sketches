import type { Vec3 } from "@/common/maaths";
import type { NavMesh, NavMeshPoly, NavMeshTile } from "./nav-mesh";

type PolyQuery = {
    process: (tile: NavMeshTile, polys: NavMeshPoly[], refs: string[], count: number) => void;
}

type QueryFilter = {
    includeFlags: number;
    excludeFlags: number;
}

const DEFAULT_QUERY_FILTER: QueryFilter = {
    includeFlags: 0xFFFFFFFF,
    excludeFlags: 0,
};

type FindNearestPolyResult = {
    ok: boolean;
    nearestPolyRef: string;
    nearestPoint: Vec3;
}

export const createFindNearestPolyResult = (): FindNearestPolyResult => {
    return {
        ok: false,
        nearestPolyRef: "",
        nearestPoint: [0, 0, 0],
    };
};

export const findNearestPoly = (result: FindNearestPolyResult, navMesh: NavMesh, center: Vec3, halfExtents: Vec3, queryFilter: QueryFilter): FindNearestPolyResult => {
    // ...

    return result;
}

// queryPolygons
// 	// Find tiles the query touches.
	// int minx, miny, maxx, maxy;
	// m_nav->calcTileLoc(bmin, &minx, &miny);
	// m_nav->calcTileLoc(bmax, &maxx, &maxy);
    
    // for tiles
    // queryPolygonsInTile

// queryPolygonsInTile
// 	// if bvTree
    // else foreach polygon in tile