import Rapier from '@dimforge/rapier3d-compat';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import {
	CuboidCollider,
	Physics,
	RigidBody,
	type RigidBodyProps,
	useRapier,
} from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import {
	type BufferGeometry,
	type Group,
	type Material,
	Mesh,
	MeshBasicMaterial,
	type Scene,
	SphereGeometry,
	Vector3,
	type Vector3Tuple,
} from 'three';
import { WebGPUCanvas } from '../../../common';

import './styles.css';

const _rayOrigin = new Vector3();
const _rayDirection = new Vector3();
const _rayWorldHitPosition = new Vector3();
const _impulse = new Vector3();
const _linearVelocity = new Vector3();

const _legOffset = new Vector3();
const _legTarget = new Vector3();

const initLegHelper = (scene: Scene) => {
	const rayOriginHelper = new Mesh(
		new SphereGeometry(0.05),
		new MeshBasicMaterial({ color: 'red', wireframe: true }),
	);

	const targetPositionHelper = new Mesh(
		new SphereGeometry(0.05),
		new MeshBasicMaterial({ color: 'green', wireframe: true }),
	);

	const currentPositionHelper = new Mesh(
		new SphereGeometry(0.05),
		new MeshBasicMaterial({ color: 'blue', wireframe: true }),
	);

	const geometries: BufferGeometry[] = [
		rayOriginHelper.geometry,
		targetPositionHelper.geometry,
		currentPositionHelper.geometry,
	];
	const materials: Material[] = [
		rayOriginHelper.material,
		targetPositionHelper.material,
		currentPositionHelper.material,
	];

	scene.add(rayOriginHelper);
	scene.add(targetPositionHelper);
	scene.add(currentPositionHelper);

	return {
		rayOriginHelper,
		targetPositionHelper,
		currentPositionHelper,
		geometries,
		materials,
	};
};

type LegHelper = ReturnType<typeof initLegHelper>;

const updateLegHelper = (
	helper: LegHelper,
	rayOrigin: Vector3,
	targetPosition: Vector3,
	currentPosition: Vector3,
) => {
	helper.rayOriginHelper.position.copy(rayOrigin);
	helper.targetPositionHelper.position.copy(targetPosition);
	helper.currentPositionHelper.position.copy(currentPosition);
};

const disposeLegHelper = (legState: LegState) => {
	const { rayOriginHelper, targetPositionHelper, currentPositionHelper } =
		legState.debug!;

	rayOriginHelper.removeFromParent();
	targetPositionHelper.removeFromParent();
	currentPositionHelper.removeFromParent();

	for (const geometry of legState.debug!.geometries) {
		geometry.dispose();
	}
	for (const material of legState.debug!.materials) {
		material.dispose();
	}
};

type LegDef = {
	id: string;
	offset: Vector3Tuple;
	stepDistanceThreshold: number;
};

type LegState = {
	id: string;
	currentPosition: Vector3 | undefined;
	goalPosition: Vector3;

	debug?: LegHelper;
};

type CrawlerState = {
	legs: Record<string, LegState>;
};

type CrawlerProps = {
	legs: LegDef[];
	legsLength: number;
	debug?: boolean;
} & RigidBodyProps;

const LEGS: LegDef[] = [
	{
		id: 'front-left',
		offset: [-1, 0, 1],
		stepDistanceThreshold: 1,
	},
	{
		id: 'front-right',
		offset: [1, 0, 1],
		stepDistanceThreshold: 1,
	},
	{
		id: 'back-left',
		offset: [-1, 0, -1],
		stepDistanceThreshold: 1,
	},
	{
		id: 'back-right',
		offset: [1, 0, -1],
		stepDistanceThreshold: 1,
	},
];

