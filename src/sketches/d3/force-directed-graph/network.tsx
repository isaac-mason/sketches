import { useThree } from '@react-three/fiber'
import * as d3 from 'd3'
import { MeshLineGeometry, MeshLineMaterial } from 'meshline'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Group, Mesh, Vector2, Vector3 } from 'three'

const vec = new Vector3()

export type NetworkNode = {
    id: string
} & d3.SimulationNodeDatum

export type NetworkLink = d3.SimulationLinkDatum<NetworkNode>

export type DedupedLink = {
    source: NetworkNode
    target: NetworkNode
    n: number
}

type NetworkContextType = {
    addNode: (node: NetworkNode, group: Group) => void
    addLink: (link: NetworkLink) => void
    removeNode: (node: NetworkNode) => void
    removeLink: (link: NetworkLink) => void
}

const networkContext = createContext<NetworkContextType>(null!)

export const useNetwork = () => {
    return useContext(networkContext)
}

export type NetworkProps = {
    children?: React.ReactNode
} & JSX.IntrinsicElements['group']

export const Network = ({ children, ...groupProps }: NetworkProps) => {
    const scene = useThree((state) => state.scene)
    const viewport = useThree((state) => state.viewport)

    const [nodes, setNodes] = useState<{ node: NetworkNode; group: Group }[]>([])
    const [links, setLinks] = useState<NetworkLink[]>([])
    const [lines] = useState<Map<string, Mesh>>(() => new Map())

    const validDedupedLinks = useMemo(() => {
        const linkMap = new Map<string, DedupedLink>()

        links.forEach((link) => {
            const key = `${link.source}-${link.target}`

            if (!linkMap.has(key)) {
                const source = nodes.find((n) => n.node.id === link.source)
                const target = nodes.find((n) => n.node.id === link.target)

                if (source && target) {
                    linkMap.set(key, {
                        n: 1,
                        source: source!.node,
                        target: target!.node,
                    })
                }
            } else {
                linkMap.get(key)!.n++
            }
        })

        return Array.from(linkMap.values())
    }, [nodes, links])

    useEffect(() => {
        const unseen = new Set(lines.keys())

        validDedupedLinks.forEach((link) => {
            const key = `${link.source.id}-${link.target.id}`

            if (lines.has(key)) {
                unseen.delete(key)
            } else {
                const geometry = new MeshLineGeometry()

                const material = new MeshLineMaterial({
                    resolution: new Vector2(10, 10),
                    lineWidth: 0.1,
                    color: '#fff',
                })

                const mesh = new Mesh(geometry, material)

                scene.add(mesh)
                lines.set(key, mesh)
            }
        })

        for (const key of unseen) {
            const line = lines.get(key)

            if (line) {
                scene.remove(line)
                lines.delete(key)
            }
        }
    }, [validDedupedLinks])

    const simulation = useMemo(() => {
        const s = d3
            .forceSimulation()
            .force(
                'link',
                d3
                    .forceLink()
                    .id((d) => (d as unknown as { id: string }).id)
                    .strength((d) => (d as DedupedLink).n),
            )
            .force('charge', d3.forceManyBody().strength(-20000))
            .force('collide', d3.forceManyBody())
            .force('center', d3.forceCenter(viewport.width / 2, viewport.height / 2))

        return s
    }, [viewport.width, viewport.height])

    useEffect(() => {
        const update = () => {
            nodes.forEach(({ node, group }) => {
                vec.set(node.x! / viewport.factor, node.y! / viewport.factor, 0)
                group.position.lerp(vec, 0.1)
            })

            validDedupedLinks.forEach((link) => {
                const key = `${link.source.id}-${link.target.id}`
                const line = lines.get(key)
                if (line) {
                    const geometry = line.geometry as MeshLineGeometry

                    const points = [
                        (link.source.x ?? 0) / viewport.factor,
                        (link.source.y ?? 0) / viewport.factor,
                        0,
                        (link.target.x ?? 0) / viewport.factor,
                        (link.target.y ?? 0) / viewport.factor,
                        0,
                    ]
                    geometry.setPoints(points)
                }
            })
        }

        simulation.tick(100)

        simulation.on('tick', update)

        return () => {
            simulation.on('tick', null)
        }
    }, [nodes, validDedupedLinks])

    useEffect(() => {
        simulation.nodes(nodes.map(({ node }) => node))

        simulation.force<d3.ForceLink<NetworkNode, DedupedLink>>('link')!.links(validDedupedLinks)
    }, [nodes, links, viewport.factor])

    const addNode = (node: NetworkNode, group: Group) => {
        setNodes((nodes) => [...nodes, { node, group }])
    }

    const removeNode = (node: NetworkNode) => {
        setNodes((nodes) => nodes.filter((n) => n.node !== node))
    }

    const addLink = (link: NetworkLink) => {
        setLinks((links) => [...links, link])
    }

    const removeLink = (link: NetworkLink) => {
        setLinks((links) => links.filter((l) => l !== link))
    }

    return (
        <networkContext.Provider value={{ addNode, removeNode, addLink, removeLink }}>
            <group {...groupProps}>{children}</group>
        </networkContext.Provider>
    )
}

export type NodeProps = {
    id: string
    fixedPosition?: [number, number]
    children?: React.ReactNode
}

export const Node = ({ children, id, fixedPosition }: NodeProps) => {
    const viewport = useThree((state) => state.viewport)
    const network = useNetwork()

    const group = useRef<THREE.Group>(null!)

    useEffect(() => {
        const [fx, fy] = fixedPosition
            ? [fixedPosition[0] * viewport.factor, fixedPosition[1] * viewport.factor]
            : [undefined, undefined]

        const node: NetworkNode = { id, fx, fy }

        network.addNode(node, group.current)

        return () => {
            network.removeNode(node)
        }
    }, [id, fixedPosition && fixedPosition.join(',')])

    return <group ref={group}>{children}</group>
}

export type LinkProps = {
    source: string
    target: string
}

export const Link = ({ source, target }: LinkProps) => {
    const network = useNetwork()

    useEffect(() => {
        const link = { source, target }

        network.addLink(link)

        return () => {
            network.removeLink(link)
        }
    }, [source, target])

    return null
}
