import { useEffect, useRef } from 'react'
import styled from 'styled-components'
import { create } from 'zustand'

type Vec2 = [number, number]
type Particle = { x: number; y: number; element: number }

const Element = {
    air: 0,
    sand: 1,
    stone: 2,
    water: 3,
    wall: 4,
}

const ElementDetails: {
    [key: number]: {
        name: string
        color: string
        density?: number
        directions?: Array<Vec2>
    }
} = {
    [Element.air]: {
        name: 'air',
        color: 'white',
        density: 0,
    },
    [Element.sand]: {
        name: 'sand',
        color: '#FFD700',
        density: 2,
        directions: [
            [0, -1],
            [-1, -1],
            [1, -1],
        ],
    },
    [Element.stone]: {
        name: 'stone',
        color: '#A9A9A9',
        density: 3,
        directions: [[0, -1]],
    },
    [Element.water]: {
        name: 'water',
        color: '#9999ff',
        density: 1,
        directions: [
            [0, -1],
            [-1, 0],
            [1, 0],
        ],
    },
    [Element.wall]: {
        name: 'wall',
        color: '#808080',
    },
}

const width = 150
const height = 150

const useFallingSand = create<{
    particles: Set<Particle>
    map: Array<null | Particle>
    selectedElement: number
    paused: boolean
    togglePause: () => void
    reset: () => void
}>((_, get) => ({
    particles: new Set(),
    map: new Array(width * height).fill(null),
    selectedElement: Element.sand,
    paused: false,
    togglePause: () => {
        useFallingSand.setState({ paused: !get().paused })
    },
    reset: () => {
        const { particles, map } = get()
        particles.clear()
        map.fill(null)
    },
}))

