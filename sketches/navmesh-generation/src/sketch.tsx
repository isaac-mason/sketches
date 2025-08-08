import { WebGPUCanvas } from '@/common/components/webgpu-canvas';
import { type Vec3, box3, vec3 } from '@/common/maaths';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Leva, useControls } from 'leva';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
    type CompactHeightfield,
    ContourBuildFlags,
    type ContourSet,
    type Heightfield,
    type NavMeshTileParams,
    type PointSet,
    type PolyMesh,
    type PolyMeshDetail,
    type TriangleMesh,
    WALKABLE_AREA,
    buildCompactHeightfield,
    buildContours,
    buildDistanceField,
    buildPolyMesh,
    buildPolyMeshDetail,
    buildRegions,
    calculateGridSize,
    calculateMeshBounds,
    compactHeightfieldToPointSet,
    createHeightfield,
    createNavMeshTile,
    erodeWalkableArea,
    filterLedgeSpans,
    filterLowHangingWalkableObstacles,
    filterWalkableLowHeightSpans,
    markWalkableTriangles,
    pointSetToWalkableTriangleMeshBPA,
    rasterizeTriangles,
    triangleMeshToPointSet,
} from './lib/generate';
import { type NavMesh, type PolyRef, navMesh, navMeshQuery } from './lib/query';
import {
    DEFAULT_QUERY_FILTER,
    createFindNearestPolyResult,
    findPath,
} from './lib/query/nav-mesh-query';
import {
    createCompactHeightfieldDistancesHelper,
    createCompactHeightfieldRegionsHelper,
    createCompactHeightfieldSolidHelper,
    createHeightfieldHelper,
    createNavMeshBvTreeHelper,
    createNavMeshHelper,
    createNavMeshPolyHelper,
    createPointSetHelper,
    createPolyMeshDetailHelper,
    createPolyMeshHelper,
    createRawContoursHelper,
    createSimplifiedContoursHelper,
    createTriangleAreaIdsHelper,
    createTriangleMeshWithAreasHelper,
    getPositionsAndIndices,
} from './lib/three';

const DungeonModel = () => {
    const gltf = useGLTF('/dungeon.gltf');

    return <primitive object={gltf.scene} />;
};

const NavTestModel = () => {
    const gltf = useGLTF('/nav-test.glb');

    return <primitive object={gltf.scene} />;
};

type RecastLikeIntermediates = {
    input: {
        positions: Float32Array;
        indices: Uint32Array;
    };
    triAreaIds: Uint8Array;
    heightfield: Heightfield;
    compactHeightfield: CompactHeightfield;
    contourSet: ContourSet;
    polyMesh: PolyMesh;
    polyMeshDetail: PolyMeshDetail;
};

