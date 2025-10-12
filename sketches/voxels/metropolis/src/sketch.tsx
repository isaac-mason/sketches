import { WebGPUCanvas } from '@sketches/common';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import {
	type Block,
	MIN_BLOCK_TEXTURE_SIZE,
	Voxels,
} from '@sketches/simple-voxels-lib';
import { useEffect, useState } from 'react';
import { suspend } from 'suspend-react';
import * as THREE from 'three';
import metropolisMapUrl from './metropolis.txt?url';

const ACTOR = new THREE.Vector3(0, 0, 0);

const GameWorld = () => {
	const scene = useThree((state) => state.scene);

	const mapText = suspend(async () => {
		const response = await fetch(metropolisMapUrl);
		const text = await response.text();

		return text;
	}, []);

	const [voxels, setVoxels] = useState<Voxels | null>(null);

	useEffect(() => {
		// init voxel world
		const voxels = new Voxels(scene, MIN_BLOCK_TEXTURE_SIZE);

		// color block types will be registered as the level is loaded
		const colorBlocks: Record<string, Block> = {};

		const cursor = new THREE.Vector3();

		const lines = mapText.split('\n');

		for (let i = 0; i < lines.length; i++) {
			const entry = lines[i];

			if (entry === undefined || entry.trim() === '' || entry[0] === '#')
				continue;

			const [x, z, y, colorHex] = entry.split(' ');

			cursor.x = Number(x);
			cursor.y = Number(y);
			cursor.z = Number(z);

			let block = colorBlocks[colorHex];

			if (!block) {
				block = voxels.registerType({
					cube: {
						default: {
							color: `#${colorHex}`,
						},
					},
				});

				colorBlocks[colorHex] = block;
			}

			voxels.setBlock(cursor.x, cursor.y, cursor.z, block.index);
		}

		voxels.updateAtlas();

		setVoxels(voxels);

		return () => {
			voxels.dispose();

			setVoxels(null);
		};
	}, [mapText, scene]);

	useFrame(() => {
		if (!voxels) return;

		// build chunks
		voxels.update(3, ACTOR);
	});

	return null;
};

export function Sketch() {
	return (
		<WebGPUCanvas gl={{ antialias: true }}>
			<GameWorld />

			<ambientLight intensity={1.5} />
			<directionalLight position={[10, 10, 10]} intensity={1} />

			<OrbitControls makeDefault />
			<PerspectiveCamera makeDefault position={[10, 10, 10]} />
		</WebGPUCanvas>
	);
}
