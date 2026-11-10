import {expect, it} from 'vitest';
import {DataSource} from 'typeorm';
import {createOrmConfig} from '@subsquid/typeorm-config';
import * as models from '../src/model';
import Migration from '../db/migrations/1794240000000-StakingV4';

it('the additive migration covers generated v0.4 model columns without changing legacy requirements', async () => {
  const statements: string[] = [];
  await new Migration().up({query: async (sql: string) => {statements.push(sql);}});
  const db = new DataSource({...createOrmConfig({projectDir: process.cwd()}), entities: Object.values(models)});
  await (db as any).buildMetadatas();
  const added = new Map<string, Set<string>>();
  for (const sql of statements) {
    const create = /^CREATE TABLE "([^"]+)" \((.*)\)$/.exec(sql);
    const alter = /^ALTER TABLE "([^"]+)" ADD "([^"]+)"/.exec(sql);
    if (create) {
      const columns = [...create[2].matchAll(/"([^"]+)" (?:character varying|numeric|text|boolean)/g)].map(m => m[1]);
      const metadata = db.entityMetadatas.find(m => m.tableName === create[1])!;
      expect(columns.sort()).toEqual(metadata.columns.map(c => c.databaseName).sort());
      added.set(create[1], new Set(columns));
    } else if (alter) {
      expect(sql).not.toContain('NOT NULL'); // old rows must remain valid
      const metadata = db.entityMetadatas.find(m => m.tableName === alter[1])!;
      expect(metadata.columns.find(c => c.databaseName === alter[2])?.isNullable).toBe(true);
      const cols = added.get(alter[1]) ?? new Set(); cols.add(alter[2]); added.set(alter[1], cols);
    } else throw new Error(`Unexpected migration statement ${sql}`);
  }
  expect(statements).toHaveLength(9);
});
