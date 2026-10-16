import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

// Shared shape for both the `products` and `services` JSON arrays on a
// knowledge base — a lightweight catalog entry the agent can speak to.
export class ProductItemDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  category?: string;
}
