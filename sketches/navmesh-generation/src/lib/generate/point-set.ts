import { type Box3, type Vec3, vec3, mat3, mat4 } from '@/common/maaths';
import type { CompactHeightfield } from './compact-heightfield';

export type PointSet = {
    /** positions in world space (x, y, z) */
    positions: number[];
    /** area ids corresponding to each position */
    areas: number[];
    /** bounds in world space */
    bounds: Box3;
};

export const compactHeightfieldToPointSet = (
    compactHeightfield: CompactHeightfield,
): PointSet => {
    const pointSet: PointSet = {
        positions: [],
        areas: [],
        bounds: structuredClone(compactHeightfield.bounds),
    };

    const chf = compactHeightfield;
    const cellSize = chf.cellSize;
    const cellHeight = chf.cellHeight;

    // Iterate through all cells in the compact heightfield
    for (let y = 0; y < chf.height; y++) {
        for (let x = 0; x < chf.width; x++) {
            const cellIndex = x + y * chf.width;
            const cell = chf.cells[cellIndex];

            // Iterate through all spans in this cell
            for (let i = 0; i < cell.count; i++) {
                const spanIndex = cell.index + i;
                const span = chf.spans[spanIndex];
                const area = chf.areas[spanIndex];

                // Skip spans with no area (unwalkable)
                if (area === 0) continue;

                // Convert from span space to local space relative to the bounds
                const worldX = x * cellSize + cellSize * 0.5; // Center of cell
                const worldY = (span.y + 1) * cellHeight; // Top of span using Recast convention
                const worldZ = y * cellSize + cellSize * 0.5; // Center of cell

                // Add position (x, y, z) to the point set in world space
                pointSet.positions.push(worldX, worldY, worldZ);
                pointSet.areas.push(area);
            }
        }
    }

    return pointSet;
};

export type TriangleMesh = {
    /** vertex positions in world space [x1, y1, z1, x2, y2, z2, ...] */
    positions: number[];
    /** triangle indices [a1, b1, c1, a2, b2, c2, ...] */
    indices: number[];
    /** area id for each triangle */
    areas: number[];
    /** bounds in world space */
    bounds: Box3;
};

// BPA Types
type MeshPoint = {
    pos: Vec3;
    normal: Vec3;
    used: boolean;
    edges: MeshEdge[];
};

enum EdgeStatus {
    active = 'active',
    inner = 'inner',
    boundary = 'boundary'
}

type MeshEdge = {
    a: MeshPoint;
    b: MeshPoint;
    opposite: MeshPoint;
    center: Vec3;
    prev: MeshEdge | null;
    next: MeshEdge | null;
    status: EdgeStatus;
};

type MeshFace = [MeshPoint, MeshPoint, MeshPoint];

type Cell = MeshPoint[];

type Grid = {
    lower: Vec3;
    upper: Vec3;
    cellSize: number;
    dims: Vec3;
    cells: Cell[];
};

type SeedResult = {
    f: MeshFace;
    ballCenter: Vec3;
};

type PivotResult = {
    p: MeshPoint;
    center: Vec3;
};

type Triangle = {
    a: Vec3;
    b: Vec3;
    c: Vec3;
};

// Helper functions
const getMeshFaceNormal = (face: MeshFace): Vec3 => {
    const ab = vec3.sub(vec3.create(), face[0].pos, face[1].pos);
    const ac = vec3.sub(vec3.create(), face[0].pos, face[2].pos);
    return vec3.normalize(vec3.create(), vec3.cross(vec3.create(), ab, ac));
};

