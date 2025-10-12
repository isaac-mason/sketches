import { useInterval } from '@sketches/common/hooks/use-interval'
import { usePageVisible } from '@sketches/common/hooks/use-page-visible'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import { useEffect, useState } from 'react'
import { Crowd, NavMesh, NavMeshQuery, RecastConfig } from 'recast-navigation'
import { DebugDrawer, getPositionsAndIndices } from '@recast-navigation/three'
import * as THREE from 'three'
import { create } from 'zustand'
import { traversableQuery } from '../ecs'
import { DynamicTiledNavMesh } from './dynamic-tiled-navmesh'

export type NavigationState = {
    dynamicTiledNavMesh?: DynamicTiledNavMesh
    navMesh?: NavMesh
    navMeshQuery?: NavMeshQuery
    crowd?: Crowd
}

export const useNavigation = create<NavigationState>(() => ({
    dynamicTiledNavMesh: undefined,
    navMesh: undefined,
    navMeshQuery: undefined,
    crowd: undefined,
}))

const navMeshBounds = new THREE.Box3(new THREE.Vector3(-50, -10, -50), new THREE.Vector3(70, 30, 40))

const cellSize = 0.15
const cellHeight = 0.45

const recastConfig: Partial<RecastConfig> = {
    tileSize: 128,
    cs: cellSize,
    ch: cellHeight,
    walkableRadius: 0.8 / cellSize,
    walkableClimb: 1.5 / cellHeight,
    walkableHeight: 3 / cellHeight,
}

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

const NavMeshDebug = () => {
    const { dynamicTiledNavMesh } = useNavigation()
    const scene = useThree((state) => state.scene)

    useEffect(() => {
        if (!dynamicTiledNavMesh) return

        const debugDrawer = new DebugDrawer()
        debugDrawer.drawNavMesh(dynamicTiledNavMesh.navMesh)
        scene.add(debugDrawer)

        const unsubOnNavMeshUpdate = dynamicTiledNavMesh.onNavMeshUpdate.add(() => {
            debugDrawer.reset()
            debugDrawer.drawNavMesh(dynamicTiledNavMesh.navMesh)
        })

        return () => {
            unsubOnNavMeshUpdate()
            scene.remove(debugDrawer)
            debugDrawer.dispose()
        }
    }, [dynamicTiledNavMesh])

    return null
}

export const Navigation = () => {
    const pageVisible = usePageVisible()

    const { boundsDebug, navMeshDebug } = useControls('navigation', {
        boundsDebug: false,
        navMeshDebug: true,
    })

    const [dynamicTiledNavMesh, setDynamicTiledNavMesh] = useState<DynamicTiledNavMesh>()

    const getTraversablePositionsAndIndices = (): [positions: Float32Array, indices: Uint32Array] => {
        const traversableMeshes = getTraversableMeshes()
        return getPositionsAndIndices(traversableMeshes)
    }

    useEffect(() => {
        const dynamicTiledNavMesh = new DynamicTiledNavMesh({ navMeshBounds, recastConfig, workers: navMeshWorkers })
        const navMeshQuery = new NavMeshQuery(dynamicTiledNavMesh.navMesh)
        const crowd = new Crowd(dynamicTiledNavMesh.navMesh, { maxAgents, maxAgentRadius })

        setDynamicTiledNavMesh(dynamicTiledNavMesh)
        useNavigation.setState({ dynamicTiledNavMesh, navMesh: dynamicTiledNavMesh.navMesh, navMeshQuery, crowd })

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

            useNavigation.setState({
                dynamicTiledNavMesh: undefined,
                navMesh: undefined,
                navMeshQuery: undefined,
                crowd: undefined,
            })

            dynamicTiledNavMesh.destroy()
            navMeshQuery.destroy()
            crowd.destroy()
        }
    }, [])

    /* rebuild tiles with active rigid bodies every 200ms */
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
        const crowd = useNavigation.getState().crowd
        if (!crowd || !pageVisible) return

        crowd.update(1 / 60, Math.min(delta, 0.1))
    })

    return (
        <>
            {boundsDebug && <box3Helper args={[navMeshBounds]} />}
            {navMeshDebug && <NavMeshDebug />}
        </>
    )
}
