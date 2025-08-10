import { vec2, vec3, type Box3, type Vec2, type Vec3 } from '@/common/maaths';
import { POLY_NEIS_FLAG_EXT_LINK, POLY_NEIS_FLAG_EXT_LINK_DIR_MASK } from '../generate';
import { createFindNearestPolyResult, DEFAULT_QUERY_FILTER, findNearestPoly } from './nav-mesh-query';

/** a serialised polygon reference, in the format `${tile id}.${index of polygon within tile}` */
export type PolyRef = `${number},${number | string}`;

/** a deserialised polygon reference, as a tuple of [tile id, index of polygon within tile] */
export type DeserialisedPolyRef = [tileId: number, tilePolygonIndex: number];

/** serialises a polygon reference */
export const serPolyRef = (tileId: number, tilePolygonId: number | string): PolyRef => {
    return `${tileId},${tilePolygonId}`;
};

/** deserialises a polygon reference */
export const desPolyRef = (polyRef: PolyRef): DeserialisedPolyRef => {
    return polyRef.split(',').map(Number) as DeserialisedPolyRef;
};

/** a navigation mesh based on tiles of convex polygons */
export type NavMesh = {
    /** the world space origin of the navigation mesh's tiles */
    origin: Vec3;

    /** the width of each tile along the x axis */
    tileWidth: number;

    /** the height of each tile along the z axis */
    tileHeight: number;

    /** the tile id counter */
    tileIdCounter: number;

    /** map of tile ids to tiles */
    tiles: Record<string, NavMeshTile>;

    /** map of tile position hashes to tile ids */
    tilePositionHashToTileId: Record<string, number>;

    /** the off mesh connection id counter */
    offMeshConnectionIdCounter: number;

    /** off mesh connection definitions */
    offMeshConnections: Record<string, NavMeshOffMeshConnection>;

    /** off mesh connection states */
    offMeshConnectionStates: Record<string, NavMeshOffMeshConnectionState>;
};

// TODO: may implement off mesh connections differently, tbd
export enum NavMeshPolyType {
    /** the polygon is a standard convex polygon that is part of the surface of the mesh */
    GROUND = 0,
    /** the polygon is an off-mesh connection consisting of two vertices */
    OFFMESH_CONNECTION = 1,
}

export type NavMeshPoly = {
    /** ids of the links to other polygons */
    links: number[];

    /** the indices of the polygon's vertices. vertices are stored in NavMeshTile.vertices */
    vertices: number[];

    /** packed data representing neighbor polygons references and flags for each edge */
    neis: number[];

    /** the user defined flags for this polygon */
    flags: number;

    /** the user defined area id for this polygon */
    area: number;

    /* the type of the poly */
    type: NavMeshPolyType;
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

    /** the number of vertices in thde sub-mesh */
    verticesCount: number;

    /** the number of trianges in the sub-mesh */
    trianglesCount: number;
};

export type NavMeshLink = {
    /** polygon reference that owns this link */
    ref: PolyRef;

    /** neighbour reference. (The neighbor that is linked to.) */
    neighbourRef: PolyRef;

    /** index of the polygon edge that owns this link */
    edge: number;

    /** if a boundary link, defines on which side the link is */
    side: number;

    /** if a boundary link, defines the min sub-edge area */
    bmin: number;

    /** if a boundary link, defines the max sub-edge area */
    bmax: number;
};

export enum OffMeshConnectionDirection {
    START_TO_END = 0,
    BIDIRECTIONAL = 1,
}

export type NavMeshOffMeshConnection = {
    /** the start position of the off mesh connection */
    start: Vec3;
    /** the end position of the off mesh connection */
    end: Vec3;
    /** the radius of the endpoints */
    radius: number;
    /** the direction of the off mesh connection */
    direction: OffMeshConnectionDirection;
};

