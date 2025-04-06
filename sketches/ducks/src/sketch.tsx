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
	MeshStandardMaterial,
	type Scene,
	SphereGeometry,
	CylinderGeometry,
	Vector3,
	type Vector3Tuple,
	Quaternion,
} from 'three';
import { WebGPUCanvas } from '../../../common';

import './styles.css';

// Temp vectors for calculations (to avoid creating new objects)
const _tempDirection = new Vector3();
const _tempPosition = new Vector3();
const _tempOffset = new Vector3();
const _tempMidpoint = new Vector3();
const _tempResult = new Vector3();

// Leg segment type
type LegSegment = {
	direction: Vector3;
	length: number;
	position?: Vector3;
};

// Corrected FABRIK algorithm implementation based on reference
const fabrik = (
	segments: LegSegment[],
	target: Vector3,
	base: Vector3,
	backwardsSegments: LegSegment[] = [],
): LegSegment[] => {
	// Calculate all joint positions (vectorTips in reference code)
	const jointPositions: Vector3[] = [];
	let prevPosition = base.clone(); // Need clone here to avoid modifying the input

	// Forward pass - calculate all joint positions based on current segments
	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i];
		
		// Calculate joint position by adding scaled direction to previous position
		_tempDirection.copy(segment.direction).multiplyScalar(segment.length);
		const jointPosition = new Vector3().copy(prevPosition).add(_tempDirection);

		jointPositions.push(jointPosition);
		prevPosition = jointPosition;
	}

	// Backward pass - work backward from target to base
	let currentTarget = target.clone(); // Need clone here to avoid modifying the input

	// Loop from second-to-last joint to first joint
	for (let i = jointPositions.length - 2; i >= 0; i--) {
		// Calculate direction from joint to current target
		_tempDirection.subVectors(jointPositions[i], currentTarget).normalize();
		
		// Use length of NEXT segment (i+1)
		const length = segments[i + 1].length;
		
		// Calculate new position and update current target
		_tempOffset.copy(_tempDirection).multiplyScalar(length);
		currentTarget = new Vector3().copy(currentTarget).add(_tempOffset);
		
		// Create new segment
		backwardsSegments.push({
			direction: new Vector3().copy(_tempDirection),
			length: length,
		});
	}
	
	// Handle the first segment (from base to first joint)
	_tempDirection.subVectors(base, currentTarget).normalize();
	const firstLength = segments[0].length;
	
	backwardsSegments.push({
		direction: new Vector3().copy(_tempDirection),
		length: firstLength,
	});
	
	return backwardsSegments;
};

const twoPassFabrik = (
	segments: LegSegment[],
	target: Vector3,
	root: Vector3,
): LegSegment[] => {
	// First pass (backward reaching)
	const pass1 = fabrik(segments, target, root, []);
	
	// Second pass (forward reaching)
	const pass2 = fabrik(pass1, root, target, pass1);
	
	// Only return the second half of the array as in reference implementation
	return pass2.slice(Math.floor(pass2.length / 2));
};

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
	segments: number; // Number of segments
	segmentLength: number; // Length of each segment
};

type LegState = {
	id: string;
	currentPosition: Vector3 | undefined;
	goalPosition: Vector3;
	segments: LegSegment[]; // Leg segments
	segmentMeshes?: Mesh[]; // Visual meshes for segments

	debug?: LegHelper;
};

type CrawlerState = {
	legs: Record<string, LegState>;
};

type CrawlerProps = {
	legs: LegDef[];
	legsDesiredHeight: number;
	debug?: boolean;
} & RigidBodyProps;

const LEGS: LegDef[] = [
	{
		id: 'front-left',
		offset: [-0.5, -0.5, 0.5],
		stepDistanceThreshold: 1,
		segments: 3,
		segmentLength: 0.33,
	},
	{
		id: 'front-right',
		offset: [0.5, -0.5, 0.5],
		stepDistanceThreshold: 1,
		segments: 3,
		segmentLength: 0.33,
	},
	{
		id: 'back-left',
		offset: [-0.5, -0.5, -0.5],
		stepDistanceThreshold: 1,
		segments: 3,
		segmentLength: 0.33,
	},
	{
		id: 'back-right',
		offset: [0.5, -0.5, -0.5],
		stepDistanceThreshold: 1,
		segments: 3,
		segmentLength: 0.33,
	},
];

