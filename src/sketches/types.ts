export type Sketch = {
    title: string
    route: string
    description?: string
    tags?: string[]
    cover?: string
    hidden?: boolean
}

export type SketchOptions = {
    noTitle?: boolean
    controls?: {
        expanded?: boolean
    }
}