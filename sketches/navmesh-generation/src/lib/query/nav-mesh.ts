import type { Box3, Vec2, Vec3 } from '@/common/maaths';
import { POLY_NEIS_FLAG_EXT_LINK } from '../generate';
import { buildNavMeshBvTree } from './nav-mesh-bv-tree';

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
    /** the offset of the vertices in the NavMeshTile detailVertices array */
    verticesBase: number;

    /** the offset of the triangles in the NavMeshTile detailTriangles array */
    trianglesBase: number;

    /** the number of vertices in the sub-mesh */
    verticesCount: number;

    /** the number of trianges in the sub-mesh */
    trianglesCount: number;
};

/** the source data used to create a navigation mesh tile */
export type NavMeshTileParams = {
    /** the polygon mesh parameters */
    polyMesh: {
        /** the polygon mesh vertices, [x1, y1, z1, ...] */
        vertices: number[];

        /** the number of vertices in the polygon mesh */
        nVertices: number;

        /** the polygon data */
        polys: number[];

        /** the polygon flags */
        polyFlags: number[];

        /** the polygon area ids */
        polyAreas: number[];

        /** the number of polygons in the mesh */
        nPolys: number;

        /** the maximum number of vertices per polygon [Limit: >= 3] */
        maxVerticesPerPoly: number;
    };

    /** (optional) height detail attributes */
    detailMesh?: {
        /** the detail mesh sub-mesh data */
        detailMeshes: number[];

        /** the detail mesh vertices, [x1, y1, z1, ...] */
        detailVertices: number[];

        /** the number of vertices in the detail mesh */
        nVertices: number;

        /** the detail mesh triangles, [a1, b1, c1, a2, b2, c2, ...] */
        detailTriangles: number[];

        /** the number of triangles in the detail mesh */
        nTriangles: number;
    };

    // TODO: off mesh connections
    // ...

    /** the user defined id of the tile */
    userId: number;

    /** the tile'x x-grid location within the multi-tile destination mesh (along the x axis) */
    tileX: number;

    /** the tile's y-grid location within the multi-tile destination mesh (along the z axis) */
    tileY: number;

    /** the tile's layer within the layered destination mesh (along the y axis) */
    tileLayer: number;

    /** the bounds of the tile */
    bounds: Box3;

    /** whether to build a bounding volume tree for the tile */
    buildBvTree: boolean;

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

    // TODO: necessary for nav mesh querying?
    // float walkableHeight;	///< The agent height. [Unit: wu]
    // float walkableRadius;	///< The agent radius. [Unit: wu]
    // float walkableClimb;	///< The agent maximum traversable ledge. (Up/Down) [Unit: wu]
    // float cs;				///< The xz-plane cell size of the polygon mesh. [Limit: > 0] [Unit: wu]
    // float ch;				///< The y-axis cell height of the polygon mesh. [Limit: > 0] [Unit: wu]
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
    /** counter describing modifications to the tile */
    id: number;

    /** the bounds of the tile's AABB */
    bounds: Box3;

    /** nav mesh tile vertices */
    vertices: number[];

    /** the detail meshes */
    detailMeshes: NavMeshPolyDetail[];

    /** the detail mesh's unique vertices */
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
     */
    cellSize: number;

    /**
     * The y-axis cell height of the polygon mesh.
     */
    cellHeight: number;

    // TODO: evaluate if necessary for nav mesh querying
    // float walkableHeight;	///< The agent height. [Unit: wu]
    // float walkableRadius;	///< The agent radius. [Unit: wu]
    // float walkableClimb;	///< The agent maximum traversable ledge. (Up/Down) [Unit: wu]
    // float cs;				///< The xz-plane cell size of the polygon mesh. [Limit: > 0] [Unit: wu]
    // float ch;				///< The y-axis cell height of the polygon mesh. [Limit: > 0] [Unit: wu]
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

/** creates a NavMeshTile from NavMeshTileParams */
export const createNavMeshTile = (params: NavMeshTileParams): NavMeshTile => {
    const tile: NavMeshTile = {
        id: 0,
        bounds: structuredClone(params.bounds),
        vertices: params.polyMesh.vertices,
        detailMeshes: [],
        detailVertices: [],
        detailTriangles: [],
        polys: [],
        links: [],
        bvTree: null,
        cellSize: params.cellSize,
        cellHeight: params.cellHeight,
    };

    const nvp = params.polyMesh.maxVerticesPerPoly;
    const MESH_NULL_IDX = 0xffff;

    // create polys from input data
    for (let i = 0; i < params.polyMesh.nPolys; i++) {
        const poly: NavMeshPoly = {
            vertices: [],
            neis: [],
            flags: params.polyMesh.polyFlags[i],
            area: params.polyMesh.polyAreas[i],
        };

        // extract polygon data for this polygon
        const polyStart = i * nvp * 2;
        const vertIndices = params.polyMesh.polys.slice(
            polyStart,
            polyStart + nvp,
        );
        const neiData = params.polyMesh.polys.slice(
            polyStart + nvp,
            polyStart + nvp * 2,
        );

        // build vertex indices and neighbor data
        for (let j = 0; j < nvp; j++) {
            const vertIndex = vertIndices[j];
            if (vertIndex === MESH_NULL_IDX) break;

            poly.vertices.push(vertIndex);

            const neiValue = neiData[j];

            if (neiValue & POLY_NEIS_FLAG_EXT_LINK) {
                // border or portal edge
                const dir = neiValue & 0xf;
                if (dir === 0xf) {
                    poly.neis.push(0);
                } else if (dir === 0) {
                    poly.neis.push(POLY_NEIS_FLAG_EXT_LINK | 4); // Portal x-
                } else if (dir === 1) {
                    poly.neis.push(POLY_NEIS_FLAG_EXT_LINK | 2); // Portal z+
                } else if (dir === 2) {
                    poly.neis.push(POLY_NEIS_FLAG_EXT_LINK | 0); // Portal x+
                } else if (dir === 3) {
                    poly.neis.push(POLY_NEIS_FLAG_EXT_LINK | 6); // Portal z-
                } else {
                    // TODO: how to handle this case?
                    poly.neis.push(0);
                }
            } else {
                // normal internal connection (add 1 to convert from 0-based to 1-based indexing)
                poly.neis.push(neiValue + 1);
            }
        }

        tile.polys.push(poly);
    }

    // create detail triangles if not provided
    if (!params.detailMesh) {
        createDetailMeshFromPolys(tile);
    } else {
        tile.detailMeshes = [];
        tile.detailVertices = params.detailMesh.detailVertices;
        tile.detailTriangles = params.detailMesh.detailTriangles;

        for (let i = 0; i < params.detailMesh.detailMeshes.length; i += 4) {
            const detailMesh: NavMeshPolyDetail = {
                verticesBase: params.detailMesh.detailMeshes[i],
                trianglesBase: params.detailMesh.detailMeshes[i + 1],
                verticesCount: params.detailMesh.detailMeshes[i + 2],
                trianglesCount: params.detailMesh.detailMeshes[i + 3],
            };
            tile.detailMeshes.push(detailMesh);
        }
    }

    // build bv tree if requested
    if (params.buildBvTree) {
        buildNavMeshBvTree(tile);
    }

    // create internal links within the tile
    createInternalLinks(tile);

    return tile;
};

const createDetailMeshFromPolys = (tile: NavMeshTile) => {
    const detailTriangles: number[] = [];
    const detailMeshes: NavMeshPolyDetail[] = [];

    let tbase = 0;
    
    for (let i = 0; i < tile.polys.length; i++) {
        const poly = tile.polys[i];
        const nv = poly.vertices.length;
        
        // Create detail mesh descriptor for this polygon
        const detailMesh: NavMeshPolyDetail = {
            verticesBase: 0,      // No additional detail vertices when triangulating from polys
            verticesCount: 0,     // No additional detail vertices when triangulating from polys
            trianglesBase: tbase, // Starting triangle index
            trianglesCount: nv - 2  // Number of triangles in fan triangulation
        };
        
        detailMeshes.push(detailMesh);
        
        // Triangulate polygon using fan triangulation (local indices within the polygon)
        for (let j = 2; j < nv; j++) {
            // Create triangle using vertex 0 and two consecutive vertices
            detailTriangles.push(0);           // first vertex (local index)
            detailTriangles.push(j - 1);      // previous vertex (local index)  
            detailTriangles.push(j);          // current vertex (local index)
            
            // Edge flags - bit for each edge that belongs to poly boundary
            let edgeFlags = 1 << 2;  // edge 2 is always a polygon boundary
            if (j === 2) edgeFlags |= 1 << 0;      // first triangle, edge 0 is boundary
            if (j === nv - 1) edgeFlags |= 1 << 4; // last triangle, edge 1 is boundary
            
            detailTriangles.push(edgeFlags);
            tbase++;
        }
    }

    tile.detailMeshes = detailMeshes;
    tile.detailTriangles = detailTriangles;
    // No additional detail vertices needed when triangulating from polygon vertices
    tile.detailVertices = [];
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
