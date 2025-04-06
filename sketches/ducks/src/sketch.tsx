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
const _desiredFootPosition = new Vector3();
const _crawlerPosition = new Vector3();
const _outwardOffset = new Vector3(); // Add a new vector for the outward offset calculations

const _prevPosition = new Vector3();
const _currentTarget = new Vector3();

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
	let prevPosition = _prevPosition.copy(base); // Need clone here to avoid modifying the input

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
	let currentTarget = _currentTarget.copy(target); // Need clone here to avoid modifying the input

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

const _legOrigin = new Vector3();
const _rayOrigin = new Vector3();
const _rayDirection = new Vector3();
const _rayWorldHitPosition = new Vector3();
const _impulse = new Vector3();
const _linearVelocity = new Vector3();
const _basePosition = new Vector3();
const _targetPosition = new Vector3();
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
	offset: Vector3Tuple;     // Leg attachment point
	outwardOffset: Vector3Tuple; // Outward stance offset for leg stance
	segments: number; // Number of segments
	legLength: number; // Total desired length of the leg
	phaseOffset: number; // Value between 0-1 indicating when in the cycle this leg steps
};

type LegState = {
	id: string;
	currentPosition: Vector3 | undefined;
	goalPosition: Vector3;
	segments: LegSegment[]; // Leg segments
	segmentMeshes?: Mesh[]; // Visual meshes for segments
	stepping: boolean; // Whether the leg is currently in a stepping motion
	stepProgress: number; // 0-1 value for step animation progress
	debug?: LegHelper;
};

type CrawlerState = {
	legs: Record<string, LegState>;
	legTimer: number; // Timer that increases when crawler is moving
	lastPosition: Vector3; // Last position to detect movement
	stepCycleTime: number; // Dedicated timer for phase-based stepping
};

const LEGS: LegDef[] = [
	{
		id: 'front-left',
		offset: [-0.5, -0.5, 0.5],
		outwardOffset: [-0.8, 0, 0.8],
		segments: 3,
		legLength: 1, // Total leg length
		phaseOffset: 0, // First in sequence
	},
	{
		id: 'back-right',
		offset: [0.5, -0.5, -0.5],
		outwardOffset: [0.8, 0, -0.8],
		segments: 3,
		legLength: 1,
		phaseOffset: 0.25, // Second in sequence
	},
	{
		id: 'front-right',
		offset: [0.5, -0.5, 0.5],
		outwardOffset: [0.8, 0, 0.8],
		segments: 3,
		legLength: 1,
		phaseOffset: 0.5, // Third in sequence
	},
	{
		id: 'back-left',
		offset: [-0.5, -0.5, -0.5],
		outwardOffset: [-0.8, 0, -0.8],
		segments: 3,
		legLength: 1,
		phaseOffset: 0.75, // Last in sequence
	},
];

// Function to create leg segment visualization
const createLegSegmentMeshes = (
	segments: LegSegment[],
	startPosition: Vector3,
	scene: Scene,
): Mesh[] => {
	let prevPosition = _prevPosition.copy(startPosition); // Need clone to avoid modifying input
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
        (mesh.material as MeshStandardMaterial).dispose();
		mesh.removeFromParent();
	}
};

// Add an easing function for smooth stepping motion
const ease = (x: number): number => {
	return -(Math.cos(Math.PI * x) - 1) / 2;
};

