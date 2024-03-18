import { useConst, useInterval } from '@/common'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { NavMesh, NavMeshQuery, RecastConfig, importNavMesh, init } from 'recast-navigation'
import { NavMeshHelper, getPositionsAndIndices } from 'recast-navigation/three'
import * as THREE from 'three'
import { Entity, NavComponent, navQuery } from '../ecs'
import NavMeshGeneratorWorker from './navmesh-generator.worker?worker'

await init()

export type TraversableProps = {
    children: React.ReactNode
}

export const Traversable = ({ children }: TraversableProps) => {
    return <group userData={{ traversable: true }}>{children}</group>
}

export const getTraversableMeshes = (scene: THREE.Scene) => {
    const traversableMeshes: Set<THREE.Mesh> = new Set()

    const traverse = (obj: THREE.Object3D, parentIsTraversable = false) => {
        if (parentIsTraversable) {
            if (obj instanceof THREE.Mesh) {
                traversableMeshes.add(obj)
            }
        }

        obj.children.forEach((child) => {
            const isTraversable = (child as any).userData?.traversable
            traverse(child, parentIsTraversable || isTraversable)
        })
    }

    traverse(scene)

    return Array.from(traversableMeshes)
}

export const NavMeshGenerator = () => {
    const scene = useThree((s) => s.scene)
    const navMeshWorker = useRef<InstanceType<typeof NavMeshGeneratorWorker>>()
    const inProgress = useRef(false)

    const nav = useConst<NavComponent>(() => ({
        navMesh: undefined,
        navMeshQuery: undefined,
    }))

    useEffect(() => {
        const worker = new NavMeshGeneratorWorker()

        worker.onmessage = ({ data: { navMeshExport } }) => {
            inProgress.current = false

            const prev = { ...nav }

            const { navMesh } = importNavMesh(navMeshExport)
            const navMeshQuery = new NavMeshQuery({ navMesh })

            nav.navMesh = navMesh
            nav.navMeshQuery = navMeshQuery

            prev.navMesh?.destroy()
            prev.navMeshQuery?.destroy()
        }

        navMeshWorker.current = worker
        inProgress.current = false

        return () => {
            navMeshWorker.current = undefined
            inProgress.current = false
            worker.terminate()
        }
    }, [])

    useInterval(() => {
        if (inProgress.current) return

        const traversableMeshes = getTraversableMeshes(scene)

        // filter out meshes outside of some bounds
        const bounds = new THREE.Box3()
        bounds.min.set(-100, -100, -100)
        bounds.max.set(100, 100, 100)

        const meshes = traversableMeshes.filter((mesh) => {
            const box = new THREE.Box3().setFromObject(mesh)
            return bounds.containsBox(box)
        })

        const [positions, indices] = getPositionsAndIndices(meshes)

        const cs = 0.1
        const ch = 0.2
        const recastConfig: Partial<RecastConfig> = {
            cs,
            ch,
            walkableRadius: 0.5 / cs,
            walkableHeight: 2 / ch,
        }

        inProgress.current = true
        navMeshWorker.current?.postMessage({ positions, indices, recastConfig }, [positions.buffer, indices.buffer])
    }, 100)

    return (
        <>
            <Entity nav={nav} />
        </>
    )
}

export const NavMeshDebug = () => {
    const [helper, setHelper] = useState<NavMeshHelper>()
    const prevNavMesh = useRef<NavMesh>()

    useFrame(() => {
        const nav = navQuery.first

        if (!nav || !nav.nav.navMesh) {
            if (helper) {
                setHelper(undefined)
            }

            return
        }

        const navMesh = nav.nav.navMesh

        if (!prevNavMesh.current) {
            prevNavMesh.current = navMesh
        }

        if (navMesh !== prevNavMesh.current) {
            prevNavMesh.current = navMesh

            const helper = new NavMeshHelper({
                navMesh,
                navMeshMaterial: new THREE.MeshStandardMaterial({
                    color: 'orange',
                    opacity: 0.3,
                    transparent: true,
                    depthWrite: false,
                }),
            })
            setHelper(helper)
        }
    })

    return <>{helper && <primitive object={helper} />}</>
}
