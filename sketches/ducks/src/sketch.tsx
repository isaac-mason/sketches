import Rapier, { type World } from '@dimforge/rapier3d-compat';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import {
	CuboidCollider,
	Physics,
	type RapierRigidBody,
	RigidBody,
	type RigidBodyProps,
	useRapier,
} from '@react-three/rapier';
import { useEffect, useRef, useState } from 'react';
import {
	type BufferGeometry,
	CylinderGeometry,
	type Group,
	type Material,
	Mesh,
	MeshBasicMaterial,
	Quaternion,
	type Scene,
	SphereGeometry,
	Vector3,
	type Vector3Tuple,
} from 'three';
import { WebGPUCanvas } from '../../../common/components/webgpu-canvas';
import { type Chain, bone, fabrikFixedIterations } from './fabrik';
import type { Vec3 } from './vec3';

import './styles.css';

const _footPlacementOffset = new Vector3();
const _legOrigin = new Vector3();
const _rayOrigin = new Vector3();
const _rayDirection = new Vector3();
const _rayWorldHitPosition = new Vector3();
const _impulse = new Vector3();
const _legOffset = new Vector3();
const _currentEffectorPosition = new Vector3();
const _midpoint = new Vector3();
const _start = new Vector3();
const _end = new Vector3();
const _goal = new Vector3();
const _direction = new Vector3();
const _quaternion = new Quaternion();

const _currentFootPositionVec3: Vec3 = [0, 0, 0];
const _legOriginVec3: Vec3 = [0, 0, 0];

const UP = new Vector3(0, 1, 0);

type LegDef = {
	id: string;
	attachmentOffset: Vector3Tuple; // Leg attachment point
	footPlacementOffset: Vector3Tuple; // Outward stance offset for leg stance
	segments: number; // Number of segments
	legLength: number; // Total desired length of the leg
	phaseOffset: number; // Value between 0-1 indicating when in the cycle this leg steps
};

type LegState = {
	id: string;
	footPlacementRayOrigin: Vector3;
	footPlacementIdealPosition: Vector3;
	effectorCurrentPosition: Vector3;
	basePosition: Vector3;
	chain: Chain;
	stepping: boolean; // Whether the leg is currently in a stepping motion
	stepProgress: number; // 0-1 value for step animation progress
	debug?: FootPlacementHelper;
	lastStepTime: number; // Store timestamp of last step
	chainHelper: ChainHelper | undefined;
	footPlacementHelper: FootPlacementHelper | undefined;
};

// Add an easing function for smooth stepping motion
const ease = (x: number): number => {
	return -(Math.cos(Math.PI * x) - 1) / 2;
};

type CrawlerDef = {
	legs: LegDef[];
	height: number;
};

type CrawlerProps = RigidBodyProps & {
	def: CrawlerDef;
	debug?: boolean;
};

const initCrawler = (def: CrawlerDef) => {
	const legs: Record<string, LegState> = {};

	for (const leg of def.legs) {
		const chain: Chain = {
			bones: [],
		};

		const segmentLength = leg.legLength / leg.segments;

		const prevEnd = new Vector3();

		for (let i = 0; i < leg.segments; i++) {
			const start = prevEnd.clone();
			const end = start.clone();
			end.add(_legOffset.set(0, -1, 0).multiplyScalar(segmentLength));

			chain.bones.push(bone(start.toArray(), end.toArray()));
		}

		legs[leg.id] = {
			id: leg.id,
			footPlacementIdealPosition: new Vector3(),
			footPlacementRayOrigin: new Vector3(),
			basePosition: new Vector3(),
			effectorCurrentPosition: new Vector3(),
			stepping: false,
			stepProgress: 1, // init as "completed" (0, 1)
			lastStepTime: 0,
			chain,
			footPlacementHelper: undefined,
			chainHelper: undefined,
		};
	}

	return {
		def,
		state: {
			legs,
			legTimer: 0,
			position: new Vector3(),
			lastPosition: new Vector3(),
			stepCycleTime: 0,
			grounded: false,
			landing: false,
		},
	};
};

type CrawlerState = ReturnType<typeof initCrawler>;

const updateCrawlerMovement = (
	crawler: CrawlerState,
	rigidBody: RapierRigidBody,
) => {
	/* update position */
	crawler.state.position.copy(rigidBody.translation());

	/* apply horizontal velocity to move in circle */
	const angle = (performance.now() / 1000) * 2;
	const x = Math.cos(angle) * 3;
	const z = Math.sin(angle) * 3;
	rigidBody.setLinvel(new Vector3(x, rigidBody.linvel().y, z), true);
	rigidBody.setAngvel(new Vector3(0, 0, 0), true);
};

