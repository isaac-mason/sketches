import { Canvas } from '@/common'
import { Billboard, KeyboardControls, Text, useKeyboardControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { World } from 'arancini'
import { createReactAPI } from 'arancini/react'
import * as p2 from 'p2-es'
import { useMemo } from 'react'
import * as THREE from 'three'
import { Duck } from './duck'
import { KinematicCharacterController } from './kinematic-character-controller'

type EntityType = {
    isPlayer?: boolean
    camera?: THREE.Camera
    object3D?: THREE.Object3D
    physicsBody?: p2.Body
    playerInput?: { up: boolean; left: boolean; right: boolean }
    kinematicCharacterController?: KinematicCharacterController
}

const world = new World<EntityType>()

const SCENERY_GROUP = 0x01
const PLAYER_GROUP = 0x02

const TIME_STEP = 1 / 60
const MAX_SUB_STEPS = 10
const MAX_STEP_DELTA = TIME_STEP * 5

const physicsWorld = new p2.World({ gravity: [0, -9.81] })

const physicsBodiesQuery = world.query((e) => e.has('physicsBody', 'object3D'))

physicsBodiesQuery.onEntityAdded.add(({ physicsBody }) => {
    physicsWorld.addBody(physicsBody)
});

physicsBodiesQuery.onEntityRemoved.add(({ physicsBody }) => {
    if (physicsBody) {
        physicsWorld.removeBody(physicsBody)
    }
});

const physicsUpdate = (delta: number) => {
    physicsWorld.step(TIME_STEP, Math.min(delta, MAX_STEP_DELTA), MAX_SUB_STEPS)

    for (const { physicsBody, object3D } of physicsBodiesQuery.entities) {
        object3D.position.set(physicsBody.interpolatedPosition[0], physicsBody.interpolatedPosition[1], 0)
        object3D.rotation.set(0, 0, physicsBody.angle)
    }
}

const playerQuery = world.query((e) => e.has('playerInput', 'physicsBody', 'kinematicCharacterController', 'object3D'))


const kinematicCharacterControllersUpdate = (delta: number) => {
    for (const entity of playerQuery) {
        const { playerInput, kinematicCharacterController } = entity

        if (!kinematicCharacterController) continue

        let left = 0
        let right = 0

        if (playerInput.left) {
            left = 1
        }

        if (playerInput.right) {
            right = 1
        }

        kinematicCharacterController.input[0] = right - left

        if (playerInput.up) {
            kinematicCharacterController.setJumpKeyState(true)
        } else {
            kinematicCharacterController.setJumpKeyState(false)
        }

        kinematicCharacterController.update(delta)
    }
}

const playerAnimationUpdate = () => {
    for (const entity of playerQuery) {
        const { object3D, kinematicCharacterController } = entity

        if (kinematicCharacterController?.wallSliding) {
            object3D.rotation.y = 0
        } else if (entity.playerInput.left) {
            object3D.rotation.y = -Math.PI / 2
        } else if (entity.playerInput.right) {
            object3D.rotation.y = Math.PI / 2
        } else {
            object3D.rotation.y = 0
        }
    }
}

const cameraQuery = world.query((e) => e.has('camera'))

const _box3 = new THREE.Box3()
const _vec3 = new THREE.Vector3()

const cameraTargetPosition = new THREE.Vector3()

const cameraUpdate = (delta: number) => {
    _box3.min.set(0, 0, 0)
    _box3.max.set(0, 0, 0)

    const points: THREE.Vector3[] = []
    for (const entity of playerQuery) {
        const { physicsBody } = entity

        points.push({ x: physicsBody.interpolatedPosition[0], y: physicsBody.interpolatedPosition[1], z: 0 } as THREE.Vector3)
    }

    _box3.setFromPoints(points)

    const center = _box3.getCenter(_vec3)

    cameraTargetPosition.copy(center)
    cameraTargetPosition.z = 10
    cameraTargetPosition.y += 2

    const camera = cameraQuery.first!.camera

    camera.position.lerp(cameraTargetPosition, 5 * delta)
    camera.lookAt(center)
}

const { Entity, Component } = createReactAPI(world)

const Loop = () => {
    useFrame((_, delta) => {
        kinematicCharacterControllersUpdate(delta)
        physicsUpdate(delta)
        cameraUpdate(delta)
        playerAnimationUpdate()
    })

    return null
}

const Camera = () => {
    const camera = useThree((s) => s.camera)

    return <Entity camera={camera} />
}

const Player = () => {
    const [, getKeyboardControls] = useKeyboardControls()

    const input = useMemo(() => ({ left: false, right: true, up: true }), [])

    const playerBody = useMemo(() => {
        const body = new p2.Body({
            type: p2.Body.KINEMATIC,
            mass: 0,
            fixedRotation: true,
            damping: 0,
            position: [0, 2],
        })

        body.addShape(
            new p2.Box({
                width: 1,
                height: 2,
                collisionGroup: PLAYER_GROUP,
            }),
        )

        return body
    }, [])

    const kinematicCharacterController = useMemo(() => {
        return new KinematicCharacterController({
            world: physicsWorld,
            body: playerBody,
            collisionMask: SCENERY_GROUP,
            velocityXSmoothing: 0.0001,
            timeToJumpApex: 0.4,
            skinWidth: 0.2,
            wallJumpClimb: [15, 15],
        })
    }, [playerBody])

    useFrame(() => {
        const controls = getKeyboardControls() as {
            up: boolean
            left: boolean
            right: boolean
        }

        input.up = controls.up
        input.left = controls.left
        input.right = controls.right
    })

    return (
        <Entity isPlayer physicsBody={playerBody} playerInput={input} kinematicCharacterController={kinematicCharacterController}>
            <Component name="object3D">
                <group>
                    <Duck />
                </group>
            </Component>
        </Entity>
    )
}

const Box = (props: {
    position: [number, number]
    width: number
    height: number
    angle?: number
    mass?: number
    type?: typeof p2.Body.STATIC | typeof p2.Body.DYNAMIC
}) => {
    const box = useMemo(() => {
        const body = new p2.Body({
            position: props.position,
            angle: props.angle ?? 0,
            mass: props.mass || 0,
            type: props.type ?? p2.Body.STATIC,
        })

        body.addShape(
            new p2.Box({
                collisionGroup: SCENERY_GROUP,
                width: props.width,
                height: props.height,
            }),
        )

        return body
    }, [])

    return (
        <Entity physicsBody={box}>
            <Component name="object3D">
                <mesh rotation={[0, 0, props.angle ?? 0]}>
                    <boxGeometry args={[props.width, props.height, 2]} />
                    <meshStandardMaterial color="#555" />
                </mesh>
            </Component>
        </Entity>
    )
}

export function Sketch() {
    return (
        <KeyboardControls
            map={[
                { name: 'up', keys: ['ArrowUp', 'w', 'W'] },
                { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
                { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
            ]}
        >
            <Canvas>
                <Player />
                <Camera />
                <Loop />

                <Box width={15} height={1} position={[0, 0]} />

                <Box width={1} height={20} position={[-8, 10]} />
                <Box width={1} height={20} position={[8, 10]} />

                <Box width={8} height={1} angle={-0.4} position={[-6, 3]} />
                <Box width={18} height={1} angle={0.4} position={[4, 10]} />
                <Box width={12} height={1} position={[-4, 15]} />

                <Billboard follow={true}>
                    <Text color="orange" fontSize={0.5} position={[0, 3.5, 2]}>
                        USE WASD TO MOVE
                    </Text>
                </Billboard>

                <ambientLight intensity={1.5} />
                <directionalLight position={[10, 40, 10]} intensity={1.5} />
            </Canvas>
        </KeyboardControls>
    )
}
