import { WebGPUCanvas } from '@/common/components/webgpu-canvas';
import { Box3, box3 } from '@/common/maaths';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Leva, useControls } from 'leva';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import { NULL_AREA, WALKABLE_AREA } from './navmesh/area';
import {
    type CompactHeightfield,
    buildCompactHeightfield,
} from './navmesh/compact-heightfield';
import { erodeWalkableArea } from './navmesh/compact-heightfield-area';
import {
    ContourBuildFlags,
    type ContourSet,
    buildContours,
} from './navmesh/contour-set';
import { getPositionsAndIndices } from './navmesh/get-positions-and-indices';
import {
    type Heightfield,
    calculateGridSize,
    createHeightfield,
    filterLedgeSpans,
    filterLowHangingWalkableObstacles,
    filterWalkableLowHeightSpans,
    rasterizeTriangles,
} from './navmesh/heightfield';
import {
    calculateMeshBounds,
    markWalkableTriangles,
} from './navmesh/input-triangle-mesh';
import { MESH_NULL_IDX, type PolyMesh, buildPolyMesh } from './navmesh/poly-mesh';
import {
    type PolyMeshDetail,
    buildPolyMeshDetail,
} from './navmesh/poly-mesh-detail';
import { buildDistanceField, buildRegions } from './navmesh/regions';

