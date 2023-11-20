export type Vec2 = {
    x: number
    y: number
}

export const vec2 = {
    add: (a: Vec2, b: Vec2) => ({ x: a.x + b.x, y: a.y + b.y }),
    equals: (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y,
    hash: ({ x, y }: Vec2) => `${x},${y}`,
}
