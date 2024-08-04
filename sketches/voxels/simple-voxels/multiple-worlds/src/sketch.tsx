import { Canvas, Crosshair } from '@/common'
import { ColliderDesc } from '@dimforge/rapier3d-compat'
import { KeyboardControls, PointerLockControls, useKeyboardControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Physics, RapierCollider, RapierRigidBody, RigidBody, quat, useRapier, vec3 } from '@react-three/rapier'
import { With, World } from 'arancini'
import { createReactAPI } from 'arancini/react'
import { useControls } from 'leva'
import { useEffect, useMemo, useRef, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import * as THREE from 'three'
import { create } from 'zustand'
import { VoxelChunkMeshes, Voxels as VoxelsComponent } from '../../lib/react'
import { Voxels, VoxelsWorkerPool } from '../../lib/voxels'
import { Chunk, chunkPositionToWorldPosition } from '../../lib/world'
import { toolTunnel } from './tunnels'

const SKETCH = 'simple-voxels/multiple-worlds'

const COLOR_ORANGE = new THREE.Color('orange').getHex()
const COLOR_GRASS_GREEN_1 = new THREE.Color('#4c8c4a').getHex()
const COLOR_GRASS_GREEN_2 = new THREE.Color('#5c9c5a').getHex()
const COLOR_GREY = new THREE.Color('#555').getHex()

const V0 = new THREE.Vector3()

const _cameraWorldDirection = new THREE.Vector3()
const _vector3 = new THREE.Vector3()
const _color = new THREE.Color()

type EntityType = {
    player?: { position: THREE.Vector3 }

    voxelWorld?: { matrix: THREE.Matrix4; type: 'fixed' | 'dynamic'; scale: number; prevScale?: number }
    voxels?: Voxels

    rigidBody?: RapierRigidBody
}

const world = new World<EntityType>()

const { Entities, Component } = createReactAPI(world)

const voxelWorldsToInitQuery = world.query((e) => e.has('voxelWorld'))

const voxelWorldsQuery = world.query((e) => e.has('voxelWorld', 'voxels'))

const InitialWorlds = () => {
    useEffect(() => {
        const quaternionFacingPositiveZ = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, 1),
        )

        const entity = world.create({
            voxelWorld: {
                type: 'fixed',
                matrix: new THREE.Matrix4().compose(
                    new THREE.Vector3(0, 0, 0),
                    quaternionFacingPositiveZ,
                    new THREE.Vector3(1, 1, 1),
                ),
                scale: 1,
            },
        })

        const voxels = entity.voxels! // created by voxelWorldsToInitQuery onEntityAdded listener

        for (let x = -20; x < 20; x++) {
            for (let z = -20; z < 20; z++) {
                voxels.setBlock(new THREE.Vector3(x, -1, z), {
                    solid: true,
                    color: Math.random() > 0.5 ? COLOR_GRASS_GREEN_1 : COLOR_GRASS_GREEN_2,
                })
            }
        }
    }, [])

    return null
}