const Crawler = ({
	legs,
	legsLength,
	debug = false,
	...rigidBodyProps
}: CrawlerProps) => {
	const scene = useThree((state) => state.scene);

	const { world } = useRapier();
	const rigidBodyRef = useRef<Rapier.RigidBody>(null!);
	const groupRef = useRef<Group>(null!);

	const state = useMemo<CrawlerState>(
		() => ({
			legs: {},
		}),
		[],
	);

	/* cleanup leg helpers on unmount */
	useEffect(() => {
		return () => {
			for (const leg of legs) {
				const legState = state.legs[leg.id];
				if (legState?.debug) {
					disposeLegHelper(legState);
					legState.debug = undefined;
				}
			}
		};
	});

	useFrame((_, dt) => {
		if (!rigidBodyRef.current) return;

		/* apply horizontal velocity to move in circle */
		const speed = 2;
		const angle = (performance.now() / 1000) * speed;
		const x = Math.cos(angle) * 5;
		const z = Math.sin(angle) * 5;
		rigidBodyRef.current.setLinvel(
			new Vector3(x, rigidBodyRef.current.linvel().y, z),
			true,
		);
		rigidBodyRef.current.setAngvel(new Vector3(0, 0, 0), true);

		/* hovering controller */
		_rayOrigin.copy(rigidBodyRef.current.translation());
		_rayOrigin.y -= 0.5;

		_rayDirection.set(0, -1, 0);

		const ray = new Rapier.Ray(_rayOrigin, _rayDirection);

		const rayColliderIntersection = world.castRayAndGetNormal(
			ray,
			legsLength,
			false,
			undefined,
			undefined,
			undefined,
			rigidBodyRef.current,
		);

		let grounded = false;

		if (rayColliderIntersection?.timeOfImpact !== undefined) {
			const rayHitDistance = rayColliderIntersection.timeOfImpact * legsLength;

			const heightDesired = legsLength;
			const heightCurrent = rayHitDistance;
			const springConstant = 5;
			const springDamping = 0.2;
			const currentVerticalVelocity = rigidBodyRef.current.linvel().y;

			const velocity =
				(heightDesired - heightCurrent) * springConstant -
				currentVerticalVelocity * springDamping;

			_impulse.set(0, velocity, 0);

			rigidBodyRef.current.applyImpulse(_impulse, true);

			if (rayHitDistance < legsLength + 0.1) {
				grounded = true;
			}
		}

		/* update leg target positions */
		for (const leg of legs) {
			let legState = state.legs[leg.id];

			if (!legState) {
				legState = state.legs[leg.id] = {
					id: leg.id,
					goalPosition: new Vector3(),
					currentPosition: undefined,
				};
			}

			_rayOrigin.copy(rigidBodyRef.current.translation());
			_rayOrigin.add(_legOffset.set(...leg.offset));

			_rayDirection.set(0, -1, 0);

			const ray = new Rapier.Ray(_rayOrigin, _rayDirection);

			const rayColliderIntersection = world.castRayAndGetNormal(
				ray,
				legsLength,
				false,
				undefined,
				undefined,
				undefined,
				rigidBodyRef.current,
			);

			const distance =
				rayColliderIntersection?.timeOfImpact !== undefined
					? rayColliderIntersection.timeOfImpact * legsLength
					: legsLength;

			_rayWorldHitPosition.copy(_rayDirection).multiplyScalar(distance);
			_rayWorldHitPosition.add(_rayOrigin);

			legState.goalPosition.copy(_rayWorldHitPosition);

			if (!legState.currentPosition) {
				legState.currentPosition = legState.goalPosition.clone();
			}

			const currentAndTargetDistance = legState.goalPosition.distanceTo(
				legState.currentPosition,
			);

			if (currentAndTargetDistance > leg.stepDistanceThreshold) {
				legState.currentPosition.copy(legState.goalPosition);
			}

			/* update leg debug helper */
			if (debug) {
				if (!legState.debug) {
					legState.debug = initLegHelper(scene);
				}

				updateLegHelper(
					legState.debug!,
					_rayOrigin,
					_rayWorldHitPosition,
					legState.currentPosition,
				);
			} else {
				if (legState.debug) {
					disposeLegHelper(legState);
				}
			}
		}
	});

	return (
		<RigidBody
			{...rigidBodyProps}
			type="dynamic"
			colliders="cuboid"
			ref={rigidBodyRef}
		>
			<group ref={groupRef}>
				<mesh>
					<boxGeometry args={[1, 1, 1]} />
					<meshStandardMaterial color="orange" />
				</mesh>
			</group>
		</RigidBody>
	);
};

const Floor = () => (
	<>
		<RigidBody type="fixed" position={[0, -1, 0]}>
			<CuboidCollider args={[100, 1, 100]} />
		</RigidBody>

		<mesh rotation={[-Math.PI / 2, 0, 0]}>
			<circleGeometry args={[50, 64]} />
			<meshStandardMaterial color="#999" />
		</mesh>
	</>
);

export function Sketch() {
	return (
		<WebGPUCanvas gl={{ antialias: true }}>
			<Physics debug>
				<Crawler position={[0, 4, 0]} legs={LEGS} legsLength={1} debug />

				<Floor />
			</Physics>

			<ambientLight intensity={1.5} />
			<directionalLight position={[0, 0, 5]} intensity={1.5} />

			<OrbitControls makeDefault />
			<PerspectiveCamera makeDefault position={[0, 0, 25]} />
		</WebGPUCanvas>
	);
}
