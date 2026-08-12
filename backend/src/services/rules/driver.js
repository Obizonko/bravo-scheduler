'use strict';

const time = require('../../domain/time');
const { finding } = require('./codes');
const quota = require('./quota');
const rulesConfig = require('../../config/rules');

function isStaticService(serviceType) {
  return rulesConfig.serviceGroups.static.includes(serviceType);
}

function isTripService(serviceType) {
  return serviceType === 'Поїздка';
}

/** DRIVER_ON_STATIC_DURING_TRIP: жорсткий блок лише при РЕАЛЬНОМУ перетині з власним виїздом кандидата. */
function checkDriverStaticDuringTrip(context, candidate, user, shift, candidateInterval) {
  if (!isStaticService(shift.service_type) || !candidateInterval) return [];

  const ownTrips = (context.schedulesByUserId.get(candidate.user_id) || []).filter((r) => {
    if (r.status === 'Completed') return false;
    const otherShift = context.shiftsById.get(r.shift_id);
    return otherShift && isTripService(otherShift.service_type);
  });

  const tripShiftIds = [];
  for (const record of ownTrips) {
    const otherInterval = context.intervalByShiftId.get(record.shift_id);
    if (otherInterval && time.overlaps(candidateInterval, otherInterval)) {
      tripShiftIds.push(record.shift_id);
    }
  }

  if (tripShiftIds.length === 0) return [];
  return [
    finding('DRIVER_ON_STATIC_DURING_TRIP', {
      user_id: candidate.user_id,
      shift_id: candidate.shift_id,
      trip_shift_ids: tripShiftIds,
    }),
  ];
}

/** QUIET_HOUR_DRIVER_UNPAIRED: тиха/all_hands зміна (allowDriverPair), серед усіх призначених немає жодного не-водія. */
function checkQuietHourPairing(context, candidate, shift) {
  if (!isStaticService(shift.service_type) || !rulesConfig.driver.quietHourPairingRequired) return [];

  const q = quota.deriveQuota(context, shift);
  if (!q.allowDriverPair) return [];

  const existing = (context.schedulesByShiftId.get(candidate.shift_id) || []).filter(
    (r) => r.status !== 'Completed' && r.user_id !== candidate.user_id
  );
  const hasNonDriverAssignee = existing.some((r) => {
    const u = context.usersById.get(r.user_id);
    return u && !u.is_driver;
  });
  if (hasNonDriverAssignee) return [];

  return [finding('QUIET_HOUR_DRIVER_UNPAIRED', { user_id: candidate.user_id, shift_id: candidate.shift_id })];
}

/**
 * DRIVER_RESERVED_FOR_TRIP: попередження, коли призначення кандидата (водія) на
 * СТАЦІОНАРНЕ чергування вибуло б з "вільного пулу" водіїв нижче за кількість ще
 * непокритих виїздів, що перетинаються за часом. Навмисно вузький жорсткий блок
 * (DRIVER_ON_STATIC_DURING_TRIP) - тут лише попередження, бо блокувати ВСІХ
 * водіїв через один виїзд зробило б інструмент непридатним для використання.
 */
function checkDriverReservation(context, candidate, user, shift, candidateInterval) {
  if (isTripService(shift.service_type) || !candidateInterval) return [];

  const overlappingTrips = context.shifts.filter((s) => {
    if (!isTripService(s.service_type)) return false;
    const interval = context.intervalByShiftId.get(s.shift_id);
    return interval && time.overlaps(candidateInterval, interval);
  });
  if (overlappingTrips.length === 0) return [];

  const unstaffedTrips = overlappingTrips.filter((s) => {
    const assignees = (context.schedulesByShiftId.get(s.shift_id) || []).filter((r) => r.status !== 'Completed');
    return !assignees.some((r) => {
      const u = context.usersById.get(r.user_id);
      return u && u.is_driver;
    });
  });
  if (unstaffedTrips.length === 0) return [];

  const allDrivers = [...context.usersById.values()].filter((u) => u.is_driver);
  const freeDrivers = allDrivers.filter((driver) => {
    if (driver.user_id === candidate.user_id) return false; // кандидат щойно зайняв стаціонарну зміну
    const records = (context.schedulesByUserId.get(driver.user_id) || []).filter((r) => r.status !== 'Completed');
    return !records.some((r) => {
      const interval = context.intervalByShiftId.get(r.shift_id);
      return interval && time.overlaps(candidateInterval, interval);
    });
  });

  if (freeDrivers.length >= unstaffedTrips.length) return [];
  return [
    finding('DRIVER_RESERVED_FOR_TRIP', {
      user_id: candidate.user_id,
      shift_id: candidate.shift_id,
      free_drivers: freeDrivers.length,
      unstaffed_trips: unstaffedTrips.length,
    }),
  ];
}

/** TRIP_WITHOUT_DRIVER: попередження, коли на "Поїздку" призначають людину без is_driver. */
function checkTripWithoutDriver(shift, candidate) {
  if (!isTripService(shift.service_type)) return [];
  return [finding('TRIP_WITHOUT_DRIVER', { user_id: candidate.user_id, shift_id: candidate.shift_id })];
}

function checkDriver(context, candidate) {
  const user = context.usersById.get(candidate.user_id);
  if (!user) return [];
  const shift = context.shiftsById.get(candidate.shift_id);
  if (!shift) return [];

  if (!user.is_driver) {
    return checkTripWithoutDriver(shift, candidate);
  }

  const candidateInterval = context.intervalByShiftId.get(candidate.shift_id);
  return [
    ...checkDriverStaticDuringTrip(context, candidate, user, shift, candidateInterval),
    ...checkQuietHourPairing(context, candidate, shift),
    ...checkDriverReservation(context, candidate, user, shift, candidateInterval),
  ];
}

module.exports = { checkDriver };