const RecastLike = () => {
    const scene = useThree((state) => state.scene);
    const group = useRef<THREE.Group>(null!);

    const {
        showMesh,
        showTriangleAreaIds,
        showHeightfield,
        showCompactHeightfieldSolid,
        showCompactHeightFieldDistances,
        showCompactHeightFieldRegions,
        showRawContours,
        showSimplifiedContours,
        showPolyMesh,
        showPolyMeshDetail,
        showNavMeshBvTree,
        showNavMesh,
    } = useControls('recast-like generation options', {
        showMesh: {
            label: 'Show Mesh',
            value: true,
        },
        showTriangleAreaIds: {
            label: 'Show Triangle Area IDs',
            value: false,
        },
        showHeightfield: {
            label: 'Show Heightfield',
            value: false,
        },
        showCompactHeightfieldSolid: {
            label: 'Show Compact Heightfield Solid',
            value: false,
        },
        showCompactHeightFieldDistances: {
            label: 'Show Compact Heightfield Distances',
            value: false,
        },
        showCompactHeightFieldRegions: {
            label: 'Show Compact Heightfield Regions',
            value: false,
        },
        showRawContours: {
            label: 'Show Raw Contours',
            value: false,
        },
        showSimplifiedContours: {
            label: 'Show Simplified Contours',
            value: false,
        },
        showPolyMesh: {
            label: 'Show Poly Mesh',
            value: false,
        },
        showPolyMeshDetail: {
            label: 'Show Poly Mesh Detail',
            value: true,
        },
        showNavMeshBvTree: {
            label: 'Show Nav Mesh BV Tree',
            value: false,
        },
        showNavMesh: {
            label: 'Show Nav Mesh',
            value: false,
        },
    });

    const [intermediates, setIntermediates] = useState<
        RecastLikeIntermediates | undefined
    >();

    const [nav, setNav] = useState<NavMesh | undefined>();

    useEffect(() => {
        console.time('navmesh generation');

        /* 0. define generation parameters */
        const cellSize = 0.1;
        const cellHeight = 0.1;

        const walkableRadiusWorld = 0.2;
        const walkableRadiusVoxels = Math.ceil(walkableRadiusWorld / cellSize);

        const walkableClimbWorld = 0.5;
        const walkableClimbVoxels = Math.ceil(walkableClimbWorld / cellHeight);
        const walkableHeightWorld = 0.25;
        const walkableHeightVoxels = Math.ceil(
            walkableHeightWorld / cellHeight,
        );

        const borderSize = 4;
        const minRegionArea = 8;
        const mergeRegionArea = 20;

        const maxSimplificationError = 1.3;
        const maxEdgeLength = 12;

        const maxVerticesPerPoly = 5;
        const detailSampleDistance = 6;
        const detailSampleMaxError = 1;

        /* 1. get positions and indices from THREE.Mesh instances in the group */

        console.time('get positions and indices');

        const meshes: THREE.Mesh[] = [];

        group.current.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                meshes.push(child);
            }
        });

        const [positions, indices] = getPositionsAndIndices(meshes);

        console.timeEnd('get positions and indices');

        /* 2. mark walkable triangles */

        console.time('mark walkable triangles');

        const triAreaIds: Uint8Array = new Uint8Array(indices.length / 3).fill(
            0,
        );

        markWalkableTriangles(positions, indices, triAreaIds, 45);

        console.timeEnd('mark walkable triangles');

        /* 3. rasterize the triangles to a voxel heightfield */

        console.time('rasterize triangles');

        const bounds = calculateMeshBounds(positions, indices, box3.create());
        const [heightfieldWidth, heightfieldHeight] = calculateGridSize(
            bounds,
            cellSize,
        );
        const heightfield = createHeightfield(
            heightfieldWidth,
            heightfieldHeight,
            bounds,
            cellSize,
            cellHeight,
        );

        rasterizeTriangles(
            heightfield,
            positions,
            indices,
            triAreaIds,
            walkableClimbVoxels,
        );

        console.timeEnd('rasterize triangles');

        /* 4. filter walkable surfaces */

        // Once all geoemtry is rasterized, we do initial pass of filtering to
        // remove unwanted overhangs caused by the conservative rasterization
        // as well as filter spans where the character cannot possibly stand.

        console.time('filter walkable surfaces');

        filterLowHangingWalkableObstacles(heightfield, walkableClimbVoxels);
        filterLedgeSpans(
            heightfield,
            walkableHeightVoxels,
            walkableClimbVoxels,
        );
        filterWalkableLowHeightSpans(heightfield, walkableHeightVoxels);

        console.timeEnd('filter walkable surfaces');

        /* 5. partition walkable surface to simple regions. */

        // Compact the heightfield so that it is faster to handle from now on.
        // This will result more cache coherent data as well as the neighbours
        // between walkable cells will be calculated.

        console.time('build compact heightfield');

        const compactHeightfield = buildCompactHeightfield(
            walkableHeightVoxels,
            walkableClimbVoxels,
            heightfield,
        );

        console.timeEnd('build compact heightfield');

        /* 6. erode the walkable area by the agent radius / walkable radius */

        console.time('erode walkable area');

        erodeWalkableArea(walkableRadiusVoxels, compactHeightfield);

        console.timeEnd('erode walkable area');

        /* 7. prepare for region partitioning by calculating a distance field along the walkable surface */

        console.time('build compact heightfield distance field');

        buildDistanceField(compactHeightfield);

        console.timeEnd('build compact heightfield distance field');

        /* 8. partition the walkable surface into simple regions without holes */

        console.time('build compact heightfield regions');

        // Partition the heightfield so that we can use simple algorithm later to triangulate the walkable areas.
        // There are 3 partitioning methods, each with some pros and cons:
        // 1) Watershed partitioning
        //   - the classic Recast partitioning
        //   - creates the nicest tessellation
        //   - usually slowest
        //   - partitions the heightfield into nice regions without holes or overlaps
        //   - the are some corner cases where this method creates produces holes and overlaps
        //      - holes may appear when a small obstacles is close to large open area (triangulation can handle this)
        //      - overlaps may occur if you have narrow spiral corridors (i.e stairs), this make triangulation to fail
        //   * generally the best choice if you precompute the navmesh, use this if you have large open areas
        // 2) Monotone partitioning
        //   - fastest
        //   - partitions the heightfield into regions without holes and overlaps (guaranteed)
        //   - creates long thin polygons, which sometimes causes paths with detours
        //   * use this if you want fast navmesh generation
        // 3) Layer partitoining
        //   - quite fast
        //   - partitions the heighfield into non-overlapping regions
        //   - relies on the triangulation code to cope with holes (thus slower than monotone partitioning)
        //   - produces better triangles than monotone partitioning
        //   - does not have the corner cases of watershed partitioning
        //   - can be slow and create a bit ugly tessellation (still better than monotone)
        //     if you have large open areas with small obstacles (not a problem if you use tiles)
        //   * good choice to use for tiled navmesh with medium and small sized tiles

        buildRegions(
            compactHeightfield,
            borderSize,
            minRegionArea,
            mergeRegionArea,
        );
        // buildRegionsMonotone(compactHeightfield, borderSize, minRegionArea, mergeRegionArea);
        // buildLayerRegions(compactHeightfield, borderSize, minRegionArea);

        console.timeEnd('build compact heightfield regions');

        /* 9. trace and simplify region contours */

        console.time('trace and simplify region contours');

        const contourSet = buildContours(
            compactHeightfield,
            maxSimplificationError,
            maxEdgeLength,
            ContourBuildFlags.CONTOUR_TESS_WALL_EDGES,
        );

        console.timeEnd('trace and simplify region contours');

        /* 10. build polygons mesh from contours */

        console.time('build polygons mesh from contours');

        const polyMesh = buildPolyMesh(contourSet, maxVerticesPerPoly);

        for (let polyIndex = 0; polyIndex < polyMesh.nPolys; polyIndex++) {
            if (polyMesh.areas[polyIndex] === WALKABLE_AREA) {
                polyMesh.areas[polyIndex] = 0;
            }

            if (polyMesh.areas[polyIndex] === 0) {
                polyMesh.flags[polyIndex] = 1;
            }
        }

        console.timeEnd('build polygons mesh from contours');

        /* 11. create detail mesh which allows to access approximate height on each polygon */

        console.time('build detail mesh from contours');

        const polyMeshDetail = buildPolyMeshDetail(
            polyMesh,
            compactHeightfield,
            detailSampleDistance,
            detailSampleMaxError,
        );

        console.timeEnd('build detail mesh from contours');

        console.timeEnd('navmesh generation');

        /* store intermediates for debugging */
        const intermediates: RecastLikeIntermediates = {
            input: {
                positions,
                indices,
            },
            triAreaIds,
            heightfield,
            compactHeightfield,
            contourSet,
            polyMesh,
            polyMeshDetail,
        };

        console.log('intermediates', intermediates);

        setIntermediates(intermediates);

        /* create a single tile nav mesh */

        const nav = navMesh.create();
        nav.tileWidth = polyMesh.bounds[1][0] - polyMesh.bounds[0][0];
        nav.tileHeight = polyMesh.bounds[1][2] - polyMesh.bounds[0][2];
        vec3.copy(nav.origin, polyMesh.bounds[0]);

        const navMeshTileParams: NavMeshTileParams = {
            bounds: polyMesh.bounds,
            polyMesh: {
                vertices: polyMesh.vertices,
                nVertices: polyMesh.nVertices,
                polys: polyMesh.polys,
                polyFlags: polyMesh.flags,
                polyAreas: polyMesh.areas,
                nPolys: polyMesh.nPolys,
                maxVerticesPerPoly: polyMesh.maxVerticesPerPoly,
            },
            detailMesh: {
                detailMeshes: polyMeshDetail.meshes,
                detailVertices: polyMeshDetail.vertices,
                detailTriangles: polyMeshDetail.triangles,
                nVertices: polyMeshDetail.nVertices,
                nTriangles: polyMeshDetail.nTriangles,
            },
            userId: 0,
            tileX: 0,
            tileY: 0,
            tileLayer: 0,
            buildBvTree: true,
            cellSize,
            cellHeight,
        };

        const tile = createNavMeshTile(navMeshTileParams);

        navMesh.addTile(nav, tile);

        setNav(nav);

        console.log('nav', nav, tile);

        // testing: find nearest poly
        const nearestPolyResult = navMeshQuery.findNearestPoly(
            createFindNearestPolyResult(),
            nav,
            [0, 3.7, 2.5],
            [1, 1, 1],
            DEFAULT_QUERY_FILTER,
        );
        console.log('nearestPolyResult', nearestPolyResult);

        const navMeshPolyHelper = createNavMeshPolyHelper(
            nav,
            nearestPolyResult.nearestPolyRef,
            new THREE.Color('red'),
        );
        navMeshPolyHelper.object.position.y += 0.25;
        scene.add(navMeshPolyHelper.object);

        // testing: find path
        const startPosition: Vec3 = [
            -3.9470102457140324, 0.26650271598300623, 4.713808784000584,
        ];
        const endPosition: Vec3 = [
            2.517768839689215, 2.3875615713045564, -2.2006116858522327,
        ];

        const startPositionNearestPoly = navMeshQuery.findNearestPoly(
            createFindNearestPolyResult(),
            nav,
            startPosition,
            [1, 1, 1],
            DEFAULT_QUERY_FILTER,
        );
        const endPositionNearestPoly = navMeshQuery.findNearestPoly(
            createFindNearestPolyResult(),
            nav,
            endPosition,
            [1, 1, 1],
            DEFAULT_QUERY_FILTER,
        );

        const findPathResult = navMeshQuery.findPath(
            nav,
            startPositionNearestPoly.nearestPolyRef,
            endPositionNearestPoly.nearestPolyRef,
            startPosition,
            endPosition,
            DEFAULT_QUERY_FILTER,
            256,
        );

        console.log(findPathResult);

        for (const poly of findPathResult.path) {
            const polyHelper = createNavMeshPolyHelper(
                nav,
                poly,
                new THREE.Color('blue'),
            );
            polyHelper.object.position.y += 0.25;
            scene.add(polyHelper.object);
        }
    }, [scene]);

    // debug view of walkable triangles with area ids based vertex colors
    useEffect(() => {
        if (!intermediates || !showTriangleAreaIds) return;

        const debugObject = createTriangleAreaIdsHelper(
            intermediates.input,
            intermediates.triAreaIds,
        );
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showTriangleAreaIds, intermediates, scene]);

    // debug view of the heightfield
    useEffect(() => {
        if (!intermediates || !showHeightfield) return;

        const debugObject = createHeightfieldHelper(intermediates.heightfield);
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showHeightfield, intermediates, scene]);

    // debug view of the compact heightfield - solid view
    useEffect(() => {
        if (!intermediates || !showCompactHeightfieldSolid) return;

        const debugObject = createCompactHeightfieldSolidHelper(
            intermediates.compactHeightfield,
        );
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showCompactHeightfieldSolid, intermediates, scene]);

    // debug view of the compact heightfield - distance field
    useEffect(() => {
        if (!intermediates || !showCompactHeightFieldDistances) return;

        const debugObject = createCompactHeightfieldDistancesHelper(
            intermediates.compactHeightfield,
        );
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showCompactHeightFieldDistances, intermediates, scene]);

    // debug view of the compact heightfield - regions
    useEffect(() => {
        if (!intermediates || !showCompactHeightFieldRegions) return;

        const debugObject = createCompactHeightfieldRegionsHelper(
            intermediates.compactHeightfield,
        );
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showCompactHeightFieldRegions, intermediates, scene]);

    // debug view of the raw contours
    useEffect(() => {
        if (!intermediates || !showRawContours) return;

        const debugObject = createRawContoursHelper(intermediates.contourSet);
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showRawContours, intermediates, scene]);

    // debug view of the simplified contours
    useEffect(() => {
        if (!intermediates || !showSimplifiedContours) return;

        const debugObject = createSimplifiedContoursHelper(
            intermediates.contourSet,
        );
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showSimplifiedContours, intermediates, scene]);

    // debug view of the poly mesh
    useEffect(() => {
        if (!intermediates || !showPolyMesh) return;

        const debugObject = createPolyMeshHelper(intermediates.polyMesh);
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showPolyMesh, intermediates, scene]);

    // debug view of the poly mesh detail
    useEffect(() => {
        if (!intermediates || !showPolyMeshDetail) return;

        const debugObject = createPolyMeshDetailHelper(
            intermediates.polyMeshDetail,
        );
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showPolyMeshDetail, intermediates, scene]);

    // debug view of the nav mesh BV tree
    useEffect(() => {
        if (!nav || !showNavMeshBvTree) return;

        const debugObject = createNavMeshBvTreeHelper(nav);
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showNavMeshBvTree, nav, scene]);

    // debug view of the nav mesh
    useEffect(() => {
        if (!nav || !showNavMesh) return;

        const debugObject = createNavMeshHelper(nav);
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showNavMesh, nav, scene]);

    return (
        <>
            <group
                ref={group}
                visible={showMesh}
                onPointerDown={(e) => console.log(e.point)}
            >
                {/* <DungeonModel /> */}
                <NavTestModel />
            </group>

            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />

            <OrbitControls />
        </>
    );
};

