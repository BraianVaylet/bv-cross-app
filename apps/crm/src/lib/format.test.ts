import { describe, expect, it } from 'vitest';
import { fmtMoney, fmtPaymentMethod } from './format';

describe('formato de precios (F3-07)', () => {
  it('usa el separador de miles argentino', () => {
    expect(fmtMoney(25_000)).toBe('$25.000');
    expect(fmtMoney(1_250_000)).toBe('$1.250.000');
  });

  it('precios chicos y cero', () => {
    expect(fmtMoney(0)).toBe('$0');
    expect(fmtMoney(999)).toBe('$999');
  });

  it('no muestra centavos: los precios del producto son enteros', () => {
    expect(fmtMoney(25_000.4)).toBe('$25.000');
  });

  it('los medios de pago se leen en castellano', () => {
    expect(fmtPaymentMethod('cash')).toBe('Efectivo');
    expect(fmtPaymentMethod('debit')).toBe('Débito');
    expect(fmtPaymentMethod('transfer')).toBe('Transferencia');
    expect(fmtPaymentMethod('other')).toBe('Otro');
  });
});
