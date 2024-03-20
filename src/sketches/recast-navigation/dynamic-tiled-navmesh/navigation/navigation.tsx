import { useInterval } from '@/common'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { Crowd, NavMesh, NavMeshQuery, RecastConfig } from 'recast-navigation'
import { NavMeshHelper, getPositionsAndIndices } from 'recast-navigation/three'
import * as THREE from 'three'
import { create } from 'zustand'
import { traversableQuery } from '../ecs'
import { DynamicTiledNavMesh } from './dynamic-tiled-navmesh'
import { useControls } from 'leva'
import { SKETCH } from '../const'

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
const cellHeight = 0.45

const recastConfig: Partial<RecastConfig> = {
    tileSize: 128,
    cs: cellSize,
    ch: cellHeight,
    walkableRadius: 0.8 / cellSize,
    walkableClimb: 1.5 / cellHeight,
    walkableHeight: 3 / cellHeight,
}

const maxTiles = 512

const navMeshWorkers = navigator.hardwareConcurrency ?? 3

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
    const { boundsDebug, navMeshDebug } = useControls(`${SKETCH}-navigation`, {
        boundsDebug: false,
        navMeshDebug: true,
    })
    const [navMeshVersion, setNavMeshVersion] = useState(0)

    const [dynamicTiledNavMesh, setDynamicTiledNavMesh] = useState<DynamicTiledNavMesh>()

    const getTraversablePositionsAndIndices = (): [positions: Float32Array, indices: Uint32Array] => {
        const traversableMeshes = getTraversableMeshes()
        const [positions, indices] = getPositionsAndIndices(traversableMeshes)

        return [positions, indices]
    }

    useEffect(() => {
        const dynamicTiledNavMesh = new DynamicTiledNavMesh({ navMeshBounds, recastConfig, maxTiles, workers: navMeshWorkers })
        const navMeshQuery = new NavMeshQuery({ navMesh: dynamicTiledNavMesh.navMesh })
        const crowd = new Crowd({ maxAgents, maxAgentRadius, navMesh: dynamicTiledNavMesh.navMesh })

        dynamicTiledNavMesh.onNavMeshUpdate.add((version) => setNavMeshVersion(version))

        setDynamicTiledNavMesh(dynamicTiledNavMesh)
        useNav.setState({ dynamicTiledNavMesh, navMesh: dynamicTiledNavMesh.navMesh, navMeshQuery, crowd })

        /* build tiles where traversable entities are added */
        const unsubTraversableQueryAdd = traversableQuery.onEntityAdded.add((entity) => {
            const bounds = new THREE.Box3()

            const meshes: THREE.Mesh[] = []
            entity.three.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    meshes.push(child)
                    bounds.expandByObject(child)
                }
            })

            const [positions, indices] = getTraversablePositionsAndIndices()

            const tiles = dynamicTiledNavMesh.getTilesForBounds(bounds)

            for (const tile of tiles) {
                dynamicTiledNavMesh.buildTile(positions, indices, tile)
            }
        })

        return () => {
            unsubTraversableQueryAdd()

            useNav.setState({ dynamicTiledNavMesh: undefined, navMesh: undefined, navMeshQuery: undefined, crowd: undefined })

            dynamicTiledNavMesh.destroy()
            navMeshQuery.destroy()
            crowd.destroy()
        }
    }, [])

    /* rebuild tiles with active rigid bodies */
    useInterval(() => {
        if (!dynamicTiledNavMesh) return

        const [positions, indices] = getTraversablePositionsAndIndices()

        const tiles = new Map<string, [x: number, y: number]>()

        for (const entity of traversableQuery) {
            if (!entity.rigidBody) continue
            if (entity.rigidBody.isSleeping()) continue

            const box3 = new THREE.Box3()
            box3.expandByObject(entity.three)

            const entityTiles = dynamicTiledNavMesh.getTilesForBounds(box3)

            for (const tile of entityTiles) {
                const key = `${tile[0]},${tile[1]}`
                tiles.set(key, tile)
            }
        }

        for (const [, tileCoords] of tiles) {
            dynamicTiledNavMesh.buildTile(positions, indices, tileCoords)
        }
    }, 200)

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
                opacity: 0.5,
                depthWrite: false,
            }),
        })
    }, [navMeshVersion])

    return (
        <>
            {navMeshDebug && navMeshHelper && <primitive object={navMeshHelper} />}
            {boundsDebug && <box3Helper args={[navMeshBounds]} />}
        </>
    )
}
