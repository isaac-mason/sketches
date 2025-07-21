import type { Box3, Vec2, Vec3 } from '@/common/maaths';
import { POLY_NEIS_FLAG_EXT_LINK } from '../generate';

/** a serialised polygon reference, in the format `${tile salt}.${tile index}.${index of polygon within tile}` */
export type PolyRef = `${number},${number},${number}`;

/** a deserialised polygon reference, as a tuple of [tile salt, tile index, index of polygon within tile] */
export type DeserialisedPolyRef = [
    tileSalt: number,
    tileIndex: number,
    tilePolygonIndex: number,
];

/** serialises a polygon reference from tile salt, tile index and polygon index */
export const serPolyRef = (
    tileSalt: number,
    tileIndex: number,
    tilePolygonIndex: number,
): PolyRef => {
    return `${tileSalt},${tileIndex},${tilePolygonIndex}`;
};

/** deserialises a polygon reference into a tuple of [tile salt, tile index, index of polygon within tile] */
export const desPolyRef = (polyRef: PolyRef): DeserialisedPolyRef => {
    return polyRef.split('.').map(Number) as DeserialisedPolyRef;
};

/** a navigation mesh based on tiles of convex polygons */
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
    tilePositionHashToTileId: Record<string, number>;

    /** the tile id counter */
    tileIdCounter: number;
};

// TODO: may implement off mesh connections differently, tbd
// export enum NavMeshPolyType {
//     /** the polygon is a standard convex polygon that is part of the surface of the mesh */
//     GROUND = 0,
//     // /** the polygon is an off-mesh connection consisting of two vertices */
//     // OFFMESH_CONNECTION = 1,
// }

export type NavMeshPoly = {
    /** the indices of the polygon's vertices. vertices are stored in NavMeshTile.vertices */
    vertices: number[];

    /** packed data representing neighbor polygons references and flags for each edge */
    neis: number[];

    /** the user defined flags for this polygon */
    flags: number;

    /** the user defined area id for this polygon */
    area: number;

    // /* the type of the poly */
    // TODO: may implement off mesh connections differently, tbd
    // type: NavMeshPolyType;
};

export type NavMeshLink = {
    /** neighbour reference. (The neighbor that is linked to.) */
    ref: number;

    /** index of the polygon edge that owns this link */
    edge: number;

    /** if a boundary link, defines on which side the link is */
    side: number;

    /** if a boundary link, defines the min sub-edge area */
    bmin: number;

    /** if a boundary link, defines the max sub-edge area */
    bmax: number;
};

export type NavMeshPolyDetail = {
    /**
     * The offset of the vertices in the NavMeshTile detailVertices array.
     * If the base index is between 0 and `NavMeshTile.vertices.length`, this is used to index into the NavMeshTile vertices array.
     * If the base index is greater than `NavMeshTile.vertices.length`, it is used to index into the NavMeshTile detailVertices array.
     * This allows for detail meshes to either re-use the polygon vertices or to define their own vertices without duplicating data.
     */
    verticesBase: number;

    /** the offset of the triangles in the NavMeshTile detailTriangles array */
    trianglesBase: number;

    /** the number of vertices in the sub-mesh */
    verticesCount: number;

    /** the number of trianges in the sub-mesh */
    trianglesCount: number;
};

export type NavMeshBvNode = {
    /** bounds of the bv node */
    bounds: Box3;
    /** the node's index */
    i: number;
};

export type NavMeshTileBvTree = {
    /** the tile bounding volume nodes */
    nodes: NavMeshBvNode[];

    /** the quantisation factor for the bounding volume tree */
    quantFactor: number;
};

export type NavMeshTile = {
    /** the unique id of the tile */
    id: number;

    /** the bounds of the tile's AABB */
    bounds: Box3;

    /** nav mesh tile vertices in world space */
    vertices: number[];

    /** the detail meshes */
    detailMeshes: NavMeshPolyDetail[];

    /** the detail mesh's unique vertices, in local tile space */
    detailVertices: number[];

    /** the detail mesh's triangles */
    detailTriangles: number[];

    /** the tile polys */
    polys: NavMeshPoly[];

    /** the tile links */
    links: NavMeshLink[];

    /** the tile's bounding volume tree */
    bvTree: NavMeshTileBvTree | null;

    /**
     * The xz-plane cell size of the polygon mesh.
     * If this tile was generated with voxelization, it should be the voxel cell size.
     * If the tile was created with a different method, use a value that approximates the level of precision required for the tile.
     * This is used to:
     * - quantize the tile's bounding volume tree, for all dimensions (x, y, z)
     * - ...
     */
    cellSize: number;

    /**
     * The y-axis cell height of the polygon mesh.
     * If this tile was generated with voxelization, it should be the voxel cell height.
     * If the tile was created with a different method, use a value that approximates the level of precision required for the tile.
     * This is used to:
     * - ...
     */
    cellHeight: number;

    // TODO: evaluate if necessary for nav mesh querying
    // float walkableHeight;	///< The agent height. [Unit: wu]
    // float walkableRadius;	///< The agent radius. [Unit: wu]
    // float walkableClimb;	///< The agent maximum traversable ledge. (Up/Down) [Unit: wu]
};