export type NavMeshOffMeshConnectionState = {
    /** the start polygon */
    startPolyRef: PolyRef;
    /** the end polygon */
    endPolyRef: PolyRef;
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

// TODO: allocateLink, freeLink
// required so that references to link indices is stable!
// Q: move outside tiles? global pool?

export type NavMeshTile = {
    /** the unique id of the tile */
    id: number;

    /* the tile x position in the nav mesh */
    tileX: number;

    /* the tile y position in the nav mesh */
    tileY: number;

    /** the tile layer in the nav mesh */
    tileLayer: number;

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

    /**
     * The agent height. [Unit: wu]
     */
    walkableHeight: number;

    /**
     * The agent radius. [Unit: wu]
     */
    walkableRadius: number;

    /**
     * The agent maximum traversable ledge. (Up/Down) [Unit: wu]
     */
    walkableClimb: number;
};

export const create = (): NavMesh => {
    return {
        origin: [0, 0, 0],
        tileWidth: 0,
        tileHeight: 0,
        tileIdCounter: -1,
        tiles: {},
        tilePositionHashToTileId: {},
        offMeshConnectionIdCounter: -1,
        offMeshConnections: {},
        offMeshConnectionStates: {},
    };
};

/**
 * Returns the tile x and y position in the nav mesh from a world space position.
 * @param outTilePosition the output tile position
 * @param worldX the world tile x coordinate
 * @param worldY the world tile y coordinate (along the z axis)
 */
export const worldToTilePosition = (outTilePosition: Vec2, navMesh: NavMesh, worldPosition: Vec3) => {
    outTilePosition[0] = Math.floor((worldPosition[0] - navMesh.origin[0]) / navMesh.tileWidth);
    outTilePosition[1] = Math.floor((worldPosition[2] - navMesh.origin[2]) / navMesh.tileHeight);
    return outTilePosition;
};

export const getTileAt = (navMesh: NavMesh, x: number, y: number, layer: number): NavMeshTile | undefined => {
    const tileHash = getTilePositionHash(x, y, layer);
    return navMesh.tiles[tileHash];
};

export const getTilesAt = (navMesh: NavMesh, x: number, y: number): NavMeshTile[] => {
    const tiles: NavMeshTile[] = [];

    for (const tileIndex in navMesh.tiles) {
        const tile = navMesh.tiles[tileIndex];
        if (tile.tileX === x && tile.tileY === y) {
            tiles.push(tile);
        }
    }

    return tiles;
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
                    ref: serPolyRef(tile.id, polyIndex),
                    neighbourRef: serPolyRef(tile.id, neighborPolyIndex),
                    edge: edgeIndex, // edge index in current polygon
                    side: 0xff, // not a boundary link
                    bmin: 0, // not used for internal links
                    bmax: 0, // not used for internal links
                };

                tile.links.push(link);

                poly.links.push(tile.links.length - 1);
            }
        }
    }
};

const oppositeTile = (side: number): number => (side + 4) & 0x7;

// Compute a scalar coordinate along the primary axis for the slab
const getSlabCoord = (v: Vec3, side: number): number => {
    if (side === 0 || side === 4) return v[0]; // x portals measure by x
    if (side === 2 || side === 6) return v[2]; // z portals measure by z
    return 0;
};

// Calculate 2D endpoints (u,y) for edge segment projected onto the portal axis plane.
// For x-portals (side 0/4) we use u = z, for z-portals (2/6) u = x.
const calcSlabEndPoints = (va: Vec3, vb: Vec3, bmin: Vec3, bmax: Vec3, side: number) => {
    if (side === 0 || side === 4) {
        if (va[2] < vb[2]) {
            bmin[0] = va[2];
            bmin[1] = va[1];
            bmax[0] = vb[2];
            bmax[1] = vb[1];
        } else {
            bmin[0] = vb[2];
            bmin[1] = vb[1];
            bmax[0] = va[2];
            bmax[1] = va[1];
        }
    } else if (side === 2 || side === 6) {
        if (va[0] < vb[0]) {
            bmin[0] = va[0];
            bmin[1] = va[1];
            bmax[0] = vb[0];
            bmax[1] = vb[1];
        } else {
            bmin[0] = vb[0];
            bmin[1] = vb[1];
            bmax[0] = va[0];
            bmax[1] = va[1];
        }
    }
};

