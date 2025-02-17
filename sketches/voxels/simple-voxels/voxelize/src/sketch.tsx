import { Canvas } from '@/common'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { VoxelChunkMeshes, Voxels, VoxelsRef } from '../../lib/react'

class Volume<T> {
    private map: Map<number, Map<number, Map<number, T>>> = new Map()

    set(x: number, y: number, z: number, value: T) {
        if (!this.map.get(x)) {
            this.map.set(x, new Map())
        }

        if (!this.map.get(x)?.get(y)) {
            this.map.get(x)?.set(y, new Map())
        }

        this.map.get(x)?.get(y)?.set(z, value)
    }

    get(x: number, y: number, z: number): T | undefined {
        return this.map.get(x)?.get(y)?.get(z)
    }

    *iterator() {
        for (const [x, yMap] of this.map) {
            for (const [y, zMap] of yMap) {
                for (const [z, value] of zMap) {
                    yield [x, y, z, value] as const
                }
            }
        }
    }

    [Symbol.iterator]() {
        return this.iterator()
    }
}

export const voxelize = (positions: number[], indices: number[], cellSize: number, cellHeight: number): Volume<boolean> => {
    const volume = new Volume<boolean>()

    const triangle = new THREE.Triangle()
    const point = new THREE.Vector3()

    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()

    const start = new THREE.Vector3()
    const end = new THREE.Vector3()

    const voxelBox = new THREE.Box3()
    const voxelSize = new THREE.Vector3(cellSize, cellHeight, cellSize)

    for (let i = 0; i < indices.length; i += 3) {
        a.set(positions[indices[i] * 3], positions[indices[i] * 3 + 1], positions[indices[i] * 3 + 2])
        b.set(positions[indices[i + 1] * 3], positions[indices[i + 1] * 3 + 1], positions[indices[i + 1] * 3 + 2])
        c.set(positions[indices[i + 2] * 3], positions[indices[i + 2] * 3 + 1], positions[indices[i + 2] * 3 + 2])

        triangle.set(a, b, c)

        start.set(
            Math.floor(Math.min(a.x, b.x, c.x) / cellSize),
            Math.floor(Math.min(a.y, b.y, c.y) / cellHeight),
            Math.floor(Math.min(a.z, b.z, c.z) / cellSize),
        )
        end.set(
            Math.floor(Math.max(a.x, b.x, c.x) / cellSize),
            Math.floor(Math.max(a.y, b.y, c.y) / cellHeight),
            Math.floor(Math.max(a.z, b.z, c.z) / cellSize),
        )

        for (let x = start.x; x <= end.x; x++) {
            for (let y = start.y; y <= end.y; y++) {
                for (let z = start.z; z <= end.z; z++) {
                    point.set(x * cellSize, y * cellHeight, z * cellSize)
                    point.addScalar(cellSize / 2)

                    voxelBox.setFromCenterAndSize(point, voxelSize)

                    if (voxelBox.intersectsTriangle(triangle)) {
                        volume.set(x, y, z, true)
                    }
                }
            }
        }
    }

    return volume
}

type VoxelizeProps = {
    children: React.ReactNode
    cellSize: number
    cellHeight: number
}

const Voxelize = ({ children, cellSize, cellHeight }: VoxelizeProps) => {
    const [voxels, setVoxels] = useState<VoxelsRef | null>()

    const group = useRef<THREE.Group>(null!)

    useEffect(() => {
        if (!voxels) return

        const positions: number[] = []
        const indices: number[] = []

        group.current.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                const geometry = object.geometry as THREE.BufferGeometry

                const position = geometry.getAttribute('position')
                const index = geometry.getIndex()

                if (position) {
                    positions.push(...position.array)
                }

                if (index) {
                    indices.push(...index.array)
                }
            }
        })

        const volume = voxelize(positions, indices, cellSize, cellHeight)

        const orange = new THREE.Color('orange')
        const color = new THREE.Color()

        for (const [x, y, z] of volume) {
            color.copy(orange)
            color.addScalar((Math.random() - 0.5) * 0.12)

            voxels.setBlock(x, y, z, true, Math.random() > 0.5 ? orange.getHex() : color.getHex())
        }
    }, [voxels])

    return (
        <>
            <group ref={group} visible={false}>
                {children}
            </group>

            <Voxels ref={setVoxels}>
                <group scale={[cellSize, cellHeight, cellSize]}>
                    <VoxelChunkMeshes />
                </group>
            </Voxels>
        </>
    )
}

export function Sketch() {
    return (
        <Canvas>
            <Voxelize cellSize={0.05} cellHeight={0.05}>
                <mesh>
                    <torusKnotGeometry args={[1, 0.2, 128, 16]} />
                </mesh>
            </Voxelize>

            <ambientLight intensity={1.5} />
            <directionalLight position={[10, 10, 10]} intensity={1} />

            <OrbitControls makeDefault />
            <PerspectiveCamera makeDefault position={[0, 0, 10]} />
        </Canvas>
    )
}
