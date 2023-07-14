import { lazy } from 'react'
import { Sketch, SketchOptions } from './types'

const sketchList = [
    { title: 'Intro', path: 'intro' },
    /* GLSL Shaders From Scratch */
    {
        title: 'Shaders From Scratch 1 - Varyings',
        path: 'glsl-shaders-from-scratch/01-varyings',
        tags: ['shaders-from-scratch', 'shaders', 'varyings'],
    },
    {
        title: 'Shaders From Scratch 2 - Uniforms',
        path: 'glsl-shaders-from-scratch/02-uniforms',
        tags: ['shaders-from-scratch', 'shaders', 'uniforms'],
    },
    {
        title: 'Shaders From Scratch 3 - Attributes',
        path: 'glsl-shaders-from-scratch/03-attributes',
        tags: ['shaders-from-scratch', 'shaders', 'attributes'],
    },
    {
        title: 'Shaders From Scratch 4 - Textures',
        path: 'glsl-shaders-from-scratch/04-textures',
        tags: ['shaders-from-scratch', 'shaders', 'textures'],
    },
    {
        title: 'Shaders From Scratch 5 - Alpha',
        path: 'glsl-shaders-from-scratch/05-alpha',
        tags: ['shaders-from-scratch', 'shaders', 'alpha'],
    },
    {
        title: 'Shaders From Scratch 6 - Addressing',
        path: 'glsl-shaders-from-scratch/06-addressing',
        tags: ['shaders-from-scratch', 'shaders', 'addressing'],
    },
    /* Three.js Journey */
    {
        title: 'Journey Lesson 3 - Basic',
        path: 'threejs-journey/03-basic',
        tags: ['threejs-journey'],
    },
    {
        title: 'Journey Lesson 5 - Transforms',
        path: 'threejs-journey/05-transforms',
        tags: ['threejs-journey'],
    },
    {
        title: 'Journey Lesson 6 - Animations',
        path: 'threejs-journey/06-animations',
        tags: ['threejs-journey', 'animation'],
    },
    {
        title: 'Journey Lesson 7 - Cameras',
        path: 'threejs-journey/07-cameras',
        tags: ['threejs-journey', 'cameras'],
    },
    {
        title: 'Journey Lesson 9 - Geometries',
        path: 'threejs-journey/09-geometries',
        tags: ['threejs-journey', 'geometries'],
    },
    {
        title: 'Journey Lesson 11 - Textures',
        path: 'threejs-journey/11-textures',
        tags: ['threejs-journey', 'textures'],
    },
    {
        title: 'Journey Lesson 12 - Materials',
        path: 'threejs-journey/12-materials',
        tags: ['threejs-journey', 'materials'],
    },
    {
        title: 'Journey Lesson 13 - Text',
        path: 'threejs-journey/13-text',
        tags: ['threejs-journey', 'text'],
    },
    {
        title: 'Journey Lesson 15 - Lights',
        path: 'threejs-journey/15-lights',
        tags: ['threejs-journey', 'lighting'],
    },
    {
        title: 'Journey Lesson 16 - Shadows',
        path: 'threejs-journey/16-shadows',
        tags: ['threejs-journey', 'shadows'],
    },
    {
        title: 'Journey Lesson 17 - Haunted House',
        path: 'threejs-journey/17-haunted-house',
        tags: ['threejs-journey', 'lighting', 'shadows', 'scene'],
    },
    {
        title: 'Journey Lesson 18.1 - Particles',
        path: 'threejs-journey/18-1-particles',
        tags: ['threejs-journey', 'particles'],
    },
    {
        title: 'Journey Lesson 18.2 - Particles',
        path: 'threejs-journey/18-2-particles',
        tags: ['threejs-journey', 'particles'],
    },
    {
        title: 'Journey Lesson 19 - Galaxy Generator',
        path: 'threejs-journey/19-galaxy-generator',
        tags: ['threejs-journey', 'particles'],
    },
    {
        title: 'Journey Lesson 27 - Shaders',
        path: 'threejs-journey/27-shaders',
        tags: ['threejs-journey', 'shaders'],
    },
    {
        title: 'Journey Lesson 28 - Raging Sea',
        path: 'threejs-journey/28-raging-sea',
        tags: ['threejs-journey', 'shaders'],
    },
    {
        title: 'Journey Lesson 29 - Animated Galaxy',
        path: 'threejs-journey/29-animated-galaxy',
        tags: ['threejs-journey', 'shaders'],
    },
    {
        title: 'Journey Lesson 30 - Modified Materials',
        path: 'threejs-journey/30-modified-materials',
        tags: ['threejs-journey', 'shaders'],
    },
    /* Rapier */
    {
        title: 'Rapier - Raycasting',
        path: 'rapier/raycasting',
        tags: ['physics', 'rapier', 'raycasting'],
    },
    {
        title: 'Rapier - Camera Raycasting',
        path: 'rapier/camera-raycasting',
        tags: ['physics', 'rapier', 'raycasting'],
    },
    {
        title: 'Rapier - Spring',
        path: 'rapier/spring',
        tags: ['physics', 'rapier'],
    },
    {
        title: 'Rapier - Pointer Constraint',
        path: 'rapier/pointer-constraint',
        tags: ['physics', 'rapier'],
    },
    {
        title: 'Rapier - Revolute Joint Vehicle',
        path: 'rapier/revolute-joint-vehicle',
        tags: ['physics', 'rapier', 'vehicle', 'controller'],
    },
    {
        title: 'Rapier - Raycast Vehicle',
        path: 'rapier/raycast-vehicle',
        tags: ['physics', 'rapier', 'vehicle', 'controller'],
    },
    {
        title: 'Rapier - Kinematic Character Controller',
        path: 'rapier/kinematic-character-controller',
        tags: ['physics', 'rapier', 'controller'],
    },
    /* p2-es */
    {
        title: 'p2-es - Marching Cubes Goo',
        path: 'p2-es/marching-cubes-goo',
        tags: ['physics', 'p2-es', 'marching-cubes'],
    },
    {
        title: 'p2-es - Pixelated Text',
        path: 'p2-es/pixelated-text',
        tags: ['physics', 'p2-es', 'text'],
    },
    /* Voxels */
    {
        title: 'Voxels - Culled Mesher',
        path: 'voxels/culled-mesher',
        tags: ['voxels'],
        hidden: true,
    },
    /* Postprocessing */
    {
        title: 'Postprocessing - Pixelation',
        path: 'postprocessing/pixelation',
        tags: ['postprocessing'],
    },
    {
        title: 'Postprocessing - Emissive Bloom',
        path: 'postprocessing/emissive-bloom',
        tags: ['postprocessing', 'bloom'],
    },
    /* d3.js */
    {
        title: 'D3 - Force Directed Graph',
        path: 'd3/force-directed-graph',
        tags: ['d3', 'data-viz', 'graph'],
    },
    /* Procedural Generation */
    {
        title: 'Procedural Generation - Diamond Square Heightmap',
        path: 'procedural-generation/diamond-square-heightmap',
        tags: ['procedural-generation', 'diamond-square', 'heightmap'],
    },
] as const

