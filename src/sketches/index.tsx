import { lazy } from 'react'
import { Sketch, SketchOptions } from './types'

const sketchList = [
    { title: 'Intro', path: 'intro' },
    /* Lines */
    {
        title: 'Lines - Image',
        path: 'lines/image',
        tags: ['lines', 'image'],
    },
    /* Game of life */
    {
        title: 'Game of Life',
        path: 'game-of-life',
        tags: ['game-of-life', 'cellular-automata'],
    },
    /* Jolt Physics */
    {
        title: 'Jolt Physics - Cube Heap',
        path: 'jolt-physics/cube-heap',
        tags: ['physics', 'jolt-physics', 'arancini'],
    },
    /* Recast Navigation */
    {
        title: 'Recast Navigation - Busy Street Crossing',
        path: 'recast-navigation/busy-street-crossing',
        tags: ['recast-navigation', 'ai', 'navigation', 'pathfinding', 'arancini'],
    },
    {
        title: 'Recast Navigation - Character Controller',
        path: 'recast-navigation/character-controller',
        tags: ['recast-navigation', 'controller', 'arancini'],
    },
    /* Voxels */
    {
        title: 'Simple Voxels - Sphere',
        path: 'voxels/simple-voxels/sphere',
        tags: ['voxels', 'vertex-colors', 'culled-mesher', 'arancini'],
    },
    {
        title: 'Simple Voxels - Building',
        path: 'voxels/simple-voxels/building',
        tags: ['voxels', 'vertex-colors', 'culled-mesher', 'building', 'arancini'],
    },
    {
        title: 'Simple Voxels - Fly Controls',
        path: 'voxels/simple-voxels/fly-controls',
        tags: ['voxels', 'vertex-colors', 'culled-mesher', 'controller', 'arancini'],
    },
    {
        title: 'Simple Voxels - Box Character Controller',
        path: 'voxels/simple-voxels/box-character-controller',
        tags: ['voxels', 'vertex-colors', 'culled-mesher', 'controller', 'arancini'],
    },
    {
        title: 'Simple Voxels - Rapier Physics',
        path: 'voxels/simple-voxels/rapier-physics',
        tags: ['voxels', 'vertex-colors', 'culled-mesher', 'physics', 'rapier', 'arancini'],
    },
    /* Reflectors */
    {
        title: 'Reflectors',
        path: 'reflectors',
        tags: ['reflector', 'mirror'],
    },
    /* Grid Pathfinding */
    {
        title: 'Grid Pathfinding - Basic',
        path: 'grid-pathfinding/basic',
        tags: ['pathfinding', 'grid'],
    },
    /* Fractals */
    {
        title: 'Fractals - Mandelbrot Set',
        path: 'fractals/mandelbrot-set',
        tags: ['fractals', 'mandelbrot-set'],
    },
    /* Rapier */
    {
        title: 'Rapier - Raycast Vehicle',
        path: 'rapier/raycast-vehicle',
        tags: ['physics', 'rapier', 'vehicle', 'controller'],
    },
    {
        title: 'Rapier - Revolute Joint Vehicle',
        path: 'rapier/revolute-joint-vehicle',
        tags: ['physics', 'rapier', 'vehicle', 'controller'],
    },
    {
        title: 'Rapier - Kinematic Character Controller',
        path: 'rapier/kinematic-character-controller',
        tags: ['physics', 'rapier', 'controller'],
    },
    {
        title: 'Rapier - Pointer Controls',
        path: 'rapier/pointer-controls',
        tags: ['physics', 'rapier'],
    },
    {
        title: 'Rapier - Ball Pit Mixer',
        path: 'rapier/ball-pit-mixer',
        tags: ['physics', 'rapier'],
    },
    {
        title: 'Rapier - Raycasting',
        path: 'rapier/raycasting',
        tags: ['physics', 'rapier', 'raycasting'],
    },
    {
        title: 'Rapier - Pointer Raycasting',
        path: 'rapier/pointer-raycasting',
        tags: ['physics', 'rapier', 'raycasting'],
    },
    {
        title: 'Rapier - Spring',
        path: 'rapier/spring',
        tags: ['physics', 'rapier'],
    },
    {
        title: 'Rapier - Arancini Integration',
        path: 'rapier/arancini-integration',
        tags: ['physics', 'rapier', 'arancini']
    },
    /* p2-es */
    {
        title: 'p2-es - Marching Cubes Goo',
        path: 'p2-es/marching-cubes-goo',
        tags: ['physics', 'p2-es', 'marching-cubes', 'arancini'],
    },
    {
        title: 'p2-es - Pixelated Text',
        path: 'p2-es/pixelated-text',
        tags: ['physics', 'p2-es', 'text', 'arancini'],
    },
    {
        title: 'p2-es - Kinematic Character Controller',
        path: 'p2-es/kinematic-character-controller',
        tags: ['physics', 'p2-es', 'controller', 'arancini'],
    },
    /* Character Animation */
    {
        title: 'Character Animation - Basic',
        path: 'character-animation/basic',
        tags: ['animation', 'character'],
    },
    {
        title: 'Character Animation - Mixamo Animations',
        path: 'character-animation/mixamo-animations',
        tags: ['animation', 'character', 'mixamo'],
    },
    /* Nature */
    {
        title: 'Nature - Grass',
        path: 'nature/grass',
        tags: ['nature', 'grass'],
    },
    /* Procedural Generation */
    {
        title: 'Procedural Generation - Diamond Square Heightmap',
        path: 'procedural-generation/diamond-square-heightmap',
        tags: ['procedural-generation', 'diamond-square', 'heightmap'],
    },
    {
        title: 'Procedural Generation - Pixelated Planet',
        path: 'procedural-generation/pixelated-planet',
        tags: ['procedural-generation', 'simplex-noise', 'space', 'planet'],
    },
    /* d3.js */
    {
        title: 'D3 - Force Directed Graph',
        path: 'd3/force-directed-graph',
        tags: ['d3', 'data-viz', 'graph'],
    },
    /* Sprites */
    {
        title: 'Sprites - Face Camera',
        path: 'sprites/face-camera',
        tags: ['sprites'],
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
    /* TSL */
    {
        title: 'TSL - Hello World',
        path: 'tsl/hello-world',
        tags: ['tsl'],
    },
    {
        title: 'TSL - Gradient',
        path: 'tsl/gradient',
        tags: ['tsl', 'gradient'],
    },
    /* GLSL Shaders From Scratch */
    {
        title: 'GLSL Shaders From Scratch - Intro - Varyings',
        path: 'glsl-shaders-from-scratch/intro/varyings',
        tags: ['shaders-from-scratch', 'shaders', 'varyings'],
    },
    {
        title: 'GLSL Shaders From Scratch - Intro - Uniforms',
        path: 'glsl-shaders-from-scratch/intro/uniforms',
        tags: ['shaders-from-scratch', 'shaders', 'uniforms'],
    },
    {
        title: 'GLSL Shaders From Scratch - Intro - Attributes',
        path: 'glsl-shaders-from-scratch/intro/attributes',
        tags: ['shaders-from-scratch', 'shaders', 'attributes'],
    },
    {
        title: 'GLSL Shaders From Scratch - Textures - Basic',
        path: 'glsl-shaders-from-scratch/textures/basic',
        tags: ['shaders-from-scratch', 'shaders', 'textures'],
    },
    {
        title: 'GLSL Shaders From Scratch - Textures - Alpha',
        path: 'glsl-shaders-from-scratch/textures/alpha',
        tags: ['shaders-from-scratch', 'shaders', 'alpha'],
    },
    {
        title: 'GLSL Shaders From Scratch - Textures - Adressing',
        path: 'glsl-shaders-from-scratch/textures/addressing',
        tags: ['shaders-from-scratch', 'shaders', 'addressing'],
    },
    {
        title: 'GLSL Shaders From Scratch - Common Functions and Tricks - Step, Mix, Smoothstep',
        path: 'glsl-shaders-from-scratch/common-functions-and-tricks/step-mix-smoothstep',
        tags: ['shaders-from-scratch', 'shaders', 'step', 'mix', 'smoothstep'],
    },
    {
        title: 'GLSL Shaders From Scratch - Common Functions and Tricks - Min, Max, Clamp, Saturate',
        path: 'glsl-shaders-from-scratch/common-functions-and-tricks/min-max-clamp-saturate',
        tags: ['shaders-from-scratch', 'shaders', 'min', 'max', 'clamp', 'saturate'],
    },
    {
        title: 'GLSL Shaders From Scratch - Common Functions and Tricks - Fract and Friends',
        path: 'glsl-shaders-from-scratch/common-functions-and-tricks/fract-and-friends',
        tags: ['shaders-from-scratch', 'shaders', 'min', 'fract'],
    },
    {
        title: 'GLSL Shaders From Scratch - Vector Operations & Math - Sin/Cos',
        path: 'glsl-shaders-from-scratch/vector-operations-and-math/sin-cos',
        tags: ['shaders-from-scratch', 'shaders', 'sin', 'cos'],
    },
    {
        title: 'GLSL Shaders From Scratch - Vector Operations & Math - Shaping Functions',
        path: 'glsl-shaders-from-scratch/vector-operations-and-math/shaping-functions',
        tags: ['shaders-from-scratch', 'shaders'],
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
    /* XR */
    {
        title: 'XR - Basic VR',
        path: 'xr/basic-vr',
        tags: ['xr', 'vr'],
        hidden: true,
    },
]

export const renamedSketches: { from: string; to: string }[] = [
    { from: 'ai/busy-street-crossing', to: 'recast-navigation/busy-street-crossing' },
]

const sketchCoverGlob: Record<string, { default: string }> = import.meta.glob(`./**/cover.png`, {
    query: {
        w: 1000,
        format: 'webp',
    },
    eager: true,
})

export const sketches: readonly Sketch[] = sketchList.map((s) => {
    const cover = sketchCoverGlob[`./${s.path}/cover.png`]

    return {
        title: s.title,
        route: s.path,
        cover: cover?.default,
        hidden: 'hidden' in s ? (s.hidden as boolean) : false,
        tags: ('tags' in s ? s.tags : undefined) as string[] | undefined,
        description: ('description' in s ? s.description : undefined) as string | undefined,
    }
})

export const visibleSketches: readonly Sketch[] = sketches.filter(
    (sketch) => sketch.hidden === undefined || sketch.hidden === false,
)

export const findSketchByRoute = (v?: string): Sketch | undefined => sketches.find((s) => s.route === v)

const sketchGlob = import.meta.glob(`./**/*.sketch.tsx`)

export const sketchModules = sketchList.reduce(
    (o, sketch) => {
        const module = Object.values(sketchGlob).find(
            (i) => i.name.replace('./', '').replace(/\/[a-zA-Z-]*.sketch.tsx/, '') === sketch.path,
        )!

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
