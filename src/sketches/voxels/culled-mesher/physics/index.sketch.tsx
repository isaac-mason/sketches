import Rapier from '@dimforge/rapier3d-compat'
import { Bounds, OrbitControls } from '@react-three/drei'
import { ThreeEvent } from '@react-three/fiber'
import { useControls } from 'leva'
import { useLayoutEffect, useMemo } from 'react'
import { Color } from 'three'
import { Canvas } from '../../../../common'
import { CorePlugin, Object3DComponent, Vec3 } from '../../engine/core'
import { CulledMesherPlugin, VoxelChunkMeshComponent } from '../../engine/culled-mesher'
import { PhysicsDebug, PhysicsPlugin, RapierInit, RigidBodyComponent } from '../../engine/physics'
import { useVoxelEngine, useVoxelEngineApi } from '../../engine/use-voxel-engine'

const gray = new Color('#666').getHex()
const orange = new Color('orange').getHex()

type BallProps = {
    position: Vec3
    radius: number
}

const Ball = ({ position: [x, y, z], radius }: BallProps) => {
    const { ecs, physicsWorld } = useVoxelEngineApi<[CorePlugin, PhysicsPlugin]>()

    const rigidBody = useMemo(() => {
        const body = physicsWorld.createRigidBody(Rapier.RigidBodyDesc.dynamic().setTranslation(x, y, z))
        physicsWorld.createCollider(Rapier.ColliderDesc.ball(radius), body)
        return body
    }, [])

    return (
        <ecs.Entity>
            <ecs.Component type={RigidBodyComponent} args={[rigidBody]} />
            <ecs.Component type={Object3DComponent}>
                <mesh position={[x, y, z]}>
                    <meshStandardMaterial color="orange" />
                    <sphereGeometry args={[radius]} />
                </mesh>
            </ecs.Component>
        </ecs.Entity>
    )
}

const App = () => {
    const { world, physicsWorld, voxelWorld, setBlock, CulledMeshes, VoxelEngineProvider } = useVoxelEngine({
        plugins: [CorePlugin, CulledMesherPlugin, PhysicsPlugin],
    })

    useLayoutEffect(() => {
        // container
        for (let x = -10; x < 10; x++) {
            for (let y = -10; y < 10; y++) {
                for (let z = -10; z < 10; z++) {
                    if (x === -10 || x === 9 || y === -10 || z === -10 || z === 9) {
                        setBlock([x, y, z], {
                            solid: true,
                            color: gray,
                        })
                    }
                }
            }
        }
    }, [])

    useControls(
        'voxels-culled-mesher-physics',
        {
            wireframe: {
                value: false,
                onChange: (value) => {
                    world.find([VoxelChunkMeshComponent]).forEach((entity) => {
                        entity.get(VoxelChunkMeshComponent).material.wireframe = value
                    })
                },
            },
        },
        [world],
    )

    const onPointerDown = (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation()

        const origin = event.ray.origin.toArray()
        const direction = event.ray.direction.toArray()

        const ray = voxelWorld.traceRay(origin, direction)

        if (!ray.hit) return

        if (event.button === 2) {
            const block: Vec3 = [Math.floor(ray.hitPosition[0]), Math.floor(ray.hitPosition[1]), Math.floor(ray.hitPosition[2])]

            setBlock(block, {
                solid: false,
            })
        } else {
            const block: Vec3 = [
                Math.floor(ray.hitPosition[0] + ray.hitNormal[0]),
                Math.floor(ray.hitPosition[1] + ray.hitNormal[1]),
                Math.floor(ray.hitPosition[2] + ray.hitNormal[2]),
            ]

            setBlock(block, {
                solid: true,
                color: orange,
            })
        }
    }

    const balls = useMemo(() => {
        return Array.from({ length: 20 }).map(() => ({
            position: [Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5] as Vec3,
            radius: 0.5,
        }))
    }, [])

    return (
        <VoxelEngineProvider>
            <Bounds fit margin={1.5}>
                <group onPointerDown={onPointerDown}>
                    <CulledMeshes />
                </group>
            </Bounds>

            {balls.map(({ position, radius }, idx) => (
                <Ball key={idx} position={position} radius={radius} />
            ))}

            <PhysicsDebug world={physicsWorld} />

            <ambientLight intensity={0.2} />
            <pointLight intensity={0.5} position={[20, 20, 20]} />
            <pointLight intensity={0.5} position={[-20, 20, -20]} />
        </VoxelEngineProvider>
    )
}

export default () => {
    return (
        <RapierInit>
            <Canvas camera={{ position: [5, 20, 5] }}>
                <App />
                <OrbitControls makeDefault />
            </Canvas>
        </RapierInit>
    )
}
