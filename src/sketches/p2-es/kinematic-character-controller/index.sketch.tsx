import { Billboard, KeyboardControls, Text, useKeyboardControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Component, System, World } from 'arancini'
import { createECS } from 'arancini/react'
import * as p2 from 'p2-es'
import { useMemo } from 'react'
import { Box3, Vector3 } from 'three'
import { Canvas } from '../../../common'
import { Duck } from './duck'
import { KinematicCharacterController } from './kinematic-character-controller'

const SCENERY_GROUP = 0x01
const PLAYER_GROUP = 0x02

class PlayerComponent extends Component {}

class CameraComponent extends Component {
    camera!: THREE.Camera

    construct(camera: THREE.Camera) {
        this.camera = camera
    }
}

class Object3DComponent extends Component {
    object3D!: THREE.Object3D

    construct(object: THREE.Object3D) {
        this.object3D = object
    }
}

class PhysicsBodyComponent extends Component {
    body!: p2.Body

    construct(body: p2.Body) {
        this.body = body
    }
}

type PlayerInput = { up: boolean; left: boolean; right: boolean }

class PlayerInputComponent extends Component {
    input!: PlayerInput

    construct(input: PlayerInput) {
        this.input = input
    }
}

class KinematicCharacterControllerComponent extends Component {
    controller!: KinematicCharacterController

    construct() {}
}

class PhysicsSystem extends System {
    physicsWorld = new p2.World({ gravity: [0, -9.81] })

    physicsBodies = new Map<string, p2.Body>()

    physicsBodyQuery = this.query([PhysicsBodyComponent, Object3DComponent])

    static TIME_STEP = 1 / 60

    static MAX_SUB_STEPS = 10

    static MAX_STEP_DELTA = PhysicsSystem.TIME_STEP * 5

    onInit(): void {
        this.physicsBodyQuery.onEntityAdded.add((entity) => {
            const { body } = entity.get(PhysicsBodyComponent)
            this.physicsWorld.addBody(body)
            this.physicsBodies.set(entity.id, body)
        })

        this.physicsBodyQuery.onEntityRemoved.add((entity) => {
            const body = this.physicsBodies.get(entity.id)
            this.physicsBodies.delete(entity.id)

            if (body) {
                this.physicsWorld.removeBody(body)
            }
        })
    }

    onUpdate(delta: number): void {
        this.physicsWorld.step(
            PhysicsSystem.TIME_STEP,
            Math.min(delta, PhysicsSystem.MAX_STEP_DELTA),
            PhysicsSystem.MAX_SUB_STEPS,
        )

        for (const entity of this.physicsBodyQuery.entities) {
            const body = entity.get(PhysicsBodyComponent).body
            const three = entity.get(Object3DComponent).object3D

            three.position.set(body.interpolatedPosition[0], body.interpolatedPosition[1], 0)

            three.rotation.set(0, 0, body.angle)
        }
    }
}

class KinematicCharacterControllerSystem extends System {
    playerQuery = this.query([
        PlayerInputComponent,
        PhysicsBodyComponent,
        Object3DComponent,
        KinematicCharacterControllerComponent,
    ])

    onInit(): void {
        this.playerQuery.onEntityAdded.add((entity) => {
            const { body } = entity.get(PhysicsBodyComponent)

            const controller = new KinematicCharacterController({
                world: this.world.getSystem(PhysicsSystem)!.physicsWorld,
                body,
                collisionMask: SCENERY_GROUP,
                velocityXSmoothing: 0.0001,
                timeToJumpApex: 0.4,
                skinWidth: 0.2,
                wallJumpClimb: [15, 15],
            })

            entity.get(KinematicCharacterControllerComponent).controller = controller
        })
    }

