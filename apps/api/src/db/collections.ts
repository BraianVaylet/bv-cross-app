import type { Collection } from 'mongodb';
import { getDb } from './client.js';
import type {
  BookingDoc,
  ClassSessionDoc,
  ClassTemplateDoc,
  EmailTokenDoc,
  ExerciseDoc,
  MembershipDoc,
  OrganizationDoc,
  PackAssignmentDoc,
  PackDoc,
  RateLimitDoc,
  RefreshTokenDoc,
  RmEntryDoc,
  UserDoc,
} from './types.js';

// Getters tipados: la única forma de acceder a una colección
// (nombres camelCase plural — docs/03-tecnico.md §5).

export const users = (): Collection<UserDoc> => getDb().collection('users');
export const organizations = (): Collection<OrganizationDoc> => getDb().collection('organizations');
export const memberships = (): Collection<MembershipDoc> => getDb().collection('memberships');
export const refreshTokens = (): Collection<RefreshTokenDoc> => getDb().collection('refreshTokens');
export const exercises = (): Collection<ExerciseDoc> => getDb().collection('exercises');
export const rmEntries = (): Collection<RmEntryDoc> => getDb().collection('rmEntries');
export const classTemplates = (): Collection<ClassTemplateDoc> =>
  getDb().collection('classTemplates');
export const classSessions = (): Collection<ClassSessionDoc> => getDb().collection('classSessions');
export const packs = (): Collection<PackDoc> => getDb().collection('packs');
export const packAssignments = (): Collection<PackAssignmentDoc> =>
  getDb().collection('packAssignments');
export const bookings = (): Collection<BookingDoc> => getDb().collection('bookings');
export const emailTokens = (): Collection<EmailTokenDoc> => getDb().collection('emailTokens');
export const rateLimits = (): Collection<RateLimitDoc> => getDb().collection('rateLimits');