// Function to create leg segment visualization
const createLegSegmentMeshes = (
	segments: LegSegment[],
	startPosition: Vector3,
	scene: Scene,
): Mesh[] => {
	let prevPosition = startPosition.clone(); // Need clone to avoid modifying input
	const meshes: Mesh[] = [];

	for (const segment of segments) {
		// Calculate end position
		_tempDirection.copy(segment.direction).multiplyScalar(segment.length);
		const endPosition = new Vector3().copy(prevPosition).add(_tempDirection);

		// Create a cylinder mesh for the segment
		const segmentMesh = new Mesh(
			new CylinderGeometry(0.05, 0.03, segment.length, 8),
			new MeshStandardMaterial({ color: 'brown' }),
		);

		// Position at midpoint
		_tempMidpoint.addVectors(prevPosition, endPosition).multiplyScalar(0.5);
		segmentMesh.position.copy(_tempMidpoint);

		// Calculate rotation to align with segment direction
		_tempDirection.subVectors(endPosition, prevPosition).normalize();

		// Create a quaternion that rotates the cylinder's Y axis to our direction
		const quaternion = new Quaternion();
		const upVector = new Vector3(0, 1, 0);
		quaternion.setFromUnitVectors(upVector, _tempDirection);

		// Apply the rotation
		segmentMesh.setRotationFromQuaternion(quaternion);

		scene.add(segmentMesh);
		meshes.push(segmentMesh);

		prevPosition = endPosition;
	}

	return meshes;
};

// Add a smoothing function to reduce jitter
const smoothVector = (
	current: Vector3,
	target: Vector3,
	alpha = 0.3,
): Vector3 => {
	return _tempResult.copy(current).lerp(target, alpha);
};

// Function to update leg segment visualization
const updateLegSegmentMeshes = (
	segments: LegSegment[],
	meshes: Mesh[],
	startPosition: Vector3,
	smoothingFactor = 0.3,
) => {
	let prevPosition = startPosition.clone(); // Need clone to avoid modifying input

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i];
		
		// Calculate end position
		_tempDirection.copy(segment.direction).multiplyScalar(segment.length);
		const endPosition = new Vector3().copy(prevPosition).add(_tempDirection);

		// Calculate the midpoint for the mesh position
		_tempMidpoint.addVectors(prevPosition, endPosition).multiplyScalar(0.5);

		// Apply smoothing to reduce jitter - avoid unnecessary clones
		_tempPosition.copy(meshes[i].position);
		const smoothedPos = _tempPosition.lerp(_tempMidpoint, smoothingFactor);

		// Update mesh position
		meshes[i].position.copy(smoothedPos);

		// Calculate direction vector and create rotation quaternion
		_tempDirection.subVectors(endPosition, prevPosition).normalize();
		const upVector = new Vector3(0, 1, 0);
		const targetQuaternion = new Quaternion();
		targetQuaternion.setFromUnitVectors(upVector, _tempDirection);

		// Smooth the rotation using slerp
		meshes[i].quaternion.slerp(targetQuaternion, smoothingFactor);

		prevPosition = endPosition;
	}
};

// Function to clean up leg segment meshes
const disposeLegSegmentMeshes = (meshes: Mesh[]) => {
	for (const mesh of meshes) {
		mesh.geometry.dispose();
		if (Array.isArray(mesh.material)) {
			mesh.material.forEach((m) => m.dispose());
		} else {
			mesh.material.dispose();
		}
		mesh.removeFromParent();
	}
};