const VoxelWorld = ({ entity }: { entity: (typeof voxelWorldsQuery.entities)[number] }) => {
    const groupRef = useRef<THREE.Group>(null!)

    const { world: physicsWorld } = useRapier()

    const [version, setVersion] = useState(0)
    const regeneratePhysicsBody = () => setVersion((v) => v + 1)

    const initial = useMemo(() => {
        const position = new THREE.Vector3()
        const quaternion = new THREE.Quaternion()
        const scale = new THREE.Vector3()

        entity.voxelWorld.matrix.decompose(position, quaternion, scale)

        return { position, quaternion, scale }
    }, [entity, version])

    useEffect(() => {
        const unsub = entity.voxels.onChunkMeshUpdated.add(() => {
            regeneratePhysicsBody()
        })

        return () => {
            unsub()
        }
    }, [])

    const colliders = useRef<Map<string, RapierCollider>>(new Map())

    useEffect(() => {
        if (entity.voxelWorld.type !== 'fixed') return

        const unsub = entity.voxels.onChunkMeshUpdated.add((chunk, mesh) => {
            const existingCollider = colliders.current.get(chunk.id)

            if (existingCollider) {
                physicsWorld.removeCollider(existingCollider, false)
            }

            const positions = new Float32Array(mesh.geometry.getAttribute('position').array) as Float32Array
            const indices = mesh.geometry.getIndex()!.array as Uint32Array

            if (positions.length === 0 || indices.length === 0) return

            const chunkWorldPosition = chunkPositionToWorldPosition(chunk.position, _vector3)
            chunkWorldPosition.multiplyScalar(entity.voxelWorld.scale)

            for (let i = 0; i < positions.length; i += 3) {
                const x = positions[i]
                const y = positions[i + 1]
                const z = positions[i + 2]

                positions[i] = x * entity.voxelWorld.scale
                positions[i + 1] = y * entity.voxelWorld.scale
                positions[i + 2] = z * entity.voxelWorld.scale
            }

            const colliderDesc = ColliderDesc.trimesh(positions, indices)
            colliderDesc.setTranslation(chunkWorldPosition.x, chunkWorldPosition.y, chunkWorldPosition.z)

            const collider = physicsWorld.createCollider(colliderDesc, entity.rigidBody!)

            colliders.current.set(chunk.id, collider)
        })

        return () => {
            unsub()
        }
    }, [version])

    useEffect(() => {
        if (entity.voxelWorld.type !== 'dynamic') return

        const add = (chunk: Chunk, position: THREE.Vector3Like) => {
            if (colliders.current.has(`${chunk.id}:${position.x},${position.y},${position.z}`)) return

            const scale = entity.voxelWorld.scale
            const halfSize = 0.5 * scale
            const colliderDesc = ColliderDesc.cuboid(halfSize, halfSize, halfSize)
            colliderDesc.setTranslation(
                position.x * scale + halfSize,
                position.y * scale + halfSize,
                position.z * scale + halfSize,
            )

            const collider = physicsWorld.createCollider(colliderDesc, entity.rigidBody!)

            colliders.current.set(`${chunk.id}:${position.x},${position.y},${position.z}`, collider)
        }

        const remove = (chunk: Chunk, position: THREE.Vector3Like) => {
            const collider = colliders.current.get(`${chunk.id}:${position.x},${position.y},${position.z}`)

            if (!collider) return

            physicsWorld.removeCollider(collider, false)

            colliders.current.delete(`${chunk.id}:${position.x},${position.y},${position.z}`)
        }

        entity.voxels.onUpdate.add((changes) => {
            for (const change of changes) {
                const { chunk, position, value } = change

                if (value.solid) {
                    add(chunk, position)
                } else {
                    remove(chunk, position)
                }
            }
        })
    }, [version])

    return (
        <group ref={groupRef}>
            <VoxelsComponent voxels={entity.voxels}>
                <Component name="rigidBody">
                    <RigidBody
                        scale={entity.voxelWorld.scale}
                        type={entity.voxelWorld.type}
                        colliders={false}
                        userData={{ voxelWorld: entity }}
                        position={initial.position}
                        quaternion={initial.quaternion}
                    >
                        <VoxelChunkMeshes />
                    </RigidBody>
                </Component>
            </VoxelsComponent>
        </group>
    )
}

const _scale = new THREE.Vector3()

const updateVoxelWorlds = () => {
    // copy rigid body transform to voxel world transform
    for (const entity of voxelWorldsQuery.entities) {
        const { rigidBody } = entity

        if (!rigidBody) continue

        entity.voxelWorld.matrix.compose(
            vec3(rigidBody.translation()),
            quat(rigidBody.rotation()),
            // keep current scale, rigid body doesn't control this
            _scale.setScalar(entity.voxelWorld.scale),
        )
    }
}

const VoxelWorlds = () => {
    const [voxelsWorkerPool] = useState(() => new VoxelsWorkerPool())

    useEffect(() => {
        voxelsWorkerPool.connect()

        return () => {
            voxelsWorkerPool.disconnect()
        }
    }, [])

    useEffect(() => {
        const unsub = voxelWorldsToInitQuery.onEntityAdded.add((e) => {
            const voxels = new Voxels({ voxelsWorkerPool })
            world.update(e, { voxels })
        })

        return () => {
            unsub()
        }
    }, [])

    useFrame(() => {
        updateVoxelWorlds()
    })

    return <Entities in={voxelWorldsQuery}>{(entity) => <VoxelWorld key={entity.voxels.world.id} entity={entity} />}</Entities>
}

const Tools = {
    Build: 'Build',
    CreateWorld: 'Create World',
}

type Tool = (typeof Tools)[keyof typeof Tools]

