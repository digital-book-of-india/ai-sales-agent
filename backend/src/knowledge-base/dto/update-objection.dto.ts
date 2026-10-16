import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateObjectionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  objection?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  recommendedResponse?: string;

  @IsOptional()
  @IsString()
  followUpQuestion?: string;

  @IsOptional()
  @IsString()
  escalationRule?: string;
}
