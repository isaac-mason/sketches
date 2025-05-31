import forestEnvironment from '@pmndrs/assets/hdri/forest.exr';
import {
    Environment,
    OrbitControls,
    PerspectiveCamera,
} from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { WebGPUCanvas, usePageVisible } from '../../../common';
import Engine from '../lib/engine';
import { Controls } from '../../../common/components/controls';

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _axis = new THREE.Vector3(0, 0, 0);
const _velocity = new THREE.Vector3();

const engine = await Engine();

const N = 2000;
const WORLD_SIZE = new engine.Vec3(100, 100, 100);
const BOUNDS_CENTER = new engine.Vec3(0, 0, 0);
const BOUNDS_RADIUS = 30;
const FIXED_TIME_STEP = 1 / 60;
const CELL_SIZE = 5;

const input = new engine.Input();

const world = new engine.World(
    N,
    WORLD_SIZE,
    CELL_SIZE,
    FIXED_TIME_STEP,
    BOUNDS_RADIUS,
    BOUNDS_CENTER,
);

const Boids = () => {
    const {
        separationWeight,
        alignmentWeight,
        cohesionWeight,
        maxSpeed,
        minSpeed,
        neighborRadius,
    } = useControls({
        separationWeight: { value: 1.5, min: 0, max: 10, step: 0.1 },
        alignmentWeight: { value: 1.0, min: 0, max: 10, step: 0.1 },
        cohesionWeight: { value: 1.0, min: 0, max: 10, step: 0.1 },
        minSpeed: { value: 5, min: 0, max: 5, step: 0.1 },
        maxSpeed: { value: 10, min: 0, max: 20, step: 0.1 },
        neighborRadius: { value: 5, min: 1, max: 20, step: 0.1 },
    });
    const [batchedMesh, setBatchedMesh] = useState<THREE.BatchedMesh>();
    const [boidIndexToInstanceId, setBoidIndexToInstanceId] =
        useState<Map<number, number>>();

    const pageVisible = usePageVisible();

    useEffect(() => {
        const geometry = new THREE.BoxGeometry(0.8, 0.12, 0.12);
        const material = new THREE.MeshNormalMaterial();

        const batchedMesh = new THREE.BatchedMesh(
            N,
            geometry.attributes.position.array.length,
            geometry.index!.array.length,
            material,
        );
        setBatchedMesh(batchedMesh);

        const geometyId = batchedMesh.addGeometry(geometry);

        const boidIndexToInstanceId = new Map<number, number>();
        for (let i = 0; i < N; i++) {
            const instanceId = batchedMesh.addInstance(geometyId);
            boidIndexToInstanceId.set(i, instanceId);
        }
        setBoidIndexToInstanceId(boidIndexToInstanceId);

        return () => {
            geometry.dispose();
            material.dispose();

            setBatchedMesh(undefined);
        };
    }, []);

    useFrame((_, dt) => {
        if (!pageVisible || !world || !batchedMesh || !boidIndexToInstanceId)
            return;

        input.separationWeight = separationWeight;
        input.alignmentWeight = alignmentWeight;
        input.cohesionWeight = cohesionWeight;
        input.maxSpeed = maxSpeed;
        input.minSpeed = minSpeed;
        input.neighborRadius = neighborRadius;

        /* update */
        engine.update(world, dt, input);

        /* render */
        // update boids
        const heap = engine.HEAPF32;

        // biome-ignore lint/suspicious/noExplicitAny: emsdk types don't include $$
        const boidsPtr = (world.boids as any).$$.ptr / 4; // divide by 4 for Float32Array index

        for (let i = 0; i < N; i++) {
            const boidBase = boidsPtr + (engine.BOID_SIZE / 4) * i; // Base pointer for this boid

            const x = heap[boidBase + engine.BOID_INTERPOLATED_POSITION_OFFSET / 4];
            const y =
                heap[boidBase + engine.BOID_INTERPOLATED_POSITION_OFFSET / 4 + 1];
            const z =
                heap[boidBase + engine.BOID_INTERPOLATED_POSITION_OFFSET / 4 + 2];

            const vx = heap[boidBase + engine.BOID_INTERPOLATED_VELOCITY_OFFSET / 4];
            const vy =
                heap[boidBase + engine.BOID_INTERPOLATED_VELOCITY_OFFSET / 4 + 1];
            const vz =
                heap[boidBase + engine.BOID_INTERPOLATED_VELOCITY_OFFSET / 4 + 2];

            const instanceId = boidIndexToInstanceId?.get(i);
            if (instanceId !== undefined && batchedMesh) {
                _matrix.compose(
                    _position.set(x, y, z),
                    _quaternion.setFromUnitVectors(
                        _axis.set(1, 0, 0),
                        _velocity.set(vx, vy, vz).normalize(),
                    ),
                    _scale.set(1, 1, 1),
                );
                batchedMesh.setMatrixAt(instanceId, _matrix);
            }
        }
    });

    if (!batchedMesh) return null;

    return <primitive object={batchedMesh} />;
};

const mat = new THREE.MeshStandardMaterial({
    transparent: true,
    opacity: 0.02,
    color: '#fff',
    side: THREE.DoubleSide,
});

export function Sketch() {
    return (
        <>
            <WebGPUCanvas gl={{ antialias: true }}>
                <Boids />

                <mesh>
                    <primitive object={mat} />
                    <icosahedronGeometry args={[BOUNDS_RADIUS + 1, 100]} />
                </mesh>

                <ambientLight intensity={1.5} />
                <Environment files={forestEnvironment} environmentIntensity={0.5} />

                <PerspectiveCamera makeDefault position={[30, 10, 100]} />
                <OrbitControls makeDefault />

            </WebGPUCanvas>
            <Controls />
        </>
    );
}