type HeightfieldBPAIntermediates = {
    input: {
        positions: Float32Array;
        indices: Uint32Array;
    };
    triAreaIds: Uint8Array;
    heightfield: Heightfield;
    compactHeightfield: CompactHeightfield;
    pointSet: PointSet;
    triangleMesh: TriangleMesh;
};

const HeightfieldBPA = () => {
    const scene = useThree((state) => state.scene);
    const group = useRef<THREE.Group>(null!);

    const {
        showMesh,
        showTriangleAreaIds,
        showHeightfield,
        showCompactHeightfieldSolid,
        showPointSet,
        showTriangleMesh,
    } = useControls('heightfield-bpa generation options', {
        showMesh: {
            label: 'Show Mesh',
            value: true,
        },
        showTriangleAreaIds: {
            label: 'Show Triangle Area IDs',
            value: false,
        },
        showHeightfield: {
            label: 'Show Heightfield',
            value: false,
        },
        showCompactHeightfieldSolid: {
            label: 'Show Compact Heightfield Solid',
            value: false,
        },
        showPointSet: {
            label: 'Show Point Set',
            value: false,
        },
        showTriangleMesh: {
            label: 'Show Triangle Mesh',
            value: true,
        },
    });

    const [intermediates, setIntermediates] = useState<
        HeightfieldBPAIntermediates | undefined
    >();

    useEffect(() => {
        console.time('navmesh generation');

        /* 0. define generation parameters */
        const cellSize = 1;
        const cellHeight = 0.2;

        const walkableRadiusWorld = 0.1;
        const walkableRadiusVoxels = Math.ceil(walkableRadiusWorld / cellSize);

        const walkableClimbWorld = 1;
        const walkableClimbVoxels = Math.ceil(walkableClimbWorld / cellHeight);
        const walkableHeightWorld = 0.25;
        const walkableHeightVoxels = Math.ceil(
            walkableHeightWorld / cellHeight,
        );

        const walkableSlopeAngleDegrees = 60;

        const bpaRadius = cellSize * 1.5;

        /* 1. get positions and indices from THREE.Mesh instances in the group */

        console.time('get positions and indices');

        const meshes: THREE.Mesh[] = [];

        group.current.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                meshes.push(child);
            }
        });

        const [positions, indices] = getPositionsAndIndices(meshes);

        console.timeEnd('get positions and indices');

        /* 2. mark walkable triangles */

        console.time('mark walkable triangles');

        const triAreaIds: Uint8Array = new Uint8Array(indices.length / 3).fill(
            0,
        );

        markWalkableTriangles(
            positions,
            indices,
            triAreaIds,
            walkableSlopeAngleDegrees,
        );

        console.timeEnd('mark walkable triangles');

        /* 3. rasterize the triangles to a voxel heightfield */

        console.time('rasterize triangles');

        const bounds = calculateMeshBounds(positions, indices, box3.create());
        const [heightfieldWidth, heightfieldHeight] = calculateGridSize(
            bounds,
            cellSize,
        );
        const heightfield = createHeightfield(
            heightfieldWidth,
            heightfieldHeight,
            bounds,
            cellSize,
            cellHeight,
        );

        rasterizeTriangles(
            heightfield,
            positions,
            indices,
            triAreaIds,
            walkableClimbVoxels,
        );

        console.timeEnd('rasterize triangles');

        /* 4. filter walkable surfaces */

        // Once all geoemtry is rasterized, we do initial pass of filtering to
        // remove unwanted overhangs caused by the conservative rasterization
        // as well as filter spans where the character cannot possibly stand.

        console.time('filter walkable surfaces');

        filterLowHangingWalkableObstacles(heightfield, walkableClimbVoxels);
        filterLedgeSpans(
            heightfield,
            walkableHeightVoxels,
            walkableClimbVoxels,
        );
        filterWalkableLowHeightSpans(heightfield, walkableHeightVoxels);

        console.timeEnd('filter walkable surfaces');

        /* 5. partition walkable surface to simple regions. */

        // Compact the heightfield so that it is faster to handle from now on.
        // This will result more cache coherent data as well as the neighbours
        // between walkable cells will be calculated.

        console.time('build compact heightfield');

        const compactHeightfield = buildCompactHeightfield(
            walkableHeightVoxels,
            walkableClimbVoxels,
            heightfield,
        );

        console.timeEnd('build compact heightfield');

        /* 6. erode the walkable area by the agent radius / walkable radius */

        console.time('erode walkable area');

        erodeWalkableArea(walkableRadiusVoxels, compactHeightfield);

        console.timeEnd('erode walkable area');

        /* 7. create point set from compact heightfield */

        console.time('compact heightfield to point set');

        const pointSet = compactHeightfieldToPointSet(compactHeightfield);

        console.timeEnd('compact heightfield to point set');

        /* 8. point set to walkable triangle mesh */

        console.time('point set to triangle mesh');

        const triangleMesh = pointSetToWalkableTriangleMeshBPA(
            pointSet,
            walkableSlopeAngleDegrees,
            bpaRadius,
        );

        console.timeEnd('point set to triangle mesh');

        console.timeEnd('navmesh generation');

        /* store intermediates for debugging */
        const intermediates: HeightfieldBPAIntermediates = {
            input: {
                positions,
                indices,
            },
            triAreaIds,
            heightfield,
            compactHeightfield,
            pointSet,
            triangleMesh,
        };

        console.log('intermediates', intermediates);

        setIntermediates(intermediates);
    }, []);

    // debug view of walkable triangles with area ids based vertex colors
    useEffect(() => {
        if (!intermediates || !showTriangleAreaIds) return;

        const debugObject = createTriangleAreaIdsHelper(
            intermediates.input,
            intermediates.triAreaIds,
        );
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showTriangleAreaIds, intermediates, scene]);

    // debug view of the heightfield
    useEffect(() => {
        if (!intermediates || !showHeightfield) return;

        const debugObject = createHeightfieldHelper(intermediates.heightfield);
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showHeightfield, intermediates, scene]);

    // debug view of the compact heightfield - solid view
    useEffect(() => {
        if (!intermediates || !showCompactHeightfieldSolid) return;

        const debugObject = createCompactHeightfieldSolidHelper(
            intermediates.compactHeightfield,
        );
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showCompactHeightfieldSolid, intermediates, scene]);

    // debug view of the point set
    useEffect(() => {
        if (!intermediates || !showPointSet) return;

        const debugObject = createPointSetHelper(intermediates.pointSet);
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showPointSet, intermediates, scene]);

    // debug view of the triangle mesh
    useEffect(() => {
        if (!intermediates || !showTriangleMesh) return;

        const debugObject = createTriangleMeshWithAreasHelper(
            intermediates.triangleMesh,
        );
        debugObject.object.position.y += 0.01;
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showTriangleMesh, intermediates, scene]);

    return (
        <>
            <group ref={group} visible={showMesh}>
                <DungeonModel />
                {/* <NavTestModel /> */}
            </group>

            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />

            <OrbitControls />
        </>
    );
};

