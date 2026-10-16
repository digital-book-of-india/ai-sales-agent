import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateObjectionDto {
  @IsString()
  @MinLength(1)
  objection: string;

  @IsString()
  @MinLength(1)
  recommendedResponse: string;

  @IsOptional()
  @IsString()
  followUpQuestion?: string;

  @IsOptional()
  @IsString()
  escalationRule?: string;
}
