'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { inList, between, notEq, isCriterion } = require('../../src/repositories/criteria');
const MongoRepository = require('../../src/repositories/MongoRepository');

describe('criteria builders', () => {
  test('inList/between/notEq are recognized as criteria', () => {
    assert.equal(isCriterion(inList([1, 2])), true);
    assert.equal(isCriterion(between(1, 2)), true);
    assert.equal(isCriterion(notEq(1)), true);
  });

  test('plain values and objects without __op are not criteria', () => {
    assert.equal(isCriterion('2026-08-09'), false);
    assert.equal(isCriterion(42), false);
    assert.equal(isCriterion(null), false);
    assert.equal(isCriterion({ shift_id: '507f1f77bcf86cd799439011' }), false);
  });
});

describe('MongoRepository#_toMongoFilter — translates criteria without touching Mongo', () => {
  // model is never called by _toMongoFilter itself, so a dummy is fine here.
  const repo = new MongoRepository({}, 'Тест');

  test('plain equality values pass through unchanged', () => {
    assert.deepEqual(repo._toMongoFilter({ date: '2026-08-09', status: 'Assigned' }), {
      date: '2026-08-09',
      status: 'Assigned',
    });
  });

  test('inList becomes $in', () => {
    assert.deepEqual(repo._toMongoFilter({ date: inList(['2026-08-08', '2026-08-09']) }), {
      date: { $in: ['2026-08-08', '2026-08-09'] },
    });
  });

  test('between becomes $gte/$lte', () => {
    assert.deepEqual(repo._toMongoFilter({ count: between(1, 3) }), {
      count: { $gte: 1, $lte: 3 },
    });
  });

  test('notEq becomes $ne', () => {
    assert.deepEqual(repo._toMongoFilter({ status: notEq('Completed') }), {
      status: { $ne: 'Completed' },
    });
  });

  test('mixing plain and criterion fields in one filter', () => {
    assert.deepEqual(repo._toMongoFilter({ service_type: 'Склад', date: inList(['2026-08-09']) }), {
      service_type: 'Склад',
      date: { $in: ['2026-08-09'] },
    });
  });

  test('empty filter yields empty Mongo query (matches everything)', () => {
    assert.deepEqual(repo._toMongoFilter({}), {});
    assert.deepEqual(repo._toMongoFilter(), {});
  });

  test('unknown operator throws rather than silently mismatching', () => {
    assert.throws(() => repo._toMongoFilter({ x: { __op: 'regex', values: [] } }));
  });
});
