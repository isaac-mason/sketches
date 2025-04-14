import { vec3, mat3, quat } from 'gl-matrix';

export type Vec3 = [number, number, number];

export type Bone = {
	start: Vec3;
	end: Vec3;
	length: number;
	jointConstraint: JointConstraint;
};

const _difference: Vec3 = [0, 0, 0];

export enum JointConstraintType {
	NONE = 0,
	BALL = 1,
}

export type JointConstraint =
	| {
			type: JointConstraintType.NONE;
	  }
	| {
			type: JointConstraintType.BALL;
			rotor: number;
	  };

export const bone = (
	start: Vec3,
	end: Vec3,
	jointConstraint: JointConstraint = { type: JointConstraintType.NONE },
): Bone => {
	// calculate the length of the bone
	vec3.sub(_difference, end, start);
	const length = vec3.length(_difference);

	return {
		start,
		end,
		length,
		jointConstraint,
	};
};

export type Chain = {
	bones: Bone[];
};

const _outerBoneOuterToInnerUV: Vec3 = [0, 0, 0];
const _outerToInnerUV: Vec3 = [0, 0, 0];
const _innerToOuterUV: Vec3 = [0, 0, 0];
const _prevBoneInnerToOuterUV: Vec3 = [0, 0, 0];
const _offset: Vec3 = [0, 0, 0];

const _constraintAxis: Vec3 = [0, 0, 0];
const _constraintRotationQuat = quat.create();
const _constraintRotationMat = mat3.create();

function applyBallConstraint(currentDir: Vec3, referenceDir: Vec3, rotor: number) {
	const angle = vec3.angle(referenceDir, currentDir);
	if (angle > rotor) {
		vec3.cross(_constraintAxis, referenceDir, currentDir);
		vec3.normalize(_constraintAxis, _constraintAxis);

		quat.setAxisAngle(_constraintRotationQuat, _constraintAxis, rotor);
		mat3.fromQuat(_constraintRotationMat, _constraintRotationQuat);

		vec3.transformMat3(currentDir, referenceDir, _constraintRotationMat);
	}
}

/**
 * Forward And Backward Reaching Inverse Kinematics
 */