// Overlap test of two edge slabs in (u,y) space, with tolerances px (horizontal pad) and py (vertical threshold)
const overlapSlabs = (amin: Vec3, amax: Vec3, bmin: Vec3, bmax: Vec3, px: number, py: number): boolean => {
    const minx = Math.max(amin[0] + px, bmin[0] + px);
    const maxx = Math.min(amax[0] - px, bmax[0] - px);
    if (minx > maxx) return false; // no horizontal overlap

    // Vertical overlap test via line interpolation along u
    const ad = (amax[1] - amin[1]) / (amax[0] - amin[0]);
    const ak = amin[1] - ad * amin[0];
    const bd = (bmax[1] - bmin[1]) / (bmax[0] - bmin[0]);
    const bk = bmin[1] - bd * bmin[0];
    const aminy = ad * minx + ak;
    const amaxy = ad * maxx + ak;
    const bminy = bd * minx + bk;
    const bmaxy = bd * maxx + bk;
    const dmin = bminy - aminy;
    const dmax = bmaxy - amaxy;
    if (dmin * dmax < 0) return true; // crossing
    const thr = py * 2 * (py * 2);
    if (dmin * dmin <= thr || dmax * dmax <= thr) return true; // near endpoints
    return false;
};

const _amin = vec3.create();
const _amax = vec3.create();
const _bmin = vec3.create();
const _bmax = vec3.create();

/**
 * Find connecting external polys between edge va->vb in target tile on opposite side.
 * Returns array of { ref, tmin, tmax } describing overlapping intervals along the edge.
 * @param va vertex A
 * @param vb vertex B
 * @param target target tile
 * @param side portal side
 * @returns array of connecting polygons
 */
const findConnectingPolys = (
    va: Vec3,
    vb: Vec3,
    target: NavMeshTile | undefined,
    side: number,
): { ref: PolyRef; umin: number; umax: number }[] => {
    if (!target) return [];
    calcSlabEndPoints(va, vb, _amin, _amax, side); // store u,y
    const apos = getSlabCoord(va, side);

    const results: { ref: PolyRef; umin: number; umax: number }[] = [];

    // iterate target polys & their boundary edges (those marked ext link in that direction)
    for (const polyId in target.polys) {
        const poly = target.polys[polyId];
        const nv = poly.vertices.length;
        for (let j = 0; j < nv; j++) {
            const nei = poly.neis[j];

            // not an external edge
            if ((nei & POLY_NEIS_FLAG_EXT_LINK) === 0) continue;

            const dir = nei & POLY_NEIS_FLAG_EXT_LINK_DIR_MASK;

            // only edges that face the specified side from target perspective
            if (dir !== side) continue;

            const vcIndex = poly.vertices[j];
            const vdIndex = poly.vertices[(j + 1) % nv];
            const vc: Vec3 = [target.vertices[vcIndex * 3], target.vertices[vcIndex * 3 + 1], target.vertices[vcIndex * 3 + 2]];
            const vd: Vec3 = [target.vertices[vdIndex * 3], target.vertices[vdIndex * 3 + 1], target.vertices[vdIndex * 3 + 2]];

            const bpos = getSlabCoord(vc, side);

            // not co-planar enough
            if (Math.abs(apos - bpos) > 0.01) continue;

            calcSlabEndPoints(vc, vd, _bmin, _bmax, side);
            if (!overlapSlabs(_amin, _amax, _bmin, _bmax, 0.01, target.walkableClimb)) continue;

            // record overlap interval
            results.push({
                ref: serPolyRef(target.id, polyId),
                umin: Math.max(_amin[0], _bmin[0]),
                umax: Math.min(_amax[0], _bmax[0]),
            });

            // proceed to next polygon (edge matched)
            break;
        }
    }
    return results;
};

const _va = vec3.create();
const _vb = vec3.create();

