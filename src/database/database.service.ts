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
    description: string | null,
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

    if (description) {
      const safeDescription = description.replace(/'/g, "''"); // escapa comillas simples

      await pool.query(`COMMENT ON TABLE "${tableName}" IS '${safeDescription}'`);
    }
  }

  async getAllTablesInfo(dbName: string): Promise<{
    name: string;
    description: string | null;
    rowsEstimated: number;
    size: string;
    realtimeEnabled: boolean;
    columnsCount: number;
  }[]> {
    const pool = this.getPool(dbName);

    const tablesRes = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE';
  `);

    const results: {
      name: string;
      description: string | null;
      rowsEstimated: number;
      size: string;
      realtimeEnabled: boolean;
      columnsCount: number;
    }[] = [];

    for (const row of tablesRes.rows) {
      const tableName = row.table_name;

      const escapedName = `"${tableName.replace(/"/g, '""')}"`; // Escapa el nombre de la tabla para evitar inyecciones SQL
      if (tableName.includes("migrations") || tableName === "User") {
        continue;
      }

      await pool.query(`ANALYZE ${escapedName}`);

      // 1. Descripción del comentario de tabla
      const commentRes = await pool.query(
        `SELECT obj_description($1::regclass, 'pg_class') AS description`,
        [escapedName]
      );

      // 2. Estadísticas de la tabla
      const statsRes = await pool.query(
        `SELECT reltuples::BIGINT AS rows_estimated
       FROM pg_class
       WHERE oid = $1::regclass`,
        [escapedName]
      );

      const sizeRes = await pool.query(
        `SELECT pg_size_pretty(pg_total_relation_size($1::regclass)) AS size`,
        [escapedName]
      );
      // 3. Número de columnas
      const columnsRes = await pool.query(
        `SELECT COUNT(*)::INT AS columns_count
       FROM information_schema.columns
       WHERE table_name = $1 AND table_schema = 'public'`,
        [tableName]
      );

      results.push({
        name: tableName,
        description: commentRes.rows[0]?.description || null,
        rowsEstimated: statsRes.rows[0]?.rows_estimated ?? 0,
        size: sizeRes.rows[0]?.size || "0 bytes",
        realtimeEnabled: false,
        columnsCount: columnsRes.rows[0]?.columns_count ?? 0,
      });
    }

    return results;
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

    // Construcción del fragmento SQL
    let columnDef = `"${column.name}" ${column.type}`;

    if (column.defaultValue !== undefined) {
      const val = column.defaultValue.trim();
      const isSqlFunction = /\w+\(.*\)/.test(val); // Detecta funciones SQL como now(), uuid_generate_v4()
      const isString = isNaN(Number(val)) &&
        !["true", "false", "null"].includes(val.toLowerCase()) &&
        !isSqlFunction;

      columnDef += ` DEFAULT ${isString ? `'${val}'` : val}`;
    }

    if (column.isNullable === false) {
      columnDef += ` NOT NULL`;
    }

    const addColumnQuery = `ALTER TABLE "${table}" ADD COLUMN ${columnDef};`;

    const pool = this.getPool(dbName);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Verificar si la columna ya existe
      const checkColumnExistsQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2;
    `;
      const existing = await client.query(checkColumnExistsQuery, [table, column.name]);

      if ((existing.rowCount ?? 0) > 0) {
        throw new Error(`La columna ${column.name} ya existe en la tabla ${table}`);
      }

      await client.query(addColumnQuery);

      if (column.isPrimary) {
        const checkPkQuery = `
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = $1;
      `;
        const result = await client.query(checkPkQuery, [table]);

        if (result.rows.length > 0) {
          throw new Error(
            `La tabla ${table} ya tiene una clave primaria: ${result.rows.map((r) => r.column_name).join(", ")}`
          );
        }

        const addPkQuery = `ALTER TABLE "${table}" ADD PRIMARY KEY ("${column.name}");`;
        await client.query(addPkQuery);
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");

      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException(err.message);
    } finally {
      client.release();
    }
  }

  async getTableColumns(dbName: string, schema: string, table: string) {
    const pool = this.getPool(dbName);
    const client = await pool.connect();

    try {
      const result = await client.query(
        `
      SELECT 
        c.column_name AS name,
        c.data_type AS type,
        c.udt_name AS format,
        c.is_nullable,
        (kcu.column_name IS NOT NULL) AS is_primary
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu
        ON c.table_name = kcu.table_name
        AND c.column_name = kcu.column_name
        AND c.table_schema = kcu.table_schema
        AND kcu.constraint_name IN (
          SELECT constraint_name
          FROM information_schema.table_constraints
          WHERE constraint_type = 'PRIMARY KEY'
            AND table_name = $2
            AND table_schema = $1
        )
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position
      `,
        [schema, table]
      );

      return result.rows.map((col) => ({
        name: col.name,
        type: col.type,
        format: col.format,
        is_nullable: col.is_nullable === 'YES',
        is_primary: col.is_primary,
      }));
    } catch (error) {
      console.error(`Error en getTableColumns:`, error.message);
      throw new BadRequestException('Error al obtener las columnas de la tabla');
    } finally {
      client.release();
    }
  }


  async getTableWithColumnsAndData(dbName: string, schema: string, tableName: string) {
    const pool = this.getPool(dbName);
    const client = await pool.connect();

    try {
      if (!/^[a-zA-Z0-9_]+$/.test(schema) || !/^[a-zA-Z0-9_]+$/.test(tableName)) {
        throw new BadRequestException("Nombre de tabla o esquema inválido.");
      }

      const columnInfoQuery = `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = $2
      ORDER BY ordinal_position
    `;
      const columnInfo = await client.query(columnInfoQuery, [tableName, schema]);

      if (columnInfo.rowCount === 0) {
        throw new BadRequestException(`La tabla ${tableName} no existe en el esquema ${schema}.`);
      }

      const dataQuery = `SELECT * FROM "${schema}"."${tableName}"`;
      const data = await client.query(dataQuery);

      const columns = columnInfo.rows.map((col) => ({
        name: col.column_name,
        type: col.data_type,
      }));

      return {
        columns,
        rows: data.rows,
      };
    } catch (error) {
      console.error(`Error al consultar la tabla ${schema}.${tableName}:`, error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException("No se pudo consultar la tabla.");
    } finally {
      client.release();
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


  async insertRecord(
    dbName: string,
    tableName: string,
    record: Record<string, any>
  ) {
    const pool = this.getPool(dbName);
    const client = await pool.connect();

    try {
      const columnsMeta = await this.getTableColumns(dbName, 'public', tableName);
      const columnNames = Object.keys(record);
      const values = Object.values(record);

      const invalidColumns: string[] = [];
      const invalidTypes: string[] = [];

      for (const col of columnNames) {
        const value = record[col];
        const column = columnsMeta.find((c) => c.name === col);

        if (!column) {
          invalidColumns.push(col);
          continue;
        }

        const pgType = column.type;

        if (value === null) {
          if (!column.is_nullable) {
            invalidTypes.push(`${col} (no acepta null)`);
          }
        } else if (!this.isTypeCompatible(pgType, value)) {
          invalidTypes.push(`${col} (esperado: ${pgType})`);
        }
      }

      if (invalidColumns.length > 0) {
        throw new BadRequestException(`Columnas inválidas: ${invalidColumns.join(", ")}`);
      }

      if (invalidTypes.length > 0) {
        throw new BadRequestException(`Tipo inválido en columnas: ${invalidTypes.join(", ")}`);
      }

      const params = values.map((_, i) => `$${i + 1}`).join(", ");
      const query = `INSERT INTO "${tableName}" (${columnNames
        .map((c) => `"${c}"`)
        .join(", ")}) VALUES (${params}) RETURNING *;`;

      const result = await client.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error("Error al insertar registro:", error.message);
      throw new BadRequestException("No se pudo insertar el registro.");
    } finally {
      client.release();
    }
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

  private isTypeCompatible(pgType: string, value: any): boolean {
    switch (pgType) {
      case "integer":
      case "int":
      case "smallint":
      case "bigint":
        return typeof value === "number" && Number.isInteger(value);

      case "numeric":
      case "decimal":
      case "real":
      case "double precision":
        return typeof value === "number";

      case "boolean":
        return typeof value === "boolean" || value === "true" || value === "false";

      case "text":
      case "varchar":
      case "char":
      case "uuid":
        return typeof value === "string";

      case "timestamp":
      case "timestamptz":
      case "date":
      case "time":
        return typeof value === "string" && !isNaN(Date.parse(value));

      default:
        return true;
    }
  }
}
