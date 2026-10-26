package kr.todanjeon.workapp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.util.Locale;

/**
 * 새 업무·채팅·공지·입금 알림. 앱 화면(MainActivity)과 상시 알림 서비스(NotifyService)가 같이 쓴다.
 * 화면이 꺼져 있어도 서비스가 앱을 살려 두므로 서버 변경을 받아 폰 알림 + 음성을 낸다.
 */
final class Alerts {
    static final String CH = "work2"; // 중요도 높음(화면 위에 뜨고 화면을 깨운다). 소리는 우리 음성 파일로 낸다.
    static final String CH_KEEP = "keep"; // 상시 알림 서비스 표시용(조용히)
    private static final Handler ui = new Handler(Looper.getMainLooper());
    static long lastSay = 0;
    private static int seq = 100;
    private static final int ROOM_BASE = 1_000_000; // 채팅방 알림 번호 = ROOM_BASE + 방 번호
    private static final java.util.Map<Integer, Integer> roomCnt = new java.util.HashMap<>();

    /** 그 방을 열었으면 방 알림을 지우고 개수를 0으로 */
    static void clearRoom(Context c, int room) {
        if (room == 0) return;
        roomCnt.remove(room);
        try {
            ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(ROOM_BASE + room);
        } catch (Exception ignored) {
        }
    }

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel ch = new NotificationChannel(CH, "업무·채팅 알림", NotificationManager.IMPORTANCE_HIGH);
        ch.setSound(null, null);
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 250, 120, 250});
        nm.createNotificationChannel(ch);
        NotificationChannel k = new NotificationChannel(CH_KEEP, "알림 받기 대기(상시)", NotificationManager.IMPORTANCE_MIN);
        k.setShowBadge(false);
        nm.createNotificationChannel(k);
    }

    private static String won(long v) {
        return java.text.NumberFormat.getInstance(Locale.KOREA).format(v) + "원";
    }

    private static String snippet(JSONObject m) {
        String k = m.optString("kind");
        if ("img".equals(k)) return "사진";
        if ("stk".equals(k)) return "스티커";
        if ("file".equals(k)) return "파일: " + m.optString("fname");
        String t = m.optString("text").replace('\n', ' ');
        return t.length() > 60 ? t.substring(0, 60) + "…" : t;
    }

    /** 서버에서 새로 들어온 자료 하나를 보고 내게 알릴 것이면 알린다. */
    static void handle(Context c, Store store, String coll, JSONObject o) {
        int me = store.sessionId();
        if (me == 0) return;
        String title = null, body = null, say = null;
        if ("tasks".equals(coll) && o.optInt("assignee") == me && o.optInt("creator") != me) {
            boolean pq = o.optJSONObject("preq") != null;
            title = pq ? "물품요청이 들어왔어요" : "새 업무가 배정됐어요";
            body = o.optString("title");
            say = pq ? "물품요청이 들어왔습니다" : "업무가 배정되었습니다";
        } else if ("preqShip".equals(coll) && o.optInt("creator") == me) {
            title = "물품이 발송됐어요 — 입고 확인을 눌러 주세요";
            body = o.optString("title");
            say = "물품이 발송되었습니다";
        } else if ("msgs".equals(coll) && o.optInt("who") != me && o.optInt("ts", 1) != 0 && System.currentTimeMillis() - o.optLong("ts") < 120000
                && !c.getSharedPreferences("chatprefs", Context.MODE_PRIVATE).getBoolean("mute_" + me + "_" + o.optInt("room"), false)) {
            title = "나인톡 · " + store.userName(o.optInt("who"));
            body = snippet(o);
            say = "나인톡";
        } else if ("library".equals(coll) && o.optInt("who") != me) {
            title = "자료실에 새 자료";
            body = o.optString("title");
        } else if ("notices".equals(coll) && o.optInt("author") != me) {
            title = "새 공지";
            body = o.optString("title");
            say = "새 공지가 있습니다";
        } else if ("deposits".equals(coll) && o.optInt("by") != me) {
            title = "입금 확인 요청";
            body = o.optString("kind") + " " + won(o.optLong("amount")) + " " + o.optString("mname");
        }
        if (title == null) return;
        boolean chat = "msgs".equals(coll);
        if (!c.getSharedPreferences("workapp", Context.MODE_PRIVATE).getBoolean(chat ? "pushChat" : "pushTask", true)) return; // 알림 받기를 끈 종류
        int room = chat ? o.optInt("room") : 0;
        int nid = seq++;
        if (chat) { // 채팅은 방마다 알림 1개: 새 글이 오면 그 방 알림을 바꾸고 '새 메시지 N개'로 센다
            Integer n = roomCnt.get(room);
            n = n == null ? 1 : n + 1;
            roomCnt.put(room, n);
            JSONObject r = store.byId("rooms", room);
            String rn = r == null ? "" : r.optBoolean("dm") ? "" : r.optString("name");
            title = "나인톡 · " + (rn.isEmpty() ? store.userName(o.optInt("who")) : rn) + (n > 1 ? " (" + n + ")" : "");
            body = (rn.isEmpty() ? "" : store.userName(o.optInt("who")) + ": ") + snippet(o);
            nid = ROOM_BASE + room;
        }
        speak(c, say);
        try {
            channels(c);
            Intent it = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            if (chat) it.putExtra("openRoom", room); // 누르면 그 채팅방으로
            PendingIntent pi = PendingIntent.getActivity(c, chat ? room : 0, it, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder nb = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH) : new Notification.Builder(c);
            nb.setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(body).setContentIntent(pi).setAutoCancel(true)
                    .setCategory("msgs".equals(coll) ? Notification.CATEGORY_MESSAGE : Notification.CATEGORY_REMINDER)
                    .setVisibility(Notification.VISIBILITY_PUBLIC);
            if (Build.VERSION.SDK_INT < 26) nb.setPriority(Notification.PRIORITY_HIGH).setVibrate(new long[]{0, 250, 120, 250});
            ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(nid, nb.build());
        } catch (Exception ignored) {
        }
        wake(c);
    }

    /** 화면이 꺼져 있으면 잠깐 켠다(알림이 보이게). */
    private static void wake(Context c) {
        try {
            android.os.PowerManager pm = (android.os.PowerManager) c.getSystemService(Context.POWER_SERVICE);
            if (pm == null || pm.isInteractive()) return;
            @SuppressWarnings("deprecation")
            android.os.PowerManager.WakeLock wl = pm.newWakeLock(android.os.PowerManager.SCREEN_BRIGHT_WAKE_LOCK | android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP, "nine:alert");
            wl.acquire(4000);
        } catch (Exception ignored) {
        }
    }

    /** 업무: 띵동 + 음성 안내 / 채팅: 카톡처럼 "나인톡!"만 짧게. 연달아 오면 한 번만. 업무·채팅 소리는 따로 끈다. */
    static void speak(Context ctx, String say) {
        if (say == null) return;
        final Context c = ctx.getApplicationContext();
        boolean chat = "나인톡".equals(say);
        if (!c.getSharedPreferences("workapp", Context.MODE_PRIVATE).getBoolean(chat ? "voiceChat" : "voice", true)) return;
        if (System.currentTimeMillis() - lastSay < (chat ? 1500 : 2500)) return;
        lastSay = System.currentTimeMillis();
        if (!chat) {
            try {
                android.media.ToneGenerator tg = new android.media.ToneGenerator(android.media.AudioManager.STREAM_NOTIFICATION, 80);
                tg.startTone(android.media.ToneGenerator.TONE_PROP_ACK, 300);
                ui.postDelayed(tg::release, 600);
            } catch (Exception ignored) {
            }
        }
        final int res = chat ? R.raw.snd_talk : "업무가 배정되었습니다".equals(say) ? R.raw.snd_task : "물품요청이 들어왔습니다".equals(say) ? R.raw.snd_preq
                : "물품이 발송되었습니다".equals(say) ? R.raw.snd_ship : "새 공지가 있습니다".equals(say) ? R.raw.snd_notice : 0;
        if (res == 0) return;
        ui.postDelayed(() -> { // 미리 녹음한 음성(res/raw)
            try {
                android.media.MediaPlayer mp = android.media.MediaPlayer.create(c, res);
                if (mp != null) {
                    mp.setOnCompletionListener(android.media.MediaPlayer::release);
                    mp.start();
                }
            } catch (Exception ignored) {
            }
        }, chat ? 0 : 450);
    }

    private Alerts() {
    }
}
