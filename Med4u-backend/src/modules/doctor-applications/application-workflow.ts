import {
  DoctorApplicationStatus as S,
  REVIEW_TARGET_HOURS,
} from '../../database/entities/doctor-application.entity';

/**
 * Pure rules for the application life cycle, kept free of I/O so they can be tested exhaustively.
 * There is deliberately NO time-based transition: a deadline can mark an application overdue, never decide it.
 */

/** Which statuses a REVIEWER may move an application out of. */
const REVIEWABLE: ReadonlySet<S> = new Set([S.PENDING_VERIFICATION, S.UNDER_REVIEW]);

export const canReview = (status: S): boolean => REVIEWABLE.has(status);

/** Starting a review is only meaningful from PENDING_VERIFICATION. */
export const canStartReview = (status: S): boolean => status === S.PENDING_VERIFICATION;

export function canResubmit(status: S, resubmissionAllowed: boolean): boolean {
  return status === S.NEEDS_INFO || (status === S.REJECTED && resubmissionAllowed);
}

export function computeReviewDeadline(submittedAt: Date): Date {
  return new Date(submittedAt.getTime() + REVIEW_TARGET_HOURS * 60 * 60 * 1000);
}

/** True once the 24-hour target has passed while the application still waits for a reviewer. */
export function isReviewOverdue(status: S, reviewDeadlineAt: Date, now: Date = new Date()): boolean {
  return canReview(status) && now.getTime() > reviewDeadlineAt.getTime();
}

export const STATUS_LABEL: Record<S, string> = {
  [S.PENDING_VERIFICATION]: 'Pending',
  [S.UNDER_REVIEW]: 'Under Review',
  [S.NEEDS_INFO]: 'More information needed',
  [S.APPROVED]: 'Approved',
  [S.REJECTED]: 'Rejected',
};

export const REVIEW_TARGET_NOTE =
  'We aim to review applications within 24 hours of submission. This is a target, not a guarantee, ' +
  'and a review does not guarantee approval.';
