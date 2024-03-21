import { AnyEntity, World } from 'arancini'
import { ReactAPI } from 'arancini/react'
import { Executor, SystemClass } from 'arancini/systems'

type UnionToIntersection<U> = ((U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never) & object

type Pretty<T> = T extends unknown
    ? {
          [K in keyof T]: T[K]
      }
    : never

type Api = Record<string, unknown>

type VoxelEnginePluginSetup<E extends AnyEntity> = (
    world: World<E>,
    executor: Executor<E>,
    react: ReactAPI<E>,
) => Api | void

export type VoxelEnginePlugin<E extends AnyEntity> = {
    E?: E
    systems?: (SystemClass & { PRIORITY?: number })[]
    setup?: VoxelEnginePluginSetup<E>
}

export type VoxelEnginePluginApi<P extends VoxelEnginePlugin<any>> = P['setup'] extends VoxelEnginePluginSetup<any>
    ? ReturnType<P['setup']>
    : object

export type VoxelEnginePluginsApi<Plugins extends ReadonlyArray<VoxelEnginePlugin<any>>> = UnionToIntersection<
    {
        [K in keyof Plugins]: VoxelEnginePluginApi<Plugins[K]>
    }[number]
>

export type VoxelEngineEntity<Plugins extends ReadonlyArray<VoxelEnginePlugin<any>>> = Pretty<
    UnionToIntersection<
        {
            [K in keyof Plugins]: Plugins[K]['E']
        }[number]
    >
>
