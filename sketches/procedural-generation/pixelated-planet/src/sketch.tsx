import { WebGPUCanvas } from '@sketches/common';
import { Html, OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { button, useControls } from 'leva';
import { useEffect, useMemo, useState } from 'react';
import { createNoise3D } from 'simplex-noise';
import * as THREE from 'three';
import { pixelationPass } from 'three/examples/jsm/tsl/display/PixelationPassNode.js';
import { mrt, output, pass, uniform } from 'three/tsl';
import { RenderPipeline, type WebGPURenderer } from 'three/webgpu';

type PlanetLayer = {
    /**
     * The name of the layer.
     */
    name: string;

    /**
     * The maximum value of the simplex noise function that this layer should be applied to.
     * Between -1 and 1.
     */
    max: number;

    /**
     * The color of the layer.
     */
    color: THREE.ColorRepresentation;
};

type GeneratePlanetTextureProps = {
    layers: PlanetLayer[];
    noise3d: (x: number, y: number, z: number) => number;
    noiseIterations: number;
    width: number;
    height: number;
    radius: number;
};

const generatePlanetTexture = ({
    layers,
    noise3d,
    noiseIterations,
    width,
    height,
    radius,
}: GeneratePlanetTextureProps): THREE.Texture => {
    const size = width * height;
    const data = new Uint8Array(size * 4);

    const color = new THREE.Color();

    for (let i = 0; i < size; i++) {
        const stride = i * 4;

        // convert index to map x and y
        const textureX = i % width;
        const textureY = Math.floor(i / width);

        // convert x and y to latitude and longitude
        const lat = (textureY / height) * Math.PI - Math.PI / 2; // Latitude ranges from -π/2 to π/2
        const lon = (textureX / width) * 2 * Math.PI - Math.PI; // Longitude ranges from -π to π

        // convert long and lat to 3D cartesian coordinates
        const x = radius * Math.cos(lat) * Math.cos(lon);
        const y = radius * Math.sin(lat);
        const z = radius * Math.cos(lat) * Math.sin(lon);

        // sample 3d noise
        let noise = noise3d(x, y, z);
        for (let iter = 1; iter < noiseIterations; iter++) {
            noise += noise3d(x * iter * 2, y * iter * 2, z * iter * 2) / (iter * 2);
        }

        // clamp noise to -1 to 1
        noise = Math.min(Math.max(noise, -1), 1);

        // find layer
        const layer = layers.find((layer) => noise <= layer.max);

        // set color
        color.set(layer?.color ?? '#000000');

        data[stride] = color.r * 255;
        data[stride + 1] = color.g * 255;
        data[stride + 2] = color.b * 255;
        data[stride + 3] = 255;
    }

    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    texture.needsUpdate = true;

    return texture;
};

type PlanetProps = {
    map: THREE.Texture;
    radius: number;
};

const Planet = ({ map, radius }: PlanetProps) => {
    return (
        <mesh>
            <sphereGeometry args={[radius]} />
            <meshStandardMaterial map={map} />
        </mesh>
    );
};

type WorldMapProps = {
    map: THREE.Texture;
};

const WorldMap = ({ map }: WorldMapProps) => {
    const dataUrl = useMemo(() => {
        const canvas = document.createElement('canvas');
        const image = map.image as HTMLImageElement;
        canvas.width = image.width;
        canvas.height = image.height;

        const renderer = new THREE.WebGLRenderer({ canvas: canvas });
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(
            canvas.width / -2,
            canvas.width / 2,
            canvas.height / 2,
            canvas.height / -2,
            0,
            1000,
        );
        camera.position.z = 1;
        camera.lookAt(scene.position);

        const plane = new THREE.PlaneGeometry(canvas.width, canvas.height);
        const material = new THREE.MeshBasicMaterial({ map });
        const mesh = new THREE.Mesh(plane, material);

        scene.add(mesh);

        renderer.render(scene, camera);

        const url = canvas.toDataURL();

        renderer.forceContextLoss();
        renderer.dispose();
        canvas.remove();

        return url;
    }, [map]);

    return (
        <Html fullscreen>
            <img
                alt=""
                src={dataUrl}
                style={{
                    position: 'absolute',
                    bottom: 0,
                    width: '300px',
                    height: '200px',
                    objectFit: 'contain',
                    left: 'calc(50% - 150px)',
                    margin: '1em 0',
                }}
            />
        </Html>
    );
};

const Renderer = () => {
    const { gl, scene, camera } = useThree();

    const [renderPipeline, setRenderPipeline] = useState<RenderPipeline | null>(null);

    useEffect(() => {
        const scenePass = pass(scene, camera, {
            magFilter: THREE.NearestFilter,
            minFilter: THREE.NearestFilter,
        });

        scenePass.setMRT(mrt({ output }));

        const pixelSize = uniform(20);
        const normalEdgeStrength = uniform(0.1);
        const depthEdgeStrength = uniform(0.1);
        const pixelation = pixelationPass(scene, camera, pixelSize, normalEdgeStrength, depthEdgeStrength);

        const outputNode = pixelation;

        const renderPipeline = new RenderPipeline(gl as unknown as WebGPURenderer);
        renderPipeline.outputNode = outputNode;

        setRenderPipeline(renderPipeline);

        return () => {
            setRenderPipeline(null);
        };
    }, [gl, scene, camera]);

    useFrame(() => {
        if (!renderPipeline) return;

        gl.clear();
        renderPipeline.render();
    }, 1);

    return null;
};

export function Sketch() {
    const [version, setVersion] = useState(0);

    const { planetRadius, noiseIterations, textureWidth, textureHeight } = useControls(
        'procgen-pixelated-planet-generation-config',
        {
            planetRadius: {
                value: 1,
                min: 0.1,
                max: 3,
            },
            noiseIterations: {
                value: 4,
                step: 1,
                min: 1,
                max: 10,
            },
            textureWidth: 300,
            textureHeight: 100,
            Regenerate: button(() => {
                setVersion((v) => v + 1);
            }),
        },
    );

    const map = useMemo(() => {
        const layers: PlanetLayer[] = [
            {
                name: 'ocean',
                max: 0,
                color: '#0000ff',
            },
            {
                name: 'shallow ocean',
                max: 0.15,
                color: '#6699ff',
            },
            {
                name: 'beach',
                max: 0.17,
                color: '#ffffee',
            },
            {
                name: 'landmass',
                max: 0.8,
                color: '#66ff66',
            },
            {
                name: 'mountains',
                max: 0.88,
                color: '#f3f3f3',
            },
            {
                name: 'snow',
                max: 1,
                color: '#ffffff',
            },
        ];

        return generatePlanetTexture({
            noise3d: createNoise3D(Math.random),
            noiseIterations,
            layers,
            width: textureWidth,
            height: textureHeight,
            radius: planetRadius,
        });
    }, [noiseIterations, planetRadius, textureWidth, textureHeight, version]);

    return (
        <WebGPUCanvas orthographic camera={{ position: [0, 0, 10], zoom: 200 }}>
            <Planet map={map} radius={planetRadius} />

            <directionalLight position={[10, 0, 10]} intensity={2} />
            <ambientLight intensity={0.6} />

            <WorldMap map={map} />

            <Renderer />

            <OrbitControls enablePan={false} />
        </WebGPUCanvas>
    );
}