const connectExternalLinks = (tile: NavMeshTile, target: NavMeshTile, side: number) => {
    // connect border links
    for (const polyId in tile.polys) {
        const poly = tile.polys[polyId];
        const nv = poly.vertices.length;
        for (let j = 0; j < nv; j++) {
            // skip non-portal edges
            if ((poly.neis[j] & POLY_NEIS_FLAG_EXT_LINK) === 0) {
                continue;
            }

            const dir = poly.neis[j] & POLY_NEIS_FLAG_EXT_LINK_DIR_MASK;
            if (side !== -1 && dir !== side) {
                continue;
            }

            // create new links
            const va = vec3.fromArray(_va, tile.vertices, poly.vertices[j] * 3);
            const vb = vec3.fromArray(_vb, tile.vertices, poly.vertices[(j + 1) % nv] * 3);

            // find overlaps against target tile along the opposite side direction
            const overlaps = findConnectingPolys(va, vb, target, oppositeTile(dir));
            for (const o of overlaps) {
                // Parameterize overlap interval along this edge to [0,1]
                let tmin: number;
                let tmax: number;
                if (dir === 0 || dir === 4) {
                    // x portals param by z
                    tmin = (o.umin - va[2]) / (vb[2] - va[2]);
                    tmax = (o.umax - va[2]) / (vb[2] - va[2]);
                } else {
                    // z portals param by x
                    tmin = (o.umin - va[0]) / (vb[0] - va[0]);
                    tmax = (o.umax - va[0]) / (vb[0] - va[0]);
                }
                if (tmin > tmax) {
                    const tmp = tmin;
                    tmin = tmax;
                    tmax = tmp;
                }
                tmin = Math.max(0, Math.min(1, tmin));
                tmax = Math.max(0, Math.min(1, tmax));

                const link: NavMeshLink = {
                    ref: serPolyRef(tile.id, polyId),
                    neighbourRef: o.ref,
                    edge: j,
                    side: dir,
                    bmin: Math.round(tmin * 255),
                    bmax: Math.round(tmax * 255),
                };
                tile.links.push(link);
                poly.links.push(tile.links.length - 1);
            }
        }
    }
};

/**
 * Disconnect external links from tile to target tile
 */
export const disconnectExternalLinks = (tile: NavMeshTile, target: NavMeshTile) => {    
    const targetId = target.id;

    for (let i = 0; i < tile.polys.length; i++) {
        const poly = tile.polys[i];


        // const filteredLinks: number[] = [];

        // for (let k = 0; k < poly.links.length; k++) {
        //     const linkIndex = poly.links[k];
        //     const link = tile.links[linkIndex];

        //     const [linkTileId] = desPolyRef(link.neighbourRef);

        //     if (linkTileId === targetId) {
        //         delete tile.links[linkIndex];
        //     } else {
        //         filteredLinks.push(linkIndex);
        //     }
        // }

        // poly.links = filteredLinks;
    }
};

const getNeighbourTilesAt = (navMesh: NavMesh, x: number, y: number, side: number): NavMeshTile[] => {
    let nx = x;
    let ny = y;

    switch (side) {
        case 0:
            nx++;
            break;
        case 1:
            nx++;
            ny++;
            break;
        case 2:
            ny++;
            break;
        case 3:
            nx--;
            ny++;
            break;
        case 4:
            nx--;
            break;
        case 5:
            nx--;
            ny--;
            break;
        case 6:
            ny--;
            break;
        case 7:
            nx++;
            ny--;
            break;
    }

    return getTilesAt(navMesh, nx, ny);
};

