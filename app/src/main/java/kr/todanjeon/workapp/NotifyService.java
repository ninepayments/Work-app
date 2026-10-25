package kr.todanjeon.workapp;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

/**
 * 상시 알림 서비스: 화면이 꺼져 있거나 앱을 닫아도 서버와 연결을 유지해 새 업무·채팅을 바로 알린다.
 * (서버 푸시(FCM)는 유료 요금제가 필요해서, 그 전까지 이 방식으로 받는다.) 상단에 '알림 받는 중' 표시가 작게 남는다.
 */
public class NotifyService extends Service {
    static void start(Context c) {
        try {
            Intent i = new Intent(c, NotifyService.class);
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } catch (Exception ignored) {
        }
    }

    static void stop(Context c) {
        try {
            c.stopService(new Intent(c, NotifyService.class));
        } catch (Exception ignored) {
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Alerts.channels(this);
        Intent it = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 1, it, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder nb = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, Alerts.CH_KEEP) : new Notification.Builder(this);
        nb.setSmallIcon(R.mipmap.ic_launcher).setContentTitle("나인패밀리").setContentText("새 업무·채팅 알림을 받는 중").setContentIntent(pi).setOngoing(true);
        if (Build.VERSION.SDK_INT < 26) nb.setPriority(Notification.PRIORITY_MIN);
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(7, nb.build(), android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING);
            else startForeground(7, nb.build());
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        // 앱 화면 없이 시작됐으면(폰 재시작·앱 정리 후) 여기서 서버와 연결한다
        Cloud.init(this);
        final Store s = Store.get(this);
        if (Cloud.auth().getCurrentUser() == null || s.sessionId() == 0) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (s.notifier == null) s.notifier = (coll, o) -> Alerts.handle(getApplicationContext(), s, coll, o);
        if (!s.isOnline()) s.attach(s.sessionId(), s.cachedPerf(), s.cachedReport(), null);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /** 폰을 다시 켜면 로그인된 상태일 때 알림 서비스를 다시 시작한다. */
    public static class Boot extends android.content.BroadcastReceiver {
        @Override
        public void onReceive(Context c, Intent i) {
            if (!c.getSharedPreferences("workapp", MODE_PRIVATE).getBoolean("bgNotify", true)) return;
            if (c.getSharedPreferences("workapp", MODE_PRIVATE).getInt("session", 0) == 0) return;
            start(c);
        }
    }
}
