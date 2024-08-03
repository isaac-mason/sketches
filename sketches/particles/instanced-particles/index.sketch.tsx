import { PerspectiveCamera } from '@react-three/drei'
import { ThreeElements, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { With, World } from 'arancini'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useConst, useInterval } from '@/common'

const _vector3 = new THREE.Vector3()
const _emptyMatrix4 = new THREE.Matrix4()

type SparkParticle = {
    type: 'spark'
    direction: THREE.Vector3
}

type Entity = {
    lifetime?: number
    transform?: THREE.Object3D
    particle?: {
        instancedMesh?: THREE.InstancedMesh
        instanceIndex?: number
    } & SparkParticle
}

const world = new World<Entity>()

const lifetimeQuery = world.query((e) => e.has('lifetime'))
const particleQuery = world.query((e) => e.has('particle', 'transform'))

const lifetimeSystem = (delta: number) => {
    for (const entity of lifetimeQuery) {
        entity.lifetime -= delta
        if (entity.lifetime <= 0) {
            world.destroy(entity)
        }
    }
}

const particleSystem = (delta: number) => {
    const t = 1 - Math.pow(0.001, delta)

    for (const entity of particleQuery) {
        if (entity.particle.type === 'spark') {
            const direction = entity.particle.direction
            direction.y -= 0.3 * t

            entity.transform.position.add(_vector3.copy(direction).multiplyScalar(0.5 * t))
        }

        entity.transform.updateMatrix()

        if (entity.particle.instanceIndex !== undefined && entity.particle.instancedMesh) {
            entity.particle.instancedMesh.setMatrixAt(entity.particle.instanceIndex, entity.transform.matrix)
            entity.particle.instancedMesh.instanceMatrix.needsUpdate = true
        }
    }
}

const Systems = () => {
    useFrame((_, delta) => {
        lifetimeSystem(delta)
        particleSystem(delta)
    })

    return null
}

type InstancedParticlesProps = {
    type: string
    limit?: number
    children?: React.ReactNode
}

const InstancedParticles = ({ type, limit = 5000, children }: InstancedParticlesProps) => {
    const instancedMeshRef = useRef<THREE.InstancedMesh>(null!)
    const instances = useConst<With<Entity, 'particle'>[]>(() => [])
    const cursor = useRef(0)

    useEffect(() => {
        instances.length = 0
        cursor.current = 0
        instancedMeshRef.current.count = 0
        instancedMeshRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

        for (let i = 0; i < limit; i++) {
            instancedMeshRef.current.setMatrixAt(i, _emptyMatrix4)
        }

        const unsubOnEntityAdded = particleQuery.onEntityAdded.add((entity) => {
            if (entity.particle.type !== type) return

            const index = cursor.current
            cursor.current++

            if (cursor.current > limit) {
                return
            }

            instancedMeshRef.current.count = Math.min(cursor.current, limit)

            instances[index] = entity
            entity.particle.instanceIndex = index
            entity.particle.instancedMesh = instancedMeshRef.current
        })

        const unsubOnEntityRemoved = particleQuery.onEntityRemoved.add((entity) => {
            if (entity.particle.type !== type) return
            if (entity.particle.instanceIndex === undefined) return

            const lastEntity = instances.pop()

            if (lastEntity) {
                lastEntity.particle.instanceIndex = entity.particle.instanceIndex
                instances[entity.particle.instanceIndex] = lastEntity
            }

            cursor.current--

            instancedMeshRef.current.count = cursor.current
            instancedMeshRef.current.setMatrixAt(entity.particle.instanceIndex, _emptyMatrix4)
            instancedMeshRef.current.instanceMatrix.needsUpdate = true
        })

        return () => {
            unsubOnEntityAdded()
            unsubOnEntityRemoved()
        }
    }, [])

    return (
        <instancedMesh ref={instancedMeshRef} args={[undefined, undefined, limit]}>
            {children}
        </instancedMesh>
    )
}

const Emitter = (props: ThreeElements['object3D']) => {
    const ref = useRef<THREE.Object3D>(null!)

    useInterval(() => {
        const transform = new THREE.Object3D()
        ref.current.getWorldPosition(transform.position)

        world.create({
            lifetime: 3,
            particle: {
                type: 'spark',
                direction: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
            },
            transform,
        })
    }, 1000 / 60)

    return <object3D {...props} ref={ref} />
}

const Pointer = (props: ThreeElements['object3D']) => {
    const ref = useRef<THREE.Object3D>(null!)

    useFrame(({ pointer, viewport }) => {
        ref.current.position.set((pointer.x * viewport.width) / 2, (pointer.y * viewport.height) / 2, 0)
    })

    return <object3D {...props} ref={ref} />
}

export default function Sketch() {
    return (
        <Canvas>
            <InstancedParticles type="spark">
                <sphereGeometry args={[0.05, 32, 32]} />
                <meshBasicMaterial color="#ffffc2" />
            </InstancedParticles>

            <Systems />

            <Pointer>
                <Emitter />
            </Pointer>

            <EffectComposer enableNormalPass={false}>
                <Bloom luminanceThreshold={0} mipmapBlur luminanceSmoothing={5.0} intensity={3} />
            </EffectComposer>

            <PerspectiveCamera makeDefault position={[0, 0, 20]} />
        </Canvas>
    )
}
