import Rapier from '@dimforge/rapier3d-compat'
import { Bounds, OrbitControls } from '@react-three/drei'
import { ThreeEvent } from '@react-three/fiber'
import { useControls } from 'leva'
import { useEffect } from 'react'
import { Color } from 'three'
import { Canvas } from '../../../../common'
import { CorePlugin, Vec3 } from '../../engine/core'
import { CulledMesherPlugin, VoxelChunkMeshComponent } from '../../engine/culled-mesher'
import { PhysicsDebug, PhysicsPlugin, RapierInit } from '../../engine/physics'
import { useVoxelEngine } from '../../engine/use-voxel-engine'

const gray = new Color('#666').getHex()
const orange = new Color('orange').getHex()

const Sphere = () => {
    const { world, physicsWorld, voxelWorld, setBlock, CulledMeshes } = useVoxelEngine([
        CorePlugin,
        CulledMesherPlugin,
        PhysicsPlugin,
    ])

    useEffect(() => {
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

        // drop some physics bodies into the container
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * 6 - 3
            const y = 10 + i * 2
            const z = Math.random() * 6 - 3

            const rigidBody = physicsWorld.createRigidBody(Rapier.RigidBodyDesc.dynamic().setTranslation(x, y, z))
            physicsWorld.createCollider(Rapier.ColliderDesc.ball(1), rigidBody)
        }
    }, [voxelWorld])

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

    return (
        <>
            <Bounds fit margin={1.5}>
                <group onPointerDown={onPointerDown}>
                    <CulledMeshes />
                </group>
            </Bounds>

            <PhysicsDebug world={physicsWorld} />

            <ambientLight intensity={0.2} />
            <pointLight intensity={0.5} position={[20, 20, 20]} />
            <pointLight intensity={0.5} position={[-20, 20, -20]} />
        </>
    )
}

export default () => {
    return (
        <RapierInit>
            <Canvas camera={{ position: [5, 20, 5] }}>
                <Sphere />
                <OrbitControls makeDefault />
            </Canvas>
        </RapierInit>
    )
}
