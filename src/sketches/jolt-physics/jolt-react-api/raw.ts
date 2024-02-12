import type Jolt from 'jolt-physics';

export const Raw = { module: null! as typeof Jolt };

export const free = (value: unknown) => {
  Raw.module.destroy(value);
};

export const initJolt = async (jolt?: typeof Jolt) => {
  if (Raw.module !== null) return;

  if (jolt) {
    Raw.module = await jolt();
  } else {
    const joltInit = await import('jolt-physics');
    Raw.module = await joltInit.default();
  }
};
