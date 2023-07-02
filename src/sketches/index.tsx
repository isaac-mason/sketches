import { lazy } from 'react'

export type Sketch = {
    title: string
    route: string
    cover?: string
    hidden?: boolean
}

const sketchList = [
    { title: 'Home', route: 'Home' },
    /* GLSL Shaders From Scratch */
    {
        title: 'Shaders From Scratch 1 - Varyings',
        route: 'GLSLShadersFromScratch01-Varyings',
    },
    {
        title: 'Shaders From Scratch 2 - Uniforms',
        route: 'GLSLShadersFromScratch02-Uniforms',
    },
    {
        title: 'Shaders From Scratch 3 - Attributes',
        route: 'GLSLShadersFromScratch03-Attributes',
    },
    {
        title: 'Shaders From Scratch 4 - Textures',
        route: 'GLSLShadersFromScratch04-Textures',
    },
    {
        title: 'Shaders From Scratch 5 - Alpha',
        route: 'GLSLShadersFromScratch05-Alpha',
    },
    {
        title: 'Shaders From Scratch 6 - Addressing',
        route: 'GLSLShadersFromScratch06-Addressing',
    },
    /* Three.js Journey */
    {
        title: 'Journey Lesson 3 - Basic',
        route: 'JourneyLesson03-Basic',
    },
    {
        title: 'Journey Lesson 5 - Transforms',
        route: 'JourneyLesson05-Transforms',
    },
    {
        title: 'Journey Lesson 6 - Animations',
        route: 'JourneyLesson06-Animations',
    },
    {
        title: 'Journey Lesson 7 - Cameras',
        route: 'JourneyLesson07-Cameras',
    },
    {
        title: 'Journey Lesson 9 - Geometries',
        route: 'JourneyLesson09-Geometries',
    },
    {
        title: 'Journey Lesson 11 - Textures',
        route: 'JourneyLesson11-Textures',
    },
    {
        title: 'Journey Lesson 12 - Materials',
        route: 'JourneyLesson12-Materials',
    },
    {
        title: 'Journey Lesson 13 - Text',
        route: 'JourneyLesson13-Text',
    },
    {
        title: 'Journey Lesson 15 - Lights',
        route: 'JourneyLesson15-Lights',
    },
    {
        title: 'Journey Lesson 16 - Shadows',
        route: 'JourneyLesson16-Shadows',
    },
    {
        title: 'Journey Lesson 17 - Haunted House',
        route: 'JourneyLesson17-HauntedHouse',
    },
    {
        title: 'Journey Lesson 18.1 - Particles',
        route: 'JourneyLesson18-1-Particles',
    },
    {
        title: 'Journey Lesson 18.2 - Particles',
        route: 'JourneyLesson18-2-Particles',
    },
    {
        title: 'Journey Lesson 19 - Galaxy Generator',
        route: 'JourneyLesson19-GalaxyGenerator',
    },
    {
        title: 'Journey Lesson 27 - Shaders',
        route: 'JourneyLesson27-Shaders',
    },
    {
        title: 'Journey Lesson 28 - Raging Sea',
        route: 'JourneyLesson28-RagingSea',
    },
    {
        title: 'Journey Lesson 29 - Animated Galaxy',
        route: 'JourneyLesson29-AnimatedGalaxy',
    },
    {
        title: 'Journey Lesson 30 - Modified Materials',
        route: 'JourneyLesson30-ModifiedMaterials',
    },
    /* Rapier */
    {
        title: 'Rapier - Raycasting',
        route: 'Rapier-Raycasting',
    },
    {
        title: 'Rapier - Camera Raycasting',
        route: 'Rapier-CameraRaycasting',
    },
    {
        title: 'Rapier - Spring',
        route: 'Rapier-Spring',
    },
    {
        title: 'Rapier - Pointer Constraint',
        route: 'Rapier-PointerConstraint',
    },
    {
        title: 'Rapier - Revolute Joint Vehicle',
        route: 'Rapier-RevoluteJointVehicle',
    },
    {
        title: 'Rapier - Raycast Vehicle',
        route: 'Rapier-RaycastVehicle',
    },
    {
        title: 'Rapier - Kinematic Character Controller',
        route: 'Rapier-KinematicCharacterController',
    },
    /* p2-es */
    {
        title: 'p2-es - Marching Cubes Goo',
        route: 'p2-MarchingCubesGoo',
    },
    {
        title: 'p2-es - Pixelated Text',
        route: 'p2-PixelatedText',
    },
    /* Postprocessing */
    {
        title: 'Postprocessing - Pixelation',
        route: 'Postprocessing-Pixelation',
    },
    {
        title: 'Postprocessing - Emissive Bloom',
        route: 'Postprocessing-EmissiveBloom',
    },
    /* d3.js */
    {
        title: 'D3 - Force Directed Graph',
        route: 'D3-ForceDirectedGraph',
    },
] as const

export const sketches: readonly Sketch[] = sketchList.map((s) => {
    const coverUrl = new URL(`./sketch-${s.route}/cover.png`, import.meta.url)

    return {
        title: s.title,
        route: s.route,
        cover: coverUrl.pathname === '/undefined' ? undefined : coverUrl.href,
    }
})

export const visibleSketches: readonly Sketch[] = sketches.filter(
    (sketch) => sketch.hidden === undefined || sketch.hidden === false
)

export const isSketchRoute = (v?: string): v is Sketch['route'] =>
    sketchList.some((s) => s.route === v)

export const sketchComponents = sketchList.reduce((o, sketch) => {
    o[sketch.route] = {
        Component: lazy(() => import(`./sketch-${sketch.route}/index.tsx`)),
    }

    return o
}, {} as Record<Sketch['route'], { Component: React.ComponentType }>)

