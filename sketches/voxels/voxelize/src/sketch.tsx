import { WebGPUCanvas } from '@sketches/common/components/webgpu-canvas'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { MIN_BLOCK_TEXTURE_SIZE, Voxels } from '@sketches/simple-voxels-lib'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const voxelize = (
    voxels: Voxels,
    blockType: number,
    positions: number[],
    indices: number[],
    cellSize: number,
    cellHeight: number,
) => {
    const voxelSize = new THREE.Vector3(cellSize, cellHeight, cellSize)

    const triangle = new THREE.Triangle()
    const point = new THREE.Vector3()

    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()

    const start = new THREE.Vector3()
    const end = new THREE.Vector3()

    const voxelBox = new THREE.Box3()

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
                        voxels.setBlock(x, y, z, blockType)
                    }
                }
            }
        }
    }
}

type VoxelizeProps = {
    children: React.ReactNode
    cellSize: number
    cellHeight: number
}

const Voxelize = ({ children, cellSize, cellHeight }: VoxelizeProps) => {
    const group = useRef<THREE.Group>(null!)
    const voxelsGroup = useRef<THREE.Group>(null!)

    useEffect(() => {
        const voxels = new Voxels(voxelsGroup.current, MIN_BLOCK_TEXTURE_SIZE)
        const orangeBlockType = voxels.registerType({
            cube: {
                default: { color: 'orange' },
            },
        })
        voxels.updateAtlas()

        const positions: number[] = []
        const indices: number[] = []

        group.current.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                const geometry = object.geometry as THREE.BufferGeometry

                const position = geometry.getAttribute('position')
                const index = geometry.getIndex()

                if (position) {
                    for (let i = 0; i < position.array.length; i += 3) {
                        positions.push(position.array[i], position.array[i + 1], position.array[i + 2])
                    }
                }

                if (index) {
                    for (let i = 0; i < index.array.length; i++) {
                        indices.push(index.array[i])
                    }
                }
            }
        })

        voxelize(voxels, orangeBlockType.index, positions, indices, cellSize, cellHeight)

        voxels.updateAll()
    }, [cellSize, cellHeight])

    return (
        <>
            <group ref={group} visible={false}>
                {children}
            </group>

            <group ref={voxelsGroup} />
        </>
    )
}

export function Sketch() {
    return (
        <WebGPUCanvas gl={{ antialias: true }}>
            <Voxelize cellSize={0.05} cellHeight={0.05}>
                <mesh>
                    <torusKnotGeometry args={[1, 0.2, 128, 16]} />
                </mesh>
            </Voxelize>

            <ambientLight intensity={1.5} />
            <directionalLight position={[10, 10, 10]} intensity={1} />

            <OrbitControls makeDefault />
            <PerspectiveCamera makeDefault position={[0, 0, 100]} />
        </WebGPUCanvas>
    )
}
