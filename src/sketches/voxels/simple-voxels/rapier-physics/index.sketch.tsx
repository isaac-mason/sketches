import Rapier from '@dimforge/rapier3d-compat'
import { Bounds, OrbitControls } from '@react-three/drei'
import { ThreeEvent, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import { useEffect, useMemo } from 'react'
import { Color } from 'three'
import { Canvas } from '@/common'
import { CorePlugin, Vec3 } from '../engine/core'
import { CulledMesherPlugin, VoxelChunkCulledMeshes } from '../engine/culled-mesher'
import { PhysicsDebug, RapierInit, RapierPhysicsPlugin } from '../engine/rapier-physics'
import { createVoxelEngine } from '../engine/voxel-engine'
import { SimpleLevel } from '../simple-level'

const PLUGINS = [CorePlugin, CulledMesherPlugin, RapierPhysicsPlugin] as const

const { VoxelEngine, useVoxelEngine } = createVoxelEngine(PLUGINS)

const orange = new Color('orange').getHex()

const Tools = ({ children }: { children: React.ReactNode }) => {
    const { world, voxelWorld, physicsWorld } = useVoxelEngine()

    const camera = useThree((s) => s.camera)

    const { tool } = useControls('voxels-culled-mesher-physics-tool', {
        tool: {
            label: 'Tool',
            options: ['cannon', 'build'],
            value: 'cannon',
        },
    })

    const handleCannon = (event: ThreeEvent<MouseEvent>) => {
        const position = camera.position
        const ray = event.ray

        const body = physicsWorld.createRigidBody(
            Rapier.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z).setRotation(camera.quaternion),
        )
        physicsWorld.createCollider(Rapier.ColliderDesc.cuboid(0.5, 0.5, 0.5), body)

        const impulse = new Rapier.Vector3(ray.direction.x, ray.direction.y, ray.direction.z)
        const impulseScale = 50
        impulse.x *= impulseScale
        impulse.y *= impulseScale
        impulse.z *= impulseScale
        body.applyImpulse(impulse, true)

        world.create({ rigidBody: body })
    }

    const handleBuild = (event: ThreeEvent<MouseEvent>) => {
        const origin = event.ray.origin.toArray()
        const direction = event.ray.direction.toArray()

        const ray = voxelWorld.traceRay(origin, direction)

        if (!ray.hit) return

        if (event.button === 2) {
            const block: Vec3 = [Math.floor(ray.hitPosition[0]), Math.floor(ray.hitPosition[1]), Math.floor(ray.hitPosition[2])]

            voxelWorld.setBlock(block, { solid: false })
        } else {
            const block: Vec3 = [
                Math.floor(ray.hitPosition[0] + ray.hitNormal[0]),
                Math.floor(ray.hitPosition[1] + ray.hitNormal[1]),
                Math.floor(ray.hitPosition[2] + ray.hitNormal[2]),
            ]

            voxelWorld.setBlock(block, {
                solid: true,
                color: orange,
            })
        }
    }

    const onPointerDown = (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation()

        if (tool === 'cannon') {
            handleCannon(event)
        } else {
            handleBuild(event)
        }
    }

    return <group onPointerDown={onPointerDown}>{children}</group>
}

const Snow = () => {
    const { world, physicsWorld } = useVoxelEngine()

    useEffect(() => {
        const timeouts: NodeJS.Timeout[] = []

        const interval = setInterval(() => {
            const x = Math.floor((Math.random() - 0.5) * 200)
            const z = Math.floor((Math.random() - 0.5) * 200)

            const body = physicsWorld.createRigidBody(Rapier.RigidBodyDesc.dynamic().setTranslation(x, 80, z))
            physicsWorld.createCollider(Rapier.ColliderDesc.cuboid(0.5, 0.5, 0.5), body)

            const entity = world.create({
                rigidBody: body,
            })

            const timeout = setTimeout(() => {
                world.destroy(entity)
                physicsWorld.removeRigidBody(body)
            }, 15000)

            timeouts.push(timeout)
        }, 20)

        return () => {
            clearInterval(interval)
            timeouts.forEach((timeout) => clearTimeout(timeout))
        }
    }, [])

    return null
}

const PhysicsVoxelCubeRenderer = () => {
    const {
        world,
        react: { Entities, Component },
    } = useVoxelEngine()

    const rigidBodyQuery = useMemo(() => world.query((e) => e.has('rigidBody')), [])

    return (
        <Entities in={rigidBodyQuery}>
            <Component name="object3D">
                <mesh>
                    <meshStandardMaterial color="white" />
                    <boxGeometry args={[1, 1, 1]} />
                </mesh>
            </Component>
        </Entities>
    )
}

const PhysicsDebugDisplay = () => {
    const { physicsWorld } = useVoxelEngine()

    const { physicsDebug } = useControls('voxels-culled-mesher-physics-debug', {
        physicsDebug: {
            label: 'Physics Debug',
            value: false,
        },
    })

    return physicsDebug && <PhysicsDebug world={physicsWorld} />
}

const Lights = () => {
    return (
        <>
            <ambientLight intensity={0.6} />
            <pointLight decay={0.5} intensity={10} position={[40, 20, 40]} />
            <pointLight decay={0.5} intensity={10} position={[-40, 20, -40]} />
        </>
    )
}

export default () => {
    return (
        <RapierInit>
            <Canvas camera={{ position: [20, 50, 50] }}>
                <VoxelEngine>
                    <Tools>
                        <SimpleLevel />

                        <Snow />

                        <Bounds fit margin={1.5}>
                            <VoxelChunkCulledMeshes />
                        </Bounds>

                        <PhysicsVoxelCubeRenderer />

                        <PhysicsDebugDisplay />

                        <Lights />
                    </Tools>
                </VoxelEngine>

                <OrbitControls makeDefault />
            </Canvas>
        </RapierInit>
    )
}