export const create = (): NavMesh => {
    return {
        origin: [0, 0, 0],
        tileWidth: 0,
        tileHeight: 0,
        tiles: {},
        tilePositionHashToTileId: {},
        tileIdCounter: -1,
    };
};

const getTilePositionHash = (x: number, y: number, layer: number): string => {
    return `${x},${y},${layer}`;
};

const createInternalLinks = (tile: NavMeshTile) => {
    // create links between polygons within the tile
    // based on the neighbor information stored in each polygon

    for (let polyIndex = 0; polyIndex < tile.polys.length; polyIndex++) {
        const poly = tile.polys[polyIndex];

        // TODO: If off mesh links are represented as polys, filter them out here
        // ...

        for (let edgeIndex = 0; edgeIndex < poly.vertices.length; edgeIndex++) {
            const neiValue = poly.neis[edgeIndex];

            // skip external links and border edges
            if (neiValue === 0 || neiValue & POLY_NEIS_FLAG_EXT_LINK) {
                continue;
            }

            // internal connection - create link
            const neighborPolyIndex = neiValue - 1; // convert back to 0-based indexing

            if (
                neighborPolyIndex >= 0 &&
                neighborPolyIndex < tile.polys.length
            ) {
                const link: NavMeshLink = {
                    ref: neighborPolyIndex, // reference to neighbor polygon
                    edge: edgeIndex, // edge index in current polygon
                    side: 0xff, // not a boundary link
                    bmin: 0, // not used for internal links
                    bmax: 0, // not used for internal links
                };

                tile.links.push(link);
            }
        }
    }
};

export const addTile = (
    navMesh: NavMesh,
    navMeshTile: NavMeshTile,
    x: number,
    y: number,
    layer: number,
    // tileId: string
) => {
    const tileHash = getTilePositionHash(x, y, layer);

    // increment id for this tile position
    navMeshTile.id = (navMesh.tileIdCounter++ % 0xffff) + 1; // wrap around at 0xffff

    // store tile in navmesh
    navMesh.tiles[navMeshTile.id] = navMeshTile;
    navMesh.tilePositionHashToTileId[tileHash] = navMeshTile.id;

    // create internal links within the tile
    createInternalLinks(navMeshTile);

    // TODO: create external links to neighboring tiles
    // ...
};

export const removeTile = (
    navMesh: NavMesh,
    x: number,
    y: number,
    layer: number,
): boolean => {
    const tileHash = getTilePositionHash(x, y, layer);
    const tileId = navMesh.tilePositionHashToTileId[tileHash];

    if (!tileId || !navMesh.tiles[tileId]) {
        return false;
    }

    // remove tile from navmesh
    delete navMesh.tiles[tileId];
    delete navMesh.tilePositionHashToTileId[tileHash];

    // TODO: remove external links from neighboring tiles that reference this tile
    // ...

    return true;
};

export const getTileAt = (
    navMesh: NavMesh,
    x: number,
    y: number,
    layer: number,
): NavMeshTile | undefined => {
    const tileHash = getTilePositionHash(x, y, layer);
    return navMesh.tiles[tileHash];
};

export const getTilesAt = (
    navMesh: NavMesh,
    x: number,
    y: number,
): NavMeshTile[] => {
    const tiles: NavMeshTile[] = [];

    // search through all tiles to find ones at the specified x,y position
    for (const [tileHash, tileId] of Object.entries(
        navMesh.tilePositionHashToTileId,
    )) {
        const [tileX, tileY, _layer] = desPolyRef(tileHash as PolyRef);

        if (tileX === x && tileY === y) {
            const tile = navMesh.tiles[tileId];
            if (tile) {
                tiles.push(tile);
            }
        }
    }

    return tiles;
};

/**
 * Returns the tile x and y position in the nav mesh from a world space position.
 * @param outTilePosition the output tile position
 * @param worldX the world tile x coordinate
 * @param worldY the world tile y coordinate (along the z axis)
 */
export const worldToTilePosition = (
    outTilePosition: Vec2,
    navMesh: NavMesh,
    worldX: number,
    worldY: number,
) => {
    outTilePosition[0] = Math.floor(
        (worldX - navMesh.origin[0]) / navMesh.tileWidth,
    );
    outTilePosition[1] = Math.floor(
        (worldY - navMesh.origin[2]) / navMesh.tileHeight,
    );
    return outTilePosition;
};
