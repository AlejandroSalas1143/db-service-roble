import { BadRequestException, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService {
  private pools: Map<string, Pool> = new Map();

  private getPool(dbName: string): Pool {
    if (!this.pools.has(dbName)) {

      const pool = new Pool({
        user: 'roble',
        host: 'localhost',
        database: dbName,
        password: 'roble1',
        port: 5432,
      });
      this.pools.set(dbName, pool);
    }
    return this.pools.get(dbName)!;
  }

  async createTable(
    dbName: string,
    tableName: string,
    columns: {
      name: string;
      type: string;
      defaultValue?: string;
      isNullable?: boolean;
      isPrimary?: boolean;
    }[]
  ) {
    this.validateName(tableName);

    for (const col of columns) {
      this.validateName(col.name);
      this.validateType(col.type);
    }

    const columnsSql = columns.map(col => {
      let colDef = `"${col.name}" ${col.type}`;

      if (col.defaultValue) {
        colDef += ` DEFAULT ${col.defaultValue}`;
      }

      if (col.isNullable === false) {
        colDef += ` NOT NULL`;
      }

      return colDef;
    });

    const primaryKeys = columns.filter(col => col.isPrimary).map(col => `"${col.name}"`);
    if (primaryKeys.length > 0) {
      columnsSql.push(`PRIMARY KEY (${primaryKeys.join(", ")})`);
    }

    const query = `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${columnsSql.join(",\n  ")}\n);`;

    const pool = this.getPool(dbName);
    await pool.query(query);
  }

  async addColumn(
    dbName: string,
    table: string,
    column: {
      name: string;
      type: string;
      defaultValue?: string;
      isNullable?: boolean;
      isPrimary?: boolean;
    }
  ) {
    this.validateName(table);
    this.validateName(column.name);
    this.validateType(column.type);

    let columnDef = `"${column.name}" ${column.type}`;

    if (column.defaultValue !== undefined) {
      columnDef += ` DEFAULT ${column.defaultValue}`;
    }

    if (column.isNullable === false) {
      columnDef += ` NOT NULL`;
    }

    const addColumnQuery = `ALTER TABLE "${table}" ADD COLUMN ${columnDef};`;

    const pool = this.getPool(dbName);
    await pool.query(addColumnQuery);

    if (column.isPrimary) {
      const addPkQuery = `ALTER TABLE "${table}" ADD PRIMARY KEY ("${column.name}");`;
      await pool.query(addPkQuery);
    }
  }


  async dropColumn(dbName: string, table: string, columnName: string) {
    this.validateName(table);
    this.validateName(columnName);

    const query = `ALTER TABLE "${table}" DROP COLUMN "${columnName}";`;
    await this.getPool(dbName).query(query);
  }

  async renameColumn(dbName: string, table: string, oldName: string, newName: string) {
    this.validateName(table);
    this.validateName(oldName);
    this.validateName(newName);

    const query = `ALTER TABLE "${table}" RENAME COLUMN "${oldName}" TO "${newName}";`;
    await this.getPool(dbName).query(query);
  }

  async alterColumnType(dbName: string, table: string, columnName: string, newType: string) {
    this.validateName(table);
    this.validateName(columnName);
    this.validateType(newType);

    const query = `ALTER TABLE "${table}" ALTER COLUMN "${columnName}" TYPE ${newType} USING "${columnName}"::${newType};`;
    await this.getPool(dbName).query(query);
  }

  // Reutilizas tus validaciones ya hechas:
  private validateName(name: string) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`Nombre inválido: ${name}`);
    }
  }
  private validateType(type: string) {
    const validTypes = [
      'text',
      'int',
      'integer',
      'smallint',
      'bigint',
      'numeric',
      'real',
      'double precision',
      'boolean',
      'uuid',
      'serial',
    ];
    if (!validTypes.includes(type.toLowerCase())) {
      throw new Error(`Tipo inválido: ${type}`);
    }
  }

  async getColumns(dbName: string, tableName: string): Promise<string[]> {
    const pool = this.getPool(dbName);
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [tableName]
    );
    return res.rows.map(row => row.column_name);
  }


  async insertRecord(dbName: string, tableName: string, record: Record<string, any>) {

    const existingColumns = await this.getColumns(dbName, tableName);

    // 2. Extraer las columnas del record que te están enviando
    const columns = Object.keys(record);

    // 3. Filtrar columnas que NO existen en la tabla
    const invalidColumns = columns.filter(c => !existingColumns.includes(c));

    // 4. Si hay columnas inválidas, lanzar error
    if (invalidColumns.length > 0) {
      throw new BadRequestException(`Columnas inválidas: ${invalidColumns.join(', ')}`);
    }

    const pool = this.getPool(dbName);
    const values = Object.values(record);
    const params = values.map((_, i) => `$${i + 1}`).join(', ');

    const query = `INSERT INTO "${tableName}" (${columns
      .map(c => `"${c}"`)
      .join(', ')}) VALUES (${params}) RETURNING *;`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async readRecords(
    dbName: string,
    tableName: string,
    filter?: Record<string, any>,
  ) {
    const pool = this.getPool(dbName);
    let query = `SELECT * FROM "${tableName}"`;
    let values: any[] = [];

    if (filter && Object.keys(filter).length > 0) {
      const whereClauses = Object.entries(filter).map(([key, val], i) => {
        values.push(val);
        return `"${key}" = $${i + 1}`;
      });
      query += ' WHERE ' + whereClauses.join(' AND ');
    }

    const result = await pool.query(query, values);
    return result.rows;
  }

  async updateRecord(
    dbName: string,
    tableName: string,
    idColumn: string,
    idValue: any,
    updates: Record<string, any>,
  ) {
    const pool = this.getPool(dbName);
    const setClauses = Object.entries(updates).map(
      ([key, _], i) => `"${key}" = $${i + 1}`,
    );
    const values = Object.values(updates);
    values.push(idValue);

    const query = `UPDATE "${tableName}" SET ${setClauses.join(
      ', ',
    )} WHERE "${idColumn}" = $${values.length} RETURNING *;`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async deleteRecord(
    dbName: string,
    tableName: string,
    idColumn: string,
    idValue: any,
  ) {
    const pool = this.getPool(dbName);
    const query = `DELETE FROM "${tableName}" WHERE "${idColumn}" = $1 RETURNING *;`;
    const result = await pool.query(query, [idValue]);
    return result.rows[0];
  }
}
