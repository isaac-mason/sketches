import { useConst, useInterval } from '@/common'
import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { useEffect, useRef, useState } from 'react'
import { NavMesh, NavMeshQuery, RecastConfig, importNavMesh, init } from 'recast-navigation'
import { NavMeshHelper, getPositionsAndIndices } from 'recast-navigation/three'
import * as THREE from 'three'
import { Entity, NavComponent, navQuery, traversableQuery } from '../ecs'
import NavMeshGeneratorWorker from './navmesh-generator.worker?worker'

await init()

export type TraversableProps = {
    children: React.ReactNode
}

export const getTraversableMeshes = () => {
    const traversable = traversableQuery.entities.map((e) => e.three)

    const traversableMeshes = new Set<THREE.Mesh>()

    for (const obj of traversable) {
        obj?.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                traversableMeshes.add(child)
            }
        })
    }

    return Array.from(traversableMeshes)
}

export const NavMeshGenerator = () => {
    const { rapier } = useRapier()

    const navMeshWorker = useRef<InstanceType<typeof NavMeshGeneratorWorker>>()
    const inProgress = useRef(false)
    const first = useRef(true)

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

            first.current = false
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

        if (!first.current) {
            const dynamicRigidBodiesSleepStates = traversableQuery.entities
                .filter((e) => e.rigidBody)
                .filter((e) => e.rigidBody!.bodyType() === rapier.RigidBodyType.Dynamic)
                .map(({ rigidBody }) => rigidBody!.isSleeping())

            if (dynamicRigidBodiesSleepStates.length === 0 || dynamicRigidBodiesSleepStates.every((x) => x)) return
        }

        const traversableMeshes = getTraversableMeshes()

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

        if (navMesh !== prevNavMesh.current) {
            prevNavMesh.current = navMesh

            const helper = new NavMeshHelper({
                navMesh,
                navMeshMaterial: new THREE.MeshStandardMaterial({
                    color: 'lightblue',
                    opacity: 0.3,
                    transparent: true,
                    depthWrite: false,
                }),
            })

            setHelper(helper)
        }

        prevNavMesh.current = navMesh
    })

    return <>{helper && <primitive object={helper} />}</>
}