const Crawler = ({
	legs,
	legsDesiredHeight,
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

	/* cleanup leg helpers and segment meshes on unmount */
	useEffect(() => {
		return () => {
			for (const leg of legs) {
				const legState = state.legs[leg.id];
				if (legState?.debug) {
					disposeLegHelper(legState);
					legState.debug = undefined;
				}
				if (legState?.segmentMeshes) {
					disposeLegSegmentMeshes(legState.segmentMeshes);
					legState.segmentMeshes = undefined;
				}
			}
		};
	});

	useFrame((_, dt) => {
		if (!rigidBodyRef.current) return;

		/* apply horizontal velocity to move in circle */
		const speed = 2;
		const angle = (performance.now() / 1000) * speed;
		const x = Math.cos(angle) * 1;
		const z = Math.sin(angle) * 1;
		rigidBodyRef.current.setLinvel(
			new Vector3(x, rigidBodyRef.current.linvel().y, z),
			true,
		);
		rigidBodyRef.current.setAngvel(new Vector3(0, 0, 0), true);

		/* hovering controller */
		_rayOrigin.copy(rigidBodyRef.current.translation());
		_rayOrigin.y -= 0.5;

		_rayDirection.set(0, -1, 0);

        const rayLength = legsDesiredHeight + 0.5;
		const ray = new Rapier.Ray(_rayOrigin, _rayDirection);

		const rayColliderIntersection = world.castRayAndGetNormal(
			ray,
			rayLength,
			false,
			undefined,
			undefined,
			undefined,
			rigidBodyRef.current,
		);

		let grounded = false;

		if (rayColliderIntersection?.timeOfImpact !== undefined) {
			const rayHitDistance =
				rayColliderIntersection.timeOfImpact * rayLength;

			const heightDesired = legsDesiredHeight;
			const heightCurrent = rayHitDistance;
			const springConstant = 1;
			const springDamping = 0.2;
			const currentVerticalVelocity = rigidBodyRef.current.linvel().y;

			const velocity =
				(heightDesired - heightCurrent) * springConstant -
				currentVerticalVelocity * springDamping;

			_impulse.set(0, velocity, 0);

			rigidBodyRef.current.applyImpulse(_impulse, true);

			if (rayHitDistance < legsDesiredHeight + 0.1) {
				grounded = true;
			}
		}

		/* update leg target positions */
		for (const leg of legs) {
			let legState = state.legs[leg.id];

			if (!legState) {
				// Initialize leg segments with improved initial directions
				const initialSegments: LegSegment[] = [];

				// Create a simple vertical chain pointing down
				const downVector = new Vector3(0, -1, 0);

				for (let i = 0; i < leg.segments; i++) {
					initialSegments.push({
						direction: downVector.clone(), // Ensure it points down
						length: leg.segmentLength,
						position: new Vector3(),
					});
				}

				legState = state.legs[leg.id] = {
					id: leg.id,
					goalPosition: new Vector3(),
					currentPosition: undefined,
					segments: initialSegments,
				};
			}

			_rayOrigin.copy(rigidBodyRef.current.translation());
			_rayOrigin.add(_legOffset.set(...leg.offset));

			_rayDirection.set(0, -1, 0);

			const ray = new Rapier.Ray(_rayOrigin, _rayDirection);

			const rayColliderIntersection = world.castRayAndGetNormal(
				ray,
				legsDesiredHeight,
				false,
				undefined,
				undefined,
				undefined,
				rigidBodyRef.current,
			);

			const distance =
				rayColliderIntersection?.timeOfImpact !== undefined
					? rayColliderIntersection.timeOfImpact * legsDesiredHeight
					: legsDesiredHeight;

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

			const basePosition = _rayOrigin.clone();
			const targetPosition = legState.currentPosition.clone();

			// Apply FABRIK to update segments - removed iterations parameter
			const newSegments = twoPassFabrik(
				legState.segments,
				targetPosition,
				basePosition
			);

			// Smooth between old and new segments to reduce jitter
			for (let i = 0; i < legState.segments.length; i++) {
				// Smoothly interpolate the direction - avoid clone()
				_tempDirection.copy(legState.segments[i].direction)
					.lerp(newSegments[i].direction, 0.1)
					.normalize();
				
				// Update the direction in place
				legState.segments[i].direction.copy(_tempDirection);
			}

			// Create or update segment visualizations
			if (!legState.segmentMeshes) {
				legState.segmentMeshes = createLegSegmentMeshes(
					legState.segments,
					basePosition,
					scene,
				);
			} else {
				// Use a lower smoothing factor for more stable movements
				updateLegSegmentMeshes(
					legState.segments,
					legState.segmentMeshes,
					basePosition,
					0.2, // Lower smoothing factor for stability
				);
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
					legState.debug = undefined;
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
		<RigidBody type="fixed" position={[0, -3, 0]}>
			<CuboidCollider args={[100, 3, 100]} />
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
				<Crawler
					position={[0, 4, 0]}
					legs={LEGS}
					legsDesiredHeight={1} // Increased to give more room for legs
					debug
				/>

				<Floor />
			</Physics>

			<ambientLight intensity={1.5} />
			<directionalLight position={[0, 0, 5]} intensity={1.5} />

			<OrbitControls makeDefault />
			<PerspectiveCamera makeDefault position={[0, 5, 15]} /> 
		</WebGPUCanvas>
	);
}
