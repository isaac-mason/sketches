export type PLY = {
    vertices: number[]; // flat array: [x, y, z, x, y, z, ...]
    colors: number[];   // flat array: [r, g, b, r, g, b, ...] normalized 0-1
};

type PropertyType = 'int8' | 'uint8' | 'char' | 'uchar' | 'int16' | 'uint16' | 'short' | 'ushort' | 'int32' | 'uint32' | 'int' | 'uint' | 'float32' | 'float' | 'float64' | 'double';

type Property = {
    name: string;
    type: PropertyType;
    size: number;
    read: (view: DataView, offset: number, littleEndian: boolean) => number;
};

type VertexElement = {
    name: 'vertex';
    count: number;
    properties: Property[];
    xIndex: number;
    yIndex: number;
    zIndex: number;
    rIndex: number;
    gIndex: number;
    bIndex: number;
    stride: number; // bytes per vertex
};

const createPropertyReader = (type: PropertyType): { size: number; read: (view: DataView, offset: number, le: boolean) => number } => {
    switch (type) {
        case 'int8':
        case 'char':
            return { size: 1, read: (v, o) => v.getInt8(o) };
        case 'uint8':
        case 'uchar':
            return { size: 1, read: (v, o) => v.getUint8(o) };
        case 'int16':
        case 'short':
            return { size: 2, read: (v, o, le) => v.getInt16(o, le) };
        case 'uint16':
        case 'ushort':
            return { size: 2, read: (v, o, le) => v.getUint16(o, le) };
        case 'int32':
        case 'int':
            return { size: 4, read: (v, o, le) => v.getInt32(o, le) };
        case 'uint32':
        case 'uint':
            return { size: 4, read: (v, o, le) => v.getUint32(o, le) };
        case 'float32':
        case 'float':
            return { size: 4, read: (v, o, le) => v.getFloat32(o, le) };
        case 'float64':
        case 'double':
            return { size: 8, read: (v, o, le) => v.getFloat64(o, le) };
        default:
            throw new Error(`Unsupported property type: ${type}`);
    }
};

const findHeaderEnd = (bytes: Uint8Array): number => {
    let i = 0;
    let line = '';

    while (i < bytes.length) {
        const c = String.fromCharCode(bytes[i++]);

        if (c === '\n' || c === '\r') {
            if (line === 'end_header') {
                // handle \r\n
                if (c === '\r' && i < bytes.length && bytes[i] === 10) {
                    i++;
                }
                return i;
            }
            line = '';
        } else {
            line += c;
        }
    }

    throw new Error('PLY header end not found');
};

const parseHeader = (headerText: string): { littleEndian: boolean; vertexElement: VertexElement | null } => {
    const lines = headerText.split(/\r?\n/);

    let littleEndian = true;
    let vertexElement: VertexElement | null = null;
    let currentElement: { name: string; count: number; properties: string[][] } | null = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'ply' || trimmed === 'end_header') continue;

        const tokens = trimmed.split(/\s+/);
        const keyword = tokens[0];

        switch (keyword) {
            case 'format': {
                const format = tokens[1];
                if (format === 'ascii') {
                    throw new Error('ASCII PLY format not supported');
                }
                littleEndian = format === 'binary_little_endian';
                break;
            }

            case 'element': {
                // save previous element if it was vertex
                if (currentElement && currentElement.name === 'vertex') {
                    vertexElement = buildVertexElement(currentElement);
                }

                currentElement = {
                    name: tokens[1],
                    count: Number.parseInt(tokens[2], 10),
                    properties: []
                };
                break;
            }

            case 'property': {
                if (currentElement) {
                    // skip list properties
                    if (tokens[1] === 'list') continue;

                    currentElement.properties.push(tokens.slice(1));
                }
                break;
            }
        }
    }

    // save last element if it was vertex
    if (currentElement && currentElement.name === 'vertex') {
        vertexElement = buildVertexElement(currentElement);
    }

    return { littleEndian, vertexElement };
};