    onUpdate(delta: number): void {
        for (const entity of this.playerQuery.entities) {
            const { input } = entity.get(PlayerInputComponent)
            const { controller } = entity.get(KinematicCharacterControllerComponent)
            const { object3D } = entity.get(Object3DComponent)

            let left = 0
            let right = 0
            if (input.left) {
                left = 1
            }
            if (input.right) {
                right = 1
            }
            controller.input[0] = right - left

            if (input.up) {
                controller.setJumpKeyState(true)
            } else {
                controller.setJumpKeyState(false)
            }

            controller.update(delta)
        }
    }
}

class PlayerModelSystem extends System {
    players = this.query([PlayerComponent, PlayerInputComponent, Object3DComponent])

    onUpdate(): void {
        for (const entity of this.players) {
            const { object3D } = entity.get(Object3DComponent)
            const { input } = entity.get(PlayerInputComponent)
            const { controller } = entity.get(KinematicCharacterControllerComponent)

            if (controller.wallSliding) {
                object3D.rotation.y = 0
            } else if (input.left) {
                object3D.rotation.y = -Math.PI / 2
            } else if (input.right) {
                object3D.rotation.y = Math.PI / 2
            } else {
                object3D.rotation.y = 0
            }
        }
    }
}

class CameraSystem extends System {
    camera = this.singleton(CameraComponent, { required: true })!

    players = this.query([PlayerComponent, PhysicsBodyComponent, Object3DComponent])

    box3 = new Box3()

    vec3 = new Vector3()

    cameraTargetPosition = new Vector3()

    onUpdate(delta: number): void {
        this.box3.min.set(0, 0, 0)
        this.box3.max.set(0, 0, 0)

        const points: Vector3[] = []
        for (const entity of this.players) {
            const { body } = entity.get(PhysicsBodyComponent)

            points.push({ x: body.interpolatedPosition[0], y: body.interpolatedPosition[1], z: 0 } as Vector3)
        }

        this.box3.setFromPoints(points)

        const { camera } = this.camera

        const center = this.box3.getCenter(this.vec3)

        this.cameraTargetPosition.copy(center)
        this.cameraTargetPosition.z = 10
        this.cameraTargetPosition.y += 2

        camera.position.lerp(this.cameraTargetPosition, 5 * delta)
        camera.lookAt(center)
    }
}

const world = new World()

world.registerComponent(Object3DComponent)
world.registerComponent(PhysicsBodyComponent)
world.registerComponent(PlayerInputComponent)
world.registerComponent(KinematicCharacterControllerComponent)
world.registerComponent(CameraComponent)
world.registerComponent(PlayerComponent)

world.registerSystem(KinematicCharacterControllerSystem)
world.registerSystem(PhysicsSystem)
world.registerSystem(CameraSystem)
world.registerSystem(PlayerModelSystem)

const ECS = createECS(world)

const Loop = () => {
    useFrame((_, delta) => {
        world.update(delta)
    })

    return null
}

const Camera = () => {
    const camera = useThree((s) => s.camera)

    return (
        <ECS.Entity>
            <ECS.Component type={CameraComponent} args={[camera]} />
        </ECS.Entity>
    )
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
        <ECS.Entity>
            <ECS.Component type={Object3DComponent}>
                <group>
                    <Duck />
                </group>
            </ECS.Component>
            <ECS.Component type={PhysicsBodyComponent} args={[player]} />
            <ECS.Component type={PlayerInputComponent} args={[input]} />
            <ECS.Component type={KinematicCharacterControllerComponent} />
            <ECS.Component type={PlayerComponent} />
        </ECS.Entity>
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
        <ECS.Entity>
            <ECS.Component type={Object3DComponent}>
                <mesh rotation={[0, 0, props.angle ?? 0]}>
                    <boxGeometry args={[props.width, props.height, 2]} />
                    <meshStandardMaterial color="#555" />
                </mesh>
            </ECS.Component>
            <ECS.Component type={PhysicsBodyComponent} args={[box]} />
        </ECS.Entity>
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

            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 40, 10]} intensity={0.5} />
        </Canvas>
    </KeyboardControls>
)