const createGrid = (points: { pos: Vec3; normal: Vec3 }[], radius: number): Grid => {
    const cellSize = radius * 2;
    
    if (points.length === 0) {
        throw new Error('No points provided');
    }
    
    const lower = vec3.clone(points[0].pos);
    const upper = vec3.clone(points[0].pos);
    
    for (const p of points) {
        for (let i = 0; i < 3; i++) {
            lower[i] = Math.min(lower[i], p.pos[i]);
            upper[i] = Math.max(upper[i], p.pos[i]);
        }
    }
    
    const size = vec3.sub(vec3.create(), upper, lower);
    const dims = vec3.fromValues(
        Math.max(Math.ceil(size[0] / cellSize), 1),
        Math.max(Math.ceil(size[1] / cellSize), 1),
        Math.max(Math.ceil(size[2] / cellSize), 1)
    );
    
    const cells: Cell[] = new Array(dims[0] * dims[1] * dims[2]).fill(null).map(() => []);
    
    for (const p of points) {
        const index = getCellIndex(p.pos, lower, dims, cellSize);
        const cellIdx = index[2] * dims[0] * dims[1] + index[1] * dims[0] + index[0];
        cells[cellIdx].push({
            pos: vec3.clone(p.pos),
            normal: vec3.clone(p.normal),
            used: false,
            edges: []
        });
    }
    
    return { lower, upper, cellSize, dims, cells };
};

const getCellIndex = (point: Vec3, lower: Vec3, dims: Vec3, cellSize: number): Vec3 => {
    const temp = vec3.sub(vec3.create(), point, lower);
    vec3.scale(temp, temp, 1 / cellSize);
    
    return vec3.fromValues(
        Math.max(0, Math.min(Math.floor(temp[0]), dims[0] - 1)),
        Math.max(0, Math.min(Math.floor(temp[1]), dims[1] - 1)),
        Math.max(0, Math.min(Math.floor(temp[2]), dims[2] - 1))
    );
};

const getSphericalNeighborhood = (grid: Grid, point: Vec3, ignore: Vec3[]): MeshPoint[] => {
    const result: MeshPoint[] = [];
    const centerIndex = getCellIndex(point, grid.lower, grid.dims, grid.cellSize);
    
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            for (let zOff = -1; zOff <= 1; zOff++) {
                const index = vec3.fromValues(
                    centerIndex[0] + xOff,
                    centerIndex[1] + yOff,
                    centerIndex[2] + zOff
                );
                
                if (index[0] < 0 || index[0] >= grid.dims[0] ||
                    index[1] < 0 || index[1] >= grid.dims[1] ||
                    index[2] < 0 || index[2] >= grid.dims[2]) {
                    continue;
                }
                
                const cellIdx = index[2] * grid.dims[0] * grid.dims[1] + index[1] * grid.dims[0] + index[0];
                const cell = grid.cells[cellIdx];
                
                for (const p of cell) {
                    const distSq = vec3.squaredDistance(p.pos, point);
                    if (distSq < grid.cellSize * grid.cellSize) {
                        const isIgnored = ignore.some(ignorePos => vec3.exactEquals(p.pos, ignorePos));
                        if (!isIgnored) {
                            result.push(p);
                        }
                    }
                }
            }
        }
    }
    
    return result;
};

const computeBallCenter = (face: MeshFace, radius: number): Vec3 | null => {
    const ac = vec3.sub(vec3.create(), face[2].pos, face[0].pos);
    const ab = vec3.sub(vec3.create(), face[1].pos, face[0].pos);
    const abXac = vec3.cross(vec3.create(), ab, ac);
    
    const abXacLengthSq = vec3.squaredLength(abXac);
    if (abXacLengthSq === 0) return null;
    
    const cross1 = vec3.cross(vec3.create(), abXac, ab);
    const cross2 = vec3.cross(vec3.create(), ac, abXac);
    
    vec3.scale(cross1, cross1, vec3.dot(ac, ac));
    vec3.scale(cross2, cross2, vec3.dot(ab, ab));
    
    const toCircumCircleCenter = vec3.add(vec3.create(), cross1, cross2);
    vec3.scale(toCircumCircleCenter, toCircumCircleCenter, 1 / (2 * abXacLengthSq));
    
    const circumCircleCenter = vec3.add(vec3.create(), face[0].pos, toCircumCircleCenter);
    
    const heightSquared = radius * radius - vec3.squaredLength(toCircumCircleCenter);
    if (heightSquared < 0) return null;
    
    const faceNormal = getMeshFaceNormal(face);
    const ballCenter = vec3.scaleAndAdd(vec3.create(), circumCircleCenter, faceNormal, Math.sqrt(heightSquared));
    
    return ballCenter;
};

