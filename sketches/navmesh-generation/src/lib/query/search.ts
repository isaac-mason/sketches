import type { Vec3 } from '@/common/maaths';
import type { PolyRef } from './nav-mesh';

export const NODE_FLAG_OPEN = 0x01;
export const NODE_FLAG_CLOSED = 0x02;

/** parent of the node is not adjacent. Found using raycast. */
export const NODE_FLAG_PARENT_DETACHED = 0x04;

/** `${poly ref}:{search node state}` */
export type SearchNodeRef = `${PolyRef}:${number}`;

export type SearchNode = {
    /** the position of the node */
    position: Vec3;
    /** the cost from the previous node to this node */
    cost: number;
    /** the cost up to this node */
    total: number;
    /** the index to the parent node */
    parent: SearchNodeRef | null;
    /** node state */
    state: number;
    /** node flags */
    flags: number;
    /** the polygon ref for this node */
    polyRef: PolyRef;
};

export type SearchNodePool = { [polyRefAndState: SearchNodeRef]: SearchNode };

export type SearchNodeQueue = SearchNode[];

export const bubbleUp = (
    queue: SearchNodeQueue,
    i: number,
    node: SearchNode,
) => {
    // note: (index > 0) means there is a parent
    let parent = Math.floor((i - 1) / 2);

    while (i > 0 && queue[parent].total > node.total) {
        queue[i] = queue[parent];
        i = parent;
        parent = Math.floor((i - 1) / 2);
    }

    queue[i] = node;
};

export const trickleDown = (
    queue: SearchNodeQueue,
    i: number,
    node: SearchNode,
) => {
    const count = queue.length;
    let child = 2 * i + 1;

    while (child < count) {
        // if there is a right child and it is smaller than the left child
        if (child + 1 < count && queue[child + 1].total < queue[child].total) {
            child++;
        }

        // if the current node is smaller than the smallest child, we are done
        if (node.total <= queue[child].total) {
            break;
        }

        // move the smallest child up
        queue[i] = queue[child];
        i = child;
        child = i * 2 + 1;
    }

    queue[i] = node;
};

export const pushNodeToQueue = (
    queue: SearchNodeQueue,
    node: SearchNode,
): void => {
    queue.push(node);
    bubbleUp(queue, queue.length - 1, node);
}

export const popNodeFromQueue = (
    queue: SearchNodeQueue,
): SearchNode | undefined => {
    if (queue.length === 0) {
        return undefined;
    }

    const node = queue[0];
    const lastNode = queue.pop();

    if (queue.length > 0 && lastNode !== undefined) {
        queue[0] = lastNode;
        trickleDown(queue, 0, lastNode);
    }

    return node;
};

export const reindexNodeInQueue = (
    queue: SearchNodeQueue,
    node: SearchNode,
): void => {
    for (let i = 0; i < queue.length; i++) {
        if (queue[i].polyRef === node.polyRef && queue[i].state === node.state) {
            queue[i] = node;
            bubbleUp(queue, i, node);
            return;
        }
    }
};