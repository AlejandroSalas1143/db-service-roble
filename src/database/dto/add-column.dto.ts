export class AddColumnDto {
  dbName: string;
  tableName: string;
  column: { name: string; type: string };
}
