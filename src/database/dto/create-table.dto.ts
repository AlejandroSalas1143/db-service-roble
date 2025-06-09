export class CreateTableDto {
  dbName: string;
  tableName: string;
  columns: { name: string; type: string }[];
}
