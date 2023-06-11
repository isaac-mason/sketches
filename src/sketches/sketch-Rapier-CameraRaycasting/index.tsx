import Rapier from '@dimforge/rapier3d-compat'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Physics, RigidBody, useRapier } from '@react-three/rapier'
import { useControls as useLevaControls } from 'leva'
import { useState } from 'react'
import { Vector3 } from 'three'
import { Canvas } from '../../components/canvas'

const Shapes = {
    TORUS: 'TORUS',
    CUBE: 'CUBE',
    CYLINDER: 'CYLINDER',
    TORUS_KNOT: 'TORUS_KNOT',
    ICOSAHEDRON: 'ICOSAHEDRON',
    CONE: 'CONE',
    SPHERE: 'SPHERE',
} as const

type ShapeRapierUserData = {
    shape: typeof Shapes[keyof typeof Shapes]
}

const Scene = () => {
    const rapier = useRapier()
    const camera = useThree((state) => state.camera)
    const mouse = useThree((state) => state.mouse)

    const [raycastHit, setRaycastHit] = useState<
        ShapeRapierUserData['shape'] | null
    >(null)

    const [rayDirection] = useState(() => new Vector3())

    useFrame(() => {
        const { world } = rapier

        rayDirection
            .set(mouse.x, mouse.y, 0)
            .unproject(camera)
            .sub(camera.position)
            .normalize()

        const rayColliderIntersection = world.castRay(
            new Rapier.Ray(camera.position, rayDirection),
            100,
            false
        )

        if (!rayColliderIntersection) {
            if (raycastHit !== null) {
                setRaycastHit(null)
            }
        } else {
            const rigidBody = rayColliderIntersection.collider.parent()
            if (!rigidBody) return

            const shape = (rigidBody.userData as ShapeRapierUserData)?.shape
            if (raycastHit !== shape) {
                setRaycastHit(shape)
            }
        }
    })

    return (
        <>
            <RigidBody
                colliders="cuboid"
                type="fixed"
                position={[0, 3.2, 0]}
                rotation={[Math.PI / 4, 0, 0]}
                userData={{ shape: Shapes.CUBE } as ShapeRapierUserData}
            >
                <mesh>
                    <boxGeometry args={[1.2, 1.2, 1.2]} />
                    <meshStandardMaterial
                        color={raycastHit === Shapes.CUBE ? 'red' : '#666'}
                    />
                </mesh>
            </RigidBody>

            <RigidBody
                colliders="trimesh"
                type="fixed"
                position={[3.2, 0, 0]}
                rotation={[0, -Math.PI / 3, 0]}
                userData={{ shape: Shapes.TORUS } as ShapeRapierUserData}
            >
                <mesh>
                    <torusGeometry args={[0.8, 0.3, 64, 64]} />
                    <meshStandardMaterial
                        color={raycastHit === Shapes.TORUS ? 'red' : '#666'}
                    />
                </mesh>
            </RigidBody>

            <RigidBody
                colliders="hull"
                type="fixed"
                position={[-3.2, 0, 0]}
                rotation={[-Math.PI / 4, 0, -Math.PI / 3]}
                userData={{ shape: Shapes.CYLINDER } as ShapeRapierUserData}
            >
                <mesh>
                    <cylinderGeometry args={[0.6, 0.6, 1.4, 64]} />
                    <meshStandardMaterial
                        color={raycastHit === Shapes.CYLINDER ? 'red' : '#666'}
                    />
                </mesh>
            </RigidBody>

            <RigidBody
                colliders="trimesh"
                type="fixed"
                position={[0, 0, 0]}
                rotation={[-Math.PI / 4, 0, -Math.PI / 3]}
                userData={{ shape: Shapes.ICOSAHEDRON } as ShapeRapierUserData}
            >
                <mesh>
                    <torusKnotGeometry args={[1, 0.2, 64, 64]} />
                    <meshStandardMaterial
                        color={
                            raycastHit === Shapes.ICOSAHEDRON ? 'red' : '#666'
                        }
                    />
                </mesh>
            </RigidBody>

            <RigidBody
                colliders="hull"
                type="fixed"
                position={[0, -3.2, 0]}
                rotation={[0, 0, 0]}
                userData={{ shape: Shapes.TORUS_KNOT } as ShapeRapierUserData}
            >
                <mesh>
                    <icosahedronGeometry args={[1.2]} />
                    <meshStandardMaterial
                        color={
                            raycastHit === Shapes.TORUS_KNOT ? 'red' : '#666'
                        }
                    />
                </mesh>
            </RigidBody>

            <RigidBody
                colliders="hull"
                type="fixed"
                position={[0, 0, 3.2]}
                rotation={[-Math.PI / 4, 0, Math.PI / 4]}
                userData={{ shape: Shapes.CONE } as ShapeRapierUserData}
            >
                <mesh>
                    <coneGeometry args={[1.2, 1.6, 4]} />
                    <meshStandardMaterial
                        color={raycastHit === Shapes.CONE ? 'red' : '#666'}
                    />
                </mesh>
            </RigidBody>

            <RigidBody
                colliders="ball"
                type="fixed"
                position={[0, 0, -3.2]}
                rotation={[-Math.PI / 4, 0, 0]}
                userData={{ shape: Shapes.SPHERE } as ShapeRapierUserData}
            >
                <mesh>
                    <sphereGeometry args={[1, 64, 64]} />
                    <meshStandardMaterial
                        color={raycastHit === Shapes.SPHERE ? 'red' : '#666'}
                    />
                </mesh>
            </RigidBody>
        </>
    )
}

export default () => {
    const { debug } = useLevaControls('rapier-raycasting', {
        debug: false,
    })
    return (
        <>
            <h1>Rapier - Camera Raycasting</h1>
            <Canvas>
                <PerspectiveCamera
                    makeDefault
                    position={[-5, 0, 10]}
                    fov={60}
                />
                <OrbitControls autoRotate autoRotateSpeed={-0.5} />

                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={0.5} />
                <pointLight position={[-10, 10, -10]} intensity={0.5} />

                <Physics gravity={[0, 0, 0]} debug={debug}>
                    <Scene />
                </Physics>
            </Canvas>
        </>
    )
}
