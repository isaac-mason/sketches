import { ComponentDefinition, SystemClass, World } from 'arancini'
import { createECS } from 'arancini/react'

export type UnionToIntersection<U> = ((U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never) & {}

export type Api = Record<string, unknown>

export type VoxelEnginePluginSetup = (world: World, ecs: ReturnType<typeof createECS>) => Api | void

export type VoxelEnginePlugin = {
    components: ComponentDefinition[]
    systems: (SystemClass & { PRIORITY?: number })[]
    setup?: VoxelEnginePluginSetup
}

export type VoxelEnginePluginApi<P extends VoxelEnginePlugin> = P['setup'] extends VoxelEnginePluginSetup
    ? ReturnType<P['setup']>
    : never