const updateCrawlerTimer = (crawler: CrawlerState, dt: number) => {
	// Increment leg timer
	crawler.state.legTimer += dt * 2;

	// Update step cycle time - this drives the phase-based stepping
	// Speed up or slow down by adjusting the multiplier (0.5 = slower cycle)
	crawler.state.stepCycleTime = (crawler.state.stepCycleTime + dt * 2) % 1;
};

const updateCrawlerHover = (
	crawler: CrawlerState,
	world: World,
	rigidBody: RapierRigidBody,
) => {
	/* hovering controller */
	_rayOrigin.copy(rigidBody.translation());
	_rayOrigin.y -= 0.5;

	_rayDirection.set(0, -1, 0);

	const rayLength = crawler.def.height + 0.5;
	const ray = new Rapier.Ray(_rayOrigin, _rayDirection);

	const rayColliderIntersection = world.castRayAndGetNormal(
		ray,
		rayLength,
		false,
		undefined,
		undefined,
		undefined,
		rigidBody,
	);

	let grounded = false;

	if (rayColliderIntersection?.timeOfImpact !== undefined) {
		const rayHitDistance = rayColliderIntersection.timeOfImpact * rayLength;

		const heightDesired = crawler.def.height;
		const heightCurrent = rayHitDistance;
		const springConstant = 1;
		const springDamping = 0.2;
		const currentVerticalVelocity = rigidBody.linvel().y;

		const velocity =
			(heightDesired - heightCurrent) * springConstant -
			currentVerticalVelocity * springDamping;

		_impulse.set(0, velocity, 0);

		rigidBody.applyImpulse(_impulse, true);

		if (rayHitDistance < crawler.def.height + 0.1) {
			grounded = true;
		}
	}

	crawler.state.landing = !crawler.state.grounded && grounded;

	crawler.state.grounded = grounded;
};

const updateCrawlerFootPlacement = (
	crawler: CrawlerState,
	world: World,
	rigidBody: RapierRigidBody,
) => {
	if (crawler.state.grounded) {
		for (const leg of crawler.def.legs) {
			const legState = crawler.state.legs[leg.id];

			_legOrigin.copy(crawler.state.position);
			_legOrigin.add(_legOffset.set(...leg.attachmentOffset));

			_rayDirection.set(0, -1, 0);

			const rayStartPos = _rayOrigin
				.copy(crawler.state.position)
				.add(_footPlacementOffset.set(...leg.footPlacementOffset));

			rayStartPos.y = _legOrigin.y;

			const ray = new Rapier.Ray(rayStartPos, _rayDirection);
			const rayColliderIntersection = world.castRayAndGetNormal(
				ray,
				crawler.def.height,
				false,
				undefined,
				undefined,
				undefined,
				rigidBody,
			);

			const distance =
				rayColliderIntersection?.timeOfImpact !== undefined
					? rayColliderIntersection.timeOfImpact * crawler.def.height
					: crawler.def.height;

			_rayWorldHitPosition.copy(_rayDirection).multiplyScalar(distance);
			_rayWorldHitPosition.add(rayStartPos);

			legState.footPlacementRayOrigin.copy(rayStartPos);
			legState.footPlacementIdealPosition.copy(_rayWorldHitPosition);
		}
	} else {
		// extend legs outwards
		for (const leg of crawler.def.legs) {
			const legState = crawler.state.legs[leg.id];

			_start.set(...leg.attachmentOffset);
			_end.set(...leg.footPlacementOffset);

			_direction.subVectors(_end, _start).normalize();
			_direction.multiplyScalar(leg.legLength);

			_end.copy(crawler.state.position);
			_end.add(_direction);

			legState.footPlacementIdealPosition.copy(_end);
		}
	}
};

