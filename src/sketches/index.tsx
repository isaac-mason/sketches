import { lazy } from 'react'

export const sketchList = [
    { title: 'Home', route: 'Home' },
    { title: 'Journey Lesson 3 - Basic', route: 'JourneyLesson03-Basic' },
    { title: 'Journey Lesson 5 - Transforms', route: 'JourneyLesson05-Transforms' },
    { title: 'Journey Lesson 6 - Animations', route: 'JourneyLesson06-Animations' },
    { title: 'Journey Lesson 7 - Cameras', route: 'JourneyLesson07-Cameras' },
    { title: 'Journey Lesson 9 - Geometries', route: 'JourneyLesson09-Geometries' },
    { title: 'Journey Lesson 11 - Textures', route: 'JourneyLesson11-Textures' },
] as const

export type Sketch = typeof sketchList[number]

export const isSketchRoute = (v?: string): v is Sketch['route'] => sketchList.some((s) => s.route === v)

export const sketches = sketchList.reduce((o, sketch) => {
    o[sketch.route] = {
        Component: lazy(() => import(`./sketch-${sketch.route}/index.tsx`)),
    }
    return o
}, {} as Record<Sketch['route'], { Component: React.LazyExoticComponent<React.ComponentType> }>)