const ballIsEmpty = (ballCenter: Vec3, points: MeshPoint[], radius: number): boolean => {
    const radiusSq = radius * radius - 1e-4; // epsilon
    return !points.some(p => vec3.squaredDistance(p.pos, ballCenter) < radiusSq);
};

const findSeedTriangle = (grid: Grid, radius: number): SeedResult | null => {
    for (const cell of grid.cells) {
        if (cell.length === 0) continue;
        
        // Only consider unused points
        const unusedPoints = cell.filter(p => !p.used);
        if (unusedPoints.length === 0) continue;
        
        // Compute average normal from unused points
        const avgNormal = vec3.create();
        for (const p of unusedPoints) {
            vec3.add(avgNormal, avgNormal, p.normal);
        }
        vec3.normalize(avgNormal, avgNormal);
        
        for (const p1 of unusedPoints) {
            const neighborhood = getSphericalNeighborhood(grid, p1.pos, [p1.pos])
                .filter(p => !p.used); // Only consider unused neighbors
            
            // Sort by distance
            neighborhood.sort((a, b) => 
                vec3.distance(a.pos, p1.pos) - vec3.distance(b.pos, p1.pos)
            );
            
            for (const p2 of neighborhood) {
                for (const p3 of neighborhood) {
                    if (p2 === p3) continue;
                    
                    const face: MeshFace = [p1, p2, p3];
                    const faceNormal = getMeshFaceNormal(face);
                    
                    if (vec3.dot(faceNormal, avgNormal) < 0) continue;
                    
                    const ballCenter = computeBallCenter(face, radius);
                    if (ballCenter && ballIsEmpty(ballCenter, neighborhood, radius)) {
                        p1.used = true;
                        p2.used = true;
                        p3.used = true;
                        return { f: face, ballCenter };
                    }
                }
            }
        }
    }
    return null;
};

const getActiveEdge = (front: MeshEdge[]): MeshEdge | null => {
    while (front.length > 0) {
        const e = front.pop()!;
        if (e.status === EdgeStatus.active) {
            return e;
        }
    }
    return null;
};

const ballPivot = (e: MeshEdge, grid: Grid, radius: number): PivotResult | null => {
    const m = vec3.scale(vec3.create(), vec3.add(vec3.create(), e.a.pos, e.b.pos), 0.5);
    const oldCenterVec = vec3.normalize(vec3.create(), vec3.sub(vec3.create(), e.center, m));
    const neighborhood = getSphericalNeighborhood(grid, m, [e.a.pos, e.b.pos, e.opposite.pos]);
    
    let smallestAngle = Number.MAX_VALUE;
    let pointWithSmallestAngle: MeshPoint | null = null;
    const centerOfSmallest = vec3.create();
    
    for (const p of neighborhood) {
        const newFaceNormal = getMeshFaceNormal([e.b, e.a, p]);
        
        // Check if normals point in same half-space
        if (vec3.dot(newFaceNormal, p.normal) < 0) continue;
        
        const c = computeBallCenter([e.b, e.a, p], radius);
        if (!c) continue;
        
        // Check if ball center is above triangle
        const newCenterVec = vec3.normalize(vec3.create(), vec3.sub(vec3.create(), c, m));
        const newCenterFaceDot = vec3.dot(newCenterVec, newFaceNormal);
        if (newCenterFaceDot < 0) continue;
        
        // Check for existing inner edges
        let hasInnerEdge = false;
        for (const ee of p.edges) {
            const otherPoint = ee.a === p ? ee.b : ee.a;
            if (ee.status === EdgeStatus.inner && (otherPoint === e.a || otherPoint === e.b)) {
                hasInnerEdge = true;
                break;
            }
        }
        if (hasInnerEdge) continue;
        
        let angle = Math.acos(Math.max(-1, Math.min(1, vec3.dot(oldCenterVec, newCenterVec))));
        const cross = vec3.cross(vec3.create(), newCenterVec, oldCenterVec);
        const edgeDir = vec3.sub(vec3.create(), e.a.pos, e.b.pos);
        if (vec3.dot(cross, edgeDir) < 0) {
            angle += Math.PI;
        }
        
        if (angle < smallestAngle) {
            smallestAngle = angle;
            pointWithSmallestAngle = p;
            vec3.copy(centerOfSmallest, c);
        }
    }
    
    if (smallestAngle !== Number.MAX_VALUE && pointWithSmallestAngle) {
        if (ballIsEmpty(centerOfSmallest, neighborhood, radius)) {
            return { p: pointWithSmallestAngle, center: centerOfSmallest };
        }
    }
    
    return null;
};

