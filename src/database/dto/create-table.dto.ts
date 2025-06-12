export class CreateTableDto {
  dbName: string;
  tableName: string;
  description: string | null;
  columns: { name: string; type: string }[];
}
