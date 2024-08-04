import Rapier from '@dimforge/rapier3d-compat'
import { OrbitControls, Wireframe } from '@react-three/drei'
import { Vector3 as Vector3Tuple, useThree } from '@react-three/fiber'
import {
    Physics,
    RapierRigidBody,
    RigidBody,
    RigidBodyProps,
    useRapier
} from '@react-three/rapier'
import { useControls } from 'leva'
import { useEffect, useRef, useState } from 'react'
import { Mesh, Quaternion, Raycaster, Vector3 } from 'three'
import { Canvas, usePageVisible } from '@/common'
import { getQueryParamOrDefault } from '@/common/utils/url-query-param'

const LEVA_KEY = 'rapier-pointer-constraint'

type DraggableUserData = {
    draggable: boolean
}

type PointerConstraintControlsProps = {
    target: Vector3Tuple
}

const SPHERICAL_CONSTRAINT = 'spherical constraint'
const SPRING = 'spring'
const ROPE_JOINT = 'rope joint'
const OPTIONS = [SPHERICAL_CONSTRAINT, SPRING, ROPE_JOINT]

const PointerControls = ({ target }: PointerConstraintControlsProps) => {
    const { type, pointerRigidBodyVisible, movementPlaneVisible } = useControls(LEVA_KEY, {
        type: {
            label: 'Type',
            value: getQueryParamOrDefault('type', SPHERICAL_CONSTRAINT, (value) => OPTIONS.includes(value)),
            options: OPTIONS,
        },
        pointerRigidBodyVisible: {
            label: 'Show Pointer Rigid Body',
            value: true,
        },
        movementPlaneVisible: {
            label: 'Show Movement Plane',
            value: false,
        },
    })

    const rapier = useRapier()
    const camera = useThree((state) => state.camera)
    const gl = useThree((state) => state.gl)
    const mouse = useThree((state) => state.mouse)

    const pointerRigidBody = useRef<RapierRigidBody>(null!)
    const movementPlane = useRef<Mesh>(null!)

    const joint = useRef<Rapier.ImpulseJoint | Rapier.SpringImpulseJoint | null>(null)

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

        const onPointerDown = () => {
            if (joint.current) {
                onPointerUp()
            }

            rayDirection.set(mouse.x, mouse.y, 1).unproject(camera).sub(camera.position).normalize()

            const rayColliderIntersection = world.castRay(new Rapier.Ray(camera.position, rayDirection), 100, true)

            const rigidBody = rayColliderIntersection?.collider.parent()
            if (!rigidBody || !(rigidBody.userData as DraggableUserData | undefined)?.draggable) return

            const rayHitPosition = new Vector3()
                .copy(camera.position)
                .add(rayDirection.multiplyScalar(rayColliderIntersection!.timeOfImpact))

            movementPlane.current.position.copy(rayHitPosition)
            movementPlane.current.quaternion.copy(camera.quaternion)
            movementPlane.current.updateMatrixWorld()

            pointerRigidBody.current.setTranslation(rayHitPosition, true)

            const rayHitPositionBodyLocalFrame = new Vector3()
                .copy(rayHitPosition)
                .sub(rigidBody.translation() as Vector3)
                .applyQuaternion(new Quaternion().copy(rigidBody.rotation() as Quaternion).conjugate())

            if (type === SPRING) {
                joint.current = world.createImpulseJoint(
                    Rapier.JointData.spring(
                        0, // rest length
                        20, // stiffness
                        5, // damping
                        new Rapier.Vector3(0, 0, 0),
                        new Rapier.Vector3(
                            rayHitPositionBodyLocalFrame.x,
                            rayHitPositionBodyLocalFrame.y,
                            rayHitPositionBodyLocalFrame.z,
                        ),
                    ),
                    pointerRigidBody.current,
                    rigidBody,
                    true,
                )
            } else if (type === ROPE_JOINT) {
                joint.current = world.createImpulseJoint(
                    Rapier.JointData.rope(
                        0.5, // length
                        new Rapier.Vector3(0, 0, 0),
                        new Rapier.Vector3(
                            rayHitPositionBodyLocalFrame.x,
                            rayHitPositionBodyLocalFrame.y,
                            rayHitPositionBodyLocalFrame.z,
                        ),
                    ),
                    pointerRigidBody.current,
                    rigidBody,
                    true,
                )
            } else {
                joint.current = world.createImpulseJoint(
                    Rapier.JointData.spherical(new Rapier.Vector3(0, 0, 0), rayHitPositionBodyLocalFrame),
                    pointerRigidBody.current,
                    rigidBody,
                    true,
                )
            }

            setDragging(true)
        }

        const onPointerUp = () => {
            if (joint.current) {
                world.removeImpulseJoint(joint.current, true)
            }

            joint.current = null
            
            setDragging(false)
        }

        const onPointerMove = () => {
            if (!joint.current) return
            updatePointerRigidBody()
        }

        const domElement = document.body

        domElement.addEventListener('pointerdown', onPointerDown)
        domElement.addEventListener('pointerup', onPointerUp)
        domElement.addEventListener('pointermove', onPointerMove)

        return () => {
            domElement.removeEventListener('pointerdown', onPointerDown)
            domElement.removeEventListener('pointerup', onPointerUp)
            domElement.removeEventListener('pointermove', onPointerMove)
        }
    }, [type, camera, mouse, gl])

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
        <RigidBody {...props} colliders="cuboid" type="dynamic" userData={{ draggable: true } as DraggableUserData}>
            <mesh castShadow receiveShadow>
                <boxGeometry args={[1.2, 1.2, 1.2]} />
                <meshStandardMaterial color="aquamarine" attach="material-0" />
                <meshStandardMaterial color="yellow" attach="material-1" />
                <meshStandardMaterial color="hotpink" attach="material-2" />
                <meshStandardMaterial color="skyblue" attach="material-3" />
                <meshStandardMaterial color="orange" attach="material-4" />
                <meshStandardMaterial color="indianred" attach="material-5" />
            </mesh>
        </RigidBody>
    )
}

const Torus = (props: RigidBodyProps) => {
    return (
        <RigidBody {...props} colliders="trimesh" type="dynamic" userData={{ draggable: true } as DraggableUserData}>
            <mesh castShadow receiveShadow>
                <torusGeometry args={[0.6, 0.2, 16, 32]} />
                <meshStandardMaterial color="orange" />
            </mesh>
        </RigidBody>
    )
}

const Sphere = (props: RigidBodyProps) => {
    return (
        <RigidBody {...props} colliders="ball" type="dynamic" userData={{ draggable: true } as DraggableUserData}>
            <mesh castShadow receiveShadow>
                <sphereGeometry args={[0.6]} />
                <meshStandardMaterial color="hotpink" />

                <Wireframe />
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

export function Sketch() {
    const visible = usePageVisible()

    const { debug } = useControls(`${LEVA_KEY}-debug`, {
        debug: false,
    })

    return (
        <>
            <Canvas camera={{ position: [4, 4, 4] }} shadows>
                <Physics paused={!visible} debug={debug} numSolverIterations={1}>
                    <PointerControls target={[0, 1, 0]} />

                    <Torus position={[-2, 5, 2]} />
                    <Cube position={[0, 5, 0]} rotation={[-Math.PI / 8, -Math.PI / 8, 0]} />
                    <Sphere position={[2, 5, -2]} angularVelocity={[1, 0, -0.5]} />

                    <Floor />

                    <ambientLight intensity={1.5} />
                    <pointLight position={[-10, 5, 10]} intensity={100} />
                </Physics>
            </Canvas>
        </>
    )
}
