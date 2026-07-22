import type { PaymentMethod } from '@bv/contracts';

const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/** 25000 → "$25.000". Los precios del producto son enteros en pesos. */
export function fmtMoney(value: number): string {
  return `$${money.format(value)}`;
}

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  debit: 'Débito',
  transfer: 'Transferencia',
  other: 'Otro',
};

export function fmtPaymentMethod(method: PaymentMethod): string {
  return PAYMENT_LABEL[method];
}
