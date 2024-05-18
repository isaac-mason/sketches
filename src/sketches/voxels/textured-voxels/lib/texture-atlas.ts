class TextureAtlasNode {
    left: TextureAtlasNode | null = null
    right: TextureAtlasNode | null = null
    filled: boolean = false
    x: number = 0
    y: number = 0
    width: number = 0
    height: number = 0
}

type TexturePosition = {
    x: number
    y: number
    width: number
    height: number
}

export class TextureAtlas {
    canvas: HTMLCanvasElement
    context: CanvasRenderingContext2D
    root: TextureAtlasNode

    constructor(initialWidth: number = 512, initialHeight: number = 512) {
        this.canvas = document.createElement('canvas')
        this.canvas.width = initialWidth
        this.canvas.height = initialHeight
        this.context = this.canvas.getContext('2d') as CanvasRenderingContext2D

        this.root = new TextureAtlasNode()
        this.root.width = initialWidth
        this.root.height = initialHeight
    }

    add(image: HTMLImageElement): TexturePosition {
        const node = this.findNode(this.root, image.width, image.height)

        if (node) {
            this.splitNode(node, image.width, image.height)
            this.context.drawImage(image, node.x, node.y)
            return { x: node.x, y: node.y, width: image.width, height: image.height }
        } else {
            this.expandCanvas(image.width, image.height)
            return this.add(image)
        }
    }

    private findNode(root: TextureAtlasNode, width: number, height: number): TextureAtlasNode | null {
        const stack = [root]

        while (stack.length > 0) {
            const node = stack.pop() as TextureAtlasNode
            if (node.left && node.right) {
                stack.push(node.left)
                stack.push(node.right)
            } else if (!node.filled && width <= node.width && height <= node.height) {
                return node
            }
        }

        return null
    }

    private splitNode(node: TextureAtlasNode, width: number, height: number) {
        node.filled = true
        node.left = new TextureAtlasNode()
        node.right = new TextureAtlasNode()

        if (node.width - width > node.height - height) {
            node.left.x = node.x + width
            node.left.y = node.y
            node.left.width = node.width - width
            node.left.height = height

            node.right.x = node.x
            node.right.y = node.y + height
            node.right.width = node.width
            node.right.height = node.height - height
        } else {
            node.left.x = node.x
            node.left.y = node.y + height
            node.left.width = width
            node.left.height = node.height - height

            node.right.x = node.x + width
            node.right.y = node.y
            node.right.width = node.width - width
            node.right.height = node.height
        }
    }

    private expandCanvas(width: number, height: number) {
        const oldRoot = this.root
        this.root = new TextureAtlasNode()
        this.root.width = Math.max(oldRoot.width, width)
        this.root.height = oldRoot.height + height
        this.root.left = oldRoot
        this.root.right = new TextureAtlasNode()
        this.root.right.y = oldRoot.height
        this.root.right.width = this.root.width
        this.root.right.height = height

        const canvasBackup = document.createElement('canvas')
        canvasBackup.width = this.canvas.width
        canvasBackup.height = this.canvas.height
        canvasBackup.getContext('2d')?.drawImage(this.canvas, 0, 0)

        this.canvas.width = this.root.width
        this.canvas.height = this.root.height
        this.context.drawImage(canvasBackup, 0, 0)
    }
}
