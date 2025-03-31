import { useFrame, useThree } from '@react-three/fiber';
import { useXR, useXRMeshes } from '@react-three/xr';
import { DebugDrawer } from '@recast-navigation/three';
import {
	type Ref,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from 'react';
import { type NavMesh, getNavMeshPositionsAndIndices } from 'recast-navigation';
import {
	type TiledNavMeshGeneratorConfig,
	generateTiledNavMesh,
} from 'recast-navigation/generators';
import {
	BufferAttribute,
	BufferGeometry,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	Vector3,
} from 'three';

function createGetXRSpaceMatrix(
	space: XRSpace,
	referenceSpace: XRSpace | (() => XRSpace | undefined),
): (target: Matrix4, frame: XRFrame | undefined) => boolean {
	return (target, frame) => {
		if (space === referenceSpace) {
			target.identity();
			return true;
		}
		const resolvedReferenceSpace =
			typeof referenceSpace === 'function' ? referenceSpace() : referenceSpace;
		if (resolvedReferenceSpace == null) {
			return false;
		}
		const pose = frame?.getPose(space, resolvedReferenceSpace);
		if (pose == null) {
			return false;
		}
		target.fromArray(pose.transform.matrix);
		return true;
	};
}

export type XRNavigationRefType =
	| null
	| undefined
	| { navMesh: NavMesh; walkableMesh: Mesh };

export type XRNavigationProps = {
	config: Partial<TiledNavMeshGeneratorConfig>;
	debug?: boolean;
	ref?: Ref<XRNavigationRefType>;
};

const _position = new Vector3();

/**
 * NOTE: ensure recast-navigation is initialized before using this component
 * ```
 * import { init } from 'recast-navigation';
 * await init();
 * ```
 */
export const XRNavigation = ({
	config,
	debug,
	ref,
}: XRNavigationProps) => {
	const scene = useThree((state) => state.scene);

	const meshes = useXRMeshes();
	const originReferenceSpace = useXR((xr) => xr.originReferenceSpace);

	const [navMesh, setNavMesh] = useState<NavMesh | null>(null);
	const [walkableMesh, setWalkableMesh] = useState<Mesh | null>(null);
	const [inputMeshGeometry, setInputMeshGeometry] =
		useState<BufferGeometry | null>(null);

	const lastFrame = useRef<XRFrame | null>(null!);

	const [meshSpaceMatrices, setMeshSpaceMatrices] = useState(
		() => new Map<XRMesh, Matrix4>(),
	);
	const [meshCount, setMeshCount] = useState(0);

	useImperativeHandle(
		ref,
		() => {
			if (!navMesh || !walkableMesh) return undefined;

			return {
				navMesh,
				walkableMesh,
			};
		},
		[navMesh, walkableMesh],
	);

	// todo: clean up approach for getting xr mesh world matrices
	// matrices are only required for initial navmesh generation.
	useFrame((_, __, frame) => {
		lastFrame.current = frame!;

		if (meshes.length !== meshCount) {
			setMeshCount(meshes.length);
		}

		for (const mesh of meshes) {
			let matrix = meshSpaceMatrices.get(mesh);

			if (!matrix) {
				matrix = new Matrix4();
				meshSpaceMatrices.set(mesh, matrix);
			}

			const getSpaceMatrix = createGetXRSpaceMatrix(
				mesh.meshSpace,
				originReferenceSpace!,
			);

			getSpaceMatrix(matrix, frame);
		}

		setMeshSpaceMatrices(meshSpaceMatrices);
	});

	/* navmesh generation */
	useEffect(() => {
		if (meshCount === 0) return;

		const combinedPositions: number[] = [];
		const combinedIndices: number[] = [];

		for (const mesh of meshes) {
			const meshSpaceMatrix = meshSpaceMatrices.get(mesh);

			if (!meshSpaceMatrix) {
				continue;
			}

			const indexOffset = combinedPositions.length / 3;

			// transform positions
			for (let i = 0; i < mesh.vertices.length; i += 3) {
				_position.set(
					mesh.vertices[i],
					mesh.vertices[i + 1],
					mesh.vertices[i + 2],
				);
				_position.applyMatrix4(meshSpaceMatrix);

				combinedPositions.push(_position.x, _position.y, _position.z);
			}

			// offset indices
			for (let i = 0; i < mesh.indices.length; i++) {
				combinedIndices.push(mesh.indices[i] + indexOffset);
			}
		}

		if (debug) {
			const inputMeshGeometry = new BufferGeometry();
			inputMeshGeometry.setAttribute(
				'position',
				new BufferAttribute(new Float32Array(combinedPositions), 3),
			);
			inputMeshGeometry.setIndex(combinedIndices);

			setInputMeshGeometry(inputMeshGeometry);
		}

		const { success, navMesh } = generateTiledNavMesh(
			combinedPositions,
			combinedIndices,
			config,
			debug,
		);

		if (success) {
			const [navMeshPositions, navMeshIndices] =
				getNavMeshPositionsAndIndices(navMesh);

			const navMeshGeometry = new BufferGeometry();
			navMeshGeometry.setAttribute(
				'position',
				new BufferAttribute(new Float32Array(navMeshPositions), 3),
			);
			navMeshGeometry.setIndex(navMeshIndices);

			const walkableMesh = new Mesh(navMeshGeometry);
			walkableMesh.visible = false;

			setNavMesh(navMesh);
			setWalkableMesh(walkableMesh);
		}

		return () => {
			setNavMesh(null);
			setWalkableMesh(null);
		};
	}, [meshes, meshCount, config, debug, meshSpaceMatrices]);

	/* debug */
	useEffect(() => {
		if (!debug || !navMesh || !inputMeshGeometry) return;

		const triMaterial = new MeshBasicMaterial({
			vertexColors: true,
			transparent: true,
			opacity: 0.5,
		});

		const debugDrawer = new DebugDrawer({ triMaterial });
		debugDrawer.renderOrder = 1;
		debugDrawer.drawNavMeshPolysWithFlags(navMesh, 1, 0x0000ff);

		debugDrawer.position.y += 0.02;

		scene.add(debugDrawer);

		const inputMaterial = new MeshBasicMaterial({
			color: 'orange',
			depthTest: false,
			depthWrite: false,
			transparent: true,
			opacity: 0.3,
		});

		const inputMesh = new Mesh(inputMeshGeometry, inputMaterial);

		scene.add(inputMesh);

		return () => {
			scene.remove(debugDrawer);
			scene.remove(inputMesh);

			debugDrawer.dispose();
		};
	}, [navMesh, inputMeshGeometry, scene, debug]);

	return walkableMesh && <primitive object={walkableMesh} />
};
