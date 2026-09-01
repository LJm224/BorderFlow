import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(2, 64)
  tenantCode!: string;

  @IsEmail()
  @Length(3, 320)
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
