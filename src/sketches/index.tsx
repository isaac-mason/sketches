import { lazy } from 'react'

export const sketchList = [
    'Home',
    'JourneyLesson03',
] as const

export type Sketch = typeof sketchList[number]

export const isSketch = (v: unknown): v is Sketch => sketchList.includes(v as Sketch)

export const sketches = sketchList.reduce((o, sketch) => {
    o[sketch] = {
        Component: lazy(() => import(`./sketch-${sketch}.tsx`)),
    }
    return o
}, {} as Record<Sketch, { Component: React.LazyExoticComponent<React.ComponentType> }>)
