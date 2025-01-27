import { useThree } from '@react-three/fiber'
import { TeleportTarget } from '@react-three/xr'
import * as RecastThree from '@recast-navigation/three'
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import * as Recast from 'recast-navigation'
import { TiledNavMeshGeneratorConfig } from 'recast-navigation/generators'
import { suspend } from 'suspend-react'
import * as THREE from 'three'

const ENABLED_POLY_FLAG = 1

export const getNavMeshPositionsAndIndices = (navMesh: Recast.NavMesh, flags: number) => {
    const positions: number[] = []
    const indices: number[] = []
    let tri = 0

    const maxTiles = navMesh.getMaxTiles()

    for (let tileIndex = 0; tileIndex < maxTiles; tileIndex++) {
        const tile = navMesh.getTile(tileIndex)
        const tileHeader = tile.header()

        if (!tileHeader) continue

        const tilePolyCount = tileHeader.polyCount()

        for (let tilePolyIndex = 0; tilePolyIndex < tilePolyCount; ++tilePolyIndex) {
            const poly = tile.polys(tilePolyIndex)

            if ((poly.flags() & flags) === 0) continue

            if (poly.getType() === 1) continue

            const polyVertCount = poly.vertCount()
            const polyDetail = tile.detailMeshes(tilePolyIndex)
            const polyDetailTriBase = polyDetail.triBase()
            const polyDetailTriCount = polyDetail.triCount()

            for (let polyDetailTriIndex = 0; polyDetailTriIndex < polyDetailTriCount; ++polyDetailTriIndex) {
                const detailTrisBaseIndex = (polyDetailTriBase + polyDetailTriIndex) * 4

                for (let trianglePoint = 0; trianglePoint < 3; ++trianglePoint) {
                    if (tile.detailTris(detailTrisBaseIndex + trianglePoint) < polyVertCount) {
                        const tileVertsBaseIndex = poly.verts(tile.detailTris(detailTrisBaseIndex + trianglePoint)) * 3

                        positions.push(
                            tile.verts(tileVertsBaseIndex),
                            tile.verts(tileVertsBaseIndex + 1),
                            tile.verts(tileVertsBaseIndex + 2),
                        )
                    } else {
                        const tileVertsBaseIndex =
                            (polyDetail.vertBase() + tile.detailTris(detailTrisBaseIndex + trianglePoint) - poly.vertCount()) * 3

                        positions.push(
                            tile.detailVerts(tileVertsBaseIndex),
                            tile.detailVerts(tileVertsBaseIndex + 1),
                            tile.detailVerts(tileVertsBaseIndex + 2),
                        )
                    }

                    indices.push(tri++)
                }
            }
        }
    }

    return [positions, indices]
}

const floodFillPruneNavMesh = (navMesh: Recast.NavMesh, point: THREE.Vector3) => {
    const navMeshQuery = new Recast.NavMeshQuery(navMesh)

    const nearestPolyResult = navMeshQuery.findNearestPoly(point, {
        halfExtents: { x: 2, y: 2, z: 2 },
    })

    if (!nearestPolyResult.success) return

    /* find all polys connected to the nearest poly */
    const visited = new Set<number>()
    visited.add(nearestPolyResult.nearestRef)

    const openList: number[] = []

    openList.push(nearestPolyResult.nearestRef)

    while (openList.length > 0) {
        const ref = openList.pop()!

        // get current poly and tile
        const { poly, tile } = navMesh.getTileAndPolyByRefUnsafe(ref)

        // visit linked polys
        for (let i = poly.firstLink(); i !== Recast.Detour.DT_NULL_LINK; i = tile.links(i).next()) {
            const neiRef = tile.links(i).ref()

            // skip invalid and already visited
            if (!neiRef || visited.has(neiRef)) continue

            // mark as visited
            visited.add(neiRef)

            // visit neighbours
            openList.push(neiRef)
        }
    }

    /* disable unvisited polys */
    for (let tileIndex = 0; tileIndex < navMesh.getMaxTiles(); tileIndex++) {
        const tile = navMesh.getTile(tileIndex)

        if (!tile || !tile.header()) continue

        const tileHeader = tile.header()!

        const base = navMesh.getPolyRefBase(tile)

        for (let i = 0; i < tileHeader.polyCount(); i++) {
            const ref = base | i

            if (!visited.has(ref)) {
                // set flag to 0
                // this could also be a custom 'disabled' area flag if using custom areas
                navMesh.setPolyFlags(ref, 0)
            }
        }
    }

    navMeshQuery.destroy()
}

type NavMeshProviderContextType = {
    navMesh: Recast.NavMesh
}

const NavMeshProviderContext = createContext<NavMeshProviderContextType | undefined>(undefined)

type NavMeshProviderProps = {
    children: ReactNode
    config: Partial<TiledNavMeshGeneratorConfig>
    floodFillPoint?: THREE.Vector3Tuple
}

export const NavMeshProvider = ({ children, config, floodFillPoint }: NavMeshProviderProps) => {
    suspend(async () => await Recast.init(), ['_recast_init'])

    const scene = useThree((s) => s.scene)

    const [context, setContext] = useState<NavMeshProviderContextType | undefined>(undefined)

    useEffect(() => {
        const walkableObjects = new Set<THREE.Object3D>()
        const meshes = new Set<THREE.Mesh>()

        scene.traverse((object) => {
            if (object.userData?.walkable) {
                walkableObjects.add(object)
            }
        })

        for (const object of walkableObjects) {
            object.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    meshes.add(child)
                }
            })
        }

        const { success, navMesh } = RecastThree.threeToTiledNavMesh(Array.from(meshes), config)

        if (!success) return

        if (floodFillPoint) {
            floodFillPruneNavMesh(navMesh, new THREE.Vector3().fromArray(floodFillPoint))
        }

        setContext({ navMesh })

        return () => {
            setContext(undefined)

            navMesh.destroy()
        }
    }, [scene, config])

    return <NavMeshProviderContext.Provider value={context}>{children}</NavMeshProviderContext.Provider>
}

type WalkableProps = {
    children: ReactNode
}

export const Walkable = ({ children }: WalkableProps) => {
    const userData = useMemo(() => ({ walkable: true }), [])

    return <object3D userData={userData}>{children}</object3D>
}

type NavMeshTeleportTargetProps = {
    onTeleport: (position: THREE.Vector3) => void
    visible?: boolean
}

export const NavMeshTeleportTarget = ({ onTeleport, visible = false }: NavMeshTeleportTargetProps) => {
    const context = useContext(NavMeshProviderContext)

    const [geometry, setGeometry] = useState<THREE.BufferGeometry | undefined>(undefined)

    useEffect(() => {
        if (!context) return

        const [positions, indices] = getNavMeshPositionsAndIndices(context.navMesh, ENABLED_POLY_FLAG)

        const geometry = new THREE.BufferGeometry()

        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
        geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1))

        setGeometry(geometry)

        return () => {
            setGeometry(undefined)

            geometry.dispose()
        }
    }, [context])

    if (!geometry) return null

    return (
        <TeleportTarget onTeleport={onTeleport}>
            <mesh>
                <primitive object={geometry} />
                <meshBasicMaterial color="#5484d1" opacity={0.5} transparent visible={visible} />
            </mesh>
        </TeleportTarget>
    )
}