type Intermediates = {
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

const DungeonModel = () => {
    const gltf = useGLTF('/dungeon.gltf');

    return <primitive object={gltf.scene} />;
};

const NavTestModel = () => {
    const gltf = useGLTF('/nav-test.glb');

    return <primitive object={gltf.scene} />;
}

const App = () => {
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
    } = useControls({
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
        }
    });

    const [intermediates, setIntermediates] = useState<
        Intermediates | undefined
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

        const maxVerticesPerPoly = 3;
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
        filterWalkableLowHeightSpans(heightfield, walkableClimbVoxels);

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

        buildRegions(
            compactHeightfield,
            borderSize,
            minRegionArea,
            mergeRegionArea,
        );

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
        const intermediates: Intermediates = {
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

        const areaToColor: Record<number, THREE.Color> = {};

        const { input, triAreaIds } = intermediates;

        const geometry = new THREE.BufferGeometry();
        const positions: number[] = [];
        const indices: number[] = [];
        const vertexColors: number[] = [];

        let positionsIndex = 0;
        let indicesIndex = 0;
        let vertexColorsIndex = 0;

        for (
            let triangle = 0;
            triangle < input.indices.length / 3;
            triangle++
        ) {
            const areaId = triAreaIds[triangle];

            let color = areaToColor[areaId];

            if (!color) {
                // hash area id to a color
                color = new THREE.Color(
                    `hsl(${(areaId * 137.5) % 360}, 100%, 50%)`,
                );
                areaToColor[areaId] = color;
            }

            positions[positionsIndex++] =
                input.positions[input.indices[triangle * 3] * 3];
            positions[positionsIndex++] =
                input.positions[input.indices[triangle * 3] * 3 + 1];
            positions[positionsIndex++] =
                input.positions[input.indices[triangle * 3] * 3 + 2];

            positions[positionsIndex++] =
                input.positions[input.indices[triangle * 3 + 1] * 3];
            positions[positionsIndex++] =
                input.positions[input.indices[triangle * 3 + 1] * 3 + 1];
            positions[positionsIndex++] =
                input.positions[input.indices[triangle * 3 + 1] * 3 + 2];

            positions[positionsIndex++] =
                input.positions[input.indices[triangle * 3 + 2] * 3];
            positions[positionsIndex++] =
                input.positions[input.indices[triangle * 3 + 2] * 3 + 1];
            positions[positionsIndex++] =
                input.positions[input.indices[triangle * 3 + 2] * 3 + 2];

            indices[indicesIndex++] = triangle * 3;
            indices[indicesIndex++] = triangle * 3 + 1;
            indices[indicesIndex++] = triangle * 3 + 2;

            const r = color.r;
            const g = color.g;
            const b = color.b;

            vertexColors[vertexColorsIndex++] = r;
            vertexColors[vertexColorsIndex++] = g;
            vertexColors[vertexColorsIndex++] = b;
            vertexColors[vertexColorsIndex++] = r;
            vertexColors[vertexColorsIndex++] = g;
            vertexColors[vertexColorsIndex++] = b;
            vertexColors[vertexColorsIndex++] = r;
            vertexColors[vertexColorsIndex++] = g;
            vertexColors[vertexColorsIndex++] = b;
        }

        geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(positions), 3),
        );
        geometry.setIndex(
            new THREE.BufferAttribute(new Uint32Array(indices), 1),
        );
        geometry.setAttribute(
            'color',
            new THREE.BufferAttribute(new Float32Array(vertexColors), 3),
        );

        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.5,
        });

        const mesh = new THREE.Mesh(geometry, material);

        scene.add(mesh);

        return () => {
            scene.remove(mesh);

            geometry.dispose();
            material.dispose();
        };
    }, [showTriangleAreaIds, intermediates, scene]);

    // debug view of the heightfield
    useEffect(() => {
        if (!intermediates || !showHeightfield) return;

        const { heightfield } = intermediates;
        const areaToColor: Record<number, THREE.Color> = {};

        // Count total spans to determine instance count
        let totalSpans = 0;
        for (let z = 0; z < heightfield.height; z++) {
            for (let x = 0; x < heightfield.width; x++) {
                const columnIndex = x + z * heightfield.width;
                let span = heightfield.spans[columnIndex];
                while (span) {
                    totalSpans++;
                    span = span.next || null;
                }
            }
        }

        if (totalSpans === 0) return;

        // Create instanced mesh
        const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial();
        const instancedMesh = new THREE.InstancedMesh(
            boxGeometry,
            material,
            totalSpans,
        );

        const matrix = new THREE.Matrix4();

        const heightfieldBoundsMin = heightfield.bounds[0];
        const cellSize = heightfield.cellSize;
        const cellHeight = heightfield.cellHeight;

        let instanceIndex = 0;

        // Iterate through all grid cells and their spans
        for (let z = 0; z < heightfield.height; z++) {
            for (let x = 0; x < heightfield.width; x++) {
                const columnIndex = x + z * heightfield.width;
                let span = heightfield.spans[columnIndex];

                while (span) {
                    // Calculate world position
                    const worldX =
                        heightfieldBoundsMin[0] + (x + 0.5) * cellSize;
                    const worldZ =
                        heightfieldBoundsMin[2] + (z + 0.5) * cellSize;

                    // Calculate span height and center Y
                    const spanHeight = (span.max - span.min) * cellHeight;
                    const worldY =
                        heightfieldBoundsMin[1] +
                        (span.min + (span.max - span.min) * 0.5) * cellHeight;

                    // Set transform matrix (position and scale)
                    matrix.makeScale(
                        cellSize * 0.9,
                        spanHeight,
                        cellSize * 0.9,
                    );
                    matrix.setPosition(worldX, worldY, worldZ);
                    instancedMesh.setMatrixAt(instanceIndex, matrix);

                    // Set color based on area ID
                    let spanColor = areaToColor[span.area];
                    if (!spanColor) {
                        // Hash area id to a color
                        spanColor = new THREE.Color(
                            `hsl(${(span.area * 137.5) % 360}, 70%, 60%)`,
                        );
                        areaToColor[span.area] = spanColor;
                    }

                    instancedMesh.setColorAt(instanceIndex, spanColor);

                    instanceIndex++;
                    span = span.next || null;
                }
            }
        }

        // Update the instanced mesh
        instancedMesh.instanceMatrix.needsUpdate = true;
        if (instancedMesh.instanceColor) {
            instancedMesh.instanceColor.needsUpdate = true;
        }

        scene.add(instancedMesh);

        return () => {
            scene.remove(instancedMesh);
            boxGeometry.dispose();
            material.dispose();
            instancedMesh.dispose();
        };
    }, [showHeightfield, intermediates, scene]);

    // debug view of the compact heightfield - solid view
    useEffect(() => {
        if (!intermediates || !showCompactHeightfieldSolid) return;

        const { compactHeightfield } = intermediates;
        const chf = compactHeightfield;

        // Count total quads to create geometry
        let totalQuads = 0;
        for (let y = 0; y < chf.height; y++) {
            for (let x = 0; x < chf.width; x++) {
                const cell = chf.cells[x + y * chf.width];
                totalQuads += cell.count;
            }
        }

        if (totalQuads === 0) return;

        // Create arrays for vertices, indices, and colors
        const positions: number[] = [];
        const indices: number[] = [];
        const colors: number[] = [];

        let indexOffset = 0;

        // Iterate through all cells and their spans
        for (let y = 0; y < chf.height; y++) {
            for (let x = 0; x < chf.width; x++) {
                const fx = chf.bounds[0][0] + x * chf.cellSize; // bmin[0] + x * cs
                const fz = chf.bounds[0][2] + y * chf.cellSize; // bmin[2] + y * cs
                const cell = chf.cells[x + y * chf.width];

                for (let i = cell.index; i < cell.index + cell.count; i++) {
                    const span = chf.spans[i];
                    const area = chf.areas[i];

                    // Determine color based on area
                    let color: THREE.Color;
                    if (area === WALKABLE_AREA) {
                        color = new THREE.Color(0x00c0ff); // RGB(0,192,255)
                    } else if (area === NULL_AREA) {
                        color = new THREE.Color(0x000000); // RGB(0,0,0)
                    } else {
                        // Hash area id to a color for other areas
                        color = new THREE.Color(
                            `hsl(${(area * 137.5) % 360}, 70%, 60%)`,
                        );
                    }

                    // Calculate the top surface Y coordinate - using Recast convention (s.y+1)*ch
                    const fy = chf.bounds[0][1] + (span.y + 1) * chf.cellHeight; // bmin[1] + (s.y+1) * ch

                    // Create quad vertices (top surface of the span)
                    // Vertex 0: (fx, fy, fz)
                    positions.push(fx, fy, fz);
                    colors.push(color.r, color.g, color.b);

                    // Vertex 1: (fx, fy, fz + cs)
                    positions.push(fx, fy, fz + chf.cellSize);
                    colors.push(color.r, color.g, color.b);

                    // Vertex 2: (fx + cs, fy, fz + cs)
                    positions.push(fx + chf.cellSize, fy, fz + chf.cellSize);
                    colors.push(color.r, color.g, color.b);

                    // Vertex 3: (fx + cs, fy, fz)
                    positions.push(fx + chf.cellSize, fy, fz);
                    colors.push(color.r, color.g, color.b);

                    // Create two triangles for the quad
                    // Triangle 1: 0, 1, 2
                    indices.push(indexOffset, indexOffset + 1, indexOffset + 2);
                    // Triangle 2: 0, 2, 3
                    indices.push(indexOffset, indexOffset + 2, indexOffset + 3);

                    indexOffset += 4;
                }
            }
        }

        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(positions), 3),
        );
        geometry.setAttribute(
            'color',
            new THREE.BufferAttribute(new Float32Array(colors), 3),
        );
        geometry.setIndex(
            new THREE.BufferAttribute(new Uint32Array(indices), 1),
        );

        // Create material with vertex colors and transparency
        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        return () => {
            scene.remove(mesh);
            geometry.dispose();
            material.dispose();
        };
    }, [showCompactHeightfieldSolid, intermediates, scene]);

    // debug view of the compact heightfield - distance field
    useEffect(() => {
        if (!intermediates || !showCompactHeightFieldDistances) return;

        const { compactHeightfield } = intermediates;
        const chf = compactHeightfield;

        // Check if distance field is available
        if (!chf.distances) return;

        // Calculate scaling factor for distance visualization
        let maxd = chf.maxDistance;
        if (maxd < 1.0) maxd = 1;
        const dscale = 255.0 / maxd;

        // Count total quads to create geometry
        let totalQuads = 0;
        for (let y = 0; y < chf.height; y++) {
            for (let x = 0; x < chf.width; x++) {
                const cell = chf.cells[x + y * chf.width];
                totalQuads += cell.count;
            }
        }

        if (totalQuads === 0) return;

        // Create arrays for vertices, indices, and colors
        const positions: number[] = [];
        const indices: number[] = [];
        const colors: number[] = [];

        let indexOffset = 0;

        // Iterate through all cells and their spans
        for (let y = 0; y < chf.height; y++) {
            for (let x = 0; x < chf.width; x++) {
                const fx = chf.bounds[0][0] + x * chf.cellSize; // bmin[0] + x * cs
                const fz = chf.bounds[0][2] + y * chf.cellSize; // bmin[2] + y * cs
                const cell = chf.cells[x + y * chf.width];

                for (let i = cell.index; i < cell.index + cell.count; i++) {
                    const span = chf.spans[i];

                    // Calculate the top surface Y coordinate
                    const fy = chf.bounds[0][1] + (span.y + 1) * chf.cellHeight; // bmin[1] + (s.y+1) * ch

                    // Get distance value and scale to 0-255 range
                    const cd =
                        Math.min(255, Math.floor(chf.distances[i] * dscale)) /
                        255.0;

                    // Create grayscale color where higher distances are brighter
                    const color = new THREE.Color(cd, cd, cd);

                    // Create quad vertices (top surface of the span)
                    // Vertex 0: (fx, fy, fz)
                    positions.push(fx, fy, fz);
                    colors.push(color.r, color.g, color.b);

                    // Vertex 1: (fx, fy, fz + cs)
                    positions.push(fx, fy, fz + chf.cellSize);
                    colors.push(color.r, color.g, color.b);

                    // Vertex 2: (fx + cs, fy, fz + cs)
                    positions.push(fx + chf.cellSize, fy, fz + chf.cellSize);
                    colors.push(color.r, color.g, color.b);

                    // Vertex 3: (fx + cs, fy, fz)
                    positions.push(fx + chf.cellSize, fy, fz);
                    colors.push(color.r, color.g, color.b);

                    // Create two triangles for the quad
                    // Triangle 1: 0, 1, 2
                    indices.push(indexOffset, indexOffset + 1, indexOffset + 2);
                    // Triangle 2: 0, 2, 3
                    indices.push(indexOffset, indexOffset + 2, indexOffset + 3);

                    indexOffset += 4;
                }
            }
        }

        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(positions), 3),
        );
        geometry.setAttribute(
            'color',
            new THREE.BufferAttribute(new Float32Array(colors), 3),
        );
        geometry.setIndex(
            new THREE.BufferAttribute(new Uint32Array(indices), 1),
        );

        // Create material with vertex colors and some transparency
        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        return () => {
            scene.remove(mesh);
            geometry.dispose();
            material.dispose();
        };
    }, [showCompactHeightFieldDistances, intermediates, scene]);

    // debug view of the compact heightfield - regions
    useEffect(() => {
        if (!intermediates || !showCompactHeightFieldRegions) return;

        const { compactHeightfield } = intermediates;
        const chf = compactHeightfield;

        // Count total quads to create geometry
        let totalQuads = 0;
        for (let y = 0; y < chf.height; y++) {
            for (let x = 0; x < chf.width; x++) {
                const cell = chf.cells[x + y * chf.width];
                totalQuads += cell.count;
            }
        }

        if (totalQuads === 0) return;

        // Create arrays for vertices, indices, and colors
        const positions: number[] = [];
        const indices: number[] = [];
        const colors: number[] = [];

        let indexOffset = 0;

        // Helper function to convert region ID to color (similar to duIntToCol)
        const regionToColor = (regionId: number): THREE.Color => {
            if (regionId === 0) {
                // No region - black with some transparency
                return new THREE.Color(0x000000);
            }

            // Hash the region ID to generate a consistent color
            // This mimics the duIntToCol function behavior
            const hash = regionId * 137.5; // Use golden ratio approximation for good distribution
            const hue = hash % 360;
            const saturation = 70 + (regionId % 30); // Vary saturation slightly
            const lightness = 50 + (regionId % 25); // Vary lightness slightly

            return new THREE.Color(
                `hsl(${hue}, ${saturation}%, ${lightness}%)`,
            );
        };

        // Iterate through all cells and their spans
        for (let y = 0; y < chf.height; y++) {
            for (let x = 0; x < chf.width; x++) {
                const fx = chf.bounds[0][0] + x * chf.cellSize; // bmin[0] + x * cs
                const fz = chf.bounds[0][2] + y * chf.cellSize; // bmin[2] + y * cs
                const cell = chf.cells[x + y * chf.width];

                for (let i = cell.index; i < cell.index + cell.count; i++) {
                    const span = chf.spans[i];

                    // Calculate the surface Y coordinate (using span.y like in the C++ code)
                    const fy = chf.bounds[0][1] + span.y * chf.cellHeight; // bmin[1] + s.y * ch

                    // Get color based on region ID
                    const color = regionToColor(span.region);

                    // Create quad vertices (surface of the span)
                    // Vertex 0: (fx, fy, fz)
                    positions.push(fx, fy, fz);
                    colors.push(color.r, color.g, color.b);

                    // Vertex 1: (fx, fy, fz + cs)
                    positions.push(fx, fy, fz + chf.cellSize);
                    colors.push(color.r, color.g, color.b);

                    // Vertex 2: (fx + cs, fy, fz + cs)
                    positions.push(fx + chf.cellSize, fy, fz + chf.cellSize);
                    colors.push(color.r, color.g, color.b);

                    // Vertex 3: (fx + cs, fy, fz)
                    positions.push(fx + chf.cellSize, fy, fz);
                    colors.push(color.r, color.g, color.b);

                    // Create two triangles for the quad
                    // Triangle 1: 0, 1, 2
                    indices.push(indexOffset, indexOffset + 1, indexOffset + 2);
                    // Triangle 2: 0, 2, 3
                    indices.push(indexOffset, indexOffset + 2, indexOffset + 3);

                    indexOffset += 4;
                }
            }
        }

        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(positions), 3),
        );
        geometry.setAttribute(
            'color',
            new THREE.BufferAttribute(new Float32Array(colors), 3),
        );
        geometry.setIndex(
            new THREE.BufferAttribute(new Uint32Array(indices), 1),
        );

        // Create material with vertex colors and transparency
        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        return () => {
            scene.remove(mesh);
            geometry.dispose();
            material.dispose();
        };
    }, [showCompactHeightFieldRegions, intermediates, scene]);

    // debug view of the raw contours
    useEffect(() => {
        if (!intermediates || !showRawContours) return;

        const { contourSet } = intermediates;

        if (!contourSet || contourSet.contours.length === 0) return;

        const orig = contourSet.bounds[0]; // bmin
        const cs = contourSet.cellSize;
        const ch = contourSet.cellHeight;

        // Arrays for line segments
        const linePositions: number[] = [];
        const lineColors: number[] = [];

        // Arrays for points
        const pointPositions: number[] = [];
        const pointColors: number[] = [];

        // Helper function to convert region ID to color (similar to duIntToCol)
        const regionToColor = (regionId: number, alpha = 1.0): THREE.Color => {
            if (regionId === 0) {
                return new THREE.Color(0x000000);
            }

            // Hash the region ID to generate a consistent color
            const hash = regionId * 137.5;
            const hue = hash % 360;
            const saturation = 70;
            const lightness = 60;

            const color = new THREE.Color(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
            return color.multiplyScalar(alpha);
        };

        // Helper function to darken color (similar to duDarkenCol)
        const darkenColor = (color: THREE.Color): THREE.Color => {
            return color.clone().multiplyScalar(0.5);
        };

        // Helper function to lerp between colors (similar to duLerpCol)
        const lerpColor = (colorA: THREE.Color, colorB: THREE.Color, t: number): THREE.Color => {
            return colorA.clone().lerp(colorB, t / 255.0);
        };

        // Draw lines for each contour
        for (let i = 0; i < contourSet.contours.length; ++i) {
            const c = contourSet.contours[i];
            const color = regionToColor(c.reg, 0.8);

            // Draw raw contour lines
            for (let j = 0; j < c.nRawVertices; ++j) {
                const v = c.rawVertices.slice(j * 4, j * 4 + 4);
                const fx = orig[0] + v[0] * cs;
                const fy = orig[1] + (v[1] + 1 + (i & 1)) * ch;
                const fz = orig[2] + v[2] * cs;

                linePositions.push(fx, fy, fz);
                lineColors.push(color.r, color.g, color.b);

                if (j > 0) {
                    linePositions.push(fx, fy, fz);
                    lineColors.push(color.r, color.g, color.b);
                }
            }

            // Loop last segment
            if (c.nRawVertices > 0) {
                const v = c.rawVertices.slice(0, 4);
                const fx = orig[0] + v[0] * cs;
                const fy = orig[1] + (v[1] + 1 + (i & 1)) * ch;
                const fz = orig[2] + v[2] * cs;

                linePositions.push(fx, fy, fz);
                lineColors.push(color.r, color.g, color.b);
            }
        }

        // Draw points for each contour
        for (let i = 0; i < contourSet.contours.length; ++i) {
            const c = contourSet.contours[i];
            const baseColor = regionToColor(c.reg, 0.8);
            const color = darkenColor(baseColor);

            for (let j = 0; j < c.nRawVertices; ++j) {
                const v = c.rawVertices.slice(j * 4, j * 4 + 4);
                let off = 0;
                let colv = color;

                if (v[3] & 0x10000) { // BORDER_VERTEX
                    colv = new THREE.Color(1, 1, 1);
                    off = ch * 2;
                }

                const fx = orig[0] + v[0] * cs;
                const fy = orig[1] + (v[1] + 1 + (i & 1)) * ch + off;
                const fz = orig[2] + v[2] * cs;

                pointPositions.push(fx, fy, fz);
                pointColors.push(colv.r, colv.g, colv.b);
            }
        }

        // Create line segments geometry
        let lineSegments: THREE.LineSegments | null = null;
        if (linePositions.length > 0) {
            const lineGeometry = new THREE.BufferGeometry();
            lineGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(new Float32Array(linePositions), 3),
            );
            lineGeometry.setAttribute(
                'color',
                new THREE.BufferAttribute(new Float32Array(lineColors), 3),
            );

            const lineMaterial = new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.8,
                linewidth: 2.0,
            });

            lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
            scene.add(lineSegments);
        }

        // Create points geometry
        let points: THREE.Points | null = null;
        if (pointPositions.length > 0) {
            const pointGeometry = new THREE.BufferGeometry();
            pointGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(new Float32Array(pointPositions), 3),
            );
            pointGeometry.setAttribute(
                'color',
                new THREE.BufferAttribute(new Float32Array(pointColors), 3),
            );

            const pointMaterial = new THREE.PointsMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.9,
                size: 6,
                sizeAttenuation: false,
            });

            points = new THREE.Points(pointGeometry, pointMaterial);
            scene.add(points);
        }

        return () => {
            if (lineSegments) {
                scene.remove(lineSegments);
                lineSegments.geometry.dispose();
                (lineSegments.material as THREE.Material).dispose();
            }

            if (points) {
                scene.remove(points);
                points.geometry.dispose();
                (points.material as THREE.Material).dispose();
            }
        };
    }, [showRawContours, intermediates, scene]);

    // debug view of the simplified contours
    useEffect(() => {
        if (!intermediates || !showSimplifiedContours) return;

        const { contourSet } = intermediates;

        if (!contourSet || contourSet.contours.length === 0) return;

        const orig = contourSet.bounds[0]; // bmin
        const cs = contourSet.cellSize;
        const ch = contourSet.cellHeight;

        // Arrays for line segments
        const linePositions: number[] = [];
        const lineColors: number[] = [];

        // Arrays for points
        const pointPositions: number[] = [];
        const pointColors: number[] = [];

        // Helper function to convert region ID to color (similar to duIntToCol)
        const regionToColor = (regionId: number, alpha = 1.0): THREE.Color => {
            if (regionId === 0) {
                return new THREE.Color(0x000000);
            }

            // Hash the region ID to generate a consistent color
            const hash = regionId * 137.5;
            const hue = hash % 360;
            const saturation = 70;
            const lightness = 60;

            const color = new THREE.Color(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
            return color.multiplyScalar(alpha);
        };

        // Helper function to darken color (similar to duDarkenCol)
        const darkenColor = (color: THREE.Color): THREE.Color => {
            return color.clone().multiplyScalar(0.5);
        };

        // Helper function to lerp between colors (similar to duLerpCol)
        const lerpColor = (colorA: THREE.Color, colorB: THREE.Color, t: number): THREE.Color => {
            return colorA.clone().lerp(colorB, t / 255.0);
        };

        // Draw lines for each contour
        for (let i = 0; i < contourSet.contours.length; ++i) {
            const c = contourSet.contours[i];
            if (c.nVertices === 0) continue;

            const baseColor = regionToColor(c.reg, 0.8);
            const whiteColor = new THREE.Color(1, 1, 1);
            const borderColor = lerpColor(baseColor, whiteColor, 128);

            for (let j = 0, k = c.nVertices - 1; j < c.nVertices; k = j++) {
                const va = c.vertices.slice(k * 4, k * 4 + 4);
                const vb = c.vertices.slice(j * 4, j * 4 + 4);
                
                // Check if this is an area border edge
                const isAreaBorder = (va[3] & 0x20000) !== 0; // RC_AREA_BORDER equivalent
                const col = isAreaBorder ? borderColor : baseColor;

                // First vertex of the line
                const fx1 = orig[0] + va[0] * cs;
                const fy1 = orig[1] + (va[1] + 1 + (i & 1)) * ch;
                const fz1 = orig[2] + va[2] * cs;

                // Second vertex of the line
                const fx2 = orig[0] + vb[0] * cs;
                const fy2 = orig[1] + (vb[1] + 1 + (i & 1)) * ch;
                const fz2 = orig[2] + vb[2] * cs;

                // Add line segment
                linePositions.push(fx1, fy1, fz1);
                lineColors.push(col.r, col.g, col.b);
                linePositions.push(fx2, fy2, fz2);
                lineColors.push(col.r, col.g, col.b);
            }
        }

        // Draw points for each contour
        for (let i = 0; i < contourSet.contours.length; ++i) {
            const c = contourSet.contours[i];
            const baseColor = regionToColor(c.reg, 0.8);
            const color = darkenColor(baseColor);

            for (let j = 0; j < c.nVertices; ++j) {
                const v = c.vertices.slice(j * 4, j * 4 + 4);
                let off = 0;
                let colv = color;

                if (v[3] & 0x10000) { // BORDER_VERTEX equivalent
                    colv = new THREE.Color(1, 1, 1);
                    off = ch * 2;
                }

                const fx = orig[0] + v[0] * cs;
                const fy = orig[1] + (v[1] + 1 + (i & 1)) * ch + off;
                const fz = orig[2] + v[2] * cs;

                pointPositions.push(fx, fy, fz);
                pointColors.push(colv.r, colv.g, colv.b);
            }
        }

        // Create line segments geometry
        let lineSegments: THREE.LineSegments | null = null;
        if (linePositions.length > 0) {
            const lineGeometry = new THREE.BufferGeometry();
            lineGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(new Float32Array(linePositions), 3),
            );
            lineGeometry.setAttribute(
                'color',
                new THREE.BufferAttribute(new Float32Array(lineColors), 3),
            );

            const lineMaterial = new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.9,
                linewidth: 2.5,
            });

            lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
            scene.add(lineSegments);
        }

        // Create points geometry
        let points: THREE.Points | null = null;
        if (pointPositions.length > 0) {
            const pointGeometry = new THREE.BufferGeometry();
            pointGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(new Float32Array(pointPositions), 3),
            );
            pointGeometry.setAttribute(
                'color',
                new THREE.BufferAttribute(new Float32Array(pointColors), 3),
            );

            const pointMaterial = new THREE.PointsMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.9,
                size: 8,
                sizeAttenuation: false,
            });

            points = new THREE.Points(pointGeometry, pointMaterial);
            scene.add(points);
        }

        return () => {
            if (lineSegments) {
                scene.remove(lineSegments);
                lineSegments.geometry.dispose();
                (lineSegments.material as THREE.Material).dispose();
            }

            if (points) {
                scene.remove(points);
                points.geometry.dispose();
                (points.material as THREE.Material).dispose();
            }
        };
    }, [showSimplifiedContours, intermediates, scene]);

    // debug view of the poly mesh
    useEffect(() => {
        if (!intermediates || !showPolyMesh) return;

        const { polyMesh } = intermediates;

        if (!polyMesh || polyMesh.nPolys === 0) return;

        const nvp = polyMesh.maxVerticesPerPoly;
        const cs = polyMesh.cellSize;
        const ch = polyMesh.cellHeight;
        const orig = polyMesh.bounds[0]; // bmin

        // Arrays for triangle geometry (polygon fills)
        const triPositions: number[] = [];
        const triColors: number[] = [];
        const triIndices: number[] = [];

        // Arrays for neighbor edges (internal edges)
        const neighborLinePositions: number[] = [];
        const neighborLineColors: number[] = [];

        // Arrays for boundary edges (external edges)
        const boundaryLinePositions: number[] = [];
        const boundaryLineColors: number[] = [];

        // Arrays for vertices (points)
        const vertexPositions: number[] = [];
        const vertexColors: number[] = [];

        let triVertexIndex = 0;

        // Helper function to convert area to color
        const areaToColor = (area: number): THREE.Color => {
            if (area === WALKABLE_AREA) {
                return new THREE.Color()
                    .setRGB(0, 192 / 255, 1)
                    .multiplyScalar(0.25); // RGB(0,192,255) with alpha 64/255
            }
            if (area === NULL_AREA) {
                return new THREE.Color().setRGB(0, 0, 0).multiplyScalar(0.25); // RGB(0,0,0) with alpha 64/255
            }
            // Hash area id to a color for other areas
            const hash = area * 137.5;
            const hue = hash % 360;
            return new THREE.Color(`hsl(${hue}, 70%, 60%)`).multiplyScalar(0.5);
        };

        // Draw polygon triangles
        for (let i = 0; i < polyMesh.nPolys; i++) {
            const polyBase = i * nvp * 2;
            const area = polyMesh.areas[i];
            const color = areaToColor(area);

            // Triangulate polygon by creating a triangle fan from vertex 0
            for (let j = 2; j < nvp; j++) {
                const v0 = polyMesh.polys[polyBase + 0];
                const v1 = polyMesh.polys[polyBase + j - 1];
                const v2 = polyMesh.polys[polyBase + j];

                if (v2 === MESH_NULL_IDX) break;

                // Add triangle vertices
                const vertices = [v0, v1, v2];
                for (let k = 0; k < 3; k++) {
                    const vertIndex = vertices[k] * 3;
                    const x = orig[0] + polyMesh.vertices[vertIndex] * cs;
                    const y =
                        orig[1] + (polyMesh.vertices[vertIndex + 1] + 1) * ch;
                    const z = orig[2] + polyMesh.vertices[vertIndex + 2] * cs;

                    triPositions.push(x, y, z);
                    triColors.push(color.r, color.g, color.b);
                }

                // Add triangle indices
                triIndices.push(
                    triVertexIndex,
                    triVertexIndex + 1,
                    triVertexIndex + 2,
                );
                triVertexIndex += 3;
            }
        }

        // Draw neighbor edges (internal edges)
        const neighborColor = new THREE.Color()
            .setRGB(0, 48 / 255, 64 / 255)
            .multiplyScalar(0.125); // RGB(0,48,64) with alpha 32/255
        for (let i = 0; i < polyMesh.nPolys; i++) {
            const polyBase = i * nvp * 2;

            for (let j = 0; j < nvp; j++) {
                const v0 = polyMesh.polys[polyBase + j];
                if (v0 === MESH_NULL_IDX) break;

                const neighbor = polyMesh.polys[polyBase + nvp + j];
                if (neighbor & 0x8000) continue; // Skip boundary edges

                const nj =
                    j + 1 >= nvp || polyMesh.polys[polyBase + j + 1] === MESH_NULL_IDX
                        ? 0
                        : j + 1;
                const v1 = polyMesh.polys[polyBase + nj];

                const vertices = [v0, v1];
                for (let k = 0; k < 2; k++) {
                    const vertIndex = vertices[k] * 3;
                    const x = orig[0] + polyMesh.vertices[vertIndex] * cs;
                    const y =
                        orig[1] +
                        (polyMesh.vertices[vertIndex + 1] + 1) * ch +
                        0.1;
                    const z = orig[2] + polyMesh.vertices[vertIndex + 2] * cs;

                    neighborLinePositions.push(x, y, z);
                    neighborLineColors.push(
                        neighborColor.r,
                        neighborColor.g,
                        neighborColor.b,
                    );
                }
            }
        }

        // Draw boundary edges (external edges)
        const boundaryColor = new THREE.Color()
            .setRGB(0, 48 / 255, 64 / 255)
            .multiplyScalar(0.863); // RGB(0,48,64) with alpha 220/255
        const portalColor = new THREE.Color()
            .setRGB(1, 1, 1)
            .multiplyScalar(0.5); // RGB(255,255,255) with alpha 128/255

        for (let i = 0; i < polyMesh.nPolys; i++) {
            const polyBase = i * nvp * 2;

            for (let j = 0; j < nvp; j++) {
                const v0 = polyMesh.polys[polyBase + j];
                if (v0 === MESH_NULL_IDX) break;

                const neighbor = polyMesh.polys[polyBase + nvp + j];
                if ((neighbor & 0x8000) === 0) continue; // Skip non-boundary edges

                const nj =
                    j + 1 >= nvp || polyMesh.polys[polyBase + j + 1] === MESH_NULL_IDX
                        ? 0
                        : j + 1;
                const v1 = polyMesh.polys[polyBase + nj];

                // Check if this is a portal edge
                const isPortal = (neighbor & 0xf) !== 0xf;
                const edgeColor = isPortal ? portalColor : boundaryColor;

                const vertices = [v0, v1];
                for (let k = 0; k < 2; k++) {
                    const vertIndex = vertices[k] * 3;
                    const x = orig[0] + polyMesh.vertices[vertIndex] * cs;
                    const y =
                        orig[1] +
                        (polyMesh.vertices[vertIndex + 1] + 1) * ch +
                        0.1;
                    const z = orig[2] + polyMesh.vertices[vertIndex + 2] * cs;

                    boundaryLinePositions.push(x, y, z);
                    boundaryLineColors.push(
                        edgeColor.r,
                        edgeColor.g,
                        edgeColor.b,
                    );
                }
            }
        }

        // Draw vertices (points)
        const vertexColor = new THREE.Color()
            .setRGB(0, 0, 0)
            .multiplyScalar(0.863); // RGB(0,0,0) with alpha 220/255
        for (let i = 0; i < polyMesh.nVertices; i++) {
            const vertIndex = i * 3;
            const x = orig[0] + polyMesh.vertices[vertIndex] * cs;
            const y =
                orig[1] + (polyMesh.vertices[vertIndex + 1] + 1) * ch + 0.1;
            const z = orig[2] + polyMesh.vertices[vertIndex + 2] * cs;

            vertexPositions.push(x, y, z);
            vertexColors.push(vertexColor.r, vertexColor.g, vertexColor.b);
        }

        // Create triangle mesh geometry
        const triGeometry = new THREE.BufferGeometry();
        if (triPositions.length > 0) {
            triGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(new Float32Array(triPositions), 3),
            );
            triGeometry.setAttribute(
                'color',
                new THREE.BufferAttribute(new Float32Array(triColors), 3),
            );
            triGeometry.setIndex(
                new THREE.BufferAttribute(new Uint32Array(triIndices), 1),
            );
        }

        const triMaterial = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: false,
            opacity: 1.0,
            side: THREE.DoubleSide,
        });

        const triMesh = new THREE.Mesh(triGeometry, triMaterial);
        scene.add(triMesh);

        // Create neighbor edges geometry
        let neighborLines: THREE.LineSegments | null = null;
        if (neighborLinePositions.length > 0) {
            const neighborLineGeometry = new THREE.BufferGeometry();
            neighborLineGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(
                    new Float32Array(neighborLinePositions),
                    3,
                ),
            );
            neighborLineGeometry.setAttribute(
                'color',
                new THREE.BufferAttribute(
                    new Float32Array(neighborLineColors),
                    3,
                ),
            );

            const neighborLineMaterial = new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.5,
                linewidth: 1.5,
            });

            neighborLines = new THREE.LineSegments(
                neighborLineGeometry,
                neighborLineMaterial,
            );
            scene.add(neighborLines);
        }

        // Create boundary edges geometry
        let boundaryLines: THREE.LineSegments | null = null;
        if (boundaryLinePositions.length > 0) {
            const boundaryLineGeometry = new THREE.BufferGeometry();
            boundaryLineGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(
                    new Float32Array(boundaryLinePositions),
                    3,
                ),
            );
            boundaryLineGeometry.setAttribute(
                'color',
                new THREE.BufferAttribute(
                    new Float32Array(boundaryLineColors),
                    3,
                ),
            );

            const boundaryLineMaterial = new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.9,
                linewidth: 2.5,
            });

            boundaryLines = new THREE.LineSegments(
                boundaryLineGeometry,
                boundaryLineMaterial,
            );
            scene.add(boundaryLines);
        }

        // Create vertex points geometry
        let vertexPoints: THREE.Points | null = null;
        if (vertexPositions.length > 0) {
            const vertexGeometry = new THREE.BufferGeometry();
            vertexGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(new Float32Array(vertexPositions), 3),
            );
            vertexGeometry.setAttribute(
                'color',
                new THREE.BufferAttribute(new Float32Array(vertexColors), 3),
            );

            const vertexMaterial = new THREE.PointsMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.9,
                size: 8,
                sizeAttenuation: false,
            });

            vertexPoints = new THREE.Points(vertexGeometry, vertexMaterial);
            scene.add(vertexPoints);
        }

        return () => {
            scene.remove(triMesh);
            triGeometry.dispose();
            triMaterial.dispose();

            if (neighborLines) {
                scene.remove(neighborLines);
                neighborLines.geometry.dispose();
                (neighborLines.material as THREE.Material).dispose();
            }

            if (boundaryLines) {
                scene.remove(boundaryLines);
                boundaryLines.geometry.dispose();
                (boundaryLines.material as THREE.Material).dispose();
            }

            if (vertexPoints) {
                scene.remove(vertexPoints);
                vertexPoints.geometry.dispose();
                (vertexPoints.material as THREE.Material).dispose();
            }
        };
    }, [showPolyMesh, intermediates, scene]);

    // debug view of the poly mesh detail
    useEffect(() => {
        if (!intermediates || !showPolyMeshDetail) return;

        const { polyMeshDetail } = intermediates;

        if (!polyMeshDetail || polyMeshDetail.nMeshes === 0) return;

        // Arrays for triangle geometry (mesh fills)
        const triPositions: number[] = [];
        const triColors: number[] = [];
        const triIndices: number[] = [];

        // Arrays for internal edges
        const internalLinePositions: number[] = [];
        const internalLineColors: number[] = [];

        // Arrays for external edges
        const externalLinePositions: number[] = [];
        const externalLineColors: number[] = [];

        // Arrays for vertices (points)
        const vertexPositions: number[] = [];
        const vertexColors: number[] = [];

        let triVertexIndex = 0;

        // Helper function to generate submesh color
        const submeshToColor = (submeshIndex: number): THREE.Color => {
            // Generate a unique color for each submesh
            const hash = submeshIndex * 137.5; // Use golden ratio approximation
            const hue = hash % 360;
            return new THREE.Color(`hsl(${hue}, 70%, 60%)`).multiplyScalar(0.3);
        };

        // Process each submesh
        for (let i = 0; i < polyMeshDetail.nMeshes; i++) {
            const meshBase = i * 4;
            const vertBase = polyMeshDetail.meshes[meshBase];
            const vertCount = polyMeshDetail.meshes[meshBase + 1];
            const triBase = polyMeshDetail.meshes[meshBase + 2];
            const triCount = polyMeshDetail.meshes[meshBase + 3];

            const color = submeshToColor(i);

            // Draw triangles for this submesh
            for (let j = 0; j < triCount; j++) {
                const triIndex = (triBase + j) * 4;
                const t0 = polyMeshDetail.triangles[triIndex];
                const t1 = polyMeshDetail.triangles[triIndex + 1];
                const t2 = polyMeshDetail.triangles[triIndex + 2];

                // Add triangle vertices
                for (let k = 0; k < 3; k++) {
                    const vertIndex = k === 0 ? t0 : k === 1 ? t1 : t2;
                    const vBase = (vertBase + vertIndex) * 3;

                    triPositions.push(
                        polyMeshDetail.vertices[vBase],
                        polyMeshDetail.vertices[vBase + 1],
                        polyMeshDetail.vertices[vBase + 2]
                    );
                    triColors.push(color.r, color.g, color.b);
                }

                // Add triangle indices
                triIndices.push(
                    triVertexIndex,
                    triVertexIndex + 1,
                    triVertexIndex + 2
                );
                triVertexIndex += 3;
            }

            // Draw edges for this submesh
            for (let j = 0; j < triCount; j++) {
                const triIndex = (triBase + j) * 4;
                const t0 = polyMeshDetail.triangles[triIndex];
                const t1 = polyMeshDetail.triangles[triIndex + 1];
                const t2 = polyMeshDetail.triangles[triIndex + 2];
                const flags = polyMeshDetail.triangles[triIndex + 3];

                // Get triangle vertices
                const v0Base = (vertBase + t0) * 3;
                const v1Base = (vertBase + t1) * 3;
                const v2Base = (vertBase + t2) * 3;

                const v0 = [
                    polyMeshDetail.vertices[v0Base],
                    polyMeshDetail.vertices[v0Base + 1],
                    polyMeshDetail.vertices[v0Base + 2]
                ];
                const v1 = [
                    polyMeshDetail.vertices[v1Base],
                    polyMeshDetail.vertices[v1Base + 1],
                    polyMeshDetail.vertices[v1Base + 2]
                ];
                const v2 = [
                    polyMeshDetail.vertices[v2Base],
                    polyMeshDetail.vertices[v2Base + 1],
                    polyMeshDetail.vertices[v2Base + 2]
                ];

                // Draw each edge
                const edges: [number[], number[], number][] = [
                    [v0, v1, (flags >> 0) & 1], // edge 0
                    [v1, v2, (flags >> 1) & 1], // edge 1
                    [v2, v0, (flags >> 2) & 1]  // edge 2
                ];

                for (const [va, vb, isExternal] of edges) {
                    if (isExternal) {
                        // External edge (thicker, brighter)
                        externalLinePositions.push(va[0], va[1], va[2]);
                        externalLinePositions.push(vb[0], vb[1], vb[2]);
                        externalLineColors.push(1, 1, 1); // White
                        externalLineColors.push(1, 1, 1);
                    } else {
                        // Internal edge (thinner, darker)
                        internalLinePositions.push(va[0], va[1], va[2]);
                        internalLinePositions.push(vb[0], vb[1], vb[2]);
                        internalLineColors.push(0.6, 0.6, 0.6); // Gray
                        internalLineColors.push(0.6, 0.6, 0.6);
                    }
                }
            }

            // Draw vertices for this submesh
            for (let j = 0; j < vertCount; j++) {
                const vBase = (vertBase + j) * 3;
                vertexPositions.push(
                    polyMeshDetail.vertices[vBase],
                    polyMeshDetail.vertices[vBase + 1],
                    polyMeshDetail.vertices[vBase + 2]
                );
                vertexColors.push(1, 0, 0); // Red vertices
            }
        }

        // Create triangle mesh
        const triGeometry = new THREE.BufferGeometry();
        triGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(triPositions), 3)
        );
        triGeometry.setAttribute(
            'color',
            new THREE.BufferAttribute(new Float32Array(triColors), 3)
        );
        triGeometry.setIndex(
            new THREE.BufferAttribute(new Uint32Array(triIndices), 1)
        );

        const triMaterial = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });

        const triMesh = new THREE.Mesh(triGeometry, triMaterial);
        scene.add(triMesh);

        // Create internal edges
        let internalLines: THREE.LineSegments | null = null;
        if (internalLinePositions.length > 0) {
            const internalGeometry = new THREE.BufferGeometry();
            internalGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(new Float32Array(internalLinePositions), 3)
            );
            internalGeometry.setAttribute(
                'color',
                new THREE.BufferAttribute(new Float32Array(internalLineColors), 3)
            );

            const internalMaterial = new THREE.LineBasicMaterial({
                vertexColors: true,
                linewidth: 1
            });

            internalLines = new THREE.LineSegments(internalGeometry, internalMaterial);
            scene.add(internalLines);
        }

        // Create external edges
        let externalLines: THREE.LineSegments | null = null;
        if (externalLinePositions.length > 0) {
            const externalGeometry = new THREE.BufferGeometry();
            externalGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(new Float32Array(externalLinePositions), 3)
            );
            externalGeometry.setAttribute(
                'color',
                new THREE.BufferAttribute(new Float32Array(externalLineColors), 3)
            );

            const externalMaterial = new THREE.LineBasicMaterial({
                vertexColors: true,
                linewidth: 3
            });

            externalLines = new THREE.LineSegments(externalGeometry, externalMaterial);
            scene.add(externalLines);
        }

        // Create vertex points
        let vertexPoints: THREE.Points | null = null;
        if (vertexPositions.length > 0) {
            const vertexGeometry = new THREE.BufferGeometry();
            vertexGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(new Float32Array(vertexPositions), 3)
            );
            vertexGeometry.setAttribute(
                'color',
                new THREE.BufferAttribute(new Float32Array(vertexColors), 3)
            );

            const vertexMaterial = new THREE.PointsMaterial({
                vertexColors: true,
                size: 4
            });

            vertexPoints = new THREE.Points(vertexGeometry, vertexMaterial);
            scene.add(vertexPoints);
        }

        return () => {
            scene.remove(triMesh);
            triGeometry.dispose();
            triMaterial.dispose();

            if (internalLines) {
                scene.remove(internalLines);
                internalLines.geometry.dispose();
                (internalLines.material as THREE.Material).dispose();
            }

            if (externalLines) {
                scene.remove(externalLines);
                externalLines.geometry.dispose();
                (externalLines.material as THREE.Material).dispose();
            }

            if (vertexPoints) {
                scene.remove(vertexPoints);
                vertexPoints.geometry.dispose();
                (vertexPoints.material as THREE.Material).dispose();
            }
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

export function Sketch() {
    return (
        <>
            <h1>NavMesh Generation</h1>

            <WebGPUCanvas>
                <App />
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
