-- Walk-in / unscheduled patients sit in WAITING until checked in.
-- Not part of ACTIVE_STATUSES, so they do not block provider slots.
ALTER TYPE "AppointmentStatus" ADD VALUE 'WAITING';
