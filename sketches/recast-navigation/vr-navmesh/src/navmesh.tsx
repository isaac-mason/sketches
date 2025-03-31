import { useThree } from '@react-three/fiber'
import { TeleportTarget } from '@react-three/xr'
import * as RecastThree from '@recast-navigation/three'
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import * as Recast from 'recast-navigation'
import { floodFillPruneNavMesh, getNavMeshPositionsAndIndices } from 'recast-navigation'
import { TiledNavMeshGeneratorConfig } from 'recast-navigation/generators'
import { suspend } from 'suspend-react'
import * as THREE from 'three'

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
            const navMeshQuery = new Recast.NavMeshQuery(navMesh)
            const point = new THREE.Vector3(...floodFillPoint)
            const { success, status, nearestRef } = navMeshQuery.findNearestPoly(point)

            if (success) {
                floodFillPruneNavMesh(navMesh, [nearestRef])
            } else {
                console.warn('Failed to find nearest poly for flood fill', Recast.statusToReadableString(status))
            }
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

const ENABLED_POLY_FLAG = 1

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