const updateCrawlerStepping = (crawler: CrawlerState, dt: number) => {
	for (const leg of crawler.def.legs) {
		const legState = crawler.state.legs[leg.id];

		// update base joint / attachment position
		legState.basePosition.copy(crawler.state.position);
		legState.basePosition.add(_legOffset.set(...leg.attachmentOffset));

		// if not grounded, stop stepping
		if (!crawler.state.grounded) {
			legState.stepping = false;
			legState.effectorCurrentPosition.copy(
				legState.footPlacementIdealPosition,
			);

			continue;
		}

		const currentEffectorPosition = _currentEffectorPosition.set(
			...legState.chain.bones[legState.chain.bones.length - 1].end,
		);

		const distanceToDesired = currentEffectorPosition.distanceTo(
			legState.footPlacementIdealPosition,
		);

		if (legState.stepping) {
			// advance step progress
			legState.stepProgress += dt * 3; // adjust for step speed

			if (legState.stepProgress >= 1) {
				// step complete
				legState.stepProgress = 1;
				legState.stepping = false;
				legState.lastStepTime = performance.now();
			}
		} else {
			// calculate where we are in the stepping cycle for this leg
			const legPhase = (crawler.state.stepCycleTime + leg.phaseOffset) % 1;

			// define the phase "window" where this leg is allowed to step
			const phaseWindowStart = 0;
			const phaseWindowEnd = 0.3; // Allow 30% of the cycle for stepping

			// is this leg is in its stepping phase window
			const inStepPhase =
				legPhase >= phaseWindowStart && legPhase <= phaseWindowEnd;

			// periodic small adjustment steps
			const smallDifferenceThreshold = 0.01;
			const hasSmallDifference = distanceToDesired > smallDifferenceThreshold;
			const timeThreshold = 3.0;
			const needsPeriodicStep =
				performance.now() - legState.lastStepTime > timeThreshold &&
				hasSmallDifference;

			// foot is far from desired position
			const needsRegularStep = distanceToDesired > 0.5;

			const needsToStep = needsRegularStep || needsPeriodicStep;

			if ((inStepPhase || crawler.state.landing) && needsToStep) {
				legState.stepping = true;
				legState.stepProgress = 0;
			}
		}

		// determine current position for the step
		if (legState.stepping) {
			legState.effectorCurrentPosition.lerp(
				legState.footPlacementIdealPosition,
				dt * 10,
			);

			// add a vertical component that peaks in the middle of the step
			const easedProgress = ease(legState.stepProgress);
			if (easedProgress > 0 && easedProgress < 1) {
				const arcHeight = 0.1;
				const arcFactor = Math.sin(easedProgress * Math.PI) * arcHeight;
				legState.effectorCurrentPosition.y += arcFactor;
			}
		}
	}
};

const updateCrawlerIK = (crawler: CrawlerState, dt: number) => {
	for (const leg of crawler.def.legs) {
		const legState = crawler.state.legs[leg.id];

		_legOriginVec3[0] = legState.basePosition.x;
		_legOriginVec3[1] = legState.basePosition.y;
		_legOriginVec3[2] = legState.basePosition.z;

		_currentFootPositionVec3[0] = legState.effectorCurrentPosition.x;
		_currentFootPositionVec3[1] = legState.effectorCurrentPosition.y;
		_currentFootPositionVec3[2] = legState.effectorCurrentPosition.z;

		fabrikFixedIterations(
			legState.chain,
			_legOriginVec3,
			_currentFootPositionVec3,
			5,
		);
	}
};

