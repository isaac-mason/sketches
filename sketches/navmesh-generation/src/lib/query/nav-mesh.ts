import type { Box3, Vec3 } from '@/common/maaths';

export type NavMesh = {
    /** the world space origin of the navigation mesh's tiles */
    origin: Vec3;
    /** the width of each tile along the x axis */
    tileWidth: number;
    /** the height of each tile along the z axis */
    tileHeight: number;
    /** map of tile ids to tiles */
    tiles: Record<string, NavMeshTile>;
    /** map of tile position hashes to tile ids */
    tilePositionHashToTileId: Record<string, string>;
};

export enum NavMeshPolyType {
    /** the polygon is a standard convex polygon that is part of the surface of the mesh */
    GROUND = 0,
    // /** the polygon is an off-mesh connection consisting of two vertices */
    // OFFMESH_CONNECTION = 1,
}

export type NavMeshPoly = { 
    /** the indices of the polygon's vertices. vertices are stored in NavMeshTile.vertices */
    polygonIndices: number[];
    /** the indices of the polygon's links. links are stored in NavMeshTile.links */
    verticesCount: number;
    /** packed data representing neighbor polygons references and flags for each edge */
    neighbours: number[];
    /** user defined flags */
    flags: number;
    /** user defined area id */
    area: number;
    /* the type of the poly */
    type: NavMeshPolyType;
}

export type NavMeshLink = {
    
}

export type NavMeshTile = {
    /** counter describing modifications to the tile */
    salt: number;

    // TODO: evaluate if necessary for nav mesh querying
    // walkableHeightWorld: number;
    // walkableRadiusWorld: number;
    // walkableClimbWorld: number;

    /** the bounds of the tile's AABB */
    bounds: Box3;
};

export const create = (): NavMesh => {
    return {
        origin: [0, 0, 0],
        tileWidth: 0,
        tileHeight: 0,
        tiles: {},
        tilePositionHashToTileId: {},
    };
};

const tileHash = (x: number, y: number, layer: number): string => {
    return `${x}_${y}_${layer}`;
};

export const addTile = () => {};

export const getTileAt = (x: number, y: number, layer: number) => { };
