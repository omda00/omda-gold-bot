import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/telegram-users/[id] - Get a specific Telegram user
 * ADMIN ONLY
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const isAdmin = await getAdminSession();
    if (!isAdmin) {
      return NextResponse.json(
        { error: "غير مصرح" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const user = await db.telegramUser.findUnique({ where: { id } });

    if (!user) {
      return NextResponse.json(
        { error: "المستخدم غير موجود" },
        { status: 404 }
      );
    }

    // Mask bot token
    return NextResponse.json({
      ...user,
      botToken: user.botToken ? `****${user.botToken.slice(-5)}` : "",
    });
  } catch (error) {
    console.error("Error fetching telegram user:", error);
    return NextResponse.json(
      { error: "Failed to fetch telegram user" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/telegram-users/[id] - Delete a Telegram user
 * ADMIN ONLY
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const isAdmin = await getAdminSession();
    if (!isAdmin) {
      return NextResponse.json(
        { error: "غير مصرح" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const existing = await db.telegramUser.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "المستخدم غير موجود" },
        { status: 404 }
      );
    }

    await db.telegramUser.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "تم حذف المستخدم بنجاح" });
  } catch (error) {
    console.error("Error deleting telegram user:", error);
    return NextResponse.json(
      { error: "Failed to delete telegram user" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/telegram-users/[id] - Update a Telegram user (toggle active, update name, etc.)
 * ADMIN ONLY
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const isAdmin = await getAdminSession();
    if (!isAdmin) {
      return NextResponse.json(
        { error: "غير مصرح" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { name, botToken, chatId, active } = body;

    const existing = await db.telegramUser.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "المستخدم غير موجود" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (botToken !== undefined) updateData.botToken = botToken.trim();
    if (chatId !== undefined) updateData.chatId = chatId.trim();
    if (active !== undefined) updateData.active = active;

    const updated = await db.telegramUser.update({
      where: { id },
      data: updateData,
    });

    // Mask bot token in response
    return NextResponse.json({
      ...updated,
      botToken: updated.botToken ? `****${updated.botToken.slice(-5)}` : "",
    });
  } catch (error) {
    console.error("Error updating telegram user:", error);
    return NextResponse.json(
      { error: "Failed to update telegram user" },
      { status: 500 }
    );
  }
}
