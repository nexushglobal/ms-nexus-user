import { Type } from 'class-transformer';
import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';

export class TreeQueryDto {
  @IsOptional()
  @IsString({ message: 'El ID del usuario debe ser una cadena de texto' })
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La profundidad debe ser un número entero' })
  @Min(1, { message: 'La profundidad mínima es 1' })
  @Max(5, { message: 'La profundidad máxima es 5' })
  depth?: number = 3;
}

export class TreeSearchDto {
  @IsOptional()
  @IsString({ message: 'El término de búsqueda debe ser texto' })
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1, { message: 'La página mínima es 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: 'El límite mínimo es 1' })
  @Max(100, { message: 'El límite máximo es 100' })
  limit?: number = 20;
}
