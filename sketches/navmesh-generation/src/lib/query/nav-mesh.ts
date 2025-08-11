import { vec3, type Box3, type Vec2, type Vec3 } from '@/common/maaths';
import { POLY_NEIS_FLAG_EXT_LINK, POLY_NEIS_FLAG_EXT_LINK_DIR_MASK } from '../generate';
import { createFindNearestPolyResult, DEFAULT_QUERY_FILTER, findNearestPoly } from './nav-mesh-query';

/** a navigation mesh based on tiles of convex polygons */
export type NavMesh = {
    /** the world space origin of the navigation mesh's tiles */
    origin: Vec3;

    /** the width of each tile along the x axis */
    tileWidth: number;

    /** the height of each tile along the z axis */
    tileHeight: number;

    /** node ref to link indices */
    nodes: Record<NodeRef, number[]>;

    /** global navmesh links pool */
    links: NavMeshLink[];

    /** free link indices */
    freeLinkIndices: number[];

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

    /** states of the off mesh connections */
    offMeshConnectionStates: Record<string, NavMeshOffMeshConnectionState>;
};

export enum NodeType {
    /** the node is a standard ground convex polygon that is part of the surface of the mesh */
    GROUND_POLY = 0,
    /** the node is an off-mesh connection consisting of two vertices */
    OFFMESH_CONNECTION = 1,
}

/** A serialized node reference */
export type NodeRef = GroundPolyNodeRef | OffMeshConnectionNodeRef;
export type GroundPolyNodeRef = `${NodeType.GROUND_POLY},${number},${number}`;
export type OffMeshConnectionNodeRef = `${NodeType.OFFMESH_CONNECTION},${number},${number}`;

/** A deserialised node reference */
export type DeserialisedNodeRef = DeserialisedGroundNodeRef | DeserialisedOffMeshConnectionNodeRef;
export type DeserialisedGroundNodeRef = [nodeType: NodeType.GROUND_POLY, tileId: number, nodeIndex: number];
export type DeserialisedOffMeshConnectionNodeRef = [
    nodeType: NodeType.OFFMESH_CONNECTION,
    offMeshConnectionIndex: number,
    side: OffMeshConnectionSide,
];

export const serOffMeshNodeRef = (offMeshConnectionId: string, side: OffMeshConnectionSide): NodeRef => {
    return `${NodeType.OFFMESH_CONNECTION},${offMeshConnectionId},${side}` as OffMeshConnectionNodeRef;
};

export function serPolyNodeRef(tileId: number, polyIndex: number): NodeRef {
    return `${NodeType.GROUND_POLY},${tileId},${polyIndex}` as NodeRef;
}

export const getNodeRefType = (nodeRef: NodeRef): NodeType => {
    return Number(nodeRef[0]) as NodeType;
};

export const desNodeRef = (nodeRef: NodeRef): DeserialisedNodeRef => {
    return nodeRef.split(',').map(Number) as DeserialisedNodeRef;
};

