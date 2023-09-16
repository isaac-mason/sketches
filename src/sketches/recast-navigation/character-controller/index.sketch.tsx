import cityEnvironment from '@pmndrs/assets/hdri/city.exr'
import { Environment, KeyboardControls, useAnimations, useGLTF, useKeyboardControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import { NavMesh, NavMeshQuery, init } from 'recast-navigation'
import { NavMeshHelper, threeToSoloNavMesh } from 'recast-navigation/three'
import { suspend } from 'suspend-react'
import { Group, LoopRepeat, MathUtils, Mesh, MeshBasicMaterial, Object3D, Raycaster, Vector3 } from 'three'
import { create } from 'zustand'
import characterGltfUrl from './character.glb?url'
import { Chest } from './chest'
import { Crate } from './crate'

type NavigationState = {
    navMesh: NavMesh | undefined
    navMeshQuery: NavMeshQuery | undefined
    walkableMeshes: Mesh[]
}

const useNavigation = create<
    NavigationState & {
        set: (state: Partial<NavigationState>) => void
    }
>((set) => ({
    navMesh: undefined,
    navMeshQuery: undefined,
    walkableMeshes: [],
    set,
}))

const Navigation = () => {
    const { debugNavMesh } = useControls('navigation-navmesh', {
        debugNavMesh: {
            label: 'Debug NavMesh',
            value: true,
        },
    })

    const { navMesh, set: setNavigation } = useNavigation()

    const group = useRef<Group>(null!)

    useEffect(() => {
        const meshes: Mesh[] = []

        group.current.traverse((child) => {
            if (child instanceof Mesh) {
                child.userData.walkable = true
                meshes.push(child)
            }
        })

        const cs = 0.1
        const ch = 0.1
        const { success, navMesh } = threeToSoloNavMesh(meshes, {
            cs,
            ch,
            walkableRadius: 0.5 / cs,
            walkableHeight: 2 / cs,
        })

        if (!success) return

        const navMeshQuery = new NavMeshQuery({ navMesh })

        setNavigation({
            navMesh,
            navMeshQuery,
            walkableMeshes: meshes,
        })

        return () => {
            setNavigation({
                navMesh: undefined,
                navMeshQuery: undefined,
                walkableMeshes: [],
            })

            navMesh.destroy()
            navMeshQuery.destroy()
        }
    }, [])

    const navMeshHelper = useMemo(() => {
        if (!navMesh || !debugNavMesh) return null

        return new NavMeshHelper({ navMesh, navMeshMaterial: new MeshBasicMaterial({ color: '', wireframe: true }) })
    }, [navMesh, debugNavMesh])

    return (
        <>
            <group ref={group}>
                {/* base */}
                <mesh position-y={-0.2}>
                    <meshStandardMaterial color="#333" />
                    <boxGeometry args={[10, 0.2, 10]} />
                </mesh>

                <mesh position={[0, 0.5, -5]} rotation-x={Math.PI * 0.15}>
                    <meshStandardMaterial color="#333" />
                    <boxGeometry args={[2, 0.2, 5]} />
                </mesh>

                <mesh position={[0, 1.65, -9.5]}>
                    <meshStandardMaterial color="#333" />
                    <boxGeometry args={[5, 0.2, 5]} />
                </mesh>

                <Crate position={[2, 0, -1.5]} rotation-y={-Math.PI / 4} scale={2} />

                <Crate position={[-2, 0, 1.5]} rotation-y={-Math.PI / 4} scale={2} />

                <Chest position={[0, 1.65, -10]} scale={2} rotation-y={Math.PI} />
            </group>

            {navMeshHelper && <primitive object={navMeshHelper} />}
        </>
    )
}

const CONTROLS_MAP = [
    { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
    { name: 'back', keys: ['ArrowDown', 's', 'S'] },
    { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
    { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
    { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
]

const tmpMovementVector = new Vector3()
const tmpMovementTarget = new Vector3()
const tmpIdealOffset = new Vector3()
const tmpIdealLookAt = new Vector3()

const tmpRaycasterOrigin = new Vector3()
const tmpRaycasterDirection = new Vector3()

const Agent = () => {
    const agent = useMemo<Object3D>(() => {
        const object = new Object3D()
        object.position.set(0, 0, 3)
        return object
    }, [])

    const groupRef = useRef<Group>(null!)

    const { animations, scene } = useGLTF(characterGltfUrl)
    const { ref, actions } = useAnimations(animations)

    const { navMesh, navMeshQuery, walkableMeshes } = useNavigation()

    const camera = useThree((s) => s.camera)
    const cameraIdealLookAt = useMemo<Vector3>(() => new Vector3(), [])
    const cameraIdealPosition = useMemo<Vector3>(() => new Vector3(), [])

    const raycaster = useMemo(() => new Raycaster(), [])

    const forward = useKeyboardControls((s) => s.forward)
    const back = useKeyboardControls((s) => s.back)
    const left = useKeyboardControls((s) => s.left)
    const right = useKeyboardControls((s) => s.right)
    const run = useKeyboardControls((s) => s.run)

    useEffect(() => {
        const idleAction = actions['Idle']!
        idleAction.loop = LoopRepeat
        idleAction.weight = 1
        idleAction.play()

        const walkAction = actions['Walk']!
        walkAction.loop = LoopRepeat
        walkAction.weight = 0
        walkAction.play()

        const runAction = actions['Run']!
        runAction.loop = LoopRepeat
        runAction.weight = 0
        runAction.play()
    }, [])

    useFrame((_, delta) => {
        if (!navMesh || !navMeshQuery || !groupRef.current) return

        const t = 1.0 - Math.pow(0.01, delta)

        /* rotation */
        let rotation = 0

        if (left) rotation += 1
        if (right) rotation -= 1
        rotation *= t * 0.75

        agent.rotation.y += rotation

        /* movement */
        const movementVector = tmpMovementVector.set(0, 0, 0)

        if (forward) movementVector.z -= 1
        if (back) movementVector.z += 1
        movementVector
            .normalize()
            .multiplyScalar(t)
            .multiplyScalar(forward && !back && run ? 1.5 : 0.5)
            .applyEuler(agent.rotation)

        const movementTarget = tmpMovementTarget.copy(agent.position).add(movementVector)

        const { nearestRef: polyRef } = navMeshQuery.findNearestPoly(agent.position)
        const { resultPosition } = navMeshQuery.moveAlongSurface(polyRef, agent.position, movementTarget)

        const { nearestRef: resultPolyRef } = navMeshQuery.findNearestPoly(resultPosition)
        const { success: heightSuccess, height } = navMeshQuery.getPolyHeight(resultPolyRef, resultPosition)

        agent.position.copy(resultPosition as Vector3)

        if (heightSuccess) {
            agent.position.y = height
        }

        /* agent position */
        groupRef.current.position.copy(agent.position)
        groupRef.current.rotation.copy(agent.rotation)

        /* update character animation */
        const idleAction = actions['Idle']!
        const walkAction = actions['Walk']!
        const runAction = actions['Run']!

        const speed = movementVector.length()

        let idleWeight = idleAction.weight
        let walkWeight = walkAction.weight
        let runWeight = runAction.weight

        const running = forward && !back && run

        if (speed < 0.01 && rotation === 0) {
            idleWeight = 1
            walkWeight = 0
            runWeight = 0
        } else if (running) {
            idleWeight = 0
            walkWeight = 0
            runWeight = 1
        } else {
            idleWeight = 0
            walkWeight = 1
            runWeight = 0
        }

        if (back) {
            // reverse
            walkAction.timeScale = -1
            runAction.timeScale = -1
        } else {
            walkAction.timeScale = 1
            runAction.timeScale = 1
        }

        idleAction.weight = MathUtils.lerp(idleAction.weight, idleWeight, t)
        walkAction.weight = MathUtils.lerp(walkAction.weight, walkWeight, t)
        runAction.weight = MathUtils.lerp(runAction.weight, runWeight, t)

        // raycast to find the ground
        const raycasterOrigin = tmpRaycasterOrigin.copy(agent.position)
        raycasterOrigin.y += 1

        const raycasterDirection = tmpRaycasterDirection.set(0, -1, 0)
        raycaster.set(raycasterOrigin, raycasterDirection)

        const hits = raycaster.intersectObjects(walkableMeshes, false)
        const hit = hits.find((hit) => hit.object.userData.walkable)
        const hitPoint = hit ? hit.point : undefined

        if (hitPoint) {
            groupRef.current.position.y = hitPoint.y
        }

        /* camera */
        const idealOffset = tmpIdealOffset.set(0, 5, 8)
        idealOffset.applyEuler(agent.rotation)
        idealOffset.add(agent.position)
        if (idealOffset.y < 0) {
            idealOffset.y = 0
        }

        const idealLookAt = tmpIdealLookAt.set(0, 1, 0)
        idealLookAt.applyEuler(agent.rotation)
        idealLookAt.add(agent.position)

        cameraIdealLookAt.lerp(idealLookAt, t * 2)
        cameraIdealPosition.lerp(idealOffset, t / 0.5)

        camera.position.copy(cameraIdealPosition)
        camera.lookAt(cameraIdealLookAt)
    })

    return (
        <group ref={groupRef}>
            <primitive ref={ref} object={scene} rotation-y={-Math.PI} />
        </group>
    )
}

export default () => {
    suspend(() => init(), [])

    return (
        <Canvas>
            <Navigation />

            <KeyboardControls map={CONTROLS_MAP}>
                <Agent />
            </KeyboardControls>

            <Environment files={cityEnvironment} />
        </Canvas>
    )
}
