import { Canvas } from '@/common/components/canvas'
import sunsetEnvironment from '@pmndrs/assets/hdri/sunset.exr'
import { Environment, KeyboardControls, PerspectiveCamera, useAnimations, useGLTF, useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { NavMeshHelper, threeToSoloNavMesh } from '@recast-navigation/three'
import { With, World } from 'arancini'
import { createReactAPI } from 'arancini/react'
import { useControls } from 'leva'
import { useEffect, useMemo, useState } from 'react'
import { NavMesh, NavMeshQuery, init as initRecast } from 'recast-navigation'
import { suspend } from 'suspend-react'
import * as THREE from 'three'
import characterGltfUrl from './character.glb?url'
import levelGlbUrl from './game-level-transformed.glb?url'

const LEVA_KEY = 'recast-navigation-character-controller'

type EntityType = {
    player?: true
    playerSpeed?: { walking: number; running: number }
    playerMovement?: { vector: THREE.Vector3; sprinting: boolean }
    playerInput?: {
        forward: boolean
        back: boolean
        left: boolean
        right: boolean
        sprint: boolean
    }
    playerAnimation?: {
        idle: THREE.AnimationAction
        walk: THREE.AnimationAction
        run: THREE.AnimationAction
    }
    camera?: THREE.PerspectiveCamera
    cameraConfiguration?: {
        offsetBehind: number
        offsetAbove: number
    }
    three?: THREE.Object3D
    traversable?: true
    navigationMesh?: {
        navMesh: NavMesh
        query: NavMeshQuery
    }
}

const world = new World<EntityType>()

const navigationMeshQuery = world.query((e) => e.has('navigationMesh'))
const traversableQuery = world.query((e) => e.has('traversable', 'three'))
const playerQuery = world.query((e) =>
    e.has('player', 'playerSpeed', 'playerAnimation', 'playerMovement', 'playerInput', 'three'),
)
const cameraQuery = world.query((e) => e.has('camera', 'cameraConfiguration'))!

const _movementTarget = new THREE.Vector3()

let firstPositionUpdate = true

const movementUpdate = (delta: number) => {
    const player = playerQuery.first

    if (!player || !navigationMeshQuery.first) return

    const navigationMesh = navigationMeshQuery.first.navigationMesh

    const {
        playerInput: input,
        three: playerObject,
        playerMovement: movement,
        playerSpeed: speed,
    } = player as With<typeof player, 'playerMovement'>

    const { left, right, forward, back, sprint } = input

    /* movement */
    const movementVector = movement.vector.set(0, 0, 0)

    if (forward || back) {
        if (forward) movementVector.z -= 1
        if (back) movementVector.z += 1
    }

    if (left || right) {
        if (left) movementVector.x -= 1
        if (right) movementVector.x += 1
    }

    const movementScalar = sprint ? speed.running : speed.walking

    const t = 1.0 - Math.pow(0.01, delta)

    movementVector.normalize().multiplyScalar(t).multiplyScalar(movementScalar)

    /* update position */
    if (movementVector.length() > 0 || firstPositionUpdate) {
        const { query: navMeshQuery } = navigationMesh

        const movementTarget = _movementTarget.copy(playerObject.position).add(movementVector)

        const { nearestRef: polyRef } = navMeshQuery.findNearestPoly(playerObject.position)

        const { resultPosition, visited } = navMeshQuery.moveAlongSurface(polyRef, playerObject.position, movementTarget)
        const moveAlongSurfaceFinalRef = visited[visited.length - 1]

        const { success: heightSuccess, height } = navMeshQuery.getPolyHeight(moveAlongSurfaceFinalRef, resultPosition)

        playerObject.position.copy(resultPosition as THREE.Vector3)

        if (heightSuccess) {
            playerObject.position.y = height
        }

        firstPositionUpdate = false
    }

    movement.sprinting = sprint
}

const _raycasterOrigin = new THREE.Vector3()
const _raycasterDirection = new THREE.Vector3()
const _playerEuler = new THREE.Euler()
const _playerQuaternion = new THREE.Quaternion()
const _raycaster = new THREE.Raycaster()
_raycaster.near = 0.01
_raycaster.far = 10

const animationUpdate = (delta: number) => {
    const player = playerQuery.first

    if (!player) return

    const t = 1.0 - Math.pow(0.01, delta)

    const { three: playerObject, playerMovement, playerAnimation } = player

    /* update rotation */
    if (playerMovement.vector.length() > 0) {
        const rotation = Math.atan2(playerMovement.vector.x, playerMovement.vector.z) - Math.PI

        const targetQuaternion = _playerQuaternion.setFromEuler(_playerEuler.set(0, rotation, 0))

        playerObject.quaternion.slerp(targetQuaternion, t * 5)
    }

    const speed = playerMovement.vector.length()

    /* update animation weights */
    let idleWeight: number
    let walkWeight: number
    let runWeight: number

    if (speed < 0.01) {
        idleWeight = 1
        walkWeight = 0
        runWeight = 0
    } else if (playerMovement.sprinting) {
        idleWeight = 0
        walkWeight = 0
        runWeight = 1
    } else {
        idleWeight = 0
        walkWeight = 1
        runWeight = 0
    }

    playerAnimation.idle.weight = THREE.MathUtils.lerp(playerAnimation.idle.weight, idleWeight, t)
    playerAnimation.walk.weight = THREE.MathUtils.lerp(playerAnimation.walk.weight, walkWeight, t)
    playerAnimation.run.weight = THREE.MathUtils.lerp(playerAnimation.run.weight, runWeight, t)

    /* raycast to correct character height */
    const characterRayOrigin = _raycasterOrigin.copy(playerObject.position)
    characterRayOrigin.y += 1

    const characterRayDirection = _raycasterDirection.set(0, -1, 0)
    _raycaster.set(characterRayOrigin, characterRayDirection)

    const characterRayHits = _raycaster.intersectObjects(
        traversableQuery.entities.map((e) => e.three),
        false,
    )
    const characterRayHit = characterRayHits
        .filter((hit) => hit.object.userData.walkable)
        .sort((a, b) => a.distance - b.distance)[0]

    const characterRayHitPoint = characterRayHit ? characterRayHit.point : undefined

    if (characterRayHitPoint) {
        const yDifference = Math.abs(characterRayHitPoint.y - playerObject.position.y)

        if (yDifference < 1) {
            playerObject.position.y = characterRayHitPoint.y
        }
    }
}

const cameraLookAt = new THREE.Vector3()
const cameraPosition = new THREE.Vector3()

const _cameraOffset = new THREE.Vector3(0, 0, 0)
const _cameraPositionTarget = new THREE.Vector3()

cameraQuery.onEntityAdded.add((e) => {
    cameraPosition.copy(e.camera.position)
})

const cameraUpdate = (delta: number) => {
    const player = playerQuery.first
    const cameraEntity = cameraQuery.first

    if (!player || !cameraEntity) return

    const { three: playerObject } = player
    const { camera, cameraConfiguration } = cameraEntity

    const cameraOffset = _cameraOffset.set(0, cameraConfiguration.offsetAbove, cameraConfiguration.offsetBehind)
    const cameraPositionTarget = _cameraPositionTarget.copy(playerObject.position).add(cameraOffset)

    const t = 1.0 - Math.pow(0.01, delta)

    cameraPosition.lerp(cameraPositionTarget, t / 1.1)
    camera.position.copy(cameraPosition)

    const lookAt = cameraLookAt.copy(cameraPosition).sub(cameraOffset)
    camera.lookAt(lookAt)
}

const { Entity, Component, useQuery } = createReactAPI(world)

const NavigationMesh = () => {
    const { showHelper, cellSize, cellHeight, walkableSlopeAngle, walkableClimb, walkableRadius, walkableHeight } = useControls(
        `${LEVA_KEY}-nav-mesh`,
        {
            showHelper: {
                label: 'Show Helper',
                value: true,
            },
            cellSize: {
                label: 'Cell Size',
                value: 0.1,
                min: 0.05,
                max: 0.2,
                step: 0.05,
            },
            cellHeight: {
                label: 'Cell Height',
                value: 0.05,
                min: 0.01,
                max: 0.5,
                step: 0.01,
            },
            walkableRadius: {
                label: 'Walkable Radius',
                value: 0.7,
                min: 0.1,
                max: 1,
                step: 0.1,
            },
            walkableSlopeAngle: {
                label: 'Walkable Slope Angle',
                value: 45,
                min: 0,
                max: 90,
                step: 1,
            },
            walkableClimb: {
                label: 'Walkable Climb',
                value: 0.4,
                min: 0.1,
                max: 1,
                step: 0.1,
            },
            walkableHeight: {
                label: 'Walkable Height',
                value: 1.5,
                min: 0.1,
                max: 3,
                step: 0.1,
            },
        },
    )
    const [navMeshHelper, setNavMeshHelper] = useState<NavMeshHelper>()

    const traversable = useQuery(traversableQuery)

    useEffect(() => {
        if (traversable.entities.length === 0) return

        const meshes: THREE.Mesh[] = []

        traversable.entities.forEach((e) => {
            e.three.traverse((object) => {
                if (object instanceof THREE.Mesh) {
                    meshes.push(object)
                }
            })
        })

        const { success, navMesh } = threeToSoloNavMesh(meshes, {
            cs: cellSize,
            ch: cellHeight,
            walkableSlopeAngle,
            walkableClimb: walkableClimb / cellHeight,
            walkableRadius: walkableRadius / cellSize,
            walkableHeight: walkableHeight / cellHeight,
            minRegionArea: 12,
        })

        if (!success) return

        const navMeshQuery = new NavMeshQuery(navMesh)

        const navigationMeshEntity = world.create({
            navigationMesh: {
                navMesh,
                query: navMeshQuery,
            },
        })

        const navMeshHelper = new NavMeshHelper(navMesh)
        navMeshHelper.position.y += 0.15

        setNavMeshHelper(navMeshHelper)

        return () => {
            setNavMeshHelper(undefined)

            world.destroy(navigationMeshEntity)

            navMesh.destroy()
            navMeshQuery.destroy()
        }
    }, [traversable.version, cellSize, cellHeight, walkableSlopeAngle, walkableClimb, walkableRadius, walkableHeight])

    return <>{navMeshHelper && showHelper && <primitive object={navMeshHelper} />}</>
}

const Traversable = ({ children }: { children: React.ReactNode }) => {
    return (
        <Entity traversable>
            <Component name="three">{children}</Component>
        </Entity>
    )
}

const Level = () => {
    const gltf = useGLTF(levelGlbUrl)

    useEffect(() => {
        gltf.scene.traverse((o) => {
            if (o instanceof THREE.Mesh) {
                o.castShadow = true
                o.receiveShadow = true
            }
        })
    }, [gltf])

    return (
        <>
            <Traversable>
                <group scale={0.01}>
                    <primitive object={gltf.scene} />
                </group>
            </Traversable>
        </>
    )
}

const KEYBOARD_CONTROLS_MAP = [
    { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
    { name: 'back', keys: ['ArrowDown', 's', 'S'] },
    { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
    { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
    { name: 'sprint', keys: ['ShiftLeft', 'ShiftRight'] },
]

const PlayerInputComponent = () => {
    const forward = useKeyboardControls((s) => s.forward)
    const back = useKeyboardControls((s) => s.back)
    const left = useKeyboardControls((s) => s.left)
    const right = useKeyboardControls((s) => s.right)
    const sprint = useKeyboardControls((s) => s.sprint)

    return <Component name="playerInput" value={{ forward, back, left, right, sprint }} />
}

type PlayerProps = {
    initialPosition: THREE.Vector3Tuple
}

const Player = ({ initialPosition }: PlayerProps) => {
    const { animations, scene: characterGltf } = useGLTF(characterGltfUrl)
    const { ref, actions: gltfActions } = useAnimations(animations)

    const [actions, setActions] = useState<EntityType['playerAnimation']>()

    const playerSpeed = useControls(`${LEVA_KEY}-player-speed`, {
        walking: {
            label: 'Walking Speed',
            value: 0.8,
        },
        running: {
            label: 'Running Speed',
            value: 1.5,
        },
    })

    const playerMovement = useMemo(
        () => ({
            vector: new THREE.Vector3(),
            sprinting: false,
        }),
        [],
    )

    useEffect(() => {
        const idleAction = gltfActions['Idle']!
        idleAction.loop = THREE.LoopRepeat
        idleAction.weight = 1
        idleAction.play()

        const walkAction = gltfActions['Walk']!
        walkAction.loop = THREE.LoopRepeat
        walkAction.weight = 0
        walkAction.timeScale = 1.5
        walkAction.play()

        const runAction = gltfActions['Run']!
        runAction.loop = THREE.LoopRepeat
        runAction.weight = 0
        runAction.play()

        setActions({
            idle: idleAction,
            walk: walkAction,
            run: runAction,
        })
    }, [])

    return (
        <Entity player playerSpeed={playerSpeed} playerMovement={playerMovement}>
            {/* player object3d */}
            <Component name="three">
                <group position={initialPosition}>
                    <primitive ref={ref} object={characterGltf} rotation-y={-Math.PI} />
                </group>
            </Component>

            {/* player input */}
            <KeyboardControls map={KEYBOARD_CONTROLS_MAP}>
                <PlayerInputComponent />
            </KeyboardControls>

            {/* add animations component when actions loaded */}
            {actions && <Component name="playerAnimation" value={actions} />}
        </Entity>
    )
}

const Camera = () => {
    const cameraConfiguration = useControls(`${LEVA_KEY}-camera`, {
        offsetBehind: {
            label: 'Offset Behind',
            value: 10,
        },
        offsetAbove: {
            label: 'Offset Above',
            value: 15,
        },
    })

    return (
        <Entity cameraConfiguration={cameraConfiguration}>
            <Component name="camera">
                <PerspectiveCamera makeDefault position={[0, 1000, 1000]} />
            </Component>
        </Entity>
    )
}

const App = () => {
    useFrame((_, delta) => {
        movementUpdate(delta)
        animationUpdate(delta)
        cameraUpdate(delta)
    })

    return (
        <>
            <Level />

            <NavigationMesh />

            <Player initialPosition={[21, -1.76, -63.53]} />

            <Camera />

            <Environment files={sunsetEnvironment} />
        </>
    )
}

export function Sketch() {
    suspend(async () => {
        await initRecast()
    }, [])

    return (
        <Canvas shadows={{ type: THREE.PCFSoftShadowMap }}>
            <App />
        </Canvas>
    )
}
