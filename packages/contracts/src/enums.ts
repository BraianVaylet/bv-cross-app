import { z } from 'zod';

// Valores EXACTOS de docs/02-arquitectura.md §4. Cambiar uno publicado = breaking + migración de datos.

export const role = z.enum(['owner', 'admin', 'coach', 'athlete']);
export type Role = z.infer<typeof role>;

export const membershipStatus = z.enum(['invited', 'active', 'disabled']);
export type MembershipStatus = z.infer<typeof membershipStatus>;

export const exerciseType = z.enum(['weight', 'reps']);
export type ExerciseType = z.infer<typeof exerciseType>;

export const exerciseScope = z.enum(['org', 'personal']);
export type ExerciseScope = z.infer<typeof exerciseScope>;

export const packAssignmentStatus = z.enum(['active', 'exhausted', 'expired', 'cancelled']);
export type PackAssignmentStatus = z.infer<typeof packAssignmentStatus>;

export const bookingStatus = z.enum([
  'booked',
  'cancelled_by_user',
  'cancelled_by_gym',
  'attended',
  'no_show',
]);
export type BookingStatus = z.infer<typeof bookingStatus>;

export const paymentMethod = z.enum(['cash', 'debit', 'transfer', 'other']);
export type PaymentMethod = z.infer<typeof paymentMethod>;

export const sessionStatus = z.enum(['scheduled', 'cancelled']);
export type SessionStatus = z.infer<typeof sessionStatus>;

export const orgStatus = z.enum(['active', 'suspended']);
export type OrgStatus = z.infer<typeof orgStatus>;