const notUsed = (p: MeshPoint): boolean => !p.used;

const onFront = (p: MeshPoint): boolean => {
    return p.edges.some(e => e.status === EdgeStatus.active);
};

const removeEdge = (edge: MeshEdge): void => {
    edge.status = EdgeStatus.inner;
};

const outputTriangle = (face: MeshFace, triangles: Triangle[]): void => {
    triangles.push({
        a: vec3.clone(face[0].pos),
        b: vec3.clone(face[1].pos),
        c: vec3.clone(face[2].pos)
    });
};

const join = (
    e_ij: MeshEdge,
    o_k: MeshPoint,
    o_k_ballCenter: Vec3,
    front: MeshEdge[],
    edges: MeshEdge[]
): [MeshEdge, MeshEdge] => {
    const e_ik: MeshEdge = {
        a: e_ij.a,
        b: o_k,
        opposite: e_ij.b,
        center: vec3.clone(o_k_ballCenter),
        prev: null,
        next: null,
        status: EdgeStatus.active
    };
    
    const e_kj: MeshEdge = {
        a: o_k,
        b: e_ij.b,
        opposite: e_ij.a,
        center: vec3.clone(o_k_ballCenter),
        prev: null,
        next: null,
        status: EdgeStatus.active
    };
    
    edges.push(e_ik, e_kj);
    
    e_ik.next = e_kj;
    e_ik.prev = e_ij.prev;
    if (e_ij.prev) e_ij.prev.next = e_ik;
    e_ij.a.edges.push(e_ik);
    
    e_kj.prev = e_ik;
    e_kj.next = e_ij.next;
    if (e_ij.next) e_ij.next.prev = e_kj;
    e_ij.b.edges.push(e_kj);
    
    o_k.used = true;
    o_k.edges.push(e_ik, e_kj);
    
    front.push(e_ik, e_kj);
    removeEdge(e_ij);
    
    return [e_ik, e_kj];
};

const glue = (a: MeshEdge, b: MeshEdge): void => {
    // case 1
    if (a.next === b && a.prev === b && b.next === a && b.prev === a) {
        removeEdge(a);
        removeEdge(b);
        return;
    }
    
    // case 2
    if (a.next === b && b.prev === a) {
        if (a.prev) a.prev.next = b.next;
        if (b.next) b.next.prev = a.prev;
        removeEdge(a);
        removeEdge(b);
        return;
    }
    
    if (a.prev === b && b.next === a) {
        if (a.next) a.next.prev = b.prev;
        if (b.prev) b.prev.next = a.next;
        removeEdge(a);
        removeEdge(b);
        return;
    }
    
    // case 3/4
    if (a.prev) a.prev.next = b.next;
    if (b.next) b.next.prev = a.prev;
    if (a.next) a.next.prev = b.prev;
    if (b.prev) b.prev.next = a.next;
    removeEdge(a);
    removeEdge(b);
};

const findReverseEdgeOnFront = (edge: MeshEdge): MeshEdge | null => {
    for (const e of edge.a.edges) {
        if (e.a === edge.b) {
            return e;
        }
    }
    return null;
};

