import { describe, expect, it } from 'vitest';
import { CAN_SCROLL_STEPS, CAN_WOBBLE_PHASES, canTiltX, canTiltY, canTiltZ, orbitProgressFromBounds } from '../src/domain/orbit';

describe('elipse sincronizada das quatro latas em três acionamentos', () => {
  it('reconcilia a posição após expandir a prévia, sem depender de um novo scroll', () => {
    expect(orbitProgressFromBounds(100, 1700, 1000)).toBe(0);
    expect(orbitProgressFromBounds(-350, 1700, 1000)).toBe(.5);
    expect(orbitProgressFromBounds(-700, 1700, 1000)).toBe(1);
    expect(orbitProgressFromBounds(-900, 1700, 1000)).toBe(1);
    expect(orbitProgressFromBounds(0, 400, 800)).toBe(0);
    expect(orbitProgressFromBounds(Number.NaN, 1700, 1000)).toBe(0);
  });
  it('começa e termina neutro e limita progresso inválido sem giros completos', () => {
    for (const phase of CAN_WOBBLE_PHASES) for (const tilt of [canTiltX, canTiltY, canTiltZ]) {
      for (const progress of [-1, 0, 1, 2, Number.NaN, Number.POSITIVE_INFINITY]) expect(Math.abs(tilt(progress, phase))).toBe(0);
      expect(Math.abs(tilt(.001, phase))).toBeLessThan(.2);
      expect(Math.abs(tilt(.999, phase))).toBeLessThan(.2);
    }
  });
  it('mantém a frente predominante e limita inclinações sem saltos na rolagem', () => {
    for (const phase of CAN_WOBBLE_PHASES) {
      let previous = [0, 0, 0];
      for (let step = 0; step <= 100; step++) {
        const progress = step / 100;
        const current = [canTiltX(progress, phase), canTiltY(progress, phase), canTiltZ(progress, phase)];
        expect(Math.abs(current[0])).toBeLessThanOrEqual(6);
        expect(Math.abs(current[1])).toBeLessThan(30.03);
        expect(Math.abs(current[2])).toBeLessThanOrEqual(1);
        const frontFacing = Math.cos(current[0] * Math.PI / 180) * Math.cos(current[1] * Math.PI / 180);
        expect(frontFacing).toBeGreaterThan(.85);
        for (let axis = 0; axis < 3; axis++) {
          expect(Number.isFinite(current[axis])).toBe(true);
          expect(Math.abs(current[axis] - previous[axis])).toBeLessThan(1.9);
        }
        previous = current;
      }
    }
  });
  it('mostra a lateral esquerda, depois a direita e retorna à posição inicial no terceiro acionamento', () => {
    expect(CAN_SCROLL_STEPS).toBe(3);
    const left = 1 / CAN_SCROLL_STEPS, right = 2 / CAN_SCROLL_STEPS;
    expect(canTiltY(left)).toBeCloseTo(26, 10);
    expect(canTiltY(right)).toBeCloseTo(-26, 10);
    expect(canTiltX(left)).toBeCloseTo(4.5, 10);
    expect(canTiltX(right)).toBeCloseTo(4.5, 10);
    expect(canTiltZ(left)).toBeCloseTo(-canTiltZ(right), 10);
    for (const tilt of [canTiltX, canTiltY, canTiltZ]) expect(tilt(1)).toBe(0);
  });
  it('percorre uma elipse angular contínua com as quatro latas uniformes', () => {
    const yawRadius = 26 / Math.sin(Math.PI * 2 / 3);
    for (let step = 0; step <= 200; step++) {
      const progress = step / 200;
      const x = canTiltX(progress), y = canTiltY(progress);
      // A true ellipse in angular space, with no positional orbit of the pivot.
      expect(((x - 3) / 3) ** 2 + (y / yawRadius) ** 2).toBeCloseTo(1, 10);
      const poses = CAN_WOBBLE_PHASES.map(phase => [canTiltX(progress, phase), canTiltY(progress, phase), canTiltZ(progress, phase)]);
      for (const pose of poses) expect(pose).toEqual(poses[0]);
      for (const tilt of [canTiltX, canTiltY, canTiltZ]) expect(tilt(progress, .24)).toBe(tilt(progress, -.24));
    }
  });
  it('voltar ao mesmo ponto de rolagem retorna exatamente à mesma posição, sem tempo ou inércia', () => {
    for (const phase of CAN_WOBBLE_PHASES) for (const tilt of [canTiltX, canTiltY, canTiltZ]) {
      const samples = [.2, .8, .2].map(progress => tilt(progress, phase));
      expect(samples[0]).toBe(samples[2]);
    }
  });
});
