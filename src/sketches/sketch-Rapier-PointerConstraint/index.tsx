import Rapier from '@dimforge/rapier3d-compat'
import { OrbitControls } from '@react-three/drei'
import { useThree, Vector3 as Vector3Tuple } from '@react-three/fiber'
import {
    Physics,
    RapierRigidBody,
    RigidBody,
    RigidBodyProps,
    useRapier,
} from '@react-three/rapier'
import { useControls } from 'leva'
import { useEffect, useRef, useState } from 'react'
import { Mesh, Quaternion, Raycaster, Vector3 } from 'three'
import { Canvas, usePageVisible } from '../../common'

const LEVA_KEY = 'rapier-pointer-constraint'

type DraggableUserData = {
    draggable: boolean
}

type PointerConstraintControlsProps = {
    target: Vector3Tuple
}

const PointerConstraintControls = ({
    target,
}: PointerConstraintControlsProps) => {
    const { pointerRigidBodyVisible, movementPlaneVisible } = useControls(
        `${LEVA_KEY}-movement-plane`,
        {
            pointerRigidBodyVisible: {
                label: 'Show Pointer Rigid Body',
                value: true,
            },
            movementPlaneVisible: {
                label: 'Show Movement Plane',
                value: false,
            },
        }
    )

    const rapier = useRapier()
    const camera = useThree((state) => state.camera)
    const gl = useThree((state) => state.gl)
    const mouse = useThree((state) => state.mouse)

    const pointerRigidBody = useRef<RapierRigidBody>(null!)
    const movementPlane = useRef<Mesh>(null!)

    const joint = useRef<Rapier.ImpulseJoint | null>(null)

    const [rayDirection] = useState(() => new Vector3())
    const [raycaster] = useState(() => new Raycaster())
    const [dragging, setDragging] = useState(false)

    const updatePointerRigidBody = () => {
        raycaster.setFromCamera(mouse, camera)
        const hits = raycaster.intersectObject(movementPlane.current)
        const hitPoint = hits.length > 0 ? hits[0].point : undefined

        if (!hitPoint) return

        pointerRigidBody.current.setTranslation(hitPoint, true)
    }

    useEffect(() => {
        const { world } = rapier
        const { domElement } = gl

        const onPointerDown = () => {
            if (joint.current) {
                onPointerUp()
            }

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

            setDragging(true)

            const rayHitPosition = new Vector3()
                .copy(camera.position)
                .add(rayDirection.multiplyScalar(rayColliderIntersection!.toi))

            movementPlane.current.position.copy(rayHitPosition)
            movementPlane.current.quaternion.copy(camera.quaternion)
            movementPlane.current.updateMatrixWorld()
            updatePointerRigidBody()

            const rigidBodyAnchor = new Vector3()
                .copy(pointerRigidBody.current.translation() as Vector3)
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
                pointerRigidBody.current,
                rigidBody,
                true
            )
        }

        const onPointerUp = () => {
            if (joint.current) {
                world.removeImpulseJoint(joint.current, true)
                joint.current = null
            }

            setDragging(false)
        }

        const onPointerMove = () => {
            if (!joint.current) return
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
            <mesh ref={movementPlane} visible={movementPlaneVisible}>
                <planeGeometry args={[100, 100]} />
                <meshStandardMaterial transparent opacity={0.2} />
            </mesh>

            <RigidBody ref={pointerRigidBody} colliders={false} type="fixed">
                <mesh visible={pointerRigidBodyVisible}>
                    <sphereGeometry args={[0.1]} />
                    <meshBasicMaterial color="red" />
                </mesh>
            </RigidBody>

            <OrbitControls enabled={!dragging} target={target} />
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

const Floor = () => (
    <RigidBody colliders="cuboid" type="fixed" position={[0, -1, 0]}>
        <mesh receiveShadow>
            <boxGeometry args={[100, 2, 100]} />
            <meshStandardMaterial color="#555" />
        </mesh>
    </RigidBody>
)

export default () => {
    const visible = usePageVisible()

    const { debug } = useControls(`${LEVA_KEY}-debug`, {
        debug: false,
    })

    return (
        <>
            <h1 style={{ pointerEvents: 'none' }}>
                Rapier - Pointer Constraint
            </h1>

            <Canvas camera={{ position: [4, 4, 4] }} shadows>
                <Physics paused={!visible} debug={debug}>
                    <PointerConstraintControls target={[0, 1, 0]} />

                    <Cube position={[0, 5, 0]} />
                    <Floor />

                    <ambientLight intensity={0.5} />
                    <pointLight position={[-10, 5, 10]} />
                </Physics>
            </Canvas>
        </>
    )
}
