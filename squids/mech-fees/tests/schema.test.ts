// Guards a store rule: a scalar field and a relation on the same entity must
// not map to the same column. TypeORM silently collapses the two into one FK
// column (`foo` + `fooId` -> a single NOT NULL `foo_id`), and the failure
// only shows up as an FK violation in production. Reads the decorator
// metadata the generated models register, so it needs no database.
import { describe, expect, it } from "vitest";
import { getMetadataArgsStorage } from "typeorm";
import * as models from "../src/model";

// TypeORM's DefaultNamingStrategy: camelCase -> snake_case.
const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

describe("generated models", () => {
  it("no scalar column shares its name with a relation's join column", () => {
    const st = getMetadataArgsStorage();
    const classes = Object.values(models).filter(
      (v): v is { new (...a: any[]): any; name: string } => typeof v === "function"
    );
    expect(classes.length).toBeGreaterThan(3);
    for (const cls of classes) {
      const scalarColumns = st.columns
        .filter((c) => c.target === cls)
        .map((c) => c.options.name ?? snake(c.propertyName));
      const joinColumns = st.relations
        .filter(
          (r) =>
            r.target === cls &&
            (r.relationType === "many-to-one" ||
              st.joinColumns.some((j) => j.target === cls && j.propertyName === r.propertyName))
        )
        .map((r) => `${snake(r.propertyName)}_id`);
      const clash = scalarColumns.filter((c) => joinColumns.includes(c));
      const hint = `${cls.name}: rename the scalar so it does not collide with the relation's join column`;
      expect(clash, hint).toEqual([]);
    }
  });
});
