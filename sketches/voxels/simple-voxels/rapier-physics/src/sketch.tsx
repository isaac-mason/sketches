import { Canvas, useInterval } from '@/common'
import Rapier from '@dimforge/rapier3d-compat'
import { Bounds, OrbitControls } from '@react-three/drei'
import { ThreeEvent, useThree } from '@react-three/fiber'
import { Physics, RapierRigidBody, RigidBody, useRapier } from '@react-three/rapier'
import { useControls } from 'leva'
import { ReactElement, createRef, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Vector3Tuple } from 'three'
import { VoxelChunkMeshes, Voxels, useVoxels } from '../../lib/react'
import { SimpleLevel } from '../../lib/simple-level'
import { chunkPositionToWorldPosition } from '../../lib/world'
import { createChunkTrimesh } from './chunk-collider'

const SKETCH = 'simple-voxels/rapier-physics'

type Box = {
    position: THREE.Vector3Tuple
    rotation: THREE.Vector3Tuple
    linvel: THREE.Vector3Tuple
}

const BoxCannonTool = ({ children }: { children: React.ReactNode }) => {
    const [box, setBox] = useState<Box[]>([])

    const camera = useThree((s) => s.camera)

    const onPointerDown = (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation()

        const ray = event.ray

        const position = camera.position.toArray()
        const rotation = camera.rotation.toArray() as Vector3Tuple
        const linvel = ray.direction.multiplyScalar(50).toArray()

        setBox([...box, { position, rotation, linvel }])
    }

    return (
        <group onPointerDown={onPointerDown}>
            {children}

            {box.map((box, i) => (
                <RigidBody key={i} type="dynamic" position={box.position} rotation={box.rotation} linearVelocity={box.linvel}>
                    <mesh>
                        <meshStandardMaterial color="orange" />
                        <boxGeometry args={[1, 1, 1]} />
                    </mesh>
                </RigidBody>
            ))}
        </group>
    )
}

const VOXEL_PHYSICS_WORLD_OFFSET = 0.5

const worldPositionToPhysicsPosition = (position: THREE.Vector3, out = new THREE.Vector3()) => {
    return out.copy(position).addScalar(VOXEL_PHYSICS_WORLD_OFFSET)
}

const ChunkColliders = () => {
    const { voxels } = useVoxels()

    const { world } = useRapier()

    const chunkRigidBodies = useMemo(() => {
        return new Map<string, Rapier.RigidBody>()
    }, [])

    useEffect(() => {
        const unsub = voxels.onUpdate.add((changes) => {
            const chunksIds = new Set<string>(changes.map((change) => change.chunk.id))

            for (const chunkId of chunksIds) {
                const chunk = voxels.world.chunks.get(chunkId)
                if (!chunk) continue

                let chunkRigidBody = chunkRigidBodies.get(chunkId)

                if (!chunkRigidBody) {
                    chunkRigidBody = world.createRigidBody(Rapier.RigidBodyDesc.fixed())

                    const offset = worldPositionToPhysicsPosition(chunkPositionToWorldPosition(chunk.position))

                    chunkRigidBody.setTranslation(offset, true)

                    chunkRigidBodies.set(chunkId, chunkRigidBody)
                }

                while (chunkRigidBody.numColliders() > 0) {
                    world.removeCollider(chunkRigidBody.collider(0), false)
                }

                const trimesh = createChunkTrimesh(voxels.world, chunk)

                const colliderDesc = Rapier.ColliderDesc.trimesh(trimesh.positions, trimesh.indices)
                colliderDesc.setTranslation(-0.5, -0.5, -0.5)

                world.createCollider(colliderDesc, chunkRigidBody)
            }
        })

        return () => {
            unsub()
        }
    }, [])

    return null
}

const Snow = () => {
    const n = 500
    const refs = useMemo(() => Array.from({ length: n }, () => createRef<RapierRigidBody>()), [])

    const bodies: ReactElement[] = []

    for (let i = 0; i < n; i++) {
        const ref = refs[i]
        bodies.push(
            <RigidBody key={i} ref={ref} type="dynamic" position={[0, -1000 - i, 0]}>
                <mesh>
                    <meshStandardMaterial color="white" />
                    <boxGeometry args={[1, 1, 1]} />
                </mesh>
            </RigidBody>,
        )
    }

    const roundRobin = useRef(0)

    useInterval(() => {
        const body = refs[roundRobin.current].current
        if (!body) return

        const translation = {
            x: (Math.random() - 0.5) * 150,
            y: 50,
            z: (Math.random() - 0.5) * 150,
        }

        const linvel = { x: 0, y: 0, z: 0 }

        body.setTranslation(translation, true)
        body.setLinvel(linvel, true)

        roundRobin.current = (roundRobin.current + 1) % n
    }, 1000 / 10)

    return bodies
}

export function Sketch() {
    const { physicsDebug } = useControls(SKETCH, {
        physicsDebug: false,
    })

    return (
        <Canvas camera={{ position: [20, 50, 50] }}>
            <Voxels>
                <SimpleLevel />

                <Physics debug={physicsDebug}>
                    <Bounds fit margin={1.5}>
                        <BoxCannonTool>
                            <VoxelChunkMeshes />
                        </BoxCannonTool>
                    </Bounds>

                    <ChunkColliders />

                    <Snow />
                </Physics>
            </Voxels>

            <ambientLight intensity={0.6} />
            <pointLight decay={0.5} intensity={10} position={[20, 20, 20]} />
            <pointLight decay={0.5} intensity={10} position={[-20, 20, -20]} />

            <OrbitControls makeDefault />
        </Canvas>
    )
}
