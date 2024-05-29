import { useConst } from '@/common'
import { ThreeElements, useFrame } from '@react-three/fiber'
import { Fragment, createContext, forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import * as THREE from 'three'
import { Voxels as VoxelsImpl, VoxelsWorkerPool } from './voxels'
import { Chunk, getChunkBounds } from './world'
import { Helper } from '@react-three/drei'
import { VertexNormalsHelper } from 'three/examples/jsm/Addons.js'

type VoxelsContextType = {
    voxels: VoxelsImpl
}

const voxelsContext = createContext<VoxelsContextType>(null!)

export const useVoxels = () => {
    const context = useContext(voxelsContext)

    if (!context) {
        throw new Error('useVoxels must be used within <Voxels>')
    }

    return context
}

export type VoxelsProps = {
    voxels?: VoxelsImpl
    voxelsWorkerPool?: VoxelsWorkerPool
    children: React.ReactNode
}

export type VoxelsRef = VoxelsImpl

export const Voxels = forwardRef<VoxelsImpl, VoxelsProps>(
    ({ voxels: existingVoxels, voxelsWorkerPool: existingVoxelsWorkerPool, children }, ref) => {
        const voxelsWorkerPool = useConst(() => existingVoxelsWorkerPool ?? new VoxelsWorkerPool())

        const voxels = useConst(() => existingVoxels ?? new VoxelsImpl({ voxelsWorkerPool }))

        useImperativeHandle(ref, () => voxels, [voxels])

        useEffect(() => {
            if (existingVoxelsWorkerPool) return

            voxelsWorkerPool.connect()

            return () => {
                voxelsWorkerPool.disconnect()
            }
        }, [])

        useFrame(() => {
            voxels.update()
        })

        const contextValue = useMemo(() => ({ voxels }), [voxels])

        return <voxelsContext.Provider value={contextValue}>{children}</voxelsContext.Provider>
    },
)

type ChunkHelperProps = { chunk: Chunk }

const ChunkHelper = ({ chunk }: ChunkHelperProps) => {
    const { min, max } = getChunkBounds(chunk)
    const box3 = new THREE.Box3(min, max)
    box3.min.subScalar(1)

    return <box3Helper args={[box3, 0xffff00]} />
}

type VoxelChunkMeshesProps = {
    chunkHelper?: boolean
} & ThreeElements['group']

export const VoxelChunkMeshes = ({ chunkHelper = false, ...groupProps }: VoxelChunkMeshesProps) => {
    const { voxels } = useVoxels()

    type ChunkAndMesh = { chunk: Chunk; mesh: THREE.Mesh }

    const [meshes, setMeshes] = useState<ChunkAndMesh[]>([])

    useEffect(() => {
        const meshes: ChunkAndMesh[] = []

        for (const [, chunk] of voxels.world.chunks) {
            const { mesh, initialised } = voxels.chunkMeshes.get(chunk.id) ?? {}

            if (!mesh || !initialised) continue

            meshes.push({ chunk, mesh })
        }

        setMeshes(meshes)

        const unsubOnChunkMeshInitialised = voxels.onChunkMeshInitialised.add((chunk, mesh) => {
            setMeshes((prev) => [...prev, { chunk, mesh }])
        })

        return () => {
            setMeshes([])

            unsubOnChunkMeshInitialised()
        }
    }, [])

    return (
        <group {...groupProps}>
            {meshes.map(({ chunk, mesh }) => (
                <Fragment key={chunk.id}>
                    <primitive object={mesh} />
                    {chunkHelper && <ChunkHelper chunk={chunk} />}
                </Fragment>
            ))}
        </group>
    )
}
