import { AnyEntity, SystemClass, World } from 'arancini'
import { ReactAPI } from 'arancini/react'

export type UnionToIntersection<U> = ((U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never) & {}

export type Api = Record<string, unknown>

export type VoxelEnginePluginSetup<E extends AnyEntity> = (world: World<E>, ecs: ReactAPI<E>) => Api | void

export type VoxelEnginePlugin<E extends AnyEntity> = {
    E?: E
    components?: (keyof E)[]
    systems?: (SystemClass & { PRIORITY?: number })[]
    setup?: VoxelEnginePluginSetup<E>
}

export type VoxelEnginePluginApi<P extends VoxelEnginePlugin<any>> = P['setup'] extends VoxelEnginePluginSetup<any>
    ? ReturnType<P['setup']>
    : {}

export type VoxelEnginePluginsApi<Plugins extends Array<VoxelEnginePlugin<any>>> = UnionToIntersection<
    {
        [K in keyof Plugins]: VoxelEnginePluginApi<Plugins[K]>
    }[number]
>

export type VoxelEngineEntity<Plugins extends Array<VoxelEnginePlugin<any>>> = UnionToIntersection<
    {
        [K in keyof Plugins]: Plugins[K]['E']
    }[number]
>