const useTool = create<{
    tool: Tool
    cycleTool: () => void
}>((set, get) => ({
    tool: Tools.Build,
    cycleTool: () => {
        const tools = Object.values(Tools)
        const currentTool = get().tool
        const currentIndex = tools.indexOf(currentTool)
        const nextIndex = (currentIndex + 1) % tools.length

        set({ tool: tools[nextIndex] })
    },
}))

const ToolPicker = () => {
    const { cycleTool } = useTool()

    useEffect(() => {
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'q') {
                cycleTool()
            }
        }

        window.addEventListener('keyup', onKeyUp)

        return () => {
            window.removeEventListener('keyup', onKeyUp)
        }
    }, [])

    return null
}

const CreateWorldTool = () => {
    const [type, setType] = useState<'fixed' | 'dynamic'>('fixed')

    const scale = useRef(1)

    const meshRef = useRef<THREE.Mesh>(null!)

    const lastCreateTime = useRef(0)

    const camera = useThree((s) => s.camera)

    const distance = 5

    useEffect(() => {
        const updateScale = (value: number) => {
            scale.current = THREE.MathUtils.clamp(value, 0.3, 3)
            meshRef.current.scale.setScalar(scale.current)
        }

        const onKeyUp = (event: KeyboardEvent) => {
            // [ ] keys
            if (event.key === ']') {
                updateScale(scale.current + 0.1)
                return
            }

            if (event.key === '[') {
                updateScale(scale.current - 0.1)
                return
            }

            if (event.key === 'e') {
                setType(type === 'fixed' ? 'dynamic' : 'fixed')
            }
        }

        const onMouseWheel = (event: WheelEvent) => {
            updateScale(scale.current + event.deltaY * 0.001)
        }

        const onPointerDown = (event: PointerEvent) => {
            if (event.button !== 0) return

            /* debounce */
            const now = Date.now()
            if (now - lastCreateTime.current < 300) return
            lastCreateTime.current = now

            /* get voxel world origin */
            const cameraWorldDirection = camera.getWorldDirection(_cameraWorldDirection).normalize()

            const quaternion = meshRef.current.quaternion.clone()

            const position = camera.position.clone().add(cameraWorldDirection.clone().multiplyScalar(distance))

            const positionOffset = _vector3.set(-0.5, -0.5, -0.5).multiplyScalar(scale.current)
            positionOffset.applyQuaternion(quaternion)

            position.add(positionOffset)

            /* store world origin in voxel world matrix */
            const matrix = new THREE.Matrix4()
            matrix.compose(position, quaternion, new THREE.Vector3().setScalar(scale.current))

            const entity = world.create({ voxelWorld: { matrix, scale: scale.current, type } })

            entity.voxels?.setBlock(V0, { solid: true, color: entity.voxelWorld.type === 'fixed' ? COLOR_GREY : COLOR_ORANGE })
        }

        window.addEventListener('pointerdown', onPointerDown)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('wheel', onMouseWheel)

        return () => {
            window.removeEventListener('pointerdown', onPointerDown)
            window.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('wheel', onMouseWheel)
        }
    }, [type])

    useFrame(({ camera }) => {
        const cameraWorldDirection = camera.getWorldDirection(_cameraWorldDirection).normalize()
        const cameraYaw = Math.atan2(cameraWorldDirection.x, cameraWorldDirection.z)

        meshRef.current.position.copy(cameraWorldDirection).multiplyScalar(5).add(camera.position)
        meshRef.current.rotation.y = cameraYaw
    })

    return (
        <>
            <mesh ref={meshRef}>
                <meshStandardMaterial color={type === 'fixed' ? '#555' : 'orange'} transparent opacity={0.5} />
                <boxGeometry args={[1, 1, 1]} />
            </mesh>

            <toolTunnel.In>
                <div
                    style={{
                        position: 'absolute',
                        bottom: '2em',
                        left: '2em',
                        fontSize: '1em',
                        fontWeight: 600,
                        fontFamily: 'monospace',
                        color: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2em',
                    }}
                >
                    <div style={{ fontSize: '1.2em' }}>[Q] Create World Tool</div>

                    <div>[E] {type === 'fixed' ? 'Fixed' : 'Dynamic'}</div>

                    <div>Scroll or use [ ] to adjust scale</div>
                </div>
            </toolTunnel.In>
        </>
    )
}