export type NavMeshPoly = {
    /** the type of the poly */
    type: NodeType;

    /** the indices of the polygon's vertices. vertices are stored in NavMeshTile.vertices */
    vertices: number[];

    /** packed data representing neighbor polygons references and flags for each edge */
    neis: number[];

    /** the user defined flags for this polygon */
    flags: number;

    /** the user defined area id for this polygon */
    area: number;
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
    ref: NodeRef;

    /** neighbour reference. (The neighbor that is linked to.) */
    neighbourRef: NodeRef;

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

export enum OffMeshConnectionSide {
    START = 0,
    END = 1,
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
    /** the flags for the off mesh connection */
    flags: number;
    /** the area id for the off mesh connection */
    area: number;
    /**
     * optional override cost for this connection.
     * if this is provided, the default query filter getCost() will return this value instead of using the distance of the start to end.
     */
    cost?: number;
};

export type NavMeshOffMeshConnectionState = {
    /** the start polygon that the off mesh connection has linked to */
    startPolyRef: NodeRef;
    /** the end polygon that the off mesh connection has linked to */
    endPolyRef: NodeRef;
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

    /** the agent height in world units */
    walkableHeight: number;

    /** the agent radius in world units */
    walkableRadius: number;

    /** the agent maximum traversable ledge (up/down) in world units */
    walkableClimb: number;
};

export const create = (): NavMesh => {
    return {
        origin: [0, 0, 0],
        tileWidth: 0,
        tileHeight: 0,
        links: [],
        nodes: {},
        freeLinkIndices: [],
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

const getTilePositionHash = (x: number, y: number, layer: number): string => {
    return `${x},${y},${layer}`;
};

/**
 * Allocates a link and returns it's index
 */
const allocateLink = (navMesh: NavMesh) => {
    // is there a pooled link we can reuse?
    const freeLinkIndex = navMesh.freeLinkIndices.pop();

    if (freeLinkIndex !== undefined) {
        return freeLinkIndex;
    }

    // create a new link
    const newLink: NavMeshLink = {
        ref: '' as NodeRef,
        neighbourRef: '' as NodeRef,
        edge: 0,
        side: 0,
        bmin: 0,
        bmax: 0,
    };

    navMesh.links.push(newLink);

    return navMesh.links.length - 1;
};

/**
 * Releases a link into the free links pool
 */
const releaseLink = (navMesh: NavMesh, index: number) => {
    navMesh.freeLinkIndices.push(index);
};

const createInternalLinks = (navMesh: NavMesh, tile: NavMeshTile) => {
    // create links between polygons within the tile
    // based on the neighbor information stored in each polygon

    for (let polyIndex = 0; polyIndex < tile.polys.length; polyIndex++) {
        const poly = tile.polys[polyIndex];
        const polyRef = serPolyNodeRef(tile.id, polyIndex);

        for (let edgeIndex = 0; edgeIndex < poly.vertices.length; edgeIndex++) {
            const neiValue = poly.neis[edgeIndex];

            // skip external links and border edges
            if (neiValue === 0 || neiValue & POLY_NEIS_FLAG_EXT_LINK) {
                continue;
            }

            // internal connection - create link
            const neighborPolyIndex = neiValue - 1; // convert back to 0-based indexing

            if (neighborPolyIndex >= 0 && neighborPolyIndex < tile.polys.length) {
                const linkIndex = allocateLink(navMesh);
                const link = navMesh.links[linkIndex];

                link.ref = serPolyNodeRef(tile.id, polyIndex);
                link.neighbourRef = serPolyNodeRef(tile.id, neighborPolyIndex);
                link.edge = edgeIndex; // edge index in current polygon
                link.side = 0xff; // not a boundary link
                link.bmin = 0; // not used for internal links
                link.bmax = 0; // not used for internal links

                navMesh.nodes[polyRef] ??= [];
                navMesh.nodes[polyRef].push(linkIndex);
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
): { ref: NodeRef; umin: number; umax: number }[] => {
    if (!target) return [];
    calcSlabEndPoints(va, vb, _amin, _amax, side); // store u,y
    const apos = getSlabCoord(va, side);

    const results: { ref: NodeRef; umin: number; umax: number }[] = [];

    // iterate target polys & their boundary edges (those marked ext link in that direction)
    for (let i = 0; i < target.polys.length; i++) {
        const poly = target.polys[i];
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
                ref: serPolyNodeRef(target.id, i),
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

const connectExternalLinks = (navMesh: NavMesh, tile: NavMeshTile, target: NavMeshTile, side: number) => {
    // connect border links
    for (let polyIndex = 0; polyIndex < tile.polys.length; polyIndex++) {
        const poly = tile.polys[polyIndex];
        const polyRef = serPolyNodeRef(tile.id, polyIndex);

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
                // parameterize overlap interval along this edge to [0,1]
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

                const linkIndex = allocateLink(navMesh);
                const link = navMesh.links[linkIndex];

                link.ref = serPolyNodeRef(tile.id, polyIndex);
                link.neighbourRef = o.ref;
                link.edge = j;
                link.side = dir;
                link.bmin = Math.round(tmin * 255);
                link.bmax = Math.round(tmax * 255);

                navMesh.nodes[polyRef] ??= [];
                navMesh.nodes[polyRef].push(linkIndex);
            }
        }
    }
};

/**
 * Disconnect external links from tile to target tile
 */
export const disconnectExternalLinks = (navMesh: NavMesh, tile: NavMeshTile, target: NavMeshTile) => {
    const targetId = target.id;

    for (let polyIndex = 0; polyIndex < tile.polys.length; polyIndex++) {
        const poly = tile.polys[polyIndex];
        const polyRef = serPolyNodeRef(tile.id, polyIndex);
        const polyLinks = navMesh.nodes[polyRef];
        if (!polyLinks) continue;

        const filteredLinks: number[] = [];

        for (let k = 0; k < polyLinks.length; k++) {
            const linkIndex = polyLinks[k];
            const link = navMesh.links[linkIndex];

            const [, linkTileId] = desNodeRef(link.neighbourRef);

            if (linkTileId === targetId) {
                releaseLink(navMesh, linkIndex);
            } else {
                filteredLinks.push(linkIndex);
            }
        }

        navMesh.nodes[polyRef] = filteredLinks;
    }
};

const disconnectOffMeshConnection = (navMesh: NavMesh, offMeshConnectionId: string): boolean => {
    const offMeshConnectionStartNodeRef = serOffMeshNodeRef(offMeshConnectionId, OffMeshConnectionSide.START);
    const offMeshConnectionEndNodeRef = serOffMeshNodeRef(offMeshConnectionId, OffMeshConnectionSide.END);

    const offMeshConnectionState = navMesh.offMeshConnectionStates[offMeshConnectionId];

    // the off mesh connection is not connected, return false
    if (!offMeshConnectionState) return false;

    const { startPolyRef, endPolyRef } = offMeshConnectionState;

    // release any links in the start and end polys that reference off mesh connection nodes
    const startPolyLinks = navMesh.nodes[startPolyRef];

    if (startPolyLinks) {
        for (let i = startPolyLinks.length - 1; i >= 0; i--) {
            const linkId = startPolyLinks[i];
            const link = navMesh.links[linkId];
            if (link.neighbourRef === offMeshConnectionStartNodeRef || link.neighbourRef === offMeshConnectionEndNodeRef) {
                releaseLink(navMesh, linkId);
                startPolyLinks.splice(i, 1);
            }
        }
    }

    const endPolyLinks = navMesh.nodes[endPolyRef];

    if (endPolyLinks) {
        for (let i = endPolyLinks.length - 1; i >= 0; i--) {
            const linkId = endPolyLinks[i];
            const link = navMesh.links[linkId];
            if (link.neighbourRef === offMeshConnectionStartNodeRef || link.neighbourRef === offMeshConnectionEndNodeRef) {
                releaseLink(navMesh, linkId);
                endPolyLinks.splice(i, 1);
            }
        }
    }

    // release the off mesh connection nodes links
    const offMeshStartNodeLinks = navMesh.nodes[offMeshConnectionStartNodeRef];

    if (offMeshStartNodeLinks) {
        for (let i = offMeshStartNodeLinks.length - 1; i >= 0; i--) {
            const linkId = offMeshStartNodeLinks[i];
            releaseLink(navMesh, linkId);
        }
    }

    const offMeshEndNodeLinks = navMesh.nodes[offMeshConnectionEndNodeRef];

    if (offMeshEndNodeLinks) {
        for (let i = offMeshEndNodeLinks.length - 1; i >= 0; i--) {
            const linkId = offMeshEndNodeLinks[i];
            releaseLink(navMesh, linkId);
        }
    }

    // remove the off mesh connection nodes
    delete navMesh.nodes[offMeshConnectionStartNodeRef];
    delete navMesh.nodes[offMeshConnectionEndNodeRef];

    // remove the off mesh connection state
    delete navMesh.offMeshConnectionStates[offMeshConnectionId];

    // the off mesh connection was disconnected, return true
    return true;
};

const connectOffMeshConnection = (
    navMesh: NavMesh,
    offMeshConnectionId: string,
    offMeshConnection: NavMeshOffMeshConnection,
): boolean => {
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

    // exit if we couldn't find a start or an end poly, can't connect off mesh connection
    if (!startTilePolyResult.success || !endTilePolyResult.success) {
        return false;
    }

    // get start and end poly nodes
    const startPolyRef = startTilePolyResult.nearestPolyRef;
    const startPolyLinks = navMesh.nodes[startPolyRef];

    const endPolyRef = endTilePolyResult.nearestPolyRef;
    const endPolyLinks = navMesh.nodes[endPolyRef];

    // create a node for the off mesh connection start
    const offMeshStartNodeRef = serOffMeshNodeRef(offMeshConnectionId, OffMeshConnectionSide.START);
    navMesh.nodes[offMeshStartNodeRef] = [];
    const offMeshStartNodeLinks = navMesh.nodes[offMeshStartNodeRef];

    // link the start poly to the off mesh node start
    const startPolyToOffMeshStartLinkIndex = allocateLink(navMesh);
    const startPolyToOffMeshStartLink = navMesh.links[startPolyToOffMeshStartLinkIndex];
    startPolyToOffMeshStartLink.ref = startPolyRef;
    startPolyToOffMeshStartLink.neighbourRef = offMeshStartNodeRef;
    startPolyToOffMeshStartLink.bmin = 0; // not used for offmesh links
    startPolyToOffMeshStartLink.bmax = 0; // not used for offmesh links
    startPolyToOffMeshStartLink.side = 0; // not used for offmesh links
    startPolyToOffMeshStartLink.edge = 0; // not used for offmesh links
    startPolyLinks.push(startPolyToOffMeshStartLinkIndex);

     // link the off mesh start node to the end poly
    const offMeshStartToEndPolyLinkIndex = allocateLink(navMesh);
    const offMeshStartToEndPolyLink = navMesh.links[offMeshStartToEndPolyLinkIndex];
    offMeshStartToEndPolyLink.ref = offMeshStartNodeRef;
    offMeshStartToEndPolyLink.neighbourRef = endPolyRef;
    offMeshStartToEndPolyLink.bmin = 0; // not used for offmesh links
    offMeshStartToEndPolyLink.bmax = 0; // not used for offmesh links
    offMeshStartToEndPolyLink.side = 0; // not used for offmesh links
    offMeshStartToEndPolyLink.edge = 0; // not used for offmesh links
    offMeshStartNodeLinks.push(offMeshStartToEndPolyLinkIndex);

    if (offMeshConnection.direction === OffMeshConnectionDirection.BIDIRECTIONAL) {
        // create a node for the off mesh connection end
        const offMeshEndNodeRef = serOffMeshNodeRef(offMeshConnectionId, OffMeshConnectionSide.END);
        navMesh.nodes[offMeshEndNodeRef] = [];
        const offMeshEndNodeLinks = navMesh.nodes[offMeshEndNodeRef];

        // link the end poly node to the off mesh end node
        const endPolyToOffMeshEndLinkIndex = allocateLink(navMesh);
        const endPolyToOffMeshEndLink = navMesh.links[endPolyToOffMeshEndLinkIndex];
        endPolyToOffMeshEndLink.ref = endPolyRef;
        endPolyToOffMeshEndLink.neighbourRef = offMeshEndNodeRef;
        endPolyToOffMeshEndLink.bmin = 0; // not used for offmesh links
        endPolyToOffMeshEndLink.bmax = 0; // not used for offmesh links
        endPolyToOffMeshEndLink.side = 0; // not used for offmesh links
        endPolyToOffMeshEndLink.edge = 0; // not used for offmesh links
        endPolyLinks.push(endPolyToOffMeshEndLinkIndex);

        // link the off mesh end node to the start poly node
        const offMeshEndToStartPolyLinkIndex = allocateLink(navMesh);
        const offMeshEndToStartPolyLink = navMesh.links[offMeshEndToStartPolyLinkIndex];
        offMeshEndToStartPolyLink.ref = offMeshEndNodeRef;
        offMeshEndToStartPolyLink.neighbourRef = startPolyRef;
        offMeshEndToStartPolyLink.bmin = 0; // not used for offmesh links
        offMeshEndToStartPolyLink.bmax = 0; // not used for offmesh links
        offMeshEndToStartPolyLink.side = 0; // not used for offmesh links
        offMeshEndToStartPolyLink.edge = 0; // not used for offmesh links
        offMeshEndNodeLinks.push(offMeshEndToStartPolyLinkIndex);
    }

    // create off mesh connection state, for quick revalidation of connections when adding and removing tiles
    const offMeshConnectionState: NavMeshOffMeshConnectionState = {
        startPolyRef,
        endPolyRef,
    };
    navMesh.offMeshConnectionStates[offMeshConnectionId] = offMeshConnectionState;

    // connected the off mesh connection, return true
    return true;
};

/**
 * Reconnects an off mesh connection. This must be called if any properties of an off mesh connection are changed, for example the start or end positions.
 * @param navMesh the navmesh
 * @param offMeshConnectionId the ID of the off mesh connection to reconnect
 * @returns whether the off mesh connection was successfully reconnected
 */
export const reconnectOffMeshConnection = (navMesh: NavMesh, offMeshConnectionId: string): boolean => {
    disconnectOffMeshConnection(navMesh, offMeshConnectionId);
    return connectOffMeshConnection(navMesh, offMeshConnectionId, navMesh.offMeshConnections[offMeshConnectionId]);
};

const updateOffMeshConnections = (navMesh: NavMesh) => {
    for (const id in navMesh.offMeshConnections) {
        const connected = isOffMeshConnectionConnected(navMesh, id);

        if (!connected) {
            reconnectOffMeshConnection(navMesh, id);
        }
    }
};

export const addTile = (navMesh: NavMesh, tile: NavMeshTile) => {
    const tileHash = getTilePositionHash(tile.tileX, tile.tileY, tile.tileLayer);

    // increment id for this tile position
    tile.id = ++navMesh.tileIdCounter;

    // store tile in navmesh
    navMesh.tiles[tile.id] = tile;
    navMesh.tilePositionHashToTileId[tileHash] = tile.id;

    // create internal links within the tile
    createInternalLinks(navMesh, tile);

    // connect with layers in current tile.
    const tilesAtCurrentPosition = getTilesAt(navMesh, tile.tileX, tile.tileY);

    for (const tileAtCurrentPosition of tilesAtCurrentPosition) {
        if (tileAtCurrentPosition.id === tile.id) continue;

        connectExternalLinks(navMesh, tileAtCurrentPosition, tile, -1);
        connectExternalLinks(navMesh, tile, tileAtCurrentPosition, -1);
    }

    // connect with neighbouring tiles
    for (let side = 0; side < 8; side++) {
        const neighbourTiles = getNeighbourTilesAt(navMesh, tile.tileX, tile.tileY, side);

        for (const neighbourTile of neighbourTiles) {
            connectExternalLinks(navMesh, tile, neighbourTile, side);
            connectExternalLinks(navMesh, neighbourTile, tile, oppositeTile(side));
        }
    }

    // update off mesh connections
    updateOffMeshConnections(navMesh);
};

/**
 * Removes the tile at the given location
 * @param navMesh the navmesh to remove the tile from
 * @param x the x coordinate of the tile
 * @param y the y coordinate of the tile
 * @param layer the layer of the tile
 * @returns true if the tile was removed, otherwise false
 */
export const removeTile = (navMesh: NavMesh, x: number, y: number, layer: number): boolean => {
    const tileHash = getTilePositionHash(x, y, layer);
    const tileId = navMesh.tilePositionHashToTileId[tileHash];
    const tile = navMesh.tiles[tileId];

    if (!tile) {
        return false;
    }

    // disconnect external links with tiles in the same layer
    const tilesAtCurrentPosition = getTilesAt(navMesh, x, y);

    for (const tileAtCurrentPosition of tilesAtCurrentPosition) {
        if (tileAtCurrentPosition.id === tileId) continue;

        disconnectExternalLinks(navMesh, tileAtCurrentPosition, tile);
        disconnectExternalLinks(navMesh, tile, tileAtCurrentPosition);
    }

    // disconnect external links with neighbouring tiles
    for (let side = 0; side < 8; side++) {
        const neighbourTiles = getNeighbourTilesAt(navMesh, x, y, side);

        for (const neighbourTile of neighbourTiles) {
            disconnectExternalLinks(navMesh, neighbourTile, tile);
            disconnectExternalLinks(navMesh, tile, neighbourTile);
        }
    }

    // release internal links
    for (let polyIndex = 0; polyIndex < tile.polys.length; polyIndex++) {
        const polyRef = serPolyNodeRef(tile.id, polyIndex);

        const polyLinks = navMesh.nodes[polyRef];
        if (!polyLinks) continue;

        for (const link of polyLinks) {
            releaseLink(navMesh, link);
        }

        delete navMesh.nodes[polyRef];
    }

    // remove tile from navmesh
    delete navMesh.tiles[tileId];
    delete navMesh.tilePositionHashToTileId[tileHash];

    // update off mesh connections
    updateOffMeshConnections(navMesh);

    return true;
};

/**
 * Adds a new off mesh connection to the NavMesh, and returns it's ID
 * @param navMesh the navmesh to add the off mesh connection to
 * @param offMeshConnection the off mesh connection to add
 * @returns the ID of the added off mesh connection
 */
export const addOffMeshConnection = (navMesh: NavMesh, offMeshConnection: NavMeshOffMeshConnection): string => {
    const offMeshConnectionId = String(++navMesh.offMeshConnectionIdCounter);

    navMesh.offMeshConnections[offMeshConnectionId] = offMeshConnection;

    connectOffMeshConnection(navMesh, offMeshConnectionId, offMeshConnection);

    return offMeshConnectionId;
};

/**
 * Removes an off mesh connection from the NavMesh
 * @param navMesh the navmesh to remove the off mesh connection from
 * @param offMeshConnectionId the ID of the off mesh connection to remove
 */
export const removeOffMeshConnection = (navMesh: NavMesh, offMeshConnectionId: string): void => {
    const offMeshConnection = navMesh.offMeshConnections[offMeshConnectionId];
    if (!offMeshConnection) return;

    disconnectOffMeshConnection(navMesh, offMeshConnectionId);
    delete navMesh.offMeshConnections[offMeshConnectionId];
};

export const isOffMeshConnectionConnected = (navMesh: NavMesh, offMeshConnectionId: string): boolean => {
    const offMeshConnectionState = navMesh.offMeshConnectionStates[offMeshConnectionId];

    // no off mesh connection state, not connected
    if (!offMeshConnectionState) return false;

    const { startPolyRef, endPolyRef } = offMeshConnectionState;

    const [, startTileId] = desNodeRef(startPolyRef);
    const [, endTileId] = desNodeRef(endPolyRef);

    // is connected if the tile ids are still valid
    return !!navMesh.tiles[startTileId] && !!navMesh.tiles[endTileId];
};