const removeOffMeshConnection = (
    navMesh: NavMesh,
    offMeshConnection: NavMeshOffMeshConnection,
    offMeshConnectionState: NavMeshOffMeshConnectionState,
) => {
    const { startPolyRef, endPolyRef } = offMeshConnectionState;

    const [startPolyTileId, startPolyId] = desPolyRef(startPolyRef);
    const [endPolyTileId, endPolyId] = desPolyRef(endPolyRef);

    const startTile = navMesh.tiles[startPolyTileId];
    const endTile = navMesh.tiles[endPolyTileId];

    // // remove links
    // // for (const linkId in startTile.links) {
    // for (let linkIndex = 0; startTile.links.length > linkIndex; linkIndex++) {
    //     const link = startTile.links[linkId];

    //     if (link.neighbourRef === startPolyRef) {
    //         delete startTile.links[linkId];

    //         const [_linkPolyTileId, linkPolyId] = desPolyRef(link.ref);
    //         const linkPoly = startTile.polys[linkPolyId];

    //         if (linkPoly) {
    //             linkPoly.links = linkPoly.links.filter((l) => l !== linkId);
    //         }
    //     }
    // }

    // for (const linkId in endTile.links) {
    //     const link = endTile.links[linkId];

    //     if (link.neighbourRef === endPolyRef) {
    //         delete endTile.links[linkId];

    //         const [_linkPolyTileId, linkPolyId] = desPolyRef(link.ref);
    //         const linkPoly = endTile.polys[linkPolyId];

    //         if (linkPoly) {
    //             linkPoly.links = linkPoly.links.filter((l) => l !== linkId);
    //         }
    //     }
    // }

    // // remove off mesh connection polys
    // delete startTile.polys[startPolyId];
    // delete endTile.polys[endPolyId];
};

const createOffMeshConnection = (navMesh: NavMesh, id: string, offMeshConnection: NavMeshOffMeshConnection) => {
    // find polys for the start and end positions
    const startTilePolyResult = findNearestPoly(
        createFindNearestPolyResult(),
        navMesh,
        offMeshConnection.start,
        [offMeshConnection.radius, offMeshConnection.radius, offMeshConnection.radius],
        DEFAULT_QUERY_FILTER,
    );
    const endTilePolyResult = findNearestPoly(
        createFindNearestPolyResult(),
        navMesh,
        offMeshConnection.end,
        [offMeshConnection.radius, offMeshConnection.radius, offMeshConnection.radius],
        DEFAULT_QUERY_FILTER,
    );

    // exit if we couldn't find a start or an end poly
    if (!startTilePolyResult.success || !endTilePolyResult.success) {
        return;
    }

    // get start and end tiles
    const startPolyRef = startTilePolyResult.nearestPolyRef;
    const [startPolyTile] = desPolyRef(startPolyRef);
    const startTile = navMesh.tiles[startPolyTile];

    const endPolyRef = endTilePolyResult.nearestPolyRef;
    const [endPolyTile] = desPolyRef(endPolyRef);
    const endTile = navMesh.tiles[endPolyTile];

    // create start off mesh poly
    // const startOffMeshPolyId = String(startTile.polyIdCounter++);
    // const startOffMeshPoly: NavMeshPoly = {
    //     links: [],
    //     vertices: [],
    //     neis: [],
    //     flags: 0xffffff,
    //     area: 0,
    //     type: NavMeshPolyType.OFFMESH_CONNECTION,
    // };

    // startTile.polys[startOffMeshPolyId] = startOffMeshPoly;

    // // create end off mesh poly
    // const endOffMeshPolyId = String(endTile.polyIdCounter++);
    // const endOffMeshPoly: NavMeshPoly = {
    //     links: [],
    //     vertices: [],
    //     neis: [],
    //     flags: 0xffffff,
    //     area: 0,
    //     type: NavMeshPolyType.OFFMESH_CONNECTION,
    // };

    // endTile.polys[endOffMeshPolyId] = endOffMeshPoly;

    // create links for start poly

    // create links for end poly
};

