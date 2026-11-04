import { describe, expect, it } from 'vitest';
import { createCanWheelGesture } from '../src/domain/can-wheel';

describe('três acionamentos de rolagem das latas', () => {
  it('conta três notches rápidos do mouse como três ações independentes', () => {
    const gesture = createCanWheelGesture();
    expect([0, 50, 100].map(time => gesture.read(100, 0, time))).toEqual([1, 1, 1]);
    expect(gesture.read(-100, 0, 150)).toBe(-1);
  });

  it('reconhece deltas expressos em linhas ou páginas sem depender do tamanho em pixels', () => {
    const gesture = createCanWheelGesture();
    expect(gesture.read(3, 1, 0)).toBe(1);
    expect(gesture.read(3, 1, 30)).toBe(1);
    expect(gesture.read(-1, 2, 60)).toBe(-1);
  });

  it('agrupa um gesto de trackpad e ignora sua cauda de inércia, mesmo se os deltas aumentarem', () => {
    const gesture = createCanWheelGesture();
    expect([5, 10, 15, 10, 60, 25, 4].map((delta, index) => gesture.read(delta, 0, index * 15)))
      .toEqual([0, 0, 0, 1, 0, 0, 0]);
    expect([5, 15, 20].map((delta, index) => gesture.read(delta, 0, 300 + index * 15)))
      .toEqual([0, 0, 1]);
  });

  it('não avança por movimento minúsculo e não acumula distância entre gestos separados', () => {
    const gesture = createCanWheelGesture();
    expect([2, 3, 4].map((delta, index) => gesture.read(delta, 0, index * 15))).toEqual([0, 0, 0]);
    expect(gesture.read(31, 0, 200)).toBe(0);
    expect(gesture.read(8, 0, 220)).toBe(0);
    expect(gesture.read(1, 0, 240)).toBe(1);
  });

  it('permite desfazer o passo ao inverter o gesto sem liberar a inércia antiga', () => {
    const gesture = createCanWheelGesture();
    expect(gesture.read(20, 0, 0)).toBe(0);
    expect(gesture.read(20, 0, 20)).toBe(1);
    expect(gesture.read(70, 0, 40)).toBe(0);
    expect(gesture.read(-10, 0, 60)).toBe(0);
    expect(gesture.read(-30, 0, 80)).toBe(-1);
    expect(gesture.read(-100, 0, 100)).toBe(0);
  });

  it('ignora entradas inválidas e zeros sem corromper um gesto em andamento', () => {
    const gesture = createCanWheelGesture();
    expect(gesture.read(15, 0, 0)).toBe(0);
    for (const [delta, mode, time] of [[NaN, 0, 10], [Infinity, 0, 10], [0, 0, 1000],
      [100, 3, 10], [100, NaN, 10], [100, 0, NaN], [100, 0, Infinity], [100, 0, -1]]) {
      expect(gesture.read(delta, mode, time)).toBe(0);
    }
    expect(gesture.read(25, 0, 30)).toBe(1);
    expect(gesture.read(100, 0, 40)).toBe(0);
  });

  it('reinicia explicitamente e aceita uma nova origem monotônica do relógio', () => {
    const gesture = createCanWheelGesture();
    expect(gesture.read(20, 0, 500)).toBe(0);
    expect(gesture.read(20, 0, 520)).toBe(1);
    gesture.reset();
    expect(gesture.read(100, 0, 0)).toBe(1);
    expect(gesture.read(15, 0, 1000)).toBe(0);
    expect(gesture.read(100, 0, 0)).toBe(1);
  });
});
