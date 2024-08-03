import { useThree } from '@react-three/fiber'
import * as d3 from 'd3'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Line2, LineGeometry, LineMaterial } from 'three/examples/jsm/Addons.js'

const vec = new THREE.Vector3()

export type NetworkNode = {
    id: string
    group: THREE.Group
} & d3.SimulationNodeDatum

export type NetworkLink = d3.SimulationLinkDatum<NetworkNode>

export type NetworkContextType = {
    addNode: (node: NetworkNode) => void
    removeNode: (node: NetworkNode) => void
    addLink: (link: NetworkLink) => void
    removeLink: (link: NetworkLink) => void
}

const networkContext = createContext<NetworkContextType>(null!)

export const useNetwork = () => {
    return useContext(networkContext)
}

type DedupedLink = {
    source: NetworkNode
    target: NetworkNode
    n: number
}

export type NetworkProps = {
    children?: React.ReactNode
} & JSX.IntrinsicElements['group']

export const Network = ({ children, ...groupProps }: NetworkProps) => {
    const scene = useThree((state) => state.scene)
    const viewport = useThree((state) => state.viewport)

    const simulation = useMemo(() => {
        const s = d3
            .forceSimulation()
            .force(
                'link',
                d3
                    .forceLink()
                    .id((d) => (d as NetworkNode).id)
                    .strength((d) => (d as DedupedLink).n),
            )
            .force('charge', d3.forceManyBody().strength(-10000))
            .force('collide', d3.forceManyBody())
            .force('center', d3.forceCenter(viewport.width / 2, viewport.height / 2))

        return s
    }, [viewport.width, viewport.height])

    const [nodes, setNodes] = useState<NetworkNode[]>([])
    const [links, setLinks] = useState<NetworkLink[]>([])

    const lineMeshes = useMemo<Map<string, Line2>>(() => new Map(), [])

    const dedupedLinks = useMemo(() => {
        const linkMap = new Map<string, DedupedLink>()

        links.forEach((link) => {
            const key = `${link.source}-${link.target}`

            if (!linkMap.has(key)) {
                const source = nodes.find((n) => n.id === link.source)
                const target = nodes.find((n) => n.id === link.target)

                if (source && target) {
                    linkMap.set(key, {
                        n: 1,
                        source,
                        target,
                    })
                }
            } else {
                linkMap.get(key)!.n++
            }
        })

        return Array.from(linkMap.values())
    }, [nodes, links])

    useEffect(() => {
        const unseenLineMeshes = new Set(lineMeshes.keys())

        dedupedLinks.forEach((link) => {
            const key = `${link.source.id}-${link.target.id}`

            if (lineMeshes.has(key)) {
                unseenLineMeshes.delete(key)
            } else {
                const geometry = new LineGeometry()

                const material = new LineMaterial({
                    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
                    linewidth: 0.1,
                    worldUnits: true,
                    color: '#fff',
                })

                const line = new Line2(geometry, material)

                scene.add(line)
                lineMeshes.set(key, line)
            }
        })

        for (const key of unseenLineMeshes) {
            const line = lineMeshes.get(key)

            if (line) {
                scene.remove(line)
                lineMeshes.delete(key)
            }
        }
    }, [dedupedLinks])

    useEffect(() => {
        simulation.nodes(nodes.map((node) => node))

        simulation.force<d3.ForceLink<NetworkNode, DedupedLink>>('link')!.links(dedupedLinks)

        simulation.tick(100)

        simulation.on('tick', () => {
            nodes.forEach((node) => {
                vec.set(node.x! / viewport.factor, node.y! / viewport.factor, 0)
                node.group.position.lerp(vec, 0.1)
            })

            dedupedLinks.forEach((link) => {
                const key = `${link.source.id}-${link.target.id}`
                const line = lineMeshes.get(key)!

                const geometry = line.geometry

                const points = [
                    link.source.group.position.x,
                    link.source.group.position.y,
                    0,
                    link.target.group.position.x,
                    link.target.group.position.y,
                    0,
                ]

                geometry.setPositions(points)
            })
        })

        return () => {
            simulation.on('tick', null)
        }
    }, [nodes, dedupedLinks, simulation])

    const addNode = (node: NetworkNode) => {
        setNodes((nodes) => [...nodes, node])
    }

    const removeNode = (node: NetworkNode) => {
        setNodes((nodes) => nodes.filter((n) => n !== node))
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
    children?: React.ReactNode
}

export const Node = ({ children, id }: NodeProps) => {
    const network = useNetwork()

    const group = useRef<THREE.Group>(null!)

    useEffect(() => {
        const node: NetworkNode = { id, group: group.current }

        network.addNode(node)

        return () => {
            network.removeNode(node)
        }
    }, [id])

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
