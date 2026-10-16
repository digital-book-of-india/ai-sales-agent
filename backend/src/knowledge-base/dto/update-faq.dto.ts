import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateFaqDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  question?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  answer?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  priority?: number;
}