// Add this function to create a stepping pose for the leg
const createSteppingPose = (
    segments: LegSegment[],
    basePosition: Vector3, 
    targetPosition: Vector3,
    stepProgress: number
): LegSegment[] => {
    // Create a copy of the segments to modify
    const steppingSegments: LegSegment[] = [];
    
    // Calculate the step height factor - highest in the middle of the step
    const liftFactor = Math.sin(stepProgress * Math.PI);
    
    // Calculate a lifting vector (elevated and slightly outward)
    const liftDirection = new Vector3(0, 1, 0); // Mainly upward
    
    // Add a slight outward component based on current leg direction
    const baseToTarget = new Vector3().subVectors(targetPosition, basePosition).normalize();
    
    // Outward is perpendicular to both up and base-to-target
    const outwardDirection = new Vector3(0, 0, 1).cross(baseToTarget).normalize();
    
    // Add outward component to lift direction
    liftDirection.add(outwardDirection.multiplyScalar(0.3)).normalize();
    
    // First segment should lift more, second segment a bit, last segment aims at target
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        
        // Calculate segment-specific lifting factor
        let segmentLiftFactor = 0;
        
        if (i === 0) {
            // First segment (connected to body) lifts the most
            segmentLiftFactor = liftFactor * 0.5; // 50% of the max lift
        } else if (i === 1 && segments.length >= 3) {
            // Middle segment lifts a moderate amount
            segmentLiftFactor = liftFactor * 0.3; // 30% of the max lift
        } else {
            // Last segment(s) lift very little - mostly aim for target
            segmentLiftFactor = liftFactor * 0.1; // 10% of the max lift
        }
        
        // Create a blended direction
        const blendedDirection = new Vector3().copy(segment.direction);
        
        // Blend with lift direction based on segment lift factor
        blendedDirection.lerp(liftDirection, segmentLiftFactor).normalize();
        
        // Add this segment to our stepping pose
        steppingSegments.push({
            direction: blendedDirection,
            length: segment.length,
        });
    }
    
    return steppingSegments;
};