export const sketches: readonly Sketch[] = sketchList.map((s) => {
    const coverUrl = new URL(`./${s.path}/cover.png`, import.meta.url)

    return {
        title: s.title,
        route: s.path,
        cover: coverUrl.pathname.includes('/undefined') ? undefined : coverUrl.href,
        hidden: 'hidden' in s ? s.hidden : false,
        tags: ('tags' in s ? s.tags : undefined) as string[] | undefined,
        description: ('description' in s ? s.description : undefined) as string | undefined,
    }
})

export const visibleSketches: readonly Sketch[] = sketches.filter(
    (sketch) => sketch.hidden === undefined || sketch.hidden === false,
)

export const findSketchByRoute = (v?: string): Sketch | undefined => sketches.find((s) => s.route === v)

const glob = import.meta.glob(`./**/*.sketch.tsx`)

export const sketchModules = sketchList.reduce(
    (o, sketch) => {
        const module = Object.values(glob).find((i) => i.name.includes(sketch.path))!

        o[sketch.path] = {
            module,
            component: lazy(module as never),
            getOptions: async () => {
                const exports = await module()

                return (exports as { options?: SketchOptions })?.options
            },
        }

        return o
    },
    {} as Record<
        Sketch['route'],
        { module: () => Promise<unknown>; component: React.ComponentType; getOptions: () => Promise<SketchOptions | undefined> }
    >,
)
