<?php

namespace Tests;

use Illuminate\Foundation\Testing\DatabaseTruncation;

/**
 * Companion to Laravel's DatabaseTruncation for classes that must run DDL.
 *
 * DatabaseTruncation empties every table in setUp, but it has no teardown: the
 * final test of such a class leaves its rows COMMITTED in the test database.
 * That is normally harmless, because the next DatabaseTruncation class wipes
 * the tables again - but a following RefreshDatabase class wraps each test in a
 * transaction it can only roll back its OWN writes, so it sees the previous
 * class's rows as pre-existing fixture data and fails on any exact-count
 * assertion (e.g. "expected 1 contact, found 2").
 *
 * Refreshing the database in tearDown as well as setUp closes that window: every
 * test in a DDL-touching class now starts and leaves the database empty.
 */
trait TruncatesDatabaseBetweenTests
{
    use DatabaseTruncation;

    protected function tearDownTruncatesDatabaseBetweenTests(): void
    {
        $this->truncateTablesForAllConnections();
    }
}