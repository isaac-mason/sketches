import { useInterval } from '@/common'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { Crowd, NavMesh, NavMeshQuery, RecastConfig } from 'recast-navigation'
import { NavMeshHelper, getPositionsAndIndices } from 'recast-navigation/three'
import * as THREE from 'three'
import { create } from 'zustand'
import { traversableQuery } from '../ecs'
import { DynamicTiledNavMesh } from './dynamic-tiled-navmesh'

export type NavState = {
    dynamicTiledNavMesh?: DynamicTiledNavMesh
    navMesh?: NavMesh
    navMeshQuery?: NavMeshQuery
    crowd?: Crowd
}

export const useNav = create<NavState>(() => ({
    dynamicTiledNavMesh: undefined,
    navMesh: undefined,
    navMeshQuery: undefined,
    crowd: undefined,
}))

const navMeshBounds = new THREE.Box3(new THREE.Vector3(-50, -10, -50), new THREE.Vector3(70, 30, 40))

const cellSize = 0.3
const cellHeight = 0.3

const recastConfig: Partial<RecastConfig> = {
    tileSize: 64,
    cs: cellSize,
    ch: cellHeight,
    walkableRadius: 1 / cellSize,
    walkableClimb: 1.5 / cellHeight,
    walkableHeight: 4 / cellHeight,
}

const maxTiles = 100

const navMeshWorkers = 3

const maxAgents = 50
const maxAgentRadius = 0.5

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

export const Navigation = () => {
    const [navMeshVersion, setNavMeshVersion] = useState(0)

    const [dynamicTiledNavMesh, setDynamicTiledNavMesh] = useState<DynamicTiledNavMesh>()

    useEffect(() => {
        const dynamicTiledNavMesh = new DynamicTiledNavMesh({ navMeshBounds, recastConfig, maxTiles, workers: navMeshWorkers })
        dynamicTiledNavMesh.onNavMeshUpdate.add((version) => setNavMeshVersion(version))

        const navMeshQuery = new NavMeshQuery({ navMesh: dynamicTiledNavMesh.navMesh })
        const crowd = new Crowd({ maxAgents, maxAgentRadius, navMesh: dynamicTiledNavMesh.navMesh })

        setDynamicTiledNavMesh(dynamicTiledNavMesh)

        useNav.setState({ dynamicTiledNavMesh, navMesh: dynamicTiledNavMesh.navMesh, navMeshQuery, crowd })

        return () => {
            useNav.setState({ dynamicTiledNavMesh: undefined, navMesh: undefined, navMeshQuery: undefined, crowd: undefined })

            dynamicTiledNavMesh.destroy()
            navMeshQuery.destroy()
            crowd.destroy()
        }
    }, [])

    useInterval(() => {
        if (!dynamicTiledNavMesh) return

        // todo: smarts for what tiles need regenerating!
        const traversableMeshes = getTraversableMeshes()

        const [positions, indices] = getPositionsAndIndices(traversableMeshes)
        dynamicTiledNavMesh.buildAllTiles(positions, indices)
    }, 100)

    useFrame((_, delta) => {
        const crowd = useNav.getState().crowd
        if (!crowd) return

        crowd.update(delta)
    })

    const navMeshHelper = useMemo(() => {
        if (!dynamicTiledNavMesh) return null

        return new NavMeshHelper({
            navMesh: dynamicTiledNavMesh.navMesh,
            navMeshMaterial: new THREE.MeshBasicMaterial({
                color: 'orange',
                transparent: true,
                opacity: 0.4,
                depthWrite: false,
            }),
        })
    }, [navMeshVersion])

    return (
        <>
            {navMeshHelper && <primitive object={navMeshHelper} />}
            <box3Helper args={[navMeshBounds]} />
        </>
    )
}