export default function Sketch() {
    const canvasRef = useRef<HTMLCanvasElement>(null!)

    const { selectedElement, paused, togglePause, reset } = useFallingSand()

    useEffect(() => {
        // space to toggle pause
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === ' ') {
                togglePause()
            }
        }

        window.addEventListener('keydown', onKeyDown)

        return () => {
            window.removeEventListener('keydown', onKeyDown)
        }
    }, [])

    useEffect(() => {
        const canvas = canvasRef.current
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')!
        ctx.imageSmoothingEnabled = false

        const { map, particles } = useFallingSand.getState()

        const get = (x: number, y: number) => {
            return map[y * width + x]
        }

        const set = (x: number, y: number, element: number) => {
            const current = get(x, y)

            if (current) {
                particles.delete(current)
            }

            if (element === Element.air) {
                map[y * width + x] = null
                return
            }

            const particle = { x, y, element }

            particles.add(particle)
            map[y * width + x] = particle
        }

        const swap = (x1: number, y1: number, x2: number, y2: number) => {
            const p1 = get(x1, y1)
            const p2 = get(x2, y2)

            if (!p1 && !p2) return

            if (p1) {
                p1.x = x2
                p1.y = y2
            }

            if (p2) {
                p2.x = x1
                p2.y = y1
            }

            map[y1 * width + x1] = p2 ?? null
            map[y2 * width + x2] = p1 ?? null
        }

        const render = () => {
            // resize
            const { clientWidth, clientHeight } = canvas.parentElement as HTMLElement
            const size = Math.min(clientWidth, clientHeight) - 120
            canvas.style.width = `${size}px`
            canvas.style.height = `${size}px`

            // clear
            ctx.fillStyle = 'white'
            ctx.fillRect(0, 0, width, height)

            // render particles
            for (const particle of particles.values()) {
                const { x, y, element: type } = particle

                const canvasX = x
                const canvasY = height - y

                ctx.fillStyle = ElementDetails[type].color

                ctx.fillRect(canvasX, canvasY, 1, 1)
            }
        }

        let pointerDown = false
        const pointerPosition = { x: 0, y: 0 }

        const updatePointerPosition = (e: PointerEvent) => {
            const x = Math.floor((e.offsetX / canvas.clientWidth) * width)
            const y = Math.floor((e.offsetY / canvas.clientHeight) * height)

            pointerPosition.x = x
            pointerPosition.y = y
        }

        canvas.addEventListener('pointerdown', (e) => {
            pointerDown = true
            updatePointerPosition(e)
        })

        canvas.addEventListener('pointermove', (e) => {
            updatePointerPosition(e)
        })

        canvas.addEventListener('pointerup', () => {
            pointerDown = false
        })

        const validPosition = (x: number, y: number) => {
            if (x < 0 || x >= width || y < 0 || y >= height) return false

            return true
        }

        const update = () => {
            // draw
            if (pointerDown) {
                const selectedType = useFallingSand.getState().selectedElement

                const x = pointerPosition.x
                const y = height - pointerPosition.y

                const brush = 2

                for (let i = -brush; i <= brush; i++) {
                    for (let j = -brush; j <= brush; j++) {
                        const nx = x + i
                        const ny = y + j

                        set(nx, ny, selectedType)
                    }
                }
            }

            // only update if not paused
            if (useFallingSand.getState().paused) return

            // update particles
            const shuffledParticles = Array.from(particles.values())
                .map((particle) => [particle, Math.random() - 0.5] as [Particle, number])
                .sort((a, b) => a[1] - b[1])
                .map(([particle]) => particle)

            for (const particle of shuffledParticles) {
                const { x, y, element: type } = particle

                const details = ElementDetails[type]

                if (!details.directions) continue

                for (const direction of details.directions) {
                    const nx = x + direction[0]
                    const ny = y + direction[1]

                    if (!validPosition(nx, ny)) continue

                    if (!get(nx, ny)) {
                        if (Math.abs(direction[0]) > 0 && Math.abs(direction[1]) > 0) {
                            if (!get(nx, y) && !get(x, ny)) {
                                continue
                            }
                        }

                        swap(x, y, nx, ny)

                        break
                    } else if (details.density) {
                        /* particle should sink through less dense types */

                        // check if particle at desired position is less dense
                        const particleBelow = get(nx, ny)
                        if (
                            !particleBelow ||
                            !ElementDetails[particleBelow.element].density ||
                            ElementDetails[particleBelow.element].density! >= details.density
                        ) {
                            continue
                        }

                        // switch places with particle below
                        swap(x, y, nx, ny)

                        // prevent rising columns
                        for (let i = 0; i < 3; i++) {
                            const directions = ElementDetails[particleBelow.element].directions

                            if (!directions) continue

                            for (const direction of directions) {
                                const sx = nx + direction[0]
                                const sy = ny + direction[1]

                                if (!validPosition(sx, sy)) continue

                                if (get(sx, sy)) continue

                                swap(x, y, sx, sy)
                            }
                        }

                        break
                    }
                }
            }
        }

        let stop = false
        let animationFrameId: number

        const loop = () => {
            if (stop) return

            update()
            render()
            animationFrameId = requestAnimationFrame(loop)
        }

        loop()

        return () => {
            ctx.clearRect(0, 0, width, height)

            stop = true
            cancelAnimationFrame(animationFrameId)
        }
    }, [])

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                }}
            >
                {Object.entries(ElementDetails).map(([type, { name, color }]) => (
                    <ElementSelector
                        key={type}
                        className={selectedElement === Number(type) ? 'selected' : ''}
                        style={{
                            backgroundColor: color,
                        }}
                        onClick={() => {
                            useFallingSand.setState({ selectedElement: Number(type) })
                        }}
                    >
                        {name}
                    </ElementSelector>
                ))}

                <Button
                    onClick={reset}
                    style={{
                        width: '100%',
                        marginTop: '1em',
                    }}
                >
                    Reset
                </Button>

                <Button
                    onClick={togglePause}
                    style={{
                        width: '100%',
                        marginTop: '1em',
                    }}
                >
                    {paused ? 'Play' : 'Pause'}
                </Button>
            </div>

            <canvas
                ref={canvasRef}
                style={{
                    imageRendering: 'pixelated',
                }}
            ></canvas>
        </div>
    )
}

const ElementSelector = styled.div`
    width: 80px;
    height: 80px;
    padding: 5px;
    font-weight: 800;
    font-family: monospace;

    border: 3px solid transparent;

    &.selected {
        border: 3px solid #000;
    }
`

const Button = styled.button`
    padding: 1em;
    border: none;
    font-weight: 600;
    font-family: monospace;
`
