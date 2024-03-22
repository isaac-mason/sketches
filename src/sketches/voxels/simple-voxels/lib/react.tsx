import { useConst } from '@/common'
import { ThreeElements, useFrame } from '@react-three/fiber'
import { Fragment, createContext, useContext, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { Voxels as VoxelsImpl } from './voxels'
import { VoxelChunk, getChunkBounds } from './world'

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
    children: React.ReactNode
} & ThreeElements['group']

export const Voxels = ({ children, ...groupProps }: VoxelsProps) => {
    const voxels = useConst(() => new VoxelsImpl())

    useEffect(() => {
        voxels.connect()

        return () => {
            voxels.disconnect()
        }
    }, [])

    useFrame(() => {
        voxels.update()
    })

    const contextValue = useMemo(() => ({ voxels }), [voxels])

    return (
        <voxelsContext.Provider value={contextValue}>
            <group {...groupProps}>{children}</group>
        </voxelsContext.Provider>
    )
}

type ChunkHelperProps = { chunk: VoxelChunk }

const ChunkHelper = ({ chunk }: ChunkHelperProps) => {
    const { min, max } = getChunkBounds(chunk)
    const box3 = new THREE.Box3(min, max)
    box3.min.subScalar(1)

    return <box3Helper args={[box3, 0xffff00]} />
}

type VoxelChunkMeshesProps = {
    chunkHelper?: boolean
}

export const VoxelChunkMeshes = ({ chunkHelper = false }: VoxelChunkMeshesProps) => {
    const { voxels } = useVoxels()

    type ChunkAndMesh = { chunk: VoxelChunk; mesh: THREE.Mesh }

    const [meshes, setMeshes] = useState<ChunkAndMesh[]>([])

    useEffect(() => {
        const meshes: ChunkAndMesh[] = []

        for (const [, chunk] of voxels.world.chunks) {
            const mesh = voxels.chunkMeshes.get(chunk.id)?.mesh

            if (!mesh) continue

            meshes.push({ chunk, mesh })
        }

        setMeshes(meshes)

        const unsub = voxels.onChunkCreated.add((chunk, mesh) => {
            setMeshes((prev) => [...prev, { chunk, mesh }])
        })

        return () => {
            setMeshes([])

            unsub()
        }
    }, [])
    return (
        <>
            {meshes.map(({ chunk, mesh }) => (
                <Fragment key={chunk.id}>
                    <primitive object={mesh} />
                    {chunkHelper && <ChunkHelper chunk={chunk} />}
                </Fragment>
            ))}
        </>
    )
}
