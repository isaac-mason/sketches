import { Canvas } from '@/common'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { VoxelChunkMeshes, Voxels, useVoxels } from '../lib/react'

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

    const min = new THREE.Vector3()
    const max = new THREE.Vector3()

    const start = new THREE.Vector3()
    const end = new THREE.Vector3()

    for (let i = 0; i < indices.length; i += 3) {
        a.set(positions[indices[i] * 3], positions[indices[i] * 3 + 1], positions[indices[i] * 3 + 2])
        b.set(positions[indices[i + 1] * 3], positions[indices[i + 1] * 3 + 1], positions[indices[i + 1] * 3 + 2])
        c.set(positions[indices[i + 2] * 3], positions[indices[i + 2] * 3 + 1], positions[indices[i + 2] * 3 + 2])

        triangle.set(a, b, c)

        min.set(Math.min(a.x, b.x, c.x), Math.min(a.y, b.y, c.y), Math.min(a.z, b.z, c.z))
        max.set(Math.max(a.x, b.x, c.x), Math.max(a.y, b.y, c.y), Math.max(a.z, b.z, c.z))

        start.set(Math.floor(min.x / cellSize), Math.floor(min.y / cellHeight), Math.floor(min.z / cellSize))
        end.set(Math.floor(max.x / cellSize), Math.floor(max.y / cellHeight), Math.floor(max.z / cellSize))

        for (let x = start.x; x <= end.x; x++) {
            for (let y = start.y; y <= end.y; y++) {
                for (let z = start.z; z <= end.z; z++) {
                    point.set(x * cellSize, y * cellHeight, z * cellSize)

                    if (triangle.containsPoint(point)) {
                        volume.set(x, y, z, true)
                    }
                }
            }
        }
    }

    return volume
}

const CELL_SIZE = 0.05
const CELL_HEIGHT = 0.05

type VoxelizeProps = {
    children: React.ReactNode
}

const Voxelize = ({ children }: VoxelizeProps) => {
    const { voxels } = useVoxels()

    const ref = useRef<THREE.Group>(null!)

    useEffect(() => {
        const positions: number[] = []
        const indices: number[] = []

        ref.current.traverse((object) => {
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

        const volume = voxelize(positions, indices, CELL_SIZE, CELL_HEIGHT)

        const cursor = new THREE.Vector3()

        const orange = new THREE.Color('orange')
        const color = new THREE.Color()

        for (const [x, y, z] of volume) {
            cursor.set(x, y, z)

            color.copy(orange)
            color.addScalar((Math.random() - 0.5) * 0.12)

            voxels.setBlock(cursor, { solid: true, color: color.getHex() })
        }
    }, [])

    return (
        <group ref={ref} visible={false}>
            {children}
        </group>
    )
}

export default function Sketch() {
    return (
        <Canvas>
            <Voxels>
                <Voxelize>
                    <mesh>
                        <torusKnotGeometry args={[1, 0.2, 128, 16]} />
                        <meshNormalMaterial />
                    </mesh>
                </Voxelize>

                <group scale={[CELL_SIZE, CELL_HEIGHT, CELL_SIZE]}>
                    <VoxelChunkMeshes />
                </group>
            </Voxels>

            <ambientLight intensity={1.5} />
            <directionalLight position={[10, 10, 10]} intensity={1} />

            <OrbitControls makeDefault />
            <PerspectiveCamera makeDefault position={[0, 0, 10]} />
        </Canvas>
    )
}