export const updateOffMeshConnections = (navMesh: NavMesh) => {
    for (const id in navMesh.offMeshConnections) {
        const offMeshConnection = navMesh.offMeshConnections[id];
        const offMeshConnectionState = navMesh.offMeshConnectionStates[id];

        let needsUpdate = false;

        if (!offMeshConnectionState) {
            needsUpdate = true;
        } else {
            const { startPolyRef, endPolyRef } = offMeshConnectionState;

            const [startTileId] = desPolyRef(startPolyRef);
            const [endTileId] = desPolyRef(endPolyRef);

            if (!navMesh.tiles[startTileId] || !navMesh.tiles[endTileId]) {
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            const existingState = navMesh.offMeshConnectionStates[id];

            if (existingState) {
                removeOffMeshConnection(navMesh, offMeshConnection, existingState);
            }

            createOffMeshConnection(navMesh, id, offMeshConnection);
        }
    }
};

export const addTile = (navMesh: NavMesh, tile: NavMeshTile) => {
    const tileHash = getTilePositionHash(tile.tileX, tile.tileY, tile.tileLayer);

    // increment id for this tile position
    tile.id = navMesh.tileIdCounter++ + 1;

    // store tile in navmesh
    navMesh.tiles[tile.id] = tile;
    navMesh.tilePositionHashToTileId[tileHash] = tile.id;

    // create internal links within the tile
    createInternalLinks(tile);

    // create connections with neighbour tiles

    // connect with layers in current tile.
    const tilesAtCurrentPosition = getTilesAt(navMesh, tile.tileX, tile.tileY);

    for (const tileAtCurrentPosition of tilesAtCurrentPosition) {
        if (tileAtCurrentPosition.id === tile.id) continue;

        connectExternalLinks(tileAtCurrentPosition, tile, -1);
        connectExternalLinks(tile, tileAtCurrentPosition, -1);
        // connectExtOffMeshLinks(tile, navMeshTile, -1);
        // connectExtOffMeshLinks(navMeshTile, tile, -1);
    }

    // connect with neighbouring tiles
    for (let side = 0; side < 8; side++) {
        const neighbourTiles = getNeighbourTilesAt(navMesh, tile.tileX, tile.tileY, side);

        for (const neighbourTile of neighbourTiles) {
            connectExternalLinks(tile, neighbourTile, side);
            connectExternalLinks(neighbourTile, tile, oppositeTile(side));
            // connectExtOffMeshLinks(navMeshTile, neighbourTile, side);
            // connectExtOffMeshLinks(neighbourTile, navMeshTile, oppositeTile(side));
        }
    }
};

export const removeTile = (navMesh: NavMesh, x: number, y: number, layer: number): boolean => {
    const tileHash = getTilePositionHash(x, y, layer);
    const tileId = navMesh.tilePositionHashToTileId[tileHash];
    const tile = navMesh.tiles[tileId];

    if (!tile) {
        return false;
    }

    // disconnect external links from neighboring tiles

    // disconnect external links with tiles in the same layer
    const tilesAtCurrentPosition = getTilesAt(navMesh, x, y);

    for (const tileAtCurrentPosition of tilesAtCurrentPosition) {
        if (tileAtCurrentPosition.id === tileId) continue;

        disconnectExternalLinks(tileAtCurrentPosition, tile);
        disconnectExternalLinks(tile, tileAtCurrentPosition);
        // disconnectExtOffMeshLinks(tile, navMesh.tiles[tileId]);
        // disconnectExtOffMeshLinks(navMesh.tiles[tileId], tile);
    }

    // disconnect external links with neighbouring tiles
    for (let side = 0; side < 8; side++) {
        const neighbourTiles = getNeighbourTilesAt(navMesh, x, y, side);

        for (const neighbourTile of neighbourTiles) {
            disconnectExternalLinks(neighbourTile, tile);
            disconnectExternalLinks(tile, neighbourTile);
            // disconnectExtOffMeshLinks(neighbourTile, navMesh.tiles[tileId]);
            // disconnectExtOffMeshLinks(navMesh.tiles[tileId], neighbourTile);
        }
    }

    // remove remaining internal links - they are to be recreated if the tile is re-added
    tile.links = [];

    // remove tile from navmesh
    delete navMesh.tiles[tileId];
    delete navMesh.tilePositionHashToTileId[tileHash];

    return true;
};