type RaycastBPAIntermediates = {
    input: {
        positions: Float32Array;
        indices: Uint32Array;
    };
    pointSet: PointSet;
    triangleMesh: TriangleMesh;
    reducedTriangleMesh: TriangleMesh;
};

const RaycastBPA = () => {
    const scene = useThree((state) => state.scene);
    const group = useRef<THREE.Group>(null!);

    const {
        showMesh,
        showPointSet,
        showTriangleMesh,
        showReducedTriangleMesh,
    } = useControls('raycast-bpa generation options', {
        showMesh: {
            label: 'Show Mesh',
            value: true,
        },
        showPointSet: {
            label: 'Show Point Set',
            value: true,
        },
        showTriangleMesh: {
            label: 'Show Triangle Mesh',
            value: true,
        },
        showReducedTriangleMesh: {
            label: 'Show Reduced Triangle Mesh',
            value: false,
        },
    });

    const [intermediates, setIntermediates] = useState<
        RaycastBPAIntermediates | undefined
    >();

    useEffect(() => {
        console.time('navmesh generation');

        /* 0. define generation parameters */
        const cellSize = 2;
        const walkableSlopeAngleDegrees = 60;
        const walkableHeight = 2;
        const bpaRadius = cellSize * 1.2;

        /* 1. get positions and indices from THREE.Mesh instances in the group */

        console.time('get positions and indices');

        const meshes: THREE.Mesh[] = [];

        group.current.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                meshes.push(child);
            }
        });

        const [positions, indices] = getPositionsAndIndices(meshes);

        console.timeEnd('get positions and indices');

        /* 2. generate walkable points using raycast-based approach */

        console.time('generate walkable points via raycasting');

        const bounds = calculateMeshBounds(positions, indices, box3.create());

        const pointSet = triangleMeshToPointSet(positions, indices, bounds, {
            gridSize: cellSize,
            walkableSlopeAngle: walkableSlopeAngleDegrees,
            walkableHeight,
            maxRayDistance: 1000,
        });

        console.timeEnd('generate walkable points via raycasting');

        /* 3. generate triangle mesh from point set */

        console.time('point set to triangle mesh');

        const triangleMesh = pointSetToWalkableTriangleMeshBPA(
            pointSet,
            walkableSlopeAngleDegrees,
            bpaRadius,
        );

        console.timeEnd('point set to triangle mesh');

        /* 4. reduce the triangle mesh */

        console.time('reduce triangle mesh');

        // const reducedTriangleMesh = reduceTriangleMesh(triangleMesh);
        const reducedTriangleMesh = triangleMesh;

        console.timeEnd('reduce triangle mesh');

        console.timeEnd('navmesh generation');

        /* store intermediates for debugging */
        const intermediates: RaycastBPAIntermediates = {
            input: {
                positions,
                indices,
            },
            pointSet,
            triangleMesh,
            reducedTriangleMesh,
        };

        console.log('intermediates', intermediates);

        setIntermediates(intermediates);
    }, []);

    // debug view of the point set
    useEffect(() => {
        if (!intermediates || !showPointSet) return;

        const debugObject = createPointSetHelper(intermediates.pointSet);
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showPointSet, intermediates, scene]);

    // debug view of the triangle mesh
    useEffect(() => {
        if (!intermediates || !showTriangleMesh) return;

        const debugObject = createTriangleMeshWithAreasHelper(
            intermediates.triangleMesh,
        );
        debugObject.object.position.y += 0.01;
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showTriangleMesh, intermediates, scene]);

    // debug view of the reduced triangle mesh
    useEffect(() => {
        if (!intermediates || !showReducedTriangleMesh) return;

        const debugObject = createTriangleMeshWithAreasHelper(
            intermediates.reducedTriangleMesh,
        );
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showReducedTriangleMesh, intermediates, scene]);

    return (
        <>
            <group ref={group} visible={showMesh}>
                <DungeonModel />
                {/* <NavTestModel /> */}
            </group>

            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />

            <OrbitControls />
        </>
    );
};

export function Sketch() {
    const { method } = useControls('generation method', {
        method: {
            value: 'recast-like',
            options: {
                'Recast-like': 'recast-like',
                'Heightfield BPA': 'heightfield-bpa',
                'Raycast BPA': 'raycast-bpa',
            },
        },
    });

    console.log('method', method);

    return (
        <>
            <h1>NavMesh Generation</h1>

            <WebGPUCanvas gl={{ antialias: true }}>
                {method === 'recast-like' && <RecastLike />}
                {method === 'heightfield-bpa' && <HeightfieldBPA />}
                {method === 'raycast-bpa' && <RaycastBPA />}
            </WebGPUCanvas>

            <Leva
                collapsed={false}
                theme={{
                    sizes: {
                        rootWidth: '400px',
                        controlWidth: '150px',
                    },
                }}
            />
        </>
    );
}
