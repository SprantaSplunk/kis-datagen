// stable pseudo-random value in [0, 1) for an integer, so dot positions do not jump between frames
export function unitNoise(n) {
    const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
}
