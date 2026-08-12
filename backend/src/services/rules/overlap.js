'use strict';

const time = require('../../domain/time');
const { finding } = require('./codes');

/**
 * candidate = { shift_id, user_id, status }
 *
 * DUPLICATE_ASSIGNMENT - людину вже призначено (не-Completed) на ЦЮ САМУ зміну.
 * PERSON_DOUBLE_BOOKED - інтервал кандидатської зміни перетинається з іншою
 * не-Completed зміною тієї самої людини (обов'язково включно з переходами через
 * північ - context.intervalByShiftId уже враховує це).
 */
function checkOverlap(context, candidate) {
  const findings = [];
  const existingForUser = context.schedulesByUserId.get(candidate.user_id) || [];

  const duplicate = existingForUser.find(
    (r) => r.shift_id === candidate.shift_id && r.status !== 'Completed'
  );
  if (duplicate) {
    findings.push(
      finding('DUPLICATE_ASSIGNMENT', {
        user_id: candidate.user_id,
        shift_id: candidate.shift_id,
        record_id: duplicate.record_id,
      })
    );
  }

  const candidateInterval = context.intervalByShiftId.get(candidate.shift_id);
  if (candidateInterval) {
    const conflicting = [];
    for (const record of existingForUser) {
      if (record.shift_id === candidate.shift_id) continue; // це вже DUPLICATE_ASSIGNMENT вище
      if (record.status === 'Completed') continue;
      const otherShift = context.shiftsById.get(record.shift_id);
      const otherInterval = context.intervalByShiftId.get(record.shift_id);
      if (!otherShift || !otherInterval) continue;
      if (time.overlaps(candidateInterval, otherInterval)) {
        conflicting.push({
          record_id: record.record_id,
          shift_id: record.shift_id,
          service_type: otherShift.service_type,
          date: otherShift.date,
          time_start: otherShift.time_start,
          time_end: otherShift.time_end,
        });
      }
    }
    if (conflicting.length > 0) {
      findings.push(finding('PERSON_DOUBLE_BOOKED', { user_id: candidate.user_id, conflicting }));
    }
  }

  return findings;
}

module.exports = { checkOverlap };