export const fabrik = (chain: Chain, base: Vec3, target: Vec3) => {
	/* forward pass from end effector to base */

	// loop over all bones in the chain, from the end effector (numBones-1) back to the basebone (0)

	for (let i = chain.bones.length - 1; i >= 0; i--) {
		const bone = chain.bones[i];

		// is this the end effector?
		if (i === chain.bones.length - 1) {
			// this is the end effector

			// snap the end effector's end location to the target
			vec3.copy(bone.end, target);

			// get the UV between the target / end-location (which are now the same) and the start location of this bone
			const outerToInnerUV = _outerToInnerUV;
			vec3.sub(_outerToInnerUV, bone.start, bone.end);
			vec3.normalize(outerToInnerUV, outerToInnerUV);

			// calculate the new start position as:
			// the end location plus the outer-to-inner direction UV multiplied by the length of the bone
			const offset = vec3.scale(_offset, outerToInnerUV, bone.length);
			vec3.add(bone.start, bone.end, offset);

			if (i > 0) {
				// if this is not the base bone, set the end joint location of the previous bone to be the new start location
				const prevBone = chain.bones[i - 1];
				vec3.copy(prevBone.end, bone.start);
			}
		} else {
			// this is not the end effector

			// get the outer-to-inner direction UV of the next bone (further out)
			// TODO: used in constraints ?
			const nextBone = chain.bones[i + 1];
			const outerBoneOuterToInnerUV = _outerBoneOuterToInnerUV;
			vec3.sub(outerBoneOuterToInnerUV, nextBone.start, nextBone.end);
			vec3.normalize(outerBoneOuterToInnerUV, outerBoneOuterToInnerUV);

			// get the outer-to-inner direction UV of this bone
			const outerToInnerUV = _outerToInnerUV;
			vec3.sub(outerToInnerUV, bone.start, bone.end);
			vec3.normalize(outerToInnerUV, outerToInnerUV);

			// constraints
			if (bone.jointConstraint.type === JointConstraintType.BALL) {
				applyBallConstraint(outerToInnerUV, outerBoneOuterToInnerUV, bone.jointConstraint.rotor);
			}

			// set the new inner joint location to be the end joint location of this bone plus the
			// outer-to-inner direction unit vector multiplied by the length of the bone.
			// const offset = vec3.multiplyScalar(outerToInnerUV, bone.length, _offset);
			const offset = vec3.scale(_offset, outerToInnerUV, bone.length);
			vec3.add(bone.start, bone.end, offset);

			// if we are not the base bone, also set the end joint locatio of the previous bone to be the new start location
			// ie the bone closer to the base
			if (i > 0) {
				const prevBone = chain.bones[i - 1];
				vec3.copy(prevBone.end, bone.start);
			}
		}
	}

	/* backward pass from base to end effector */
	for (let i = 0; i < chain.bones.length; i++) {
		const bone = chain.bones[i];

		// is this the base bone?
		if (i === 0) {
			// this is the base bone

			// const fixedBase = true;
			// if (fixedBase) {

			// if the base is fixed, set the start location to be the root
			vec3.copy(bone.start, base);

			// } else {
			//     // TODO: verify this is correct, untested
			//     // otherwise project it backawrds from the end to the start by its length
			//     const innerToOuterUV = vec3.directionBetween(bone.end, bone.start, _innerToOuterUV);
			//     const offset = vec3.multiplyScalar(innerToOuterUV, bone.length, _offset);
			//     vec3.sub(bone.end, offset, bone.start);
			// }

			// get the inner-to-outer direction of this bone
			const innerToOuterUV = _innerToOuterUV;
			vec3.sub(innerToOuterUV, bone.end, bone.start);
			vec3.normalize(innerToOuterUV, innerToOuterUV);


			// Set the new end location of this bone
			const offset = vec3.scale(_offset, innerToOuterUV, bone.length);
			vec3.add(bone.end, bone.start, offset);

			// if there are more bones, then set the start location of the next bone to be the end location of this bone
			if (i < chain.bones.length - 1) {
				const nextBone = chain.bones[i + 1];
				vec3.copy(nextBone.start, bone.end);
			}
		} else {
			// this is not the base bone

			// get the inner-to-outer direction UV of this bone and the previous bone to use as a baseline
			const innerToOuterUV = _innerToOuterUV;
			vec3.sub(innerToOuterUV, bone.end, bone.start);
			vec3.normalize(innerToOuterUV, innerToOuterUV);

			const prevBone = chain.bones[i - 1];
			const prevBoneInnerToOuterUV = _prevBoneInnerToOuterUV;
			vec3.sub(prevBoneInnerToOuterUV, prevBone.end, prevBone.start);
			vec3.normalize(prevBoneInnerToOuterUV, prevBoneInnerToOuterUV);

			// constraints
			if (bone.jointConstraint.type === JointConstraintType.BALL) {
				applyBallConstraint(innerToOuterUV, prevBoneInnerToOuterUV, bone.jointConstraint.rotor);
			}


			// TODO: used in constraints ?
			// const prevBoneInnerToOuterUV = vec3.directionBetween(bone.end, bone.start, [0, 0, 0]);

			const offset = vec3.scale(_offset, innerToOuterUV, bone.length);
			vec3.add(bone.end, bone.start, offset);

			if (i < chain.bones.length - 1) {
				// if this is not the last bone / end effector, set the start joint location of the next bone to be the new end location
				const nextBone = chain.bones[i + 1];
				vec3.copy(nextBone.start, bone.end);
			}
		}
	}
};

export const fabrikFixedIterations = (
	chain: Chain,
	base: Vec3,
	target: Vec3,
	iterations: number,
) => {
	for (let i = 0; i < iterations; i++) {
		fabrik(chain, base, target);
	}
};

// TODO: fabrikSolver with max iterations, threshold, "best solution" logic
