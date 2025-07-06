import { WebGPUCanvas } from '@/common/components/webgpu-canvas';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getPositionsAndIndices } from './navmesh/get-positions-and-indices';
import { markWalkableTriangles } from './navmesh/input-triangle-mesh';
import { useThree } from '@react-three/fiber';
import { useControls } from 'leva';
import { OrbitControls } from '@react-three/drei';

type Intermediates = {
    input: {
        positions: Float32Array;
        indices: Uint32Array;
    };
    triAreaIds: Uint8Array;
};

const Home = () => {
    const scene = useThree((state) => state.scene);
    const group = useRef<THREE.Group>(null!);

    const { showMesh, showTriangleAreaIds } = useControls({
        showMesh: {
            value: true,
            label: 'Show Mesh',
        },
        showTriangleAreaIds: {
            value: false,
            label: 'Show Triangle Area IDs',
        },
    })

    const [intermediates, setIntermediates] = useState<Intermediates | undefined>();

    useEffect(() => {
        /* 1. get positions and indices from THREE.Mesh instances in the group */
        const meshes: THREE.Mesh[] = [];

        group.current.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                meshes.push(child);
            }
        });

        const [positions, indices] = getPositionsAndIndices(meshes);

        /* 2. mark walkable triangles */
        const triAreaIds: Uint8Array = new Uint8Array(
            indices.length / 3,
        ).fill(0);

        markWalkableTriangles(positions, indices, triAreaIds, 45);

        /* store intermediates for debugging */
        const intermediates: Intermediates = {
            input: {
                positions,
                indices,
            },
            triAreaIds,
        };

        setIntermediates(intermediates);
    }, []);

    // wireframe of walkable triangles with area ids based vertex colors
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

        for (let triangle = 0; triangle < input.indices.length / 3; triangle++) {
            const areaId = triAreaIds[triangle];

            let color = areaToColor[areaId];
            
            if (!color) {
                // hash area id to a color
                color = new THREE.Color(
                    `hsl(${(areaId * 137.5) % 360}, 100%, 50%)`,
                );
                areaToColor[areaId] = color;
            }

            positions[positionsIndex++] = input.positions[input.indices[triangle * 3] * 3];
            positions[positionsIndex++] = input.positions[input.indices[triangle * 3] * 3 + 1];
            positions[positionsIndex++] = input.positions[input.indices[triangle * 3] * 3 + 2];

            positions[positionsIndex++] = input.positions[input.indices[triangle * 3 + 1] * 3];
            positions[positionsIndex++] = input.positions[input.indices[triangle * 3 + 1] * 3 + 1];
            positions[positionsIndex++] = input.positions[input.indices[triangle * 3 + 1] * 3 + 2];

            positions[positionsIndex++] = input.positions[input.indices[triangle * 3 + 2] * 3];
            positions[positionsIndex++] = input.positions[input.indices[triangle * 3 + 2] * 3 + 1];
            positions[positionsIndex++] = input.positions[input.indices[triangle * 3 + 2] * 3 + 2];

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
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
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
    }, [showTriangleAreaIds, intermediates, scene])

    return (
        <>
            <group ref={group} visible={showMesh}>
                <mesh>
                    <boxGeometry args={[1, 1, 1]} />
                    <meshStandardMaterial color="orange" />
                </mesh>
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
                <Home />
            </WebGPUCanvas>
        </>
    );
}
