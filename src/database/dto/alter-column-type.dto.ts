export class AlterColumnTypeDto {
  dbName: string;
  tableName: string;
  columnName: string;
  newType: string;
}
