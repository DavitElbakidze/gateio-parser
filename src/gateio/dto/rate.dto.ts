import { IsString, IsNotEmpty } from 'class-validator';

export class RateDto {
  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  to: string;

  @IsString()
  @IsNotEmpty()
  buy: string;

  @IsString()
  @IsNotEmpty()
  sell: string;
}