import Rapier from '@dimforge/rapier3d-compat'
import { useThree } from '@react-three/fiber'
import {
    Debug,
    Physics,
    RigidBody,
    RigidBodyApi,
    RigidBodyProps,
    useRapier,
} from '@react-three/rapier'
import { useControls } from 'leva'
import { useEffect, useRef, useState } from 'react'
import { Mesh, Quaternion, Raycaster, Vector3 } from 'three'
import { usePageVisible } from '../../hooks/use-page-visible'
import { Canvas } from '../Canvas'

const LEVA_KEY = 'rapier-mouse-pick'

type DraggableUserData = {
    draggable: boolean
}

const MousePick = () => {
    const { movementPlaneVisible } = useControls(`${LEVA_KEY}-movement-plane`, {
        movementPlaneVisible: false,
    })

    const rapier = useRapier()

    const camera = useThree((state) => state.camera)
    const gl = useThree((state) => state.gl)
    const mouse = useThree((state) => state.mouse)

    const mouseRigidBody = useRef<RigidBodyApi>(null!)
    const movementPlane = useRef<Mesh>(null!)

    const currentlyDragging = useRef<Rapier.RigidBody | null>(null)
    const joint = useRef<Rapier.ImpulseJoint | null>(null)

    const [rayDirection] = useState(() => new Vector3())
    const [raycaster] = useState(() => new Raycaster())

    useEffect(() => {
        const world = rapier.world.raw()
        const { domElement } = gl

        const updatePointerRigidBody = () => {
            raycaster.setFromCamera(mouse, camera)
            const hits = raycaster.intersectObject(movementPlane.current)
            const hitPoint = hits.length > 0 ? hits[0].point : undefined

            if (!hitPoint) return

            mouseRigidBody.current.setTranslation(hitPoint)
        }

        const onPointerDown = () => {
            // If we're already dragging something, release it
            if (currentlyDragging.current) {
                onPointerUp()
            }

            // Raycast
            rayDirection
                .set(mouse.x, mouse.y, 0.5)
                .unproject(camera)
                .sub(camera.position)
                .normalize()

            const rayColliderIntersection = world.castRay(
                new Rapier.Ray(camera.position, rayDirection),
                100,
                false
            )

            const rigidBody = rayColliderIntersection?.collider.parent()
            if (!rigidBody) return

            const draggable = (
                rigidBody.userData as DraggableUserData | undefined
            )?.draggable
            if (!draggable) return

            currentlyDragging.current = rigidBody

            // Move movement plane to the ray hit position and face it towards the camera
            const rayHitPosition = new Vector3()
                .copy(camera.position)
                .add(rayDirection.multiplyScalar(rayColliderIntersection!.toi))

            movementPlane.current.position.copy(rayHitPosition)
            movementPlane.current.quaternion.copy(camera.quaternion)

            // Move the pointer rigid body
            updatePointerRigidBody()

            // Create a ball joint
            const rigidBodyAnchor = new Vector3()
                .copy(mouseRigidBody.current.translation())
                .sub(rigidBody.translation() as Vector3)
                .applyQuaternion(
                    new Quaternion()
                        .copy(rigidBody.rotation() as Quaternion)
                        .conjugate()
                )

            joint.current = world.createImpulseJoint(
                Rapier.JointData.spherical(
                    new Rapier.Vector3(0, 0, 0),
                    rigidBodyAnchor
                ),
                mouseRigidBody.current.raw(),
                rigidBody,
                true
            )
        }

        const onPointerUp = () => {
            currentlyDragging.current = null

            if (joint.current) {
                world.removeImpulseJoint(joint.current, true)
                joint.current = null
            }
        }

        const onPointerMove = () => {
            if (!currentlyDragging.current) return

            updatePointerRigidBody()
        }

        domElement.addEventListener('pointerdown', onPointerDown)
        domElement.addEventListener('pointerup', onPointerUp)
        domElement.addEventListener('pointermove', onPointerMove)

        return () => {
            domElement.removeEventListener('pointerdown', onPointerDown)
            domElement.removeEventListener('pointerup', onPointerUp)
            domElement.removeEventListener('pointermove', onPointerMove)
        }
    }, [camera, mouse, gl])

    return (
        <>
            <mesh visible={movementPlaneVisible} ref={movementPlane}>
                <planeGeometry args={[100, 100]} />
                <meshStandardMaterial transparent opacity={0.2} />
            </mesh>

            <RigidBody ref={mouseRigidBody} colliders={false} type="fixed">
                <mesh>
                    <sphereGeometry args={[0.1]} />
                    <meshBasicMaterial color="red" />
                </mesh>
            </RigidBody>
        </>
    )
}

const Cube = (props: RigidBodyProps) => {
    return (
        <RigidBody
            {...props}
            colliders="cuboid"
            type="dynamic"
            userData={{ draggable: true } as DraggableUserData}
        >
            <mesh castShadow receiveShadow>
                <boxGeometry args={[1.2, 1.2, 1.2]} />
                <meshStandardMaterial color="orange" />
            </mesh>
        </RigidBody>
    )
}

const Sphere = (props: RigidBodyProps) => {
    return (
        <RigidBody
            {...props}
            colliders="ball"
            type="dynamic"
            userData={{ draggable: true } as DraggableUserData}
        >
            <mesh castShadow receiveShadow>
                <sphereGeometry args={[0.6]} />
                <meshStandardMaterial color="orange" />
            </mesh>
        </RigidBody>
    )
}

const Floor = () => (
    <RigidBody colliders="cuboid" type="fixed" position={[0, -1, 0]}>
        <mesh receiveShadow>
            <boxGeometry args={[100, 2, 100]} />
            <meshStandardMaterial color="#555" />
        </mesh>
    </RigidBody>
)

const Scene = () => (
    <>
        <MousePick />

        <Cube position={[0, 1, 0]} />
        <Sphere position={[2, 1, 0]} />
        <Floor />

        <ambientLight intensity={0.5} />
        <pointLight position={[10, 5, -10]} />
    </>
)

export default () => {
    const visible = usePageVisible()

    const { debug } = useControls(`${LEVA_KEY}-debug`, {
        debug: false,
    })

    return (
        <>
            <h1 style={{ pointerEvents: 'none' }}>Rapier - Mouse Pick</h1>

            <Canvas camera={{ position: [0, 3, 5] }} shadows>
                <Physics paused={!visible}>
                    <Scene />
                    {debug && <Debug />}
                </Physics>
            </Canvas>
        </>
    )
}
