import { WebGPUCanvas } from '@/common/components/webgpu-canvas';
import { type Box3, type Vec3, box3, triangle3, vec2, vec3 } from '@/common/maaths';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { type ThreeEvent, useThree } from '@react-three/fiber';
import { Leva, useControls } from 'leva';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { LineGeometry } from 'three/examples/jsm/Addons.js';
import { Line2 } from 'three/examples/jsm/lines/webgpu/Line2.js';
import { Line2NodeMaterial } from 'three/webgpu';
import {
    BuildContext,
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
import { type NavMesh, type NavMeshOffMeshConnection, OffMeshConnectionDirection, navMesh, navMeshQuery } from './lib/query';
import { createFindNearestPolyResult } from './lib/query/nav-mesh-query';
import {
    createCompactHeightfieldDistancesHelper,
    createCompactHeightfieldRegionsHelper,
    createCompactHeightfieldSolidHelper,
    createHeightfieldHelper,
    createNavMeshBvTreeHelper,
    createNavMeshHelper,
    createNavMeshOffMeshConnectionsHelper,
    createNavMeshPolyHelper,
    createNavMeshPortalsHelper,
    createPointSetHelper,
    createPolyMeshDetailHelper,
    createPolyMeshHelper,
    createRawContoursHelper,
    createSearchNodesHelper,
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

type SoloNavMeshIntermediates = {
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

const SoloNavMesh = () => {
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
        showNavMeshPortals,
    } = useControls('solo-nav-mesh generation options', {
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
        showNavMeshPortals: {
            label: 'Show Nav Mesh Portals',
            value: false,
        },
    });

    const [intermediates, setIntermediates] = useState<SoloNavMeshIntermediates | undefined>();

    const [nav, setNav] = useState<NavMesh | undefined>();

    useEffect(() => {
        console.time('navmesh generation');

        /* 0. define generation parameters */
        const cellSize = 0.15;
        const cellHeight = 0.15;

        const walkableRadiusWorld = 0.1;
        const walkableRadiusVoxels = Math.ceil(walkableRadiusWorld / cellSize);

        const walkableClimbWorld = 0.5;
        const walkableClimbVoxels = Math.ceil(walkableClimbWorld / cellHeight);
        const walkableHeightWorld = 0.25;
        const walkableHeightVoxels = Math.ceil(walkableHeightWorld / cellHeight);
        const walkableSlopeAngleDegrees = 45;

        const borderSize = 4;
        const minRegionArea = 8;
        const mergeRegionArea = 20;

        const maxSimplificationError = 1.3;
        const maxEdgeLength = 12;

        const maxVerticesPerPoly = 5;
        const detailSampleDistance = 6;
        const detailSampleMaxError = 1;

        const ctx = BuildContext.create();

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

        const triAreaIds: Uint8Array = new Uint8Array(indices.length / 3).fill(0);

        markWalkableTriangles(positions, indices, triAreaIds, walkableSlopeAngleDegrees);

        console.timeEnd('mark walkable triangles');

        /* 3. rasterize the triangles to a voxel heightfield */

        console.time('rasterize triangles');

        const bounds = calculateMeshBounds(box3.create(), positions, indices);
        const [heightfieldWidth, heightfieldHeight] = calculateGridSize(vec2.create(), bounds, cellSize);
        const heightfield = createHeightfield(heightfieldWidth, heightfieldHeight, bounds, cellSize, cellHeight);

        rasterizeTriangles(ctx, heightfield, positions, indices, triAreaIds, walkableClimbVoxels);

        console.timeEnd('rasterize triangles');

        /* 4. filter walkable surfaces */

        // Once all geoemtry is rasterized, we do initial pass of filtering to
        // remove unwanted overhangs caused by the conservative rasterization
        // as well as filter spans where the character cannot possibly stand.

        console.time('filter walkable surfaces');

        filterLowHangingWalkableObstacles(heightfield, walkableClimbVoxels);
        filterLedgeSpans(heightfield, walkableHeightVoxels, walkableClimbVoxels);
        filterWalkableLowHeightSpans(heightfield, walkableHeightVoxels);

        console.timeEnd('filter walkable surfaces');

        /* 5. partition walkable surface to simple regions. */

        // Compact the heightfield so that it is faster to handle from now on.
        // This will result more cache coherent data as well as the neighbours
        // between walkable cells will be calculated.

        console.time('build compact heightfield');

        const compactHeightfield = buildCompactHeightfield(walkableHeightVoxels, walkableClimbVoxels, heightfield);

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

        buildRegions(ctx, compactHeightfield, borderSize, minRegionArea, mergeRegionArea);
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

        const polyMeshDetail = buildPolyMeshDetail(ctx, polyMesh, compactHeightfield, detailSampleDistance, detailSampleMaxError);

        console.timeEnd('build detail mesh from contours');

        console.timeEnd('navmesh generation');

        /* store intermediates for debugging */
        const intermediates: SoloNavMeshIntermediates = {
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
                polyEdgeNeighbours: polyMesh.neis,
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
            walkableHeight: walkableHeightWorld,
            walkableRadius: walkableRadiusWorld,
            walkableClimb: walkableClimbWorld,
        };

        const tileResult = createNavMeshTile(navMeshTileParams);

        if (tileResult.tile) {
            navMesh.addTile(nav, tileResult.tile);
        }

        setNav(nav);

        console.log('nav', nav, tileResult.tile);

        const disposables: (() => void)[] = [];

        // testing: find nearest poly
        const nearestPolyResult = navMeshQuery.findNearestPoly(
            navMeshQuery.createFindNearestPolyResult(),
            nav,
            [0, 3.7, 2.5],
            [1, 1, 1],
            navMeshQuery.DEFAULT_QUERY_FILTER,
        );
        console.log('nearestPolyResult', nearestPolyResult);

        const navMeshPolyHelper = createNavMeshPolyHelper(nav, nearestPolyResult.nearestPolyRef, new THREE.Color('red'));
        navMeshPolyHelper.object.position.y += 0.25;
        scene.add(navMeshPolyHelper.object);
        disposables.push(() => {
            navMeshPolyHelper.object.removeFromParent();
            navMeshPolyHelper.dispose();
        });

        // testing: find path
        const startPosition: Vec3 = [-3.9470102457140324, 0.26650271598300623, 4.713808784000584];
        const endPosition: Vec3 = [2.517768839689215, 2.3875615713045564, -2.2006116858522327];

        const startPositionNearestPoly = navMeshQuery.findNearestPoly(
            navMeshQuery.createFindNearestPolyResult(),
            nav,
            startPosition,
            [1, 1, 1],
            navMeshQuery.DEFAULT_QUERY_FILTER,
        );
        const endPositionNearestPoly = navMeshQuery.findNearestPoly(
            navMeshQuery.createFindNearestPolyResult(),
            nav,
            endPosition,
            [1, 1, 1],
            navMeshQuery.DEFAULT_QUERY_FILTER,
        );

        const findPathResult = navMeshQuery.findNodePath(
            nav,
            startPositionNearestPoly.nearestPolyRef,
            endPositionNearestPoly.nearestPolyRef,
            startPosition,
            endPosition,
            navMeshQuery.DEFAULT_QUERY_FILTER,
        );

        console.log(findPathResult);

        for (let i = 0; i < findPathResult.path.length; i++) {
            const poly = findPathResult.path[i];
            const hslColor = new THREE.Color().setHSL(i / findPathResult.path.length, 1, 0.5);
            const polyHelper = createNavMeshPolyHelper(nav, poly, hslColor);
            polyHelper.object.position.y += 0.25;
            scene.add(polyHelper.object);
            disposables.push(() => {
                polyHelper.object.removeFromParent();
                polyHelper.dispose();
            });
        }

        return () => {
            for (const disposable of disposables) {
                disposable();
            }
        };
    }, [scene]);

    // debug view of walkable triangles with area ids based vertex colors
    useEffect(() => {
        if (!intermediates || !showTriangleAreaIds) return;

        const debugObject = createTriangleAreaIdsHelper(intermediates.input, intermediates.triAreaIds);
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

        const debugObject = createCompactHeightfieldSolidHelper(intermediates.compactHeightfield);
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showCompactHeightfieldSolid, intermediates, scene]);

    // debug view of the compact heightfield - distance field
    useEffect(() => {
        if (!intermediates || !showCompactHeightFieldDistances) return;

        const debugObject = createCompactHeightfieldDistancesHelper(intermediates.compactHeightfield);
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showCompactHeightFieldDistances, intermediates, scene]);

    // debug view of the compact heightfield - regions
    useEffect(() => {
        if (!intermediates || !showCompactHeightFieldRegions) return;

        const debugObject = createCompactHeightfieldRegionsHelper(intermediates.compactHeightfield);
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

        const debugObject = createSimplifiedContoursHelper(intermediates.contourSet);
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

        const debugObject = createPolyMeshDetailHelper(intermediates.polyMeshDetail);
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

    // debug view of the nav mesh portals (after nav mesh)
    useEffect(() => {
        if (!nav || !showNavMeshPortals) return;

        const debugObject = createNavMeshPortalsHelper(nav);
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showNavMeshPortals, nav, scene]);

    return (
        <>
            <group ref={group} visible={showMesh} onPointerDown={(e) => console.log(e.point)}>
                {/* <DungeonModel /> */}
                <NavTestModel />
            </group>

            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />

            <OrbitControls />
        </>
    );
};

type TiledNavMeshIntermediates = {
    input: {
        positions: Float32Array;
        indices: Uint32Array;
    };
    inputBounds: Box3;
    triAreaIds: Uint8Array[];
    heightfield: Heightfield[];
    compactHeightfield: CompactHeightfield[];
    contourSet: ContourSet[];
    polyMesh: PolyMesh[];
    polyMeshDetail: PolyMeshDetail[];
};

const TiledNavMesh = () => {
    const scene = useThree((state) => state.scene);
    const group = useRef<THREE.Group>(null!);

    const {
        showMesh,
        showMeshBounds,
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
        showNavMeshPortals,
        showNavMeshOffMeshConnections,
    } = useControls('tiled-nav-mesh generation options', {
        showMesh: {
            label: 'Show Mesh',
            value: true,
        },
        showMeshBounds: {
            label: 'Show Mesh Bounds',
            value: false,
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
        showNavMeshPortals: {
            label: 'Show Nav Mesh Portals',
            value: false,
        },
        showNavMeshOffMeshConnections: {
            label: 'Show Nav Mesh Off-Mesh Connections',
            value: false,
        },
    });

    const [intermediates, setIntermediates] = useState<TiledNavMeshIntermediates | undefined>();

    const [nav, setNav] = useState<NavMesh | undefined>();

    useEffect(() => {
        console.time('navmesh generation');

        const buildTile = (
            positions: ArrayLike<number>,
            indices: ArrayLike<number>,
            tileBounds: Box3,
            cellSize: number,
            cellHeight: number,
            borderSize: number,
            walkableSlopeAngleDegrees: number,
        ) => {
            // Expand the heightfield bounding box by border size to find the extents of geometry we need to build this tile.
            //
            // This is done in order to make sure that the navmesh tiles connect correctly at the borders,
            // and the obstacles close to the border work correctly with the dilation process.
            // No polygons (or contours) will be created on the border area.
            //
            // IMPORTANT!
            //
            //   :''''''''':
            //   : +-----+ :
            //   : |     | :
            //   : |     |<--- tile to build
            //   : |     | :
            //   : +-----+ :<-- geometry needed
            //   :.........:
            //
            // You should use this bounding box to query your input geometry.
            //
            // For example if you build a navmesh for terrain, and want the navmesh tiles to match the terrain tile size
            // you will need to pass in data from neighbour terrain tiles too! In a simple case, just pass in all the 8 neighbours,
            // or use the bounding box below to only pass in a sliver of each of the 8 neighbours.

            /* 1. expand the tile bounds by the border size */
            const expandedTileBounds = structuredClone(tileBounds);

            expandedTileBounds[0][0] -= borderSize * cellSize;
            expandedTileBounds[0][2] -= borderSize * cellSize;

            expandedTileBounds[1][0] += borderSize * cellSize;
            expandedTileBounds[1][2] += borderSize * cellSize;

            /* 2. get triangles overlapping the tile bounds */
            const trianglesInBox: number[] = [];

            const triangle = triangle3.create();

            for (let i = 0; i < indices.length; i += 3) {
                const a = indices[i];
                const b = indices[i + 1];
                const c = indices[i + 2];

                vec3.fromBuffer(triangle[0], positions, a * 3);
                vec3.fromBuffer(triangle[1], positions, b * 3);
                vec3.fromBuffer(triangle[2], positions, c * 3);

                if (box3.intersectsTriangle3(expandedTileBounds, triangle)) {
                    trianglesInBox.push(a, b, c);
                }
            }

            /* 3. mark walkable triangles */
            const triAreaIds: Uint8Array = new Uint8Array(trianglesInBox.length / 3).fill(0);

            markWalkableTriangles(positions, trianglesInBox, triAreaIds, walkableSlopeAngleDegrees);

            /* 4. rasterize the triangles to a voxel heightfield */
            const heightfieldWidth = Math.floor(tileSizeVoxels + borderSize * 2);
            const heightfieldHeight = Math.floor(tileSizeVoxels + borderSize * 2);

            const heightfield = createHeightfield(heightfieldWidth, heightfieldHeight, expandedTileBounds, cellSize, cellHeight);

            rasterizeTriangles(ctx, heightfield, positions, trianglesInBox, triAreaIds, walkableClimbVoxels);

            /* 5. filter walkable surfaces */
            filterLowHangingWalkableObstacles(heightfield, walkableClimbVoxels);
            filterLedgeSpans(heightfield, walkableHeightVoxels, walkableClimbVoxels);
            filterWalkableLowHeightSpans(heightfield, walkableHeightVoxels);

            /* 6. partition walkable surface to simple regions. */
            const compactHeightfield = buildCompactHeightfield(walkableHeightVoxels, walkableClimbVoxels, heightfield);

            /* 7. erode the walkable area by the agent radius / walkable radius */
            erodeWalkableArea(walkableRadiusVoxels, compactHeightfield);

            /* 8. prepare for region partitioning by calculating a distance field along the walkable surface */
            buildDistanceField(compactHeightfield);

            /* 9. partition the walkable surface into simple regions without holes */
            buildRegions(ctx, compactHeightfield, borderSize, minRegionArea, mergeRegionArea);
            // buildRegionsMonotone(compactHeightfield, borderSize, minRegionArea, mergeRegionArea);
            // buildLayerRegions(compactHeightfield, borderSize, minRegionArea);

            /* 10. trace and simplify region contours */
            const contourSet = buildContours(
                compactHeightfield,
                maxSimplificationError,
                maxEdgeLength,
                ContourBuildFlags.CONTOUR_TESS_WALL_EDGES,
            );

            /* 11. build polygons mesh from contours */
            const polyMesh = buildPolyMesh(contourSet, maxVerticesPerPoly);

            for (let polyIndex = 0; polyIndex < polyMesh.nPolys; polyIndex++) {
                if (polyMesh.areas[polyIndex] === WALKABLE_AREA) {
                    polyMesh.areas[polyIndex] = 0;
                }

                if (polyMesh.areas[polyIndex] === 0) {
                    polyMesh.flags[polyIndex] = 1;
                }
            }

            /* 12. create detail mesh which allows to access approximate height on each polygon */
            const polyMeshDetail = buildPolyMeshDetail(
                ctx,
                polyMesh,
                compactHeightfield,
                detailSampleDistance,
                detailSampleMaxError,
            );

            return {
                expandedTileBounds,
                heightfield,
                compactHeightfield,
                contourSet,
                polyMesh,
                polyMeshDetail,
            };
        };

        /* 0. define generation parameters */

        const cellSize = 0.15;
        const cellHeight = 0.15;

        const tileSizeVoxels = 64;
        const tileSizeWorld = tileSizeVoxels * cellSize;

        const walkableRadiusWorld = 0.1;
        const walkableRadiusVoxels = Math.ceil(walkableRadiusWorld / cellSize);

        const walkableClimbWorld = 0.5;
        const walkableClimbVoxels = Math.ceil(walkableClimbWorld / cellHeight);
        const walkableHeightWorld = 0.25;
        const walkableHeightVoxels = Math.ceil(walkableHeightWorld / cellHeight);
        const walkableSlopeAngleDegrees = 45;

        const borderSize = 4;
        const minRegionArea = 8;
        const mergeRegionArea = 20;

        const maxSimplificationError = 1.3;
        const maxEdgeLength = 12;

        const maxVerticesPerPoly = 5;
        const detailSampleDistance = 6;
        const detailSampleMaxError = 1;

        const ctx = BuildContext.create();

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

        /* 2. create a tiled nav mesh */

        const meshBounds = calculateMeshBounds(box3.create(), positions, indices);
        const gridSize = calculateGridSize(vec2.create(), meshBounds, cellSize);

        const nav = navMesh.create();
        nav.tileWidth = tileSizeWorld;
        nav.tileHeight = tileSizeWorld;
        nav.origin = meshBounds[0];

        /* 3. generate tiles */

        const intermediates: TiledNavMeshIntermediates = {
            input: {
                positions,
                indices,
            },
            inputBounds: meshBounds,
            triAreaIds: [],
            heightfield: [],
            compactHeightfield: [],
            contourSet: [],
            polyMesh: [],
            polyMeshDetail: [],
        };

        const nTilesX = Math.floor((gridSize[0] + tileSizeVoxels - 1) / tileSizeVoxels);
        const nTilesY = Math.floor((gridSize[1] + tileSizeVoxels - 1) / tileSizeVoxels);

        for (let tileX = 0; tileX < nTilesX; tileX++) {
            for (let tileY = 0; tileY < nTilesY; tileY++) {
                const tileBounds: Box3 = [
                    [meshBounds[0][0] + tileX * tileSizeWorld, meshBounds[0][1], meshBounds[0][2] + tileY * tileSizeWorld],
                    [
                        meshBounds[0][0] + (tileX + 1) * tileSizeWorld,
                        meshBounds[1][1],
                        meshBounds[0][2] + (tileY + 1) * tileSizeWorld,
                    ],
                ];

                const { polyMesh, polyMeshDetail, heightfield, compactHeightfield, contourSet } = buildTile(
                    positions,
                    indices,
                    tileBounds,
                    cellSize,
                    cellHeight,
                    borderSize,
                    walkableSlopeAngleDegrees,
                );

                intermediates.heightfield.push(heightfield);
                intermediates.compactHeightfield.push(compactHeightfield);
                intermediates.contourSet.push(contourSet);
                intermediates.polyMesh.push(polyMesh);
                intermediates.polyMeshDetail.push(polyMeshDetail);

                const navMeshTileParams: NavMeshTileParams = {
                    bounds: polyMesh.bounds,
                    polyMesh: {
                        vertices: polyMesh.vertices,
                        nVertices: polyMesh.nVertices,
                        polys: polyMesh.polys,
                        polyEdgeNeighbours: polyMesh.neis,
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
                    tileX,
                    tileY,
                    tileLayer: 0,
                    buildBvTree: true,
                    cellSize,
                    cellHeight,
                    walkableHeight: walkableHeightWorld,
                    walkableRadius: walkableRadiusWorld,
                    walkableClimb: walkableClimbWorld,
                };

                const tileResult = createNavMeshTile(navMeshTileParams);

                if (tileResult.tile) {
                    navMesh.addTile(nav, tileResult.tile);
                }
            }
        }

        /* 4. add offmesh connections */
        const offMeshConnections: NavMeshOffMeshConnection[] = [
            {
                start: [-2.4799404316645157, 0.26716880587122915, 4.039628947351325],
                end: [-2.735661224133032, 2.3264200687408447, 0.9084349415865054],
                direction: OffMeshConnectionDirection.START_TO_END,
                radius: 0.5,
                cost: 0,
                area: 0,
                flags: 0xffffff,
            },
        ];

        for (const offMeshConnection of offMeshConnections) {
            navMesh.addOffMeshConnection(nav, offMeshConnection);
        }

        console.timeEnd('navmesh generation');

        setNav(nav);
        setIntermediates(intermediates);

        console.log('nav', nav);

        const disposables: (() => void)[] = [];

        // testing: find nearest poly
        const nearestPolyResult = navMeshQuery.findNearestPoly(
            navMeshQuery.createFindNearestPolyResult(),
            nav,
            [-0.22592914810594739, 3.7884295483375467, 2.1988403851931517],
            [1, 1, 1],
            navMeshQuery.DEFAULT_QUERY_FILTER,
        );
        console.log('nearestPolyResult', nearestPolyResult);

        if (nearestPolyResult.success) {
            const navMeshPolyHelper = createNavMeshPolyHelper(nav, nearestPolyResult.nearestPolyRef, new THREE.Color('red'));
            navMeshPolyHelper.object.position.y += 0.25;
            scene.add(navMeshPolyHelper.object);

            disposables.push(() => {
                scene.remove(navMeshPolyHelper.object);
                navMeshPolyHelper.dispose();
            });
        }

        // testing: find path
        const startPosition: Vec3 = [-3.9470102457140324, 0.26650271598300623, 4.713808784000584];
        const endPosition: Vec3 = [2.5106054275953076, 2.3875614958052864, -2.0952471700431685];

        const startPositionNearestPoly = navMeshQuery.findNearestPoly(
            navMeshQuery.createFindNearestPolyResult(),
            nav,
            startPosition,
            [1, 1, 1],
            navMeshQuery.DEFAULT_QUERY_FILTER,
        );
        const endPositionNearestPoly = navMeshQuery.findNearestPoly(
            navMeshQuery.createFindNearestPolyResult(),
            nav,
            endPosition,
            [1, 1, 1],
            navMeshQuery.DEFAULT_QUERY_FILTER,
        );

        console.log('findNodePath params', {
            nav,
            startPositionNearestPoly,
            endPositionNearestPoly,
            startPosition,
            endPosition,
        });

        const findNodePathResult = navMeshQuery.findNodePath(
            nav,
            startPositionNearestPoly.nearestPolyRef,
            endPositionNearestPoly.nearestPolyRef,
            startPosition,
            endPosition,
            navMeshQuery.DEFAULT_QUERY_FILTER,
        );

        console.log('findNodePathResult', findNodePathResult);

        for (let i = 0; i < findNodePathResult.path.length; i++) {
            const poly = findNodePathResult.path[i];
            const hslColor = new THREE.Color().setHSL(i / findNodePathResult.path.length, 1, 0.5);
            const polyHelper = createNavMeshPolyHelper(nav, poly, hslColor);
            polyHelper.object.position.y += 0.25;
            scene.add(polyHelper.object);

            disposables.push(() => {
                scene.remove(polyHelper.object);
                polyHelper.dispose();
            });
        }

        if (findNodePathResult.intermediates?.nodes) {
            const searchNodesHelper = createSearchNodesHelper(findNodePathResult.intermediates.nodes);
            scene.add(searchNodesHelper.object);

            disposables.push(() => {
                scene.remove(searchNodesHelper.object);
                searchNodesHelper.dispose();
            });
        }

        // testing: find straight path
        const findStraightPathResult = navMeshQuery.findStraightPath(nav, startPosition, endPosition, findNodePathResult.path);

        console.log('findStraightPathResult', findStraightPathResult);

        for (let i = 0; i < findStraightPathResult.path.length; i++) {
            const point = findStraightPathResult.path[i];

            // point
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.1, 16, 16),
                new THREE.MeshBasicMaterial({ color: new THREE.Color('yellow') }),
            );
            mesh.position.set(...point.position);
            scene.add(mesh);

            disposables.push(() => {
                scene.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
            });

            // line from prev to current
            if (i > 0) {
                const prevPoint = findStraightPathResult.path[i - 1];

                const lineGeometry = new LineGeometry();
                lineGeometry.setFromPoints([new THREE.Vector3(...prevPoint.position), new THREE.Vector3(...point.position)]);
                const lineMaterial = new Line2NodeMaterial({
                    color: 'yellow',
                    linewidth: 0.1,
                    worldUnits: true,
                });
                const line = new Line2(lineGeometry, lineMaterial);
                scene.add(line);

                disposables.push(() => {
                    scene.remove(line);
                    lineGeometry.dispose();
                    lineMaterial.dispose();
                });
            }
        }

        // testing: move along surface
        const moveStart = vec3.fromValues(7.998617874675065, 1.9101248566771005, 2.0063896115329314);
        const moveEnd = vec3.fromValues(9.21025357579929, 2.2998759746551514, 2.6880702982290465);

        const moveStartNearestPoly = navMeshQuery.findNearestPoly(
            navMeshQuery.createFindNearestPolyResult(),
            nav,
            moveStart,
            [1, 1, 1],
            navMeshQuery.DEFAULT_QUERY_FILTER,
        );

        if (moveStartNearestPoly.success) {
            const moveAlongSurfaceResult = navMeshQuery.moveAlongSurface(
                nav,
                moveStartNearestPoly.nearestPolyRef,
                moveStart,
                moveEnd,
                navMeshQuery.DEFAULT_QUERY_FILTER,
            );

            console.log('moveAlongSurfaceResult', moveAlongSurfaceResult);

            if (moveAlongSurfaceResult.success) {
                // Visualize the start position
                const startMesh = new THREE.Mesh(
                    new THREE.SphereGeometry(0.1, 16, 16),
                    new THREE.MeshBasicMaterial({ color: new THREE.Color('green') }),
                );
                startMesh.position.fromArray(moveStart);
                scene.add(startMesh);

                disposables.push(() => {
                    scene.remove(startMesh);
                    startMesh.geometry.dispose();
                    startMesh.material.dispose();
                });

                // Visualize the target end position
                const targetMesh = new THREE.Mesh(
                    new THREE.SphereGeometry(0.1, 16, 16),
                    new THREE.MeshBasicMaterial({ color: new THREE.Color('red') }),
                );
                targetMesh.position.fromArray(moveEnd);
                scene.add(targetMesh);

                disposables.push(() => {
                    scene.remove(targetMesh);
                    targetMesh.geometry.dispose();
                    targetMesh.material.dispose();
                });

                // Visualize the result position
                const resultMesh = new THREE.Mesh(
                    new THREE.SphereGeometry(0.15, 16, 16),
                    new THREE.MeshBasicMaterial({ color: new THREE.Color('cyan') }),
                );
                resultMesh.position.fromArray(moveAlongSurfaceResult.resultPosition);
                scene.add(resultMesh);

                disposables.push(() => {
                    scene.remove(resultMesh);
                    resultMesh.geometry.dispose();
                    resultMesh.material.dispose();
                });

                // Visualize the path from start to result
                const lineGeometry = new LineGeometry();
                lineGeometry.setFromPoints([
                    new THREE.Vector3(...moveStart),
                    new THREE.Vector3(...moveAlongSurfaceResult.resultPosition),
                ]);
                const lineMaterial = new Line2NodeMaterial({
                    color: 'cyan',
                    linewidth: 0.15,
                    worldUnits: true,
                });
                const line = new Line2(lineGeometry, lineMaterial);
                scene.add(line);

                disposables.push(() => {
                    scene.remove(line);
                    lineGeometry.dispose();
                    lineMaterial.dispose();
                });

                // Visualize the intended direction line (start to target)
                const directionLineGeometry = new LineGeometry();
                directionLineGeometry.setFromPoints([new THREE.Vector3(...moveStart), new THREE.Vector3(...moveEnd)]);
                const directionLineMaterial = new Line2NodeMaterial({
                    color: 'red',
                    linewidth: 0.1,
                    worldUnits: true,
                });
                const directionLine = new Line2(directionLineGeometry, directionLineMaterial);
                scene.add(directionLine);

                disposables.push(() => {
                    scene.remove(directionLine);
                    directionLineGeometry.dispose();
                    directionLineMaterial.dispose();
                });

                // Visualize the visited polygons
                for (let i = 0; i < moveAlongSurfaceResult.visited.length; i++) {
                    const poly = moveAlongSurfaceResult.visited[i];
                    const hslColor = new THREE.Color().setHSL(0.5, 0.8, 0.3 + (i / moveAlongSurfaceResult.visited.length) * 0.4);
                    const polyHelper = createNavMeshPolyHelper(nav, poly, hslColor);
                    polyHelper.object.position.y += 0.3;
                    scene.add(polyHelper.object);

                    disposables.push(() => {
                        scene.remove(polyHelper.object);
                        polyHelper.dispose();
                    });
                }
            }
        }

        // testing: raycast
        const raycastStart = vec3.fromValues(-0.6369757983243722, 0.2670287934145126, 4.9034711243234055);
        const raycastEnd = vec3.fromValues(0.5382623335427014, 0.26749792728632293, 3.5854695302398483);

        const raycastStartNearestPoly = navMeshQuery.findNearestPoly(
            navMeshQuery.createFindNearestPolyResult(),
            nav,
            raycastStart,
            [1, 1, 1],
            navMeshQuery.DEFAULT_QUERY_FILTER,
        );

        if (raycastStartNearestPoly.success) {
            const raycastResult = navMeshQuery.raycast(
                nav,
                raycastStartNearestPoly.nearestPolyRef,
                raycastStart,
                raycastEnd,
                navMeshQuery.DEFAULT_QUERY_FILTER,
            );

            console.log('raycastHit', raycastResult);

            // Visualize the raycast start position
            const rayStartMesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.08, 16, 16),
                new THREE.MeshBasicMaterial({ color: new THREE.Color('orange') }),
            );
            rayStartMesh.position.fromArray(raycastStart);
            rayStartMesh.position.y += 0.5;
            scene.add(rayStartMesh);

            disposables.push(() => {
                scene.remove(rayStartMesh);
                rayStartMesh.geometry.dispose();
                rayStartMesh.material.dispose();
            });

            // Visualize the raycast target end position
            const rayTargetMesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.08, 16, 16),
                new THREE.MeshBasicMaterial({ color: new THREE.Color('purple') }),
            );
            rayTargetMesh.position.fromArray(raycastEnd);
            rayTargetMesh.position.y += 0.5;
            scene.add(rayTargetMesh);

            disposables.push(() => {
                scene.remove(rayTargetMesh);
                rayTargetMesh.geometry.dispose();
                rayTargetMesh.material.dispose();
            });

            // Calculate hit position
            let hitPos: Vec3;
            if (raycastResult.t === Number.MAX_VALUE) {
                // Ray reached the end without hitting a wall
                hitPos = raycastEnd;
            } else {
                // Ray hit a wall at parameter t
                hitPos = vec3.create();
                vec3.lerp(hitPos, raycastStart, raycastEnd, raycastResult.t);
            }

            // Visualize the hit position
            const hitMesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.12, 16, 16),
                new THREE.MeshBasicMaterial({ color: new THREE.Color('blue') }),
            );
            hitMesh.position.fromArray(hitPos);
            hitMesh.position.y += 0.5;
            scene.add(hitMesh);

            disposables.push(() => {
                scene.remove(hitMesh);
                hitMesh.geometry.dispose();
                hitMesh.material.dispose();
            });

            // Visualize the raycast path
            const rayLineGeometry = new LineGeometry();
            rayLineGeometry.setFromPoints([new THREE.Vector3(...raycastStart), new THREE.Vector3(...hitPos)]);
            const rayLineMaterial = new Line2NodeMaterial({
                color: 'magenta',
                linewidth: 0.12,
                worldUnits: true,
            });
            const rayLine = new Line2(rayLineGeometry, rayLineMaterial);
            rayLine.position.y += 0.5;
            scene.add(rayLine);

            disposables.push(() => {
                scene.remove(rayLine);
                rayLineGeometry.dispose();
                rayLineMaterial.dispose();
            });

            // Visualize the intended ray direction (dashed line if hit a wall)
            if (raycastResult.t < Number.MAX_VALUE) {
                const intendedRayLineGeometry = new LineGeometry();
                intendedRayLineGeometry.setFromPoints([new THREE.Vector3(...raycastStart), new THREE.Vector3(...raycastEnd)]);
                const intendedRayLineMaterial = new Line2NodeMaterial({
                    color: 'purple',
                    linewidth: 0.08,
                    worldUnits: true,
                    dashed: true,
                    dashSize: 0.1,
                    gapSize: 0.05,
                });
                const intendedRayLine = new Line2(intendedRayLineGeometry, intendedRayLineMaterial);
                intendedRayLine.position.y += 0.5;
                scene.add(intendedRayLine);

                disposables.push(() => {
                    scene.remove(intendedRayLine);
                    intendedRayLineGeometry.dispose();
                    intendedRayLineMaterial.dispose();
                });
            }

            // Visualize hit normal if we hit a wall
            if (raycastResult.t < Number.MAX_VALUE && vec3.length(raycastResult.hitNormal) > 0) {
                const normalEnd = vec3.create();
                vec3.scaleAndAdd(normalEnd, hitPos, raycastResult.hitNormal, 0.5);

                const normalLineGeometry = new LineGeometry();
                normalLineGeometry.setFromPoints([new THREE.Vector3(...hitPos), new THREE.Vector3(...normalEnd)]);
                const normalLineMaterial = new Line2NodeMaterial({
                    color: 'yellow',
                    linewidth: 0.08,
                    worldUnits: true,
                });
                const normalLine = new Line2(normalLineGeometry, normalLineMaterial);
                normalLine.position.y += 0.5;
                scene.add(normalLine);

                disposables.push(() => {
                    scene.remove(normalLine);
                    normalLineGeometry.dispose();
                    normalLineMaterial.dispose();
                });
            }

            // Visualize the visited polygons from raycast
            for (let i = 0; i < raycastResult.path.length; i++) {
                const poly = raycastResult.path[i];
                const hslColor = new THREE.Color().setHSL(0.8, 0.9, 0.4 + (i / raycastResult.path.length) * 0.3);
                const polyHelper = createNavMeshPolyHelper(nav, poly, hslColor);
                polyHelper.object.position.y += 0.35;
                scene.add(polyHelper.object);

                disposables.push(() => {
                    scene.remove(polyHelper.object);
                    polyHelper.dispose();
                });
            }

            // testing: find random point
            const randomPoint = navMeshQuery.findRandomPoint(nav, navMeshQuery.DEFAULT_QUERY_FILTER, Math.random);

            if (randomPoint.success) {
                const point = randomPoint.position;
                const pointMesh = new THREE.Mesh(
                    new THREE.SphereGeometry(0.1, 16, 16),
                    new THREE.MeshBasicMaterial({ color: 'red' })
                );
                pointMesh.position.set(...point);
                scene.add(pointMesh);

                disposables.push(() => {
                    scene.remove(pointMesh);
                    pointMesh.geometry.dispose();
                    pointMesh.material.dispose();
                });
            }

            // testing: find random point around circle
            const randomPointAroundCircleStart = navMeshQuery.findNearestPoly(createFindNearestPolyResult(), nav, [2.60197368685782, 2.7357429300436893, 3.8039709751268105], [1, 1, 1], navMeshQuery.DEFAULT_QUERY_FILTER);
            
            if (randomPointAroundCircleStart.success) {
                const randomPointAroundCircle = navMeshQuery.findRandomPointAroundCircle(nav, randomPointAroundCircleStart.nearestPolyRef, randomPointAroundCircleStart.nearestPoint, 0.2, navMeshQuery.DEFAULT_QUERY_FILTER, Math.random);
    
                if (randomPointAroundCircle.success) {
                    const point = randomPointAroundCircle.position;
                    const pointMesh = new THREE.Mesh(
                        new THREE.SphereGeometry(0.1, 16, 16),
                        new THREE.MeshBasicMaterial({ color: 'blue' })
                    );
                    pointMesh.position.set(...point);
                    scene.add(pointMesh);
    
                    disposables.push(() => {
                        scene.remove(pointMesh);
                        pointMesh.geometry.dispose();
                        pointMesh.material.dispose();
                    });
                }
            }

        }

        return () => {
            for (const dispose of disposables) {
                dispose();
            }
        };
    }, [scene]);

    // debug view of the mesh bounds
    useEffect(() => {
        if (!intermediates || !showMeshBounds) return;

        // intermediates.inputBounds
        const min = intermediates.inputBounds[0];
        const max = intermediates.inputBounds[1];

        const box3Helper = new THREE.Box3Helper(
            new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)),
            new THREE.Color('white'),
        );
        scene.add(box3Helper);

        return () => {
            scene.remove(box3Helper);
            box3Helper.dispose();
        };
    }, [showMeshBounds, intermediates, scene]);

    // debug view of walkable triangles with area ids based vertex colors
    useEffect(() => {
        if (!intermediates || !showTriangleAreaIds) return;

        const disposables: (() => void)[] = [];

        for (const triAreaIds of intermediates.triAreaIds) {
            const debugObject = createTriangleAreaIdsHelper(intermediates.input, triAreaIds);
            scene.add(debugObject.object);

            disposables.push(() => {
                scene.remove(debugObject.object);
                debugObject.dispose();
            });
        }

        return () => {
            for (const dispose of disposables) {
                dispose();
            }
        };
    }, [showTriangleAreaIds, intermediates, scene]);

    // debug view of the heightfield
    useEffect(() => {
        if (!intermediates || !showHeightfield) return;

        const disposables: (() => void)[] = [];

        for (const heightfield of intermediates.heightfield) {
            const debugObject = createHeightfieldHelper(heightfield);
            scene.add(debugObject.object);

            disposables.push(() => {
                scene.remove(debugObject.object);
                debugObject.dispose();
            });
        }

        return () => {
            for (const dispose of disposables) {
                dispose();
            }
        };
    }, [showHeightfield, intermediates, scene]);

    // debug view of the compact heightfield - solid view
    useEffect(() => {
        if (!intermediates || !showCompactHeightfieldSolid) return;

        const disposables: (() => void)[] = [];

        for (const compactHeightfield of intermediates.compactHeightfield) {
            const debugObject = createCompactHeightfieldSolidHelper(compactHeightfield);
            scene.add(debugObject.object);

            disposables.push(() => {
                scene.remove(debugObject.object);
                debugObject.dispose();
            });
        }

        return () => {
            for (const dispose of disposables) {
                dispose();
            }
        };
    }, [showCompactHeightfieldSolid, intermediates, scene]);

    // debug view of the compact heightfield - distance field
    useEffect(() => {
        if (!intermediates || !showCompactHeightFieldDistances) return;

        const disposables: (() => void)[] = [];

        for (const compactHeightfield of intermediates.compactHeightfield) {
            const debugObject = createCompactHeightfieldDistancesHelper(compactHeightfield);
            scene.add(debugObject.object);

            disposables.push(() => {
                scene.remove(debugObject.object);
                debugObject.dispose();
            });
        }

        return () => {
            for (const dispose of disposables) {
                dispose();
            }
        };
    }, [showCompactHeightFieldDistances, intermediates, scene]);

    // debug view of the compact heightfield - regions
    useEffect(() => {
        if (!intermediates || !showCompactHeightFieldRegions) return;

        const disposables: (() => void)[] = [];

        for (const compactHeightfield of intermediates.compactHeightfield) {
            const debugObject = createCompactHeightfieldRegionsHelper(compactHeightfield);
            scene.add(debugObject.object);

            disposables.push(() => {
                scene.remove(debugObject.object);
                debugObject.dispose();
            });
        }

        return () => {
            for (const dispose of disposables) {
                dispose();
            }
        };
    }, [showCompactHeightFieldRegions, intermediates, scene]);

    // debug view of the raw contours
    useEffect(() => {
        if (!intermediates || !showRawContours) return;

        const disposables: (() => void)[] = [];

        for (const contourSet of intermediates.contourSet) {
            const debugObject = createRawContoursHelper(contourSet);
            scene.add(debugObject.object);

            disposables.push(() => {
                scene.remove(debugObject.object);
                debugObject.dispose();
            });
        }
        return () => {
            for (const dispose of disposables) {
                dispose();
            }
        };
    }, [showRawContours, intermediates, scene]);

    // debug view of the simplified contours
    useEffect(() => {
        if (!intermediates || !showSimplifiedContours) return;

        const disposables: (() => void)[] = [];

        for (const contourSet of intermediates.contourSet) {
            const debugObject = createSimplifiedContoursHelper(contourSet);
            scene.add(debugObject.object);

            disposables.push(() => {
                scene.remove(debugObject.object);
                debugObject.dispose();
            });
        }

        return () => {
            for (const dispose of disposables) {
                dispose();
            }
        };
    }, [showSimplifiedContours, intermediates, scene]);

    // debug view of the poly mesh
    useEffect(() => {
        if (!intermediates || !showPolyMesh) return;

        const disposables: (() => void)[] = [];

        for (const polyMesh of intermediates.polyMesh) {
            const debugObject = createPolyMeshHelper(polyMesh);
            scene.add(debugObject.object);

            disposables.push(() => {
                scene.remove(debugObject.object);
                debugObject.dispose();
            });
        }

        return () => {
            for (const dispose of disposables) {
                dispose();
            }
        };
    }, [showPolyMesh, intermediates, scene]);

    // debug view of the poly mesh detail
    useEffect(() => {
        if (!intermediates || !showPolyMeshDetail) return;

        const disposables: (() => void)[] = [];

        for (const polyMeshDetail of intermediates.polyMeshDetail) {
            const debugObject = createPolyMeshDetailHelper(polyMeshDetail);
            scene.add(debugObject.object);

            disposables.push(() => {
                scene.remove(debugObject.object);
                debugObject.dispose();
            });
        }

        return () => {
            for (const dispose of disposables) {
                dispose();
            }
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

    // debug view of the nav mesh portals
    useEffect(() => {
        if (!nav || !showNavMeshPortals) return;

        const debugObject = createNavMeshPortalsHelper(nav);
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showNavMeshPortals, nav, scene]);

    // debug view of the nav mesh off mesh connections
    useEffect(() => {
        if (!nav || !showNavMeshOffMeshConnections) return;

        const debugObject = createNavMeshOffMeshConnectionsHelper(nav);
        scene.add(debugObject.object);

        return () => {
            scene.remove(debugObject.object);
            debugObject.dispose();
        };
    }, [showNavMeshOffMeshConnections, nav, scene]);

    const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
        console.log('point', e.point);

        if (nav) {
            console.log('tile xy', navMesh.worldToTilePosition(vec2.create(), nav, e.point.toArray()));

            console.log(
                'nearest poly',
                navMeshQuery.findNearestPoly(
                    navMeshQuery.createFindNearestPolyResult(),
                    nav,
                    e.point.toArray(),
                    [1, 1, 1],
                    navMeshQuery.DEFAULT_QUERY_FILTER,
                ).nearestPolyRef,
            );
        }
    };

    return (
        <>
            <group ref={group} visible={showMesh} onPointerDown={onPointerDown}>
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

    const { showMesh, showTriangleAreaIds, showHeightfield, showCompactHeightfieldSolid, showPointSet, showTriangleMesh } =
        useControls('heightfield-bpa generation options', {
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

    const [intermediates, setIntermediates] = useState<HeightfieldBPAIntermediates | undefined>();

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
        const walkableHeightVoxels = Math.ceil(walkableHeightWorld / cellHeight);

        const walkableSlopeAngleDegrees = 60;

        const bpaRadius = cellSize * 1.5;

        const ctx = BuildContext.create();

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

        const triAreaIds: Uint8Array = new Uint8Array(indices.length / 3).fill(0);

        markWalkableTriangles(positions, indices, triAreaIds, walkableSlopeAngleDegrees);

        console.timeEnd('mark walkable triangles');

        /* 3. rasterize the triangles to a voxel heightfield */

        console.time('rasterize triangles');

        const bounds = calculateMeshBounds(box3.create(), positions, indices);
        const [heightfieldWidth, heightfieldHeight] = calculateGridSize(vec2.create(), bounds, cellSize);
        const heightfield = createHeightfield(heightfieldWidth, heightfieldHeight, bounds, cellSize, cellHeight);

        rasterizeTriangles(ctx, heightfield, positions, indices, triAreaIds, walkableClimbVoxels);

        console.timeEnd('rasterize triangles');

        /* 4. filter walkable surfaces */

        // Once all geoemtry is rasterized, we do initial pass of filtering to
        // remove unwanted overhangs caused by the conservative rasterization
        // as well as filter spans where the character cannot possibly stand.

        console.time('filter walkable surfaces');

        filterLowHangingWalkableObstacles(heightfield, walkableClimbVoxels);
        filterLedgeSpans(heightfield, walkableHeightVoxels, walkableClimbVoxels);
        filterWalkableLowHeightSpans(heightfield, walkableHeightVoxels);

        console.timeEnd('filter walkable surfaces');

        /* 5. partition walkable surface to simple regions. */

        // Compact the heightfield so that it is faster to handle from now on.
        // This will result more cache coherent data as well as the neighbours
        // between walkable cells will be calculated.

        console.time('build compact heightfield');

        const compactHeightfield = buildCompactHeightfield(walkableHeightVoxels, walkableClimbVoxels, heightfield);

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

        const triangleMesh = pointSetToWalkableTriangleMeshBPA(pointSet, walkableSlopeAngleDegrees, bpaRadius);

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

        const debugObject = createTriangleAreaIdsHelper(intermediates.input, intermediates.triAreaIds);
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

        const debugObject = createCompactHeightfieldSolidHelper(intermediates.compactHeightfield);
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

        const debugObject = createTriangleMeshWithAreasHelper(intermediates.triangleMesh);
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

    const { showMesh, showPointSet, showTriangleMesh, showReducedTriangleMesh } = useControls('raycast-bpa generation options', {
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

    const [intermediates, setIntermediates] = useState<RaycastBPAIntermediates | undefined>();

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

        const bounds = calculateMeshBounds(box3.create(), positions, indices);

        const pointSet = triangleMeshToPointSet(positions, indices, bounds, {
            gridSize: cellSize,
            walkableSlopeAngle: walkableSlopeAngleDegrees,
            walkableHeight,
            maxRayDistance: 1000,
        });

        console.timeEnd('generate walkable points via raycasting');

        /* 3. generate triangle mesh from point set */

        console.time('point set to triangle mesh');

        const triangleMesh = pointSetToWalkableTriangleMeshBPA(pointSet, walkableSlopeAngleDegrees, bpaRadius);

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

        const debugObject = createTriangleMeshWithAreasHelper(intermediates.triangleMesh);
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

        const debugObject = createTriangleMeshWithAreasHelper(intermediates.reducedTriangleMesh);
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
            value: 'tiled-nav-mesh',
            options: {
                'Solo NavMesh': 'solo-nav-mesh',
                'Tiled NavMesh': 'tiled-nav-mesh',
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
                {method === 'solo-nav-mesh' && <SoloNavMesh />}
                {method === 'tiled-nav-mesh' && <TiledNavMesh />}
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
