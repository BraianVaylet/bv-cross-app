import type {
  BookingStatus,
  ExerciseScope,
  ExerciseType,
  MembershipStatus,
  OrgStatus,
  PackAssignmentStatus,
  PaymentMethod,
  Role,
  SessionStatus,
} from '@bv/contracts';
import type { ObjectId } from 'mongodb';

/**
 * Tipos de DOCUMENTO internos (docs/02-arquitectura.md §4).
 * Nunca se exponen: los DTOs de @bv/contracts son la cara pública (toDto()).
 */

export interface UserDoc {
  _id: ObjectId;
  email: string; // lowercase
  emailVerifiedAt: Date | null;
  name: string;
  phone?: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationDoc {
  _id: ObjectId;
  name: string;
  slug: string;
  joinCode: string; // RN-01, lowercase
  timezone: string; // IANA
  settings: {
    cancellationWindowHours: number; // RN-08
    sessionGenerationDays: number; // RN-05
  };
  status: OrgStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface MembershipDoc {
  _id: ObjectId;
  orgId: ObjectId;
  userId: ObjectId | null; // null mientras es pre-carga 'invited'
  role: Role;
  status: MembershipStatus;
  profile: {
    displayName?: string;
    phone?: string;
    emergencyContact?: string;
    birthdate?: string; // YYYY-MM-DD
  };
  adminNotes?: string; // solo DTOs del CRM (docs/05-seguridad.md §4)
  invitedEmail?: string; // lowercase, para vincular al registrarse (F2 funcional)
  joinedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshTokenDoc {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string; // SHA-256; jamás el token en claro
  familyId: ObjectId; // detección de reuso (rotación, DEC-04)
  expiresAt: Date;
  revokedAt?: Date;
  /**
   * Sucesor que lo reemplazó al rotar. Solo lo escribe la rotación: distingue
   * "revocado porque ya rotó" de "revocado por logout o por reuso", y habilita
   * la ventana de gracia de refresh concurrente (F4-03).
   */
  replacedBy?: ObjectId;
  createdAt: Date;
  userAgent?: string;
  ip?: string;
}

export interface ExerciseDoc {
  _id: ObjectId;
  scope: ExerciseScope;
  orgId: ObjectId | null; // requerido si scope='org'
  ownerUserId: ObjectId | null; // requerido si scope='personal' (RN-20/21)
  name: string;
  discipline?: string;
  type: ExerciseType; // RN-23
  imageUrl?: string;
  notes?: string;
  archivedAt?: Date; // RN-19
  createdAt: Date;
  updatedAt: Date;
}

export interface RmEntryDoc {
  _id: ObjectId;
  exerciseId: ObjectId;
  userId: ObjectId;
  orgId: ObjectId | null; // org del contexto si el ejercicio es de catálogo (RN-21)
  kg?: number;
  reps?: number; // exactamente uno (RN-23)
  date: string; // YYYY-MM-DD (fecha de calendario, decisión v1)
  comment?: string;
  painFlag?: boolean;
  createdAt: Date;
}

export interface ClassTemplateDoc {
  _id: ObjectId;
  orgId: ObjectId;
  weekday: number; // 0=domingo, en timezone de la org
  startTime: string; // HH:mm hora local de la org
  durationMin: number;
  discipline: string;
  description?: string;
  capacity: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassSessionDoc {
  _id: ObjectId;
  orgId: ObjectId;
  templateId: ObjectId | null; // null = sesión manual
  startsAt: Date; // UTC
  endsAt: Date;
  discipline: string;
  description?: string;
  capacity: number;
  bookedCount: number; // DEC-08, mantenido atómicamente
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PackDoc {
  _id: ObjectId;
  orgId: ObjectId;
  name: string;
  classCount: number;
  durationDays: number;
  price: number; // ARS enteros
  currency: 'ARS';
  paymentMethod: PaymentMethod;
  internalNotes?: string;
  archivedAt?: Date; // RN-15
  createdAt: Date;
  updatedAt: Date;
}

export interface PackAssignmentDoc {
  _id: ObjectId;
  orgId: ObjectId;
  userId: ObjectId;
  packId: ObjectId;
  snapshot: {
    // RN-16: inmutable desde la creación
    name: string;
    classCount: number;
    durationDays: number;
    price: number;
    currency: 'ARS';
    paymentMethod: PaymentMethod;
  };
  startsAt: Date;
  expiresAt: Date; // RN-18
  classesUsed: number; // DEC-08
  status: PackAssignmentStatus;
  payment: {
    amount: number;
    method: PaymentMethod;
    paidAt: Date;
    notes?: string;
  };
  cancelledReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookingDoc {
  _id: ObjectId;
  orgId: ObjectId;
  sessionId: ObjectId;
  userId: ObjectId;
  packAssignmentId: ObjectId;
  status: BookingStatus;
  bookedAt: Date;
  cancelledAt?: Date;
}

export interface EmailTokenDoc {
  _id: ObjectId;
  userId: ObjectId;
  purpose: 'verify' | 'reset';
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

export interface RateLimitDoc {
  _id: string; // '<scope>:<key>:<windowStart>'
  count: number;
  expiresAt: Date; // TTL
}
