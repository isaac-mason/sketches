import { type BufferAttribute, type Mesh, Vector3 } from 'three';

const _position = new Vector3();

export const getPositionsAndIndices = (
  meshes: Mesh[],
): [positions: Float32Array, indices: Uint32Array] => {
  const toMerge: {
    positions: ArrayLike<number>;
    indices: ArrayLike<number>;
  }[] = [];

  for (const mesh of meshes) {
    const positionAttribute = mesh.geometry.attributes
      .position as BufferAttribute;

    if (!positionAttribute || positionAttribute.itemSize !== 3) {
      continue;
    }

    mesh.updateMatrixWorld();

    const positions = new Float32Array(positionAttribute.array);

    for (let i = 0; i < positions.length; i += 3) {
      const pos = _position.set(
        positions[i],
        positions[i + 1],
        positions[i + 2],
      );
      mesh.localToWorld(pos);
      positions[i] = pos.x;
      positions[i + 1] = pos.y;
      positions[i + 2] = pos.z;
    }

    let indices: ArrayLike<number> | undefined =
      mesh.geometry.getIndex()?.array;

    if (indices === undefined) {
      // this will become indexed when merging with other meshes
      const ascendingIndex: number[] = [];
      for (let i = 0; i < positionAttribute.count; i++) {
        ascendingIndex.push(i);
      }
      indices = ascendingIndex;
    }

    toMerge.push({
      positions,
      indices,
    });
  }

  return mergePositionsAndIndices(toMerge);
};


export const mergePositionsAndIndices = (
  meshes: Array<{
    positions: ArrayLike<number>;
    indices: ArrayLike<number>;
  }>,
): [Float32Array, Uint32Array] => {
  const mergedPositions: number[] = [];
  const mergedIndices: number[] = [];

  const positionToIndex: { [hash: string]: number } = {};
  let indexCounter = 0;

  for (const { positions, indices } of meshes) {
    for (let i = 0; i < indices.length; i++) {
      const pt = indices[i] * 3;

      const x = positions[pt];
      const y = positions[pt + 1];
      const z = positions[pt + 2];

      const key = `${x}_${y}_${z}`;
      let idx = positionToIndex[key];

      if (!idx) {
        positionToIndex[key] = idx = indexCounter;
        mergedPositions.push(x, y, z);
        indexCounter++;
      }

      mergedIndices.push(idx);
    }
  }

  return [Float32Array.from(mergedPositions), Uint32Array.from(mergedIndices)];
};