const _raycaster = new THREE.Raycaster()
const _raycastInverseMatrix = new THREE.Matrix4()
const _raycastLocalPosition = new THREE.Vector3()
const _raycastHitNormalOffset = new THREE.Vector3()
const _raycastNormalOffsetLocalPosition = new THREE.Vector3()
const _raycastBlock = new THREE.Vector3()

/**
 * Multi-voxel world raycast
 */
const raycastVoxelWorlds = (origin: THREE.Vector3, direction: THREE.Vector3) => {
    _raycaster.set(origin, direction)

    const voxelChunkMeshes = voxelWorldsQuery.entities
        .flatMap((entity) => Array.from(entity.voxels.chunkMeshes.values()))
        .map((chunkMesh) => chunkMesh.mesh)

    const hits = _raycaster.intersectObjects(voxelChunkMeshes, true)

    const closest = hits.sort((a, b) => a.distance - b.distance)[0]

    if (!closest) return

    const closestMesh = closest.object as THREE.Mesh

    let voxelWorldGroup: THREE.Object3D | null = closestMesh
    while (voxelWorldGroup && !voxelWorldGroup.userData.voxelWorld) {
        voxelWorldGroup = voxelWorldGroup.parent
    }

    if (!voxelWorldGroup) return

    const entity = voxelWorldGroup.userData.voxelWorld as With<EntityType, 'voxelWorld' | 'voxels'>
    const { voxelWorld } = entity

    const hitPosition = closest.point
    const hitNormal = closest.face?.normal

    if (!hitNormal) return

    hitNormal.normalize()

    // get local position of voxel world via matrix
    const inverseMatrix = _raycastInverseMatrix.copy(voxelWorld.matrix).invert()
    const localPosition = _raycastLocalPosition.copy(hitPosition).applyMatrix4(inverseMatrix)

    // use face normal to get desired block position
    const hitNormalOffset = _raycastHitNormalOffset.copy(hitNormal).multiplyScalar(-0.5)
    const normalOffsetLocalPosition = _raycastNormalOffsetLocalPosition.copy(localPosition).add(hitNormalOffset)
    const block = _raycastBlock.copy(normalOffsetLocalPosition).floor()

    return { block, localPosition, normalOffsetLocalPosition, hitNormal, entity }
}

const useBuildTool = create<{
    color: string
    setColor: (color: string) => void
}>((set) => ({
    color: '#ff9999',
    setColor: (color) => {
        set({ color })
    },
}))