const runBPAFromSeed = (
    seedResult: SeedResult,
    grid: Grid,
    radius: number,
    triangles: Triangle[],
    edges: MeshEdge[]
): void => {
    const { f: seed, ballCenter } = seedResult;
    outputTriangle(seed, triangles);
    
    const e0: MeshEdge = {
        a: seed[0], b: seed[1], opposite: seed[2],
        center: vec3.clone(ballCenter),
        prev: null, next: null,
        status: EdgeStatus.active
    };
    
    const e1: MeshEdge = {
        a: seed[1], b: seed[2], opposite: seed[0],
        center: vec3.clone(ballCenter),
        prev: null, next: null,
        status: EdgeStatus.active
    };
    
    const e2: MeshEdge = {
        a: seed[2], b: seed[0], opposite: seed[1],
        center: vec3.clone(ballCenter),
        prev: null, next: null,
        status: EdgeStatus.active
    };
    
    edges.push(e0, e1, e2);
    
    e0.prev = e2; e0.next = e1;
    e1.prev = e0; e1.next = e2;
    e2.prev = e1; e2.next = e0;
    
    seed[0].edges.push(e0, e2);
    seed[1].edges.push(e0, e1);
    seed[2].edges.push(e1, e2);
    
    const front: MeshEdge[] = [e0, e1, e2];
    
    while (true) {
        const e_ij = getActiveEdge(front);
        if (!e_ij) break;
        
        const o_k = ballPivot(e_ij, grid, radius);
        
        if (o_k && (notUsed(o_k.p) || onFront(o_k.p))) {
            outputTriangle([e_ij.a, o_k.p, e_ij.b], triangles);
            const [e_ik, e_kj] = join(e_ij, o_k.p, o_k.center, front, edges);
            
            const e_ki = findReverseEdgeOnFront(e_ik);
            if (e_ki) glue(e_ik, e_ki);
            
            const e_jk = findReverseEdgeOnFront(e_kj);
            if (e_jk) glue(e_kj, e_jk);
        } else {
            e_ij.status = EdgeStatus.boundary;
        }
    }
};

/**
 * Performs the BPA (Ball Pivoting Algorithm) to convert a PointSet into a walkable triangle mesh.
 * Handles multiple disconnected regions by running BPA multiple times.
 */
export const pointSetToWalkableTriangleMeshBPA = (
    pointSet: PointSet,
    walkableSlopeAngle: number,
    radius: number,
): TriangleMesh => {
    // Convert PointSet to points with normals (assuming y-up)
    const points: { pos: Vec3; normal: Vec3 }[] = [];
    for (let i = 0; i < pointSet.positions.length; i += 3) {
        points.push({
            pos: vec3.fromValues(
                pointSet.positions[i],
                pointSet.positions[i + 1],
                pointSet.positions[i + 2]
            ),
            normal: vec3.fromValues(0, 1, 0) // y-up normal
        });
    }
    
    if (points.length === 0) {
        return {
            positions: [],
            indices: [],
            areas: [],
            bounds: pointSet.bounds
        };
    }
    
    const grid = createGrid(points, radius);
    const triangles: Triangle[] = [];
    const edges: MeshEdge[] = [];
    
    // Keep finding new seed triangles and running BPA until no more unused points exist
    while (true) {
        const seedResult = findSeedTriangle(grid, radius);
        if (!seedResult) {
            // No more seed triangles found, we're done
            break;
        }
        
        // Run BPA from this seed to create one connected component
        runBPAFromSeed(seedResult, grid, radius, triangles, edges);
    }
    
    // Convert triangles to flat arrays
    const resultPositions: number[] = [];
    const resultIndices: number[] = [];
    const resultAreas: number[] = [];
    
    // Create a map from position to index
    const positionMap = new Map<string, number>();
    let vertexIndex = 0;
    
    for (const triangle of triangles) {
        const vertices = [triangle.a, triangle.b, triangle.c];
        const triangleIndices: number[] = [];
        
        for (const vertex of vertices) {
            const key = `${vertex[0]},${vertex[1]},${vertex[2]}`;
            let index = positionMap.get(key);
            
            if (index === undefined) {
                index = vertexIndex++;
                positionMap.set(key, index);
                resultPositions.push(vertex[0], vertex[1], vertex[2]);
            }
            
            triangleIndices.push(index);
        }
        
        resultIndices.push(...triangleIndices);
        resultAreas.push(1); // Default area
    }
    
    return {
        positions: resultPositions,
        indices: resultIndices,
        areas: resultAreas,
        bounds: pointSet.bounds
    };
};
