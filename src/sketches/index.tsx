import { lazy } from 'react'
import GLSLShadersFromScratch01Cover from './covers/GLSLShadersFromScratch01-Varyings.png'
import GLSLShadersFromScratch02Cover from './covers/GLSLShadersFromScratch02-Uniforms.png'
import GLSLShadersFromScratch03Cover from './covers/GLSLShadersFromScratch03-Attributes.png'
import GLSLShadersFromScratch04Cover from './covers/GLSLShadersFromScratch04-Textures.png'
import GLSLShadersFromScratch05Cover from './covers/GLSLShadersFromScratch05-Alpha.png'
import GLSLShadersFromScratch06Cover from './covers/GLSLShadersFromScratch06.png'
import JourneyLesson03Cover from './covers/JourneyLesson03.png'
import JourneyLesson05Cover from './covers/JourneyLesson05.png'
import JourneyLesson06Cover from './covers/JourneyLesson06.png'
import JourneyLesson07Cover from './covers/JourneyLesson07.png'
import JourneyLesson09Cover from './covers/JourneyLesson09.png'
import JourneyLesson11Cover from './covers/JourneyLesson11.png'
import JourneyLesson12Cover from './covers/JourneyLesson12.png'
import JourneyLesson13Cover from './covers/JourneyLesson13.png'
import JourneyLesson15Cover from './covers/JourneyLesson15.png'
import JourneyLesson16Cover from './covers/JourneyLesson16.png'
import JourneyLesson17Cover from './covers/JourneyLesson17.png'
import JourneyLesson18_1Cover from './covers/JourneyLesson18_1.png'
import JourneyLesson18_2Cover from './covers/JourneyLesson18_2.png'
import JourneyLesson19Cover from './covers/JourneyLesson19.png'
import JourneyLesson27Cover from './covers/JourneyLesson27.png'
import JourneyLesson28Cover from './covers/JourneyLesson28.png'
import JourneyLesson29Cover from './covers/JourneyLesson29.png'
import JourneyLesson30Cover from './covers/JourneyLesson30.png'

export type Sketch = {
    title: string
    route: string
    cover?: string
}

const sketches = [
    { title: 'Home', route: 'Home' },
    /* GLSL Shaders From Scratch */
    {
        title: 'Shaders From Scratch 1 - Varyings',
        route: 'GLSLShadersFromScratch01-Varyings',
        cover: GLSLShadersFromScratch01Cover,
    },
    {
        title: 'Shaders From Scratch 2 - Uniforms',
        route: 'GLSLShadersFromScratch02-Uniforms',
        cover: GLSLShadersFromScratch02Cover,
    },
    {
        title: 'Shaders From Scratch 3 - Attributes',
        route: 'GLSLShadersFromScratch03-Attributes',
        cover: GLSLShadersFromScratch03Cover,
    },
    {
        title: 'Shaders From Scratch 4 - Textures',
        route: 'GLSLShadersFromScratch04-Textures',
        cover: GLSLShadersFromScratch04Cover,
    },
    {
        title: 'Shaders From Scratch 5 - Alpha',
        route: 'GLSLShadersFromScratch05-Alpha',
        cover: GLSLShadersFromScratch05Cover,
    },
    {
        title: 'Shaders From Scratch 6 - Addressing',
        route: 'GLSLShadersFromScratch06-Addressing',
        cover: GLSLShadersFromScratch06Cover,
    },
    /* Three.js Journey */
    {
        title: 'Journey Lesson 3 - Basic',
        route: 'JourneyLesson03-Basic',
        cover: JourneyLesson03Cover,
    },
    {
        title: 'Journey Lesson 5 - Transforms',
        route: 'JourneyLesson05-Transforms',
        cover: JourneyLesson05Cover,
    },
    {
        title: 'Journey Lesson 6 - Animations',
        route: 'JourneyLesson06-Animations',
        cover: JourneyLesson06Cover,
    },
    {
        title: 'Journey Lesson 7 - Cameras',
        route: 'JourneyLesson07-Cameras',
        cover: JourneyLesson07Cover,
    },
    {
        title: 'Journey Lesson 9 - Geometries',
        route: 'JourneyLesson09-Geometries',
        cover: JourneyLesson09Cover,
    },
    {
        title: 'Journey Lesson 11 - Textures',
        route: 'JourneyLesson11-Textures',
        cover: JourneyLesson11Cover,
    },
    {
        title: 'Journey Lesson 12 - Materials',
        route: 'JourneyLesson12-Materials',
        cover: JourneyLesson12Cover,
    },
    {
        title: 'Journey Lesson 13 - Text',
        route: 'JourneyLesson13-Text',
        cover: JourneyLesson13Cover,
    },
    {
        title: 'Journey Lesson 15 - Lights',
        route: 'JourneyLesson15-Lights',
        cover: JourneyLesson15Cover,
    },
    {
        title: 'Journey Lesson 16 - Shadows',
        route: 'JourneyLesson16-Shadows',
        cover: JourneyLesson16Cover,
    },
    {
        title: 'Journey Lesson 17 - Haunted House',
        route: 'JourneyLesson17-HauntedHouse',
        cover: JourneyLesson17Cover,
    },
    {
        title: 'Journey Lesson 18.1 - Particles',
        route: 'JourneyLesson18-1-Particles',
        cover: JourneyLesson18_1Cover,
    },
    {
        title: 'Journey Lesson 18.2 - Particles',
        route: 'JourneyLesson18-2-Particles',
        cover: JourneyLesson18_2Cover,
    },
    {
        title: 'Journey Lesson 19 - Galaxy Generator',
        route: 'JourneyLesson19-GalaxyGenerator',
        cover: JourneyLesson19Cover,
    },
    {
        title: 'Journey Lesson 27 - Shaders',
        route: 'JourneyLesson27-Shaders',
        cover: JourneyLesson27Cover,
    },
    {
        title: 'Journey Lesson 28 - Raging Sea',
        route: 'JourneyLesson28-RagingSea',
        cover: JourneyLesson28Cover,
    },
    {
        title: 'Journey Lesson 29 - Animated Galaxy',
        route: 'JourneyLesson29-AnimatedGalaxy',
        cover: JourneyLesson29Cover,
    },
    {
        title: 'Journey Lesson 30 - Modified Materials',
        route: 'JourneyLesson30-ModifiedMaterials',
        cover: JourneyLesson30Cover,
    },
    {
        title: 'Rapier - Arcade Car',
        route: 'Rapier-ArcadeCar',
    },
] as const

export const sketchList: readonly Sketch[] = sketches

export const isSketchRoute = (v?: string): v is Sketch['route'] =>
    sketchList.some((s) => s.route === v)

export const sketchComponents = sketchList.reduce((o, sketch) => {
    o[sketch.route] = {
        Component: lazy(() => import(`./sketch-${sketch.route}/index.tsx`)),
    }
    return o
}, {} as Record<Sketch['route'], { Component: React.ComponentType }>)
