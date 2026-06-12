import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

/**
 * POST /api/cleanup/duplicates - Remove duplicate TelegramUser entries
 * 
 * ADMIN ONLY — requires admin session cookie
 * 
 * When multiple entries exist for the same chatId+botToken, keeps the most
 * recently updated one and deletes the rest.
 */
export async function POST() {
  try {
    const isAdmin = await getAdminSession();
    if (!isAdmin) {
      return NextResponse.json(
        { error: "غير مصرح — يرجى تسجيل الدخول كمسؤول" },
        { status: 401 }
      );
    }

    // Get all users
    const allUsers = await db.telegramUser.findMany({
      orderBy: { updatedAt: "desc" },
    });

    // Find duplicates by chatId+botToken
    const seen = new Map<string, typeof allUsers[0]>();
    const duplicates: typeof allUsers = [];

    for (const user of allUsers) {
      const key = `${user.chatId}:${user.botToken}`;
      if (seen.has(key)) {
        duplicates.push(user);
      } else {
        seen.set(key, user);
      }
    }

    if (duplicates.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "لا توجد تسجيلات مكررة — قاعدة البيانات نظيفة",
        totalUsers: allUsers.length,
        duplicatesRemoved: 0,
      });
    }

    // Delete all duplicate entries (keeping the first/most-recent one we saw)
    let deletedCount = 0;
    for (const dup of duplicates) {
      try {
        await db.telegramUser.delete({ where: { id: dup.id } });
        deletedCount++;
        console.log(`[cleanup] Deleted duplicate: ${dup.name} (chatId: ${dup.chatId}, id: ${dup.id})`);
      } catch (err) {
        console.error(`[cleanup] Failed to delete duplicate ${dup.id}:`, err);
      }
    }

    const remainingUsers = await db.telegramUser.count();

    return NextResponse.json({
      ok: true,
      message: `تم حذف ${deletedCount} تسجيل مكرر`,
      totalUsers: allUsers.length,
      duplicatesRemoved: deletedCount,
      remainingUsers,
    });
  } catch (error) {
    console.error("Error cleaning up telegram users:", error);
    return NextResponse.json(
      { error: "Failed to cleanup telegram users" },
      { status: 500 }
    );
  }
}
