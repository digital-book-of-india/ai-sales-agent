import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreatePlaybookQuestionDto {
  @IsString()
  @MinLength(1)
  question: string;

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
