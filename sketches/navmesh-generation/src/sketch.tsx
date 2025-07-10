import { WebGPUCanvas } from '@/common/components/webgpu-canvas';
import { box3 } from '@/common/maaths';
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
    type PolyMesh,
    type PolyMeshDetail,
    buildCompactHeightfield,
    buildContours,
    buildDistanceField,
    buildPolyMesh,
    buildPolyMeshDetail,
    buildRegions,
    calculateGridSize,
    calculateMeshBounds,
    createHeightfield,
    erodeWalkableArea,
    filterLedgeSpans,
    filterLowHangingWalkableObstacles,
    filterWalkableLowHeightSpans,
    markWalkableTriangles,
    rasterizeTriangles,
    compactHeightfieldToPointSet,
    type PointSet,
    pointSetToTriangleMesh,
    reduceTriangleMesh,
    type TriangleMesh,
} from './lib/generate';
import {
    createCompactHeightfieldDistancesHelper,
    createCompactHeightfieldRegionsHelper,
    createCompactHeightfieldSolidHelper,
    createHeightfieldHelper,
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
            value: false,
        },
    });

    const [intermediates, setIntermediates] = useState<
        RecastLikeIntermediates | undefined
    >();

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

    return (
        <>
            <group ref={group} visible={showMesh}>
                {/* <DungeonModel /> */}
                <NavTestModel />
            </group>

            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />

            <OrbitControls />
        </>
    );
};

type AltIntermediates = {
    input: {
        positions: Float32Array;
        indices: Uint32Array;
    };
    triAreaIds: Uint8Array;
    heightfield: Heightfield;
    compactHeightfield: CompactHeightfield;
    pointSet: PointSet;
    triangleMesh: TriangleMesh;
    reducedTriangleMesh: TriangleMesh;
};

const Alt = () => {
    const scene = useThree((state) => state.scene);
    const group = useRef<THREE.Group>(null!);

    const {
        showMesh,
        showTriangleAreaIds,
        showHeightfield,
        showCompactHeightfieldSolid,
        showPointSet,
        showTriangleMesh,
        showReducedTriangleMesh,
    } = useControls('alt generation options', {
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
            value: true,
        },
        showTriangleMesh: {
            label: 'Show Triangle Mesh',
            value: true,
        },
        showReducedTriangleMesh: {
            label: 'Show Reduced Triangle Mesh',
            value: true,
        },
    });

    const [intermediates, setIntermediates] = useState<
        AltIntermediates | undefined
    >();

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

        /* 7. generate point set from compact heightfield */

        console.time('generate point set');

        const pointSet = compactHeightfieldToPointSet(compactHeightfield);

        console.timeEnd('generate point set');

        /* 8. generate triangle mesh from point set */

        console.time('point set to triangle mesh');

        const triangleMesh = pointSetToTriangleMesh(pointSet);

        console.timeEnd('point set to triangle mesh');

        /* 9. reduce the triangle mesh */

        console.time('reduce triangle mesh');

        const reducedTriangleMesh = reduceTriangleMesh(triangleMesh);

        console.timeEnd('reduce triangle mesh');

        console.timeEnd('navmesh generation');

        /* store intermediates for debugging */
        const intermediates: AltIntermediates = {
            input: {
                positions,
                indices,
            },
            triAreaIds,
            heightfield,
            compactHeightfield,
            pointSet,
            triangleMesh,
            reducedTriangleMesh,
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
            intermediates.triangleMesh.positions,
            intermediates.triangleMesh.indices,
            intermediates.triAreaIds,
        );
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
            intermediates.reducedTriangleMesh.positions,
            intermediates.reducedTriangleMesh.indices,
            intermediates.triAreaIds,
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
                {/* <DungeonModel /> */}
                <NavTestModel />
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
                alt: 'alt',
            },
        },
    });

    console.log('method', method);

    return (
        <>
            <h1>NavMesh Generation</h1>

            <WebGPUCanvas>
                {method === 'recast-like' && <RecastLike />}
                {method === 'alt' && <Alt />}
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
