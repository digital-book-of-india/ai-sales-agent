import { IsString, MinLength } from 'class-validator';

export class AddTagDto {
  @IsString()
  @MinLength(1)
  tag: string;
}
