import { vec2, mat2 } from 'maaths';

export type Vec2 = [number, number];

export type Bone = {
	start: Vec2;
	end: Vec2;
	length: number;
	jointConstraint: JointConstraint;
};

const _difference: Vec2 = [0, 0];

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
	start: Vec2,
	end: Vec2,
	jointConstraint: JointConstraint = { type: JointConstraintType.NONE },
): Bone => {
	// calculate the length of the bone
	vec2.sub(_difference, end, start);
	const length = vec2.length(_difference);

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

const _outerBoneOuterToInnerUV: Vec2 = [0, 0];
const _outerToInnerUV: Vec2 = [0, 0];
const _offset: Vec2 = [0, 0];

const _constraintRotationMat = mat2.create();

function applyBallConstraint(
	currentDir: Vec2,
	referenceDir: Vec2,
	rotor: number,
) {
	const angle = vec2.angle(referenceDir, currentDir);
	if (angle > rotor) {
		// determine rotation sign (Z of cross)
		const crossZ =
			referenceDir[0] * currentDir[1] - referenceDir[1] * currentDir[0];
		const sign = crossZ >= 0 ? 1 : -1;
		mat2.fromRotation(_constraintRotationMat, rotor * sign);
		vec2.transformMat2(currentDir, referenceDir, _constraintRotationMat);
	}
}

/**
 * Approach is derived from "Forward And Backward Reaching Inverse Kinematics", but only the forward pass is done, no backward pass.
 */
export const fabrikForwardPass = (chain: Chain, target: Vec2) => {
	/* forward pass from end effector to base */

	// loop over all bones in the chain, from the end effector (numBones-1) back to the basebone (0)

	for (let i = chain.bones.length - 1; i >= 0; i--) {
		const bone = chain.bones[i];

		// is this the end effector?
		if (i === chain.bones.length - 1) {
			// this is the end effector

			// snap the end effector's end location to the target
			vec2.copy(bone.end, target);

			// get the UV between the target / end-location (which are now the same) and the start location of this bone
			const outerToInnerUV = _outerToInnerUV;
			vec2.sub(_outerToInnerUV, bone.start, bone.end);
			vec2.normalize(outerToInnerUV, outerToInnerUV);

			// calculate the new start position as:
			// the end location plus the outer-to-inner direction UV multiplied by the length of the bone
			vec2.scale(_offset, outerToInnerUV, bone.length);
			vec2.add(bone.start, bone.end, _offset);

			if (i > 0) {
				// if this is not the base bone, set the end joint location of the previous bone to be the new start location
				const prevBone = chain.bones[i - 1];
				vec2.copy(prevBone.end, bone.start);
			}
		} else {
			// this is not the end effector

			// get the outer-to-inner direction UV of the next bone (further out)
			// TODO: used in constraints ?
			const nextBone = chain.bones[i + 1];
			const outerBoneOuterToInnerUV = _outerBoneOuterToInnerUV;
			vec2.sub(outerBoneOuterToInnerUV, nextBone.start, nextBone.end);
			vec2.normalize(outerBoneOuterToInnerUV, outerBoneOuterToInnerUV);

			// get the outer-to-inner direction UV of this bone
			const outerToInnerUV = _outerToInnerUV;
			vec2.sub(outerToInnerUV, bone.start, bone.end);
			vec2.normalize(outerToInnerUV, outerToInnerUV);

			// constraints
			if (bone.jointConstraint.type === JointConstraintType.BALL) {
				applyBallConstraint(
					outerToInnerUV,
					outerBoneOuterToInnerUV,
					bone.jointConstraint.rotor,
				);
			}

			// set the new inner joint location to be the end joint location of this bone plus the
			// outer-to-inner direction unit vector multiplied by the length of the bone.
			vec2.scale(_offset, outerToInnerUV, bone.length);
			vec2.add(bone.start, bone.end, _offset);

			// if we are not the base bone, also set the end joint locatio of the previous bone to be the new start location
			// ie the bone closer to the base
			if (i > 0) {
				const prevBone = chain.bones[i - 1];
				vec2.copy(prevBone.end, bone.start);
			}
		}
	}
};

export const fabrikForwardPassFixedIterations = (
	chain: Chain,
	target: Vec2,
	iterations: number,
) => {
	for (let i = 0; i < iterations; i++) {
		fabrikForwardPass(chain, target);
	}
};

// TODO: fabrikSolver with max iterations, threshold, "best solution" logic