type CrawlerProps = RigidBodyProps & {
    legs: LegDef[];
    legsDesiredHeight: number;
    debug?: boolean;
}

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
			legTimer: 0,
			lastPosition: new Vector3(),
			stepCycleTime: 0, // Initialize step cycle time
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

        // move up and down along z axis
        const speed = 1;
        const angle = (performance.now() / 1000) * speed;
        const z = Math.cos(angle) * 2;
        rigidBodyRef.current.setLinvel(
            new Vector3(rigidBodyRef.current.linvel().x, rigidBodyRef.current.linvel().y, z),
            true,
        );

		// /* apply horizontal velocity to move in circle */
		// const speed = 2;
		// const angle = (performance.now() / 1000) * speed;
		// const x = Math.cos(angle) * 2;
		// const z = Math.sin(angle) * 2;
		// rigidBodyRef.current.setLinvel(
		// 	new Vector3(x, rigidBodyRef.current.linvel().y, z),
		// 	true,
		// );
		// rigidBodyRef.current.setAngvel(new Vector3(0, 0, 0), true);
		
		// Update crawlerPosition and check for movement
		_crawlerPosition.copy(rigidBodyRef.current.translation());
		
		// Reset timer if moved significantly
		if (_crawlerPosition.distanceTo(state.lastPosition) > 0.05) {
			state.legTimer = 0;
			state.lastPosition.copy(_crawlerPosition);
		}
		
		// Increment leg timer
		state.legTimer += dt * 2;
		
		// Update step cycle time - this drives the phase-based stepping
		// Speed up or slow down by adjusting the multiplier (0.5 = slower cycle)
		state.stepCycleTime = (state.stepCycleTime + dt * 2) % 1;

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
				// Calculate segment length from total leg length
				const segmentLength = leg.legLength / leg.segments;
				
				// Initialize leg segments with improved initial directions
				const initialSegments: LegSegment[] = [];

				// Create a simple vertical chain pointing down
				const downVector = new Vector3(0, -1, 0);

				for (let i = 0; i < leg.segments; i++) {
					initialSegments.push({
						direction: downVector.clone(),
						length: segmentLength, // Use derived segment length
						position: new Vector3(),
					});
				}

				legState = state.legs[leg.id] = {
					id: leg.id,
					goalPosition: new Vector3(),
					currentPosition: undefined,
					segments: initialSegments,
					stepping: false,
					stepProgress: 1, // Start as "completed step"
				};
			}

			// Calculate the ray origin (the point where the leg attaches to the body)
			_legOrigin.copy(_crawlerPosition);
			_legOrigin.add(_legOffset.set(...leg.offset));
			
			// Calculate the outward stance position by applying the outward offset
			_outwardOffset.set(...leg.outwardOffset);

			// Get hit position on ground, but starting from the outward position
			_rayDirection.set(0, -1, 0);

			// Cast ray from the body position plus the outward offset
			const rayStartPos = _rayOrigin.copy(_crawlerPosition).add(_outwardOffset);

			// Adjust ray origin to be at the same height as the leg attachment
			rayStartPos.y = _legOrigin.y;

			const ray = new Rapier.Ray(rayStartPos, _rayDirection);
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

			// Calculate desired foot position on ground using the outward offset
			_rayWorldHitPosition.copy(_rayDirection).multiplyScalar(distance);
			_rayWorldHitPosition.add(rayStartPos);
			
			// Store this as the ideal/desired foot position
			_desiredFootPosition.copy(_rayWorldHitPosition);

			// Initialize foot position if not set
			if (!legState.currentPosition) {
				legState.currentPosition = _desiredFootPosition.clone();
				legState.goalPosition.copy(_desiredFootPosition);
			}
			
			// Check if we should start a new step
			const distanceToDesired = legState.currentPosition.distanceTo(_desiredFootPosition);
			const distanceToBody = legState.currentPosition.distanceTo(_crawlerPosition);
			const idealDistance = legsDesiredHeight; // This is our ideal leg length
			
			// Spider-like stepping conditions with enhanced phase-based logic
			if (!legState.stepping) {
				// Calculate where we are in the stepping cycle for this leg
				const legPhase = (state.stepCycleTime + leg.phaseOffset) % 1;
				
				// Define the phase "window" where this leg is allowed to step
				const phaseWindowStart = 0;
				const phaseWindowEnd = 0.3; // Allow 30% of the cycle for stepping
				
				// Check if this leg is in its stepping phase window
				const inStepPhase = legPhase >= phaseWindowStart && legPhase <= phaseWindowEnd;
				
				// Determine if leg needs to step based on distance criteria
				const needsToStep = 
					distanceToDesired > 0.5 || // Foot is far from desired position
					distanceToBody > idealDistance * 1.2; // Leg is too stretched
				
				// Only step if we're in the right phase AND the leg needs to step
				if (inStepPhase && needsToStep) {
					// Start a new step
					legState.stepping = true;
					legState.stepProgress = 0;
					legState.goalPosition.copy(_desiredFootPosition);
				}
			}
			
			// Update step progress if stepping
			if (legState.stepping) {
				// Advance step progress
				legState.stepProgress += dt * 3; // Adjust for step speed
				
				if (legState.stepProgress >= 1) {
					// Step complete
					legState.stepProgress = 1;
					legState.stepping = false;
					legState.currentPosition.copy(legState.goalPosition);
				} else {
					// Animate step using easing function
					const easedProgress = ease(legState.stepProgress);
					
					// Interpolate position with easing
					_tempPosition.copy(legState.currentPosition).lerp(legState.goalPosition, easedProgress);
					
					// Add a slight arc during the step
					if (easedProgress > 0 && easedProgress < 1) {
						// Add a vertical component that peaks in the middle of the step
						const arcHeight = 0.1; // Height of the stepping arc
						const arcFactor = Math.sin(easedProgress * Math.PI) * arcHeight;
						_tempPosition.y += arcFactor;
					}
					
					legState.currentPosition.copy(_tempPosition);
				}
			}

			// Apply FABRIK to update segments
			const basePosition = _basePosition.copy(_legOrigin);
			const targetPosition = _targetPosition.copy(legState.currentPosition);

			 // If the leg is stepping, create a pose that's more elevated and outward-pointing
			 let segmentsToUpdate = legState.segments;
        
			 if (legState.stepping && legState.stepProgress > 0 && legState.stepProgress < 1) {
				 // Create a stepping pose that influences the FABRIK calculation
				 segmentsToUpdate = createSteppingPose(
					 legState.segments,
					 basePosition,
					 targetPosition,
					 legState.stepProgress
				 );
			 }

			// Apply FABRIK with potentially modified segments
			const newSegments = twoPassFabrik(
				segmentsToUpdate,
				targetPosition,
				basePosition
			);

			// Smooth between old and new segments
			for (let i = 0; i < legState.segments.length; i++) {
				_tempDirection.copy(legState.segments[i].direction)
					.lerp(newSegments[i].direction, 0.1)
					.normalize();
				
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
					1, // Lower smoothing factor for stability
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