const buildVertexElement = (elem: { name: string; count: number; properties: string[][] }): VertexElement => {
    const properties: Property[] = [];
    let xIndex = -1;
    let yIndex = -1;
    let zIndex = -1;
    let rIndex = -1;
    let gIndex = -1;
    let bIndex = -1;
    let stride = 0;

    for (const propTokens of elem.properties) {
        const type = propTokens[0] as PropertyType;
        const name = propTokens[1];
        const reader = createPropertyReader(type);

        const prop: Property = {
            name,
            type,
            size: reader.size,
            read: reader.read
        };

        properties.push(prop);
        const propIndex = properties.length - 1;

        // map position attributes
        if (name === 'x' || name === 'px' || name === 'posx') xIndex = propIndex;
        else if (name === 'y' || name === 'py' || name === 'posy') yIndex = propIndex;
        else if (name === 'z' || name === 'pz' || name === 'posz') zIndex = propIndex;
        // map color attributes
        else if (name === 'red' || name === 'r' || name === 'diffuse_red' || name === 'diffuse_r') rIndex = propIndex;
        else if (name === 'green' || name === 'g' || name === 'diffuse_green' || name === 'diffuse_g') gIndex = propIndex;
        else if (name === 'blue' || name === 'b' || name === 'diffuse_blue' || name === 'diffuse_b') bIndex = propIndex;

        stride += reader.size;
    }

    if (xIndex === -1 || yIndex === -1 || zIndex === -1) {
        throw new Error('PLY vertex element missing x, y, or z property');
    }

    return {
        name: 'vertex',
        count: elem.count,
        properties,
        xIndex,
        yIndex,
        zIndex,
        rIndex,
        gIndex,
        bIndex,
        stride
    };
};

const parseVertices = (
    view: DataView,
    offset: number,
    element: VertexElement,
    littleEndian: boolean
): { vertices: number[]; colors: number[] } => {
    const vertexCount = element.count;
    const vertices = new Array(vertexCount * 3);
    const colors = new Array(vertexCount * 3);

    const hasColor = element.rIndex !== -1 && element.gIndex !== -1 && element.bIndex !== -1;

    let byteOffset = offset;
    let vertexIdx = 0;
    let colorIdx = 0;

    // precompute property offsets for faster access
    const propOffsets = new Array(element.properties.length);
    let currentOffset = 0;
    for (let i = 0; i < element.properties.length; i++) {
        propOffsets[i] = currentOffset;
        currentOffset += element.properties[i].size;
    }

    for (let i = 0; i < vertexCount; i++) {
        const rowStart = byteOffset;

        // read position
        vertices[vertexIdx++] = element.properties[element.xIndex].read(view, rowStart + propOffsets[element.xIndex], littleEndian);
        vertices[vertexIdx++] = element.properties[element.yIndex].read(view, rowStart + propOffsets[element.yIndex], littleEndian);
        vertices[vertexIdx++] = element.properties[element.zIndex].read(view, rowStart + propOffsets[element.zIndex], littleEndian);

        // read color (normalize to 0-1 range)
        if (hasColor) {
            colors[colorIdx++] = element.properties[element.rIndex].read(view, rowStart + propOffsets[element.rIndex], littleEndian) / 255;
            colors[colorIdx++] = element.properties[element.gIndex].read(view, rowStart + propOffsets[element.gIndex], littleEndian) / 255;
            colors[colorIdx++] = element.properties[element.bIndex].read(view, rowStart + propOffsets[element.bIndex], littleEndian) / 255;
        } else {
            // default white
            colors[colorIdx++] = 1;
            colors[colorIdx++] = 1;
            colors[colorIdx++] = 1;
        }

        byteOffset += element.stride;
    }

    return { vertices, colors };
};

export const parsePLY = (data: ArrayBuffer): PLY => {
    const bytes = new Uint8Array(data);

    // find header end
    const headerLength = findHeaderEnd(bytes);

    // extract and parse header
    const headerBytes = bytes.subarray(0, headerLength);
    const headerText = new TextDecoder().decode(headerBytes);
    const { littleEndian, vertexElement } = parseHeader(headerText);

    if (!vertexElement) {
        throw new Error('PLY file does not contain a vertex element');
    }

    // parse vertex data
    const view = new DataView(data, headerLength);
    const { vertices, colors } = parseVertices(view, 0, vertexElement, littleEndian);

    return { vertices, colors };
};
