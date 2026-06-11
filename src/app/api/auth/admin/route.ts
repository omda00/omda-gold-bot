import { NextRequest, NextResponse } from "next/server";
import { createAdminSession, ADMIN_COOKIE_NAME_EXPORT } from "@/lib/admin-auth";

/**
 * POST /api/auth/admin - Login with admin password
 * Body: { password: string }
 * Fixed password: 908070
 */
const ADMIN_PASSWORD = "908070";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== "string" || password.trim().length === 0) {
      return NextResponse.json(
        { error: "كلمة المرور مطلوبة" },
        { status: 400 }
      );
    }

    // Verify against fixed password
    if (password.trim() !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: "كلمة المرور غير صحيحة" },
        { status: 401 }
      );
    }

    // Create session
    const token = await createAdminSession();
    const response = NextResponse.json({
      ok: true,
      message: "تم تسجيل الدخول بنجاح",
    });
    response.cookies.set(ADMIN_COOKIE_NAME_EXPORT, token, {
      httpOnly: true,
      secure: false, // local dev
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { error: "حدث خطأ في تسجيل الدخول" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/admin - Check if admin is logged in
 */
export async function GET() {
  try {
    const { verifyAdminSession } = await import("@/lib/admin-auth");
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE_NAME_EXPORT)?.value;

    if (!token) {
      return NextResponse.json({ authenticated: false });
    }

    const valid = await verifyAdminSession(token);
    return NextResponse.json({ authenticated: valid });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}

/**
 * DELETE /api/auth/admin - Logout
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true, message: "تم تسجيل الخروج" });
  response.cookies.set(ADMIN_COOKIE_NAME_EXPORT, "", {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
