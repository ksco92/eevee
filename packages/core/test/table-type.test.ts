/**
 * Tests for the abstract table-type base contract.
 */

import {
    TableDefinition,
    Violation,
} from '../src/model';
import {
    TableTypeBase,
} from '../src/table-type';

/// A minimal concrete subclass that implements only the truly-abstract methods,
/// leaving the optional `engineSpecificViolations` hook at its base default. This
/// is the shape a future engine with no engine-specific rules would take.
class BareTable extends TableTypeBase {
    public isValidColumnType(): boolean {
        return true;
    }

    public partitionViolations(): Violation[] {
        return [];
    }
}

function emptyDefinition(): TableDefinition {
    return {
        specVersion: '0',
        description: 'bare',
        tableType: 'bare',
        isRawData: true,
        columns: [],
        primaryKey: [],
        partitions: [],
        sortOrder: [],
        indexes: [],
        uniqueConstraints: [],
        checkConstraints: [],
        tableProperties: {},
        dependsOn: [],
        foreignKeys: [],
    };
}

test('the base engineSpecificViolations hook defaults to no violations', () => {
    const table = new BareTable({
        schema: 'analytics',
        name: 't',
        qualifiedName: 'analytics.t',
        filePath: '/virtual/analytics/t.json',
        structurallyValid: true,
        definition: emptyDefinition(),
    });
    expect(table.engineSpecificViolations()).toEqual([]);
});
