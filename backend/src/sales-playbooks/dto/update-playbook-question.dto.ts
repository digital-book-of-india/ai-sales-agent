import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdatePlaybookQuestionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  question?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  expectedInfo?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  possibleAnswers?: string[];

  @IsOptional()
  @IsInt()
  order?: number;
}
