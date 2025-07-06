import { WebGPUCanvas } from '@/common/components/webgpu-canvas';
import { Box3, box3 } from '@/common/maaths';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Leva, useControls } from 'leva';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import { type CompactHeightfield, buildCompactHeightfield, erodeWalkableArea } from './navmesh/compact-heightfield';
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
import { WALKABLE_AREA, NULL_AREA } from './navmesh/area';

type Intermediates = {
    input: {
        positions: Float32Array;
        indices: Uint32Array;
    };
    triAreaIds: Uint8Array;
    heightfield: Heightfield;
    compactHeightfield: CompactHeightfield;
};

const DungeonModel = () => {
    const gltf = useGLTF('/dungeon.gltf');

    return <primitive object={gltf.scene} />;
};

const App = () => {
    const scene = useThree((state) => state.scene);
    const group = useRef<THREE.Group>(null!);

    const { showMesh, showTriangleAreaIds, showHeightfield, showCompactHeightfieldSolid } = useControls({
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
    });

    const [intermediates, setIntermediates] = useState<
        Intermediates | undefined
    >();

    useEffect(() => {
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

        const cellSize = 0.2;
        const cellHeight = 0.2;

        const walkableRadiusWorld = 0.5;
        const walkableRadiusVoxels = Math.ceil(
            walkableRadiusWorld / cellSize,
        );

        const walkableClimbWorld = 1;
        const walkableClimbVoxels = Math.ceil(
            walkableClimbWorld / cellHeight,
        );
        const walkableHeightWorld = 0.4;
        const walkableHeightVoxels = Math.ceil(
            walkableHeightWorld / cellHeight,
        );

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
        filterLedgeSpans(heightfield, walkableHeightVoxels, walkableClimbVoxels);
        filterWalkableLowHeightSpans(heightfield, walkableClimbVoxels);

        console.timeEnd('filter walkable surfaces');

        /* 5. partition walkable surface to simple regions. */
        // Compact the heightfield so that it is faster to handle from now on.
        // This will result more cache coherent data as well as the neighbours
        // between walkable cells will be calculated.

        console.time("build compact heightfield");

        const compactHeightfield = buildCompactHeightfield(walkableHeightVoxels, walkableClimbVoxels, heightfield);

        console.timeEnd("build compact heightfield");

        /* erode the walkable area by the agent radius / walkable radius */

        console.time('erode walkable area');

        erodeWalkableArea(walkableRadiusVoxels, compactHeightfield);

        console.timeEnd('erode walkable area');

        /* store intermediates for debugging */
        const intermediates: Intermediates = {
            input: {
                positions,
                indices,
            },
            triAreaIds,
            heightfield,
            compactHeightfield,
        };

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
                        color = new THREE.Color(`hsl(${(area * 137.5) % 360}, 70%, 60%)`);
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
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

        // Create material with vertex colors and transparency
        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        return () => {
            scene.remove(mesh);
            geometry.dispose();
            material.dispose();
        };
    }, [showCompactHeightfieldSolid, intermediates, scene]);

    return (
        <>
            <group ref={group} visible={showMesh}>
                {/* floor */}
                {/* <mesh>
                    <boxGeometry args={[10, 0.2, 10]} />
                    <meshStandardMaterial color="#333" />
                </mesh>
                 */}
                <DungeonModel />
            </group>

            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />

            <OrbitControls />

            {/* walkable triangles */}
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