const BuildTool = () => {
    const { color, setColor } = useBuildTool()

    const { localVoxelSpaceDebug } = useControls(`${SKETCH}/build-tool`, {
        localVoxelSpaceDebug: false,
    })

    const camera = useThree((s) => s.camera)

    const [debugObjects, setDebugObjects] = useState<THREE.Object3D[]>([])

    useEffect(() => {
        const onKeyUp = (event: KeyboardEvent) => {
            // 'p' to pick color
            if (event.key === 'p') {
                const raycastResult = raycastVoxelWorlds(camera.position, camera.getWorldDirection(_cameraWorldDirection))

                if (!raycastResult) return

                const {
                    block,
                    entity: { voxels },
                } = raycastResult

                const { color } = voxels.world.getBlock(block)

                if (!color) return

                setColor(`#${_color.set(color).getHexString()}`)
            }
        }

        const onPointerDown = (event: MouseEvent) => {
            setDebugObjects([])

            const origin = camera.position
            const direction = camera.getWorldDirection(_cameraWorldDirection)

            const raycastResult = raycastVoxelWorlds(origin, direction)
            if (!raycastResult) return

            const {
                block,
                localPosition,
                normalOffsetLocalPosition,
                hitNormal,
                entity: { voxels },
            } = raycastResult

            if (localVoxelSpaceDebug) {
                setDebugObjects((prev) => {
                    const voxelLocalPositionHelper = new THREE.Mesh(
                        new THREE.SphereGeometry(0.1),
                        new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false }),
                    )
                    voxelLocalPositionHelper.position.copy(localPosition)

                    const normalHelper = new THREE.ArrowHelper(hitNormal, localPosition, 0.5, 0xff0000)
                    return [...prev, voxelLocalPositionHelper, normalHelper]
                })
            }

            if (event.button === 0) {
                if (V0.equals(block)) return

                voxels.setBlock(block, {
                    solid: false,
                })
            } else {
                block.add(hitNormal).floor()

                voxels.setBlock(block, {
                    solid: true,
                    color: new THREE.Color(color).getHex(),
                })
            }

            if (localVoxelSpaceDebug) {
                setDebugObjects((prev) => {
                    const normalOffsetLocalPositionHelper = new THREE.Mesh(
                        new THREE.SphereGeometry(0.1),
                        new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false }),
                    )
                    normalOffsetLocalPositionHelper.position.copy(normalOffsetLocalPosition)

                    const blockHelper = new THREE.Mesh(
                        new THREE.SphereGeometry(0.1),
                        new THREE.MeshBasicMaterial({ color: 0x0000ff, depthTest: false }),
                    )
                    blockHelper.position.copy(block)

                    return [...prev, blockHelper, normalOffsetLocalPositionHelper]
                })
            }
        }

        window.addEventListener('pointerdown', onPointerDown)
        window.addEventListener('keyup', onKeyUp)

        return () => {
            window.removeEventListener('pointerdown', onPointerDown)
            window.removeEventListener('keyup', onKeyUp)
        }
    }, [color, localVoxelSpaceDebug])

    return (
        <>
            {debugObjects.map((mesh) => (
                <primitive key={mesh.id} object={mesh} />
            ))}

            <toolTunnel.In>
                <div
                    style={{
                        position: 'absolute',
                        bottom: '2em',
                        left: '2em',
                        fontSize: '1em',
                        fontWeight: 600,
                        fontFamily: 'monospace',
                        color: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2em',
                    }}
                >
                    <div style={{ fontSize: '1.2em' }}>[Q] Build Tool</div>
                    <div>[P] Pick Block Color</div>
                    <HexColorPicker className="picker" color={color} onChange={(c) => setColor(c)} />
                </div>
            </toolTunnel.In>
        </>
    )
}

const CurrentTool = () => {
    const { tool } = useTool()

    switch (tool) {
        case Tools.CreateWorld:
            return <CreateWorldTool />
        case Tools.Build:
            return <BuildTool />
    }
}

const _playerFrontVector = new THREE.Vector3()
const _playerSideVector = new THREE.Vector3()
const _playerDirection = new THREE.Vector3()

type PlayerInput = {
    forward: boolean
    backward: boolean
    left: boolean
    right: boolean
    ascend: boolean
    descend: boolean
}

const Player = () => {
    const position = useRef<THREE.Vector3>(new THREE.Vector3(0, 3, 5))

    const [, getControls] = useKeyboardControls()

    const camera = useThree((s) => s.camera)

    useFrame((_, delta) => {
        const t = 1.0 - Math.pow(0.01, delta)

        const { forward, backward, left, right, ascend, descend } = getControls() as PlayerInput

        _playerFrontVector.set(0, 0, Number(backward) - Number(forward))
        _playerSideVector.set(Number(left) - Number(right), 0, 0)

        _playerDirection.subVectors(_playerFrontVector, _playerSideVector).normalize().applyEuler(camera.rotation)
        _playerDirection.y += Number(ascend) - Number(descend)
        _playerDirection.multiplyScalar(5 * t)

        position.current.add(_playerDirection)

        camera.position.lerp(position.current, t * 2)
    })

    return null
}

export function Sketch() {
    const { physicsDebug } = useControls(`${SKETCH}/physics`, {
        physicsDebug: false,
    })

    return (
        <>
            <Crosshair />

            <Canvas camera={{ near: 0.001 }}>
                <Physics debug={physicsDebug}>
                    <VoxelWorlds />

                    <InitialWorlds />

                    <ToolPicker />
                    <CurrentTool />

                    <PointerLockControls makeDefault />
                    <KeyboardControls
                        map={[
                            { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
                            { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
                            { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
                            { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
                            { name: 'ascend', keys: [' '] },
                            { name: 'descend', keys: ['Shift'] },
                        ]}
                    >
                        <Player />
                    </KeyboardControls>
                </Physics>

                <ambientLight intensity={0.6} />
                <pointLight decay={0.5} intensity={10} position={[20, 20, 20]} />
                <pointLight decay={0.5} intensity={10} position={[-20, 20, -20]} />
            </Canvas>

            <toolTunnel.Out />
        </>
    )
}
