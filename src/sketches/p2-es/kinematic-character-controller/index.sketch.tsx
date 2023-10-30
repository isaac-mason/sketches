import { Billboard, KeyboardControls, Text, useKeyboardControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { System, World } from 'arancini'
import { createECS } from 'arancini/react'
import * as p2 from 'p2-es'
import { useMemo } from 'react'
import { Box3, Vector3 } from 'three'
import { Canvas } from '../../../common'
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

const SCENERY_GROUP = 0x01
const PLAYER_GROUP = 0x02

class PhysicsSystem extends System<EntityType> {
    physicsWorld = new p2.World({ gravity: [0, -9.81] })

    physicsBodies = new Map<string, p2.Body>()

    physicsBodyQuery = this.query((e) => e.has('physicsBody', 'object3D'))

    static TIME_STEP = 1 / 60

    static MAX_SUB_STEPS = 10

    static MAX_STEP_DELTA = PhysicsSystem.TIME_STEP * 5

    onInit(): void {
        this.physicsBodyQuery.onEntityAdded.add(({ physicsBody }) => {
            this.physicsWorld.addBody(physicsBody)
        })

        this.physicsBodyQuery.onEntityRemoved.add(({ physicsBody }) => {
            if (physicsBody) {
                this.physicsWorld.removeBody(physicsBody)
            }
        })
    }

    onUpdate(delta: number): void {
        this.physicsWorld.step(
            PhysicsSystem.TIME_STEP,
            Math.min(delta, PhysicsSystem.MAX_STEP_DELTA),
            PhysicsSystem.MAX_SUB_STEPS,
        )

        for (const { physicsBody, object3D } of this.physicsBodyQuery.entities) {
            object3D.position.set(physicsBody.interpolatedPosition[0], physicsBody.interpolatedPosition[1], 0)

            object3D.rotation.set(0, 0, physicsBody.angle)
        }
    }
}

class KinematicCharacterControllerSystem extends System<EntityType> {
    playerQuery = this.query((e) => e.has('playerInput', 'physicsBody'))

    onInit(): void {
        this.playerQuery.onEntityAdded.add((entity) => {
            const { physicsBody } = entity

            const controller = new KinematicCharacterController({
                world: this.world.getSystem(PhysicsSystem)!.physicsWorld,
                body: physicsBody,
                collisionMask: SCENERY_GROUP,
                velocityXSmoothing: 0.0001,
                timeToJumpApex: 0.4,
                skinWidth: 0.2,
                wallJumpClimb: [15, 15],
            })

            world.add(entity, 'kinematicCharacterController', controller)
        })
    }

    onUpdate(delta: number): void {
        for (const entity of this.playerQuery.entities) {
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
}

class PlayerModelSystem extends System<EntityType> {
    players = this.query((e) => e.has('isPlayer', 'playerInput', 'object3D', 'kinematicCharacterController'))

    onUpdate(): void {
        for (const entity of this.players) {
            const { object3D, playerInput, kinematicCharacterController } = entity

            if (kinematicCharacterController?.wallSliding) {
                object3D.rotation.y = 0
            } else if (playerInput.left) {
                object3D.rotation.y = -Math.PI / 2
            } else if (playerInput.right) {
                object3D.rotation.y = Math.PI / 2
            } else {
                object3D.rotation.y = 0
            }
        }
    }
}

class CameraSystem extends System {
    camera = this.singleton('camera', { required: true })!

    players = this.query((e) => e.has('isPlayer', 'physicsBody', 'object3D'))

    box3 = new Box3()

    vec3 = new Vector3()

    cameraTargetPosition = new Vector3()

    onUpdate(delta: number): void {
        this.box3.min.set(0, 0, 0)
        this.box3.max.set(0, 0, 0)

        const points: Vector3[] = []
        for (const entity of this.players) {
            const { physicsBody } = entity

            points.push({ x: physicsBody.interpolatedPosition[0], y: physicsBody.interpolatedPosition[1], z: 0 } as Vector3)
        }

        this.box3.setFromPoints(points)

        const center = this.box3.getCenter(this.vec3)

        this.cameraTargetPosition.copy(center)
        this.cameraTargetPosition.z = 10
        this.cameraTargetPosition.y += 2

        this.camera.position.lerp(this.cameraTargetPosition, 5 * delta)
        this.camera.lookAt(center)
    }
}

const world = new World<EntityType>({
    components: ['isPlayer', 'camera', 'object3D', 'physicsBody', 'playerInput', 'kinematicCharacterController'],
})

world.registerSystem(KinematicCharacterControllerSystem)
world.registerSystem(PhysicsSystem)
world.registerSystem(CameraSystem)
world.registerSystem(PlayerModelSystem)

world.init()

const { Entity, Component } = createECS(world)

const Loop = () => {
    useFrame((_, delta) => {
        world.step(delta)
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

    const player = useMemo(() => {
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
        <Entity isPlayer physicsBody={player} playerInput={input}>
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

export default () => (
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
