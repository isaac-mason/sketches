import { lazy } from 'react'

export const sketchList = [
    { title: 'Home', route: 'Home' },
    { title: 'Journey Lesson 3 - Basic', route: 'JourneyLesson03-Basic' },
    { title: 'Journey Lesson 5 - Transforms', route: 'JourneyLesson05-Transforms' },
    { title: 'Journey Lesson 6 - Animations', route: 'JourneyLesson06-Animations' },
    { title: 'Journey Lesson 7 - Cameras', route: 'JourneyLesson07-Cameras' },
    { title: 'Journey Lesson 9 - Geometries', route: 'JourneyLesson09-Geometries' },
    { title: 'Journey Lesson 11 - Textures', route: 'JourneyLesson11-Textures' },
    { title: 'Journey Lesson 12 - Materials', route: 'JourneyLesson12-Materials' },
    { title: 'Journey Lesson 13 - Text', route: 'JourneyLesson13-Text' },
    { title: 'Journey Lesson 15 - Lights', route: 'JourneyLesson15-Lights' },
    { title: 'Journey Lesson 16 - Shadows', route: 'JourneyLesson16-Shadows' },
    { title: 'Journey Lesson 17 - Haunted House', route: 'JourneyLesson17-HauntedHouse' },
    { title: 'Journey Lesson 18.1 - Particles', route: 'JourneyLesson18-1-Particles' },
    { title: 'Journey Lesson 18.2 - Particles', route: 'JourneyLesson18-2-Particles' },
    { title: 'Journey Lesson 19 - Galaxy Generator', route: 'JourneyLesson19-GalaxyGenerator' },
] as const

export type Sketch = typeof sketchList[number]

export const isSketchRoute = (v?: string): v is Sketch['route'] => sketchList.some((s) => s.route === v)

export const sketches = sketchList.reduce((o, sketch) => {
    o[sketch.route] = {
        Component: lazy(() => import(`./sketch-${sketch.route}/index.tsx`)),
    }
    return o
}, {} as Record<Sketch['route'], { Component: React.LazyExoticComponent<React.ComponentType> }>)
