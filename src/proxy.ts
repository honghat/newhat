import { NextRequest, NextResponse } from 'next/server';

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  
  // 1. Cho qua toàn bộ file tĩnh và public routes
  if (
    pathname.startsWith('/_next') || 
    pathname.startsWith('/api/auth') ||
    pathname === '/login' ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 2. Kiểm tra token bằng cách quét thô header cookie (Siêu ổn định)
  const cookieStr = req.headers.get('cookie') || '';
  const hasToken = cookieStr.includes('nh_token=');

  if (!hasToken) {
    // Nếu là API thì trả về 401, nếu là trang web thì về login
    if (pathname.startsWith('/api/')) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
