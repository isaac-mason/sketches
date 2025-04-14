import { vec3, type Vec3 } from "./vec3";

// TODO!
// https://github.com/lo-th/fullik/blob/gh-pages/src/core/Chain3D.js

export type Bone = {
    start: Vec3;
    end: Vec3;
    length: number;
};

const _difference: Vec3 = [0, 0, 0];

export const bone = (start: Vec3, end: Vec3): Bone => {
    // calculate the length of the bone
    vec3.sub(end, start, _difference);
    const length = vec3.length(_difference);

    return {
        start,
        end,
        length
    }
}

export type Chain = {
    bones: Bone[];
}

/**
 * Forward And Backward Reaching Inverse Kinematics
 */
export const fabrik = (
    chain: Chain,
    base: Vec3,
    target: Vec3,
) => {
    /* forward pass from end effector to base */

    // loop over all bones in the chain, from the end effector (numBones-1) back to the basebone (0) 

    for (let i = chain.bones.length - 1; i >= 0; i--) {
        const bone = chain.bones[i];

        // is this the end effector?
        if (i === chain.bones.length - 1) {
            // this is the end effector

            // snap the end effector's end location to the target
            vec3.copy(target, bone.end);

            // get the UV between the target / end-location (which are now the same) and the start location of this bone
            const outerToInnerUV = vec3.directionBetween(bone.start, bone.end, [0, 0, 0]);

            // calculate the new start position as:
            // the end location plus the outer-to-inner direction UV multiplied by the length of the bone
            const outerToInnerDirectionLengthOffset = vec3.multiplyScalar(outerToInnerUV, bone.length, [0, 0, 0]);
            const newStartLocation = vec3.add(bone.end, outerToInnerDirectionLengthOffset, [0, 0, 0]);

            vec3.copy(newStartLocation, bone.start);

            if (i > 0) {
                // if this is not the base bone, set the end joint location of the previous bone to be the new start location
                const prevBone = chain.bones[i - 1];
                vec3.copy(newStartLocation, prevBone.end);
            }
        } else {
            // this is not the end effector

            // get the outer-to-inner direction UV of the next bone (further out)
            // TODO: used in constraints ?
            // const nextBone = chain.bones[i + 1];
            // const outerBoneOuterToInnerUV = vec3.directionBetween(nextBone.start, nextBone.end, [0, 0, 0]);


            // get the outer-to-inner direction UV of this bone
            const boneOuterToInnerUV = vec3.directionBetween(bone.start, bone.end, [0, 0, 0]);

            // set the new inner joint location to be the end joint location of this bone plus the
            // outer-to-inner direction unit vector multiplied by the length of the bone.
            const boneOuterDirectionLengthOffset = vec3.multiplyScalar(boneOuterToInnerUV, bone.length, [0, 0, 0]);
            const newStartLocation = vec3.add(bone.end, boneOuterDirectionLengthOffset, [0, 0, 0]);
            
            vec3.copy(newStartLocation, bone.start);

            // if we are not the base bone, also set the end joint locatio of the previous bone to be the new start location
            // ie the bone closer to the base
            if (i > 0) {
                const prevBone = chain.bones[i - 1];
                vec3.copy(newStartLocation, prevBone.end);
            }
        }
    }

    /* backward pass from base to end effector */
    for (let i = 0; i < chain.bones.length; i++) {
        const bone = chain.bones[i];

        // is this the base bone?
        if (i === 0) {
            // this is the base bone
            
            
            const fixedBase = true;
            if (fixedBase) {
                // if the base is fixed, set the start location to be the root
                vec3.copy(base, bone.start);
            } else {
                // TODO: verify this is correct, untested
                // otherwise project it backawrds from the end to the start by its length
                const boneInnerToOuterUV = vec3.directionBetween(bone.end, bone.start, [0, 0, 0]);
                const offset = vec3.multiplyScalar(boneInnerToOuterUV, bone.length, [0, 0, 0]);
                vec3.sub(bone.end, offset, bone.start);
            }

            // get the inner-to-outer direction of this bone
            const boneInnerToOuterUV = vec3.directionBetween(bone.end, bone.start, [0, 0, 0]);

            // Set the new end location of this bone
            const offset = vec3.multiplyScalar(boneInnerToOuterUV, bone.length, [0, 0, 0]);
            const newEndLocation = vec3.add(bone.start, offset, [0, 0, 0]);
            vec3.copy(newEndLocation, bone.end);
            
            // if there are more bones, then set the start location of the next bone to be the end location of this bone
            if (i < chain.bones.length - 1) {
                const nextBone = chain.bones[i + 1];
                vec3.copy(newEndLocation, nextBone.start);
            }

        } else {
            // this is not the base bone

            // get the inner-to-outer direction UV of this bone and the previous bone to use as a baseline
            const boneInnerToOuterUV = vec3.directionBetween(bone.end, bone.start, [0, 0, 0]);
            
            // TODO: used in constraints ?
            // const prevBoneInnerToOuterUV = vec3.directionBetween(bone.end, bone.start, [0, 0, 0]);

            const offset = vec3.multiplyScalar(boneInnerToOuterUV, bone.length, [0, 0, 0]);
            const newEndLocation = vec3.add(bone.start, offset, [0, 0, 0]);

            // set the new start joint location for this bone
            vec3.copy(newEndLocation, bone.end);

            if (i < chain.bones.length - 1) {
                // if this is not the last bone / end effector, set the start joint location of the next bone to be the new end location
                const nextBone = chain.bones[i + 1];
                vec3.copy(newEndLocation, nextBone.start);
            }
        }
    }

    // TODO: if using in a "best solution solver" return the last target location an the distance between the current effector and the target?
}

export const fabrikFixedIterations = (chain: Chain, base: Vec3, target: Vec3, iterations: number) => {
    for (let i = 0; i < iterations; i++) {
        fabrik(chain, base, target);
    }
}

// TODO: fabrikSolver with max iterations, threshold, "best solution" logic