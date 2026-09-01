import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LoginDto } from './auth.dto';
import { AuthService } from './auth.service';
import { AuthRequest, AuthResponse, LoginResult } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantIsolationGuard } from '../tenants/tenant-isolation.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() request: AuthRequest, @Res({ passthrough: true }) response: AuthResponse): Promise<LoginResult> {
    const result = await this.authService.login(dto, this.getHeader(request, 'user-agent'), this.getIpAddress(request));
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: AuthRequest, @Res({ passthrough: true }) response: AuthResponse): Promise<LoginResult> {
    const result = await this.authService.refresh(this.getRefreshToken(request), this.getHeader(request, 'user-agent'), this.getIpAddress(request));
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: AuthResponse): Promise<{ success: true }> {
    await this.authService.logout(this.getRefreshToken(request));
    this.clearRefreshCookie(response);
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, TenantIsolationGuard)
  async me(@CurrentUser() currentUser: { sub: string }): Promise<NonNullable<Awaited<ReturnType<AuthService['getPublicUserById']>>>> {
    const user = await this.authService.getPublicUserById(currentUser.sub);
    if (!user) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '登录状态无效或已过期' });
    return user;
  }

  private getRefreshToken(request: AuthRequest): string | undefined {
    const cookieHeader = this.getHeader(request, 'cookie');
    if (!cookieHeader) return undefined;
    const prefix = `${this.authService.getRefreshCookieName()}=`;
    const cookie = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : undefined;
  }

  private setRefreshCookie(response: AuthResponse, token: string): void {
    response.cookie(this.authService.getRefreshCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: this.authService.getRefreshCookieMaxAge(),
    });
  }

  private clearRefreshCookie(response: AuthResponse): void {
    response.clearCookie(this.authService.getRefreshCookieName(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
    });
  }

  private getHeader(request: AuthRequest, name: string): string | undefined {
    const value = request.headers?.[name];
    return Array.isArray(value) ? value[0] : value;
  }

  private getIpAddress(request: AuthRequest): string | undefined {
    const forwarded = this.getHeader(request, 'x-forwarded-for');
    return forwarded?.split(',')[0].trim();
  }
}