const initFootPlacementHelper = (scene: Scene) => {
	const rayOriginHelper = new Mesh(
		new SphereGeometry(0.05),
		new MeshBasicMaterial({ color: 'red', wireframe: true }),
	);

	const targetPositionHelper = new Mesh(
		new SphereGeometry(0.05),
		new MeshBasicMaterial({ color: 'green', wireframe: true }),
	);

	const currentPositionHelper = new Mesh(
		new SphereGeometry(0.06),
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

type FootPlacementHelper = ReturnType<typeof initFootPlacementHelper>;

const updateFootPlacementHelper = (
	helper: FootPlacementHelper,
	rayOrigin: Vector3,
	targetPosition: Vector3,
	currentPosition: Vector3,
) => {
	helper.rayOriginHelper.position.copy(rayOrigin);
	helper.targetPositionHelper.position.copy(targetPosition);
	helper.currentPositionHelper.position.copy(currentPosition);
};

const disposeFootPlacementHelper = (helper: FootPlacementHelper) => {
	const { rayOriginHelper, targetPositionHelper, currentPositionHelper } =
		helper;

	rayOriginHelper.removeFromParent();
	targetPositionHelper.removeFromParent();
	currentPositionHelper.removeFromParent();

	for (const geometry of helper.geometries) {
		geometry.dispose();
	}
	for (const material of helper.materials) {
		material.dispose();
	}
};

const initChainHelper = (chain: Chain, scene: Scene) => {
	// cylinders for each bone
	const boneMeshes: Mesh[] = [];
	const boneGeometry = new CylinderGeometry(0.03, 0.03, 1, 8);
	const boneMaterial = new MeshBasicMaterial({ color: 'orange' });

	const jointMeshes: Mesh[] = [];
	const jointGeometry = new SphereGeometry(0.1, 8, 8);
	const jointMaterial = new MeshBasicMaterial({ color: 'blue' });

	const baseMaterial = new MeshBasicMaterial({ color: 'green' });

	for (let i = 0; i < chain.bones.length; i++) {
		const bone = chain.bones[i];

		const mesh = new Mesh(boneGeometry, boneMaterial);
		mesh.position.set(...bone.start);
		mesh.lookAt(...bone.end);
		mesh.updateMatrixWorld();
		mesh.scale.set(1, bone.length, 1);
		scene.add(mesh);
		boneMeshes.push(mesh);

		const jointMesh = new Mesh(
			jointGeometry,
			i === 0 ? baseMaterial : boneMaterial,
		);
		jointMesh.position.set(...bone.start);
		scene.add(jointMesh);
		jointMeshes.push(jointMesh);
	}

	const attachmentGeometry = new SphereGeometry(0.12, 8, 8);
	const attachmentMaterial = new MeshBasicMaterial({ color: 'purple' });
	const attachmentMesh = new Mesh(attachmentGeometry, attachmentMaterial);
	scene.add(attachmentMesh);

	const effectorMaterial = new MeshBasicMaterial({ color: 'red' });
	const effectorMesh = new Mesh(jointGeometry, effectorMaterial);
	effectorMesh.position.set(...chain.bones[chain.bones.length - 1].end);
	scene.add(effectorMesh);

	return {
		boneMeshes,
		boneGeometry,
		boneMaterial,
		jointMeshes,
		jointGeometry,
		jointMaterial,
		baseMaterial,
		effectorMaterial,
		effectorMesh,
		attachmentGeometry,
		attachmentMaterial,
		attachmentMesh,
	};
};

type ChainHelper = ReturnType<typeof initChainHelper>;

const updateChainHelper = (
	legState: LegState,
	chain: Chain,
	chainHelper: ChainHelper,
) => {
	for (let i = 0; i < chain.bones.length; i++) {
		const bone = chain.bones[i];
		const jointMesh = chainHelper.jointMeshes[i];
		const boneMesh = chainHelper.boneMeshes[i];

		_start.set(...bone.start);
		_end.set(...bone.end);

		_midpoint.addVectors(_start, _end).multiplyScalar(0.5);

		_direction.subVectors(_end, _start).normalize();
		_quaternion.setFromUnitVectors(UP, _direction);

		jointMesh.position.copy(_start);

		boneMesh.position.copy(_midpoint);
		boneMesh.quaternion.copy(_quaternion);
	}

	const attachmentMesh = chainHelper.attachmentMesh;
	attachmentMesh.position.copy(legState.basePosition);

	const effectorMesh = chainHelper.effectorMesh;
	effectorMesh.position.set(...chain.bones[chain.bones.length - 1].end);
};

const disposeChainHelper = (chainHelper: ChainHelper) => {
	for (const mesh of chainHelper.boneMeshes) {
		mesh.removeFromParent();
		mesh.geometry.dispose();
		(mesh.material as Material).dispose();
	}

	for (const mesh of chainHelper.jointMeshes) {
		mesh.removeFromParent();
		mesh.geometry.dispose();
		(mesh.material as Material).dispose();
	}

	chainHelper.effectorMesh.removeFromParent();
	chainHelper.effectorMesh.geometry.dispose();
	(chainHelper.effectorMesh.material as Material).dispose();

	chainHelper.attachmentMesh.removeFromParent();
	chainHelper.attachmentMesh.geometry.dispose();
	(chainHelper.attachmentMesh.material as Material).dispose();
};

const updateCrawlerDebugVisuals = (
	crawler: CrawlerState,
	debug: boolean,
	scene: Scene,
) => {
	for (const leg of crawler.def.legs) {
		const legState = crawler.state.legs[leg.id];

		if (debug) {
			if (!legState.debug) {
				legState.debug = initFootPlacementHelper(scene);
			}

			updateFootPlacementHelper(
				legState.debug!,
				legState.footPlacementRayOrigin,
				legState.footPlacementIdealPosition,
				legState.effectorCurrentPosition,
			);

			if (!legState.chainHelper) {
				legState.chainHelper = initChainHelper(legState.chain, scene);
			}

			updateChainHelper(legState, legState.chain, legState.chainHelper);
		} else {
			if (legState.footPlacementHelper) {
				disposeFootPlacementHelper(legState.footPlacementHelper);
				legState.footPlacementHelper = undefined;
			}

			if (legState.chainHelper) {
				disposeChainHelper(legState.chainHelper);
				legState.chainHelper = undefined;
			}
		}
	}
};

const updateCrawler = (
	crawler: CrawlerState,
	world: World,
	rigidBody: RapierRigidBody,
	debug: boolean,
	scene: Scene,
	dt: number,
) => {
	updateCrawlerMovement(crawler, rigidBody);
	updateCrawlerTimer(crawler, dt);
	updateCrawlerHover(crawler, world, rigidBody);
	updateCrawlerFootPlacement(crawler, world, rigidBody);
	updateCrawlerStepping(crawler, dt);
	updateCrawlerIK(crawler, dt);
	updateCrawlerDebugVisuals(crawler, debug, scene);
};

const disposeCrawler = (crawler: CrawlerState) => {
	for (const leg of crawler.def.legs) {
		const legState = crawler.state.legs[leg.id];

		if (legState.debug) {
			disposeFootPlacementHelper(legState.debug!);
		}
	}
};

const Crawler = ({ def, debug = false, ...rigidBodyProps }: CrawlerProps) => {
	const scene = useThree((state) => state.scene);

	const { world } = useRapier();
	const rigidBodyRef = useRef<Rapier.RigidBody>(null!);
	const groupRef = useRef<Group>(null!);

	const [crawlerState, setCrawlerState] = useState<CrawlerState>();

	useEffect(() => {
		const crawler = initCrawler(def);
		setCrawlerState(crawler);

		return () => {
			disposeCrawler(crawler);
			setCrawlerState(undefined);
		};
	}, [def]);

	useFrame((_, dt) => {
		if (!crawlerState) return;

		const rigidBody = rigidBodyRef.current;
		if (!rigidBody) return;

		updateCrawler(crawlerState, world, rigidBody, debug, scene, dt);
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
					<sphereGeometry args={[0.5, 32, 32]} />
					<meshStandardMaterial color="orange" />
				</mesh>
			</group>
		</RigidBody>
	);
};

const Floor = () => (
	<>
		<RigidBody type="fixed" position={[0, -3, 0]}>
			<CuboidCollider args={[100, 3, 100]} />
		</RigidBody>

		<mesh rotation={[-Math.PI / 2, 0, 0]}>
			<circleGeometry args={[50, 64]} />
			<meshStandardMaterial color="#999" />
		</mesh>
	</>
);

const LEGS: LegDef[] = [
	{
		id: 'front-left',
		attachmentOffset: [-0.3, -0.3, 0.3],
		footPlacementOffset: [-0.8, 0, 0.8],
		segments: 3,
		legLength: 1.3, // Total leg length
		phaseOffset: 0, // First in sequence
	},
	{
		id: 'back-right',
		attachmentOffset: [0.3, -0.3, -0.3],
		footPlacementOffset: [0.8, 0, -0.8],
		segments: 3,
		legLength: 1.3,
		phaseOffset: 0.25, // Second in sequence
	},
	{
		id: 'front-right',
		attachmentOffset: [0.3, -0.3, 0.3],
		footPlacementOffset: [0.8, 0, 0.8],
		segments: 3,
		legLength: 1.3,
		phaseOffset: 0.5, // Third in sequence
	},
	{
		id: 'back-left',
		attachmentOffset: [-0.3, -0.3, -0.3],
		footPlacementOffset: [-0.8, 0, -0.8],
		segments: 3,
		legLength: 1.3,
		phaseOffset: 0.75, // Last in sequence
	},
];

const CRAWLER_DEF: CrawlerDef = {
	legs: LEGS,
	height: 1,
};

export function Sketch() {
	return (
		<WebGPUCanvas gl={{ antialias: true }}>
			<Physics debug>
				<Crawler position={[0, 4, 0]} def={CRAWLER_DEF} debug />

				<Floor />
			</Physics>

			<ambientLight intensity={1.5} />
			<directionalLight position={[0, 0, 5]} intensity={1.5} />

			<OrbitControls makeDefault />
			<PerspectiveCamera makeDefault position={[0, 5, 15]} />
		</WebGPUCanvas>
	);
}
