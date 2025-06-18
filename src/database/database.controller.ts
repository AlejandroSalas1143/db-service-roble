import { Controller, Post, Body, Put, Get, Query, Delete, UseGuards, Param } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { CreateTableDto } from './dto/create-table.dto';
import { AddColumnDto } from './dto/add-column.dto';
import { DropColumnDto } from './dto/drop-column.dto';
import { RenameColumnDto } from './dto/rename-column.dto';
import { AlterColumnTypeDto } from './dto/alter-column-type.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';


@Controller('database')
// @UseGuards(JwtAuthGuard)
export class DatabaseController {
  constructor(private readonly dbService: DatabaseService) { }

  @Post('create-table')
  async createTable(@Body() createTableDto: CreateTableDto) {
    const { dbName, tableName, description, columns } = createTableDto;
    await this.dbService.createTable(dbName, tableName, description, columns);
    return { message: `Tabla '${tableName}' creada en la base '${dbName}'` };
  }

  @Get(':dbName/usage')
  async getAllTablesInfo(@Param('dbName') dbName: string) {
    const tablesInfo = await this.dbService.getAllTablesInfo(dbName);
    return { tables: tablesInfo };
  }
  @Get(':dbName/columns')
  async getTableColumns(@Param('dbName') dbName: string, @Query('schema') schema: string = 'public', @Query('table') table: string) {
    const columns = await this.dbService.getTableColumns(dbName, schema, table);
    return { columns };
  }

  @Get(':dbName/table-data')
  async getTableData(@Param('dbName') dbName: string, @Query('schema') schema = 'public', @Query('table') tableName: string,) {
    return this.dbService.getTableWithColumnsAndData(dbName, schema, tableName);
  }
  
  @Post('add-column')
  async addColumn(@Body() dto: AddColumnDto) {
    await this.dbService.addColumn(dto.dbName, dto.tableName, dto.column);
    return { success: true };
  }

  @Post('drop-column')
  async dropColumn(@Body() dto: DropColumnDto) {
    await this.dbService.dropColumn(dto.dbName, dto.tableName, dto.columnName);
    return { success: true };
  }

  @Post('rename-column')
  async renameColumn(@Body() dto: RenameColumnDto) {
    await this.dbService.renameColumn(dto.dbName, dto.tableName, dto.oldName, dto.newName);
    return { success: true };
  }

  @Post('alter-column-type')
  async alterColumnType(@Body() dto: AlterColumnTypeDto) {
    await this.dbService.alterColumnType(dto.dbName, dto.tableName, dto.columnName, dto.newType);
    return { success: true };
  }

  @Post('insert')
  async insertRecord(@Body() body: {
    dbName: string;
    tableName: string;
    record: Record<string, any>;
  }) {
    return this.dbService.insertRecord(body.dbName, body.tableName, body.record);
  }

  @Get('read')
  async readRecords(
    @Query('dbName') dbName: string,
    @Query('tableName') tableName: string,
    @Query() query: Record<string, any>,
  ) {
    // quitar dbName y tableName de filtros para no duplicar
    const filters = { ...query };
    delete filters.dbName;
    delete filters.tableName;
    return this.dbService.readRecords(dbName, tableName, filters);
  }

  @Put('update')
  async updateRecord(@Body() body: {
    dbName: string;
    tableName: string;
    idColumn: string;
    idValue: any;
    updates: Record<string, any>;
  }) {
    return this.dbService.updateRecord(
      body.dbName,
      body.tableName,
      body.idColumn,
      body.idValue,
      body.updates,
    );
  }

  @Delete('delete')
  async deleteRecord(@Body() body: {
    dbName: string;
    tableName: string;
    idColumn: string;
    idValue: any;
  }) {
    return this.dbService.deleteRecord(
      body.dbName,
      body.tableName,
      body.idColumn,
      body.idValue,
    );
  }
}
