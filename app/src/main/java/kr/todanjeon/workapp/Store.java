package kr.todanjeon.workapp;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import com.google.firebase.firestore.DocumentChange;
import com.google.firebase.firestore.Query;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 앱의 저장소. 폰 안 보관본(빠른 시작·오프라인)을 두고, 로그인 후에는 서버(Firestore)와 실시간으로 맞춘다.
 * 자료는 삭제하지 않는다. 바뀐 문서는 서버에 올리면서 변경 기록(audit)도 남긴다.
 */
final class Store {
    static final String[] COLLS = {"users", "tasks", "notices", "projects", "contracts", "events", "merchants", "stock", "rooms", "msgs", "reports", "profiles", "costs", "contacts", "deposits", "library", "mlogs", "config"};
    static final String[] GRADES = {"S · 5만원 이상", "A · 3만원 이상", "B · 1만원 이상", "C · 1만원 미만", "해지가맹점", "신규가맹점", "", "협력사"};

    private final SharedPreferences sp;
    private final Handler main = new Handler(Looper.getMainLooper());
    private JSONObject db;
    private final Map<String, String> pushed = new HashMap<>();
    private final Map<String, String> pushedPhone = new HashMap<>();
    private final SecureRandom rnd = new SecureRandom();
    private final List<com.google.firebase.firestore.ListenerRegistration> regs = new ArrayList<>();
    private int actor = 0;
    private boolean online = false;
    java.util.function.BiConsumer<String, JSONObject> notifier = null;

    String dumpJson() {
        try {
            return db.toString(2);
        } catch (JSONException e) {
            return db.toString();
        }
    }

    /** 자동백업용: 들여쓰기 없이 작게. */
    String dumpCompact() {
        return db.toString();
    }

    /** 가맹점 전체(삭제 표시된 것 포함)를 복사해 둔다. 되돌리기 기준점으로 쓴다. */
    JSONArray merchantsCopy() {
        JSONArray out = new JSONArray();
        JSONArray a = db.optJSONArray("merchants");
        try {
            for (int i = 0; i < a.length(); i++) out.put(new JSONObject(a.optJSONObject(i).toString()));
        } catch (JSONException ignored) {
        }
        return out;
    }

    /**
     * 가맹점을 백업 내용으로 되돌린다. 같은 id 는 백업 내용으로 바꾸고, 지금 없는 것은 되살린다.
     * exact 이면 백업에 없는 가맹점(그 뒤에 새로 생긴 것)은 삭제 표시한다(서버 자료는 지우지 않음).
     * 돌려주는 값: {바뀐 곳, 되살린 곳, 삭제표시한 곳}
     */
    int[] restoreMerchants(JSONArray backup, boolean exact) {
        int changed = 0, added = 0, hidden = 0;
        JSONArray cur = db.optJSONArray("merchants");
        java.util.HashSet<Integer> inBackup = new java.util.HashSet<>();
        try {
            for (int i = 0; i < backup.length(); i++) {
                JSONObject b = backup.optJSONObject(i);
                if (b == null) continue;
                int id = b.optInt("id");
                if (id == 0) continue;
                inBackup.add(id);
                boolean found = false;
                for (int k = 0; k < cur.length(); k++) {
                    JSONObject c = cur.optJSONObject(k);
                    if (c.optInt("id") != id) continue;
                    found = true;
                    if (!sameJson(c, b)) {
                        cur.put(k, new JSONObject(b.toString()));
                        changed++;
                    }
                    break;
                }
                if (!found) {
                    cur.put(new JSONObject(b.toString()));
                    added++;
                }
            }
            if (exact) {
                for (int k = 0; k < cur.length(); k++) {
                    JSONObject c = cur.optJSONObject(k);
                    if (!inBackup.contains(c.optInt("id")) && !c.optBoolean("deleted")) {
                        c.put("deleted", true);
                        hidden++;
                    }
                }
            }
        } catch (JSONException ignored) {
        }
        save();
        return new int[]{changed, added, hidden};
    }

    static boolean sameJson(JSONObject a, JSONObject b) {
        if (a.length() != b.length()) return false;
        java.util.Iterator<String> it = a.keys();
        while (it.hasNext()) {
            String k = it.next();
            if (!b.has(k)) return false;
            if (!String.valueOf(a.opt(k)).equals(String.valueOf(b.opt(k)))) return false;
        }
        return true;
    }

    /** 두 직원의 1:1 대화방이 이미 있으면 돌려주고, 없으면 null. */
    JSONObject findDm(int a, int b) {
        int lo = Math.min(a, b), hi = Math.max(a, b);
        JSONArray rooms = db.optJSONArray("rooms");
        for (int i = 0; i < rooms.length(); i++) {
            JSONObject r = rooms.optJSONObject(i);
            JSONArray mm = r.optJSONArray("members");
            if (!r.optBoolean("dm") || mm == null || mm.length() != 2 || r.optBoolean("deleted")) continue;
            int x = mm.optInt(0), y = mm.optInt(1);
            if (Math.min(x, y) == lo && Math.max(x, y) == hi) return r;
        }
        return null;
    }

    /** 아직 저장하지 않은 1:1 대화방 초안. 첫 메시지를 보낼 때 addRoom 으로 실제로 만든다(텔레그램처럼). */
    JSONObject dmDraft(int a, String phoneA, int b, String phoneB) {
        int lo = Math.min(a, b), hi = Math.max(a, b);
        try {
            int id = 1500000000 + (int) (((long) lo * 1000003L + hi) % 400000000L);
            if (byId("rooms", id) != null || idUsed(id)) id = nextId();
            JSONObject r = new JSONObject();
            r.put("id", id);
            r.put("created", now());
            r.put("name", "");
            r.put("dm", true);
            r.put("members", new JSONArray().put(lo).put(hi));
            r.put("mem", new JSONArray().put(a == lo ? phoneA : phoneB).put(a == lo ? phoneB : phoneA));
            return r;
        } catch (JSONException e) {
            return null;
        }
    }

    void addRoom(JSONObject r) {
        db.optJSONArray("rooms").put(r);
        save();
    }

    /** 초대한 사람들끼리만 보이는 그룹 대화방. mem(전화번호)에 든 사람에게만 서버가 보여 준다. */
    JSONObject groupRoom(String name, int by, List<Integer> ids, List<String> phones) {
        try {
            JSONObject r = new JSONObject();
            r.put("id", nextId());
            r.put("created", now());
            r.put("name", name);
            r.put("by", by);
            r.put("grp", true);
            r.put("members", new JSONArray(ids));
            r.put("mem", new JSONArray(phones));
            db.optJSONArray("rooms").put(r);
            save();
            return r;
        } catch (JSONException e) {
            return null;
        }
    }

    /** 그룹 대화방에 사람을 더 초대한다. (새로 들어온 사람은 들어온 뒤의 대화부터 보여요) */
    boolean invite(JSONObject r, int uid, String phone) {
        try {
            JSONArray mm = r.optJSONArray("members"), mem = r.optJSONArray("mem");
            if (mm == null || mem == null) return false;
            for (int i = 0; i < mm.length(); i++) if (mm.optInt(i) == uid) return false;
            mm.put(uid);
            mem.put(phone);
            save();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** 두 직원의 1:1 대화방을 찾고, 없으면 만든다. 참가자 전화번호(mem)가 들어 있어 서버가 둘에게만 보여 준다. */
    JSONObject dmRoom(int a, String phoneA, int b, String phoneB) {
        int lo = Math.min(a, b), hi = Math.max(a, b);
        JSONArray rooms = db.optJSONArray("rooms");
        for (int i = 0; i < rooms.length(); i++) {
            JSONObject r = rooms.optJSONObject(i);
            JSONArray mm = r.optJSONArray("members");
            if (!r.optBoolean("dm") || mm == null || mm.length() != 2) continue;
            int x = mm.optInt(0), y = mm.optInt(1);
            if (Math.min(x, y) == lo && Math.max(x, y) == hi) return r;
        }
        try {
            int id = 1500000000 + (int) (((long) lo * 1000003L + hi) % 400000000L); // 같은 둘이 동시에 걸어도 같은 방이 되게
            if (byId("rooms", id) != null || idUsed(id)) id = nextId();
            JSONObject r = new JSONObject();
            r.put("id", id);
            r.put("created", now());
            r.put("name", "");
            r.put("dm", true);
            r.put("members", new JSONArray().put(lo).put(hi));
            r.put("mem", new JSONArray().put(a == lo ? phoneA : phoneB).put(a == lo ? phoneB : phoneA));
            db.optJSONArray("rooms").put(r);
            save();
            return r;
        } catch (JSONException e) {
            return null;
        }
    }

    Store(Context c) {
        sp = c.getSharedPreferences("workapp", Context.MODE_PRIVATE);
        try {
            db = new JSONObject(sp.getString("db2", "{}"));
        } catch (JSONException e) {
            db = new JSONObject();
        }
        try {
            for (String k : COLLS) if (!db.has(k)) db.put(k, new JSONArray());
        } catch (JSONException ignored) {
        }
        for (String k : COLLS) {
            JSONArray a = db.optJSONArray(k);
            for (int i = 0; i < a.length(); i++) pushed.put(k + "/" + a.optJSONObject(i).optInt("id"), a.optJSONObject(i).toString());
        }
    }

    // ---------- 저장·동기화 ----------
    private final Runnable localTask = new Runnable() {
        @Override
        public void run() {
            saveLocal();
        }
    };

    /** 서버에는 바로 올리고, 폰 안 보관본은 1.5초 모아서 한 번만 쓴다(자료가 많아도 느려지지 않게). 오프라인이면 바로 쓴다. */
    void save() {
        if (online) {
            main.removeCallbacks(localTask);
            main.postDelayed(localTask, 1500);
        } else {
            saveLocal();
        }
        push();
    }

    /** 앱이 가려질 때 아직 안 쓴 보관본을 바로 쓴다. */
    void flush() {
        main.removeCallbacks(localTask);
        saveLocal();
    }

    private void saveLocal() {
        sp.edit().putString("db2", db.toString()).apply();
    }

    static String now() {
        return new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.KOREA).format(new Date());
    }

    int nextId() {
        for (int tries = 0; tries < 50; tries++) {
            int n = 1 + rnd.nextInt(2000000000);
            if (!idUsed(n)) return n;
        }
        return (int) (System.currentTimeMillis() % 2000000000L);
    }

    private boolean idUsed(int id) {
        for (String k : COLLS) {
            JSONArray a = db.optJSONArray(k);
            for (int i = 0; i < a.length(); i++) if (a.optJSONObject(i).optInt("id") == id) return true;
        }
        return false;
    }

    /** 로그인 후 호출: 이 사람의 번호표(uid)로 서버와 실시간 연결한다. */
    void attach(int uid, boolean canPerf, boolean canReport, final Runnable onChange) {
        detach();
        actor = uid;
        online = true;
        com.google.firebase.auth.FirebaseUser au0 = Cloud.auth().getCurrentUser();
        final String myPhone = au0 == null ? null : au0.getPhoneNumber();
        List<String> servers = new ArrayList<>(java.util.Arrays.asList(COLLS));
        if (myPhone != null) { // 1:1 비공개 대화: 내 번호가 참가자(mem)에 든 문서만 서버가 내려준다
            servers.add("prooms");
            servers.add("pmsgs");
        }
        for (final String srv : servers) {
            final boolean priv = "prooms".equals(srv) || "pmsgs".equals(srv);
            final String coll = "prooms".equals(srv) ? "rooms" : "pmsgs".equals(srv) ? "msgs" : srv;
            if ("costs".equals(coll) && !canPerf) continue; // 단가는 실적 권한자만
            Query q = Cloud.fs().collection(srv);
            if (priv) q = q.whereArrayContains("mem", myPhone);
            if ("contracts".equals(coll) && !canPerf) q = q.whereEqualTo("who", (long) uid);
            if ("reports".equals(coll) && !canReport) q = q.whereEqualTo("who", (long) uid);
            if ("msgs".equals(coll) && !priv) q = q.orderBy("u", Query.Direction.DESCENDING).limit(400);
            final boolean[] firstSnap = {true};
            regs.add(q.addSnapshotListener((snap, err) -> {
                if (snap == null) return;
                boolean changed = false;
                final List<JSONObject> fresh = new ArrayList<>();
                final List<JSONObject> shipped = new ArrayList<>();
                for (DocumentChange dc : snap.getDocumentChanges()) {
                    if (dc.getType() == DocumentChange.Type.REMOVED) continue;
                    String j = dc.getDocument().getString("j");
                    if (j == null) continue;
                    try {
                        JSONObject o = new JSONObject(j);
                        int id = o.optInt("id");
                        String key = coll + "/" + id;
                        if (j.equals(pushed.get(key))) continue;
                        pushed.put(key, j);
                        JSONObject old = byId(coll, id);
                        if (!firstSnap[0] && old == null) fresh.add(o);
                        if (!firstSnap[0] && old != null && "tasks".equals(coll) && o.optJSONObject("preq") != null && old.optJSONObject("preq") != null
                                && "발송함".equals(o.optJSONObject("preq").optString("stage")) && !"발송함".equals(old.optJSONObject("preq").optString("stage")))
                            shipped.add(o); // 물품요청이 발송됨 → 요청한 사람에게 알림
                        replace(db.optJSONArray(coll), o);
                        if ("users".equals(coll)) pushedPhone.put(key, phoneSig(o));
                        changed = true;
                    } catch (JSONException ignored) {
                    }
                }
                firstSnap[0] = false;
                if (changed) {
                    saveLocal();
                    if (onChange != null) main.post(onChange);
                    final java.util.function.BiConsumer<String, JSONObject> nf = notifier;
                    if (nf != null) for (final JSONObject o : fresh) main.post(() -> nf.accept(coll, o));
                    if (nf != null) for (final JSONObject o : shipped) main.post(() -> nf.accept("preqShip", o));
                }
            }));
        }
        push();
    }

    /** 로그아웃·다른 사람 로그인 때 폰에 남은 보관본을 비운다(서버 자료는 그대로). */
    void clear() {
        detach();
        pushed.clear();
        pushedPhone.clear();
        db = new JSONObject();
        try {
            for (String k : COLLS) db.put(k, new JSONArray());
        } catch (JSONException ignored) {
        }
        sp.edit().remove("db2").remove("session").remove("perf").remove("report").apply();
    }

    void detach() {
        for (com.google.firebase.firestore.ListenerRegistration r : regs) r.remove();
        regs.clear();
        online = false;
    }

    private void replace(JSONArray a, JSONObject o) throws JSONException {
        int id = o.optInt("id");
        for (int i = 0; i < a.length(); i++) {
            if (a.optJSONObject(i).optInt("id") == id) {
                a.put(i, o);
                return;
            }
        }
        a.put(o);
    }

    private static String phoneSig(JSONObject u) {
        return u.optString("phone") + "|" + has(u, Perm.STAFF_MANAGE) + "|" + has(u, Perm.PERF_VIEW) + "|" + has(u, Perm.REPORT_VIEW) + "|"
                + u.optBoolean("active", true) + "|" + u.optString("name") + "|" + u.optInt("id");
    }

    private void push() {
        if (!online) return;
        for (String coll : COLLS) {
            JSONArray a = db.optJSONArray(coll);
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.optJSONObject(i);
                int id = o.optInt("id");
                String key = coll + "/" + id;
                String s = o.toString();
                if (!s.equals(pushed.get(key))) {
                    Map<String, Object> m = new HashMap<>();
                    m.put("j", s);
                    m.put("u", System.currentTimeMillis());
                    String target = coll;
                    boolean priv = false;
                    if ("rooms".equals(coll) || "msgs".equals(coll)) { // 1:1 비공개: 참가자(mem)가 있으면 따로 보관
                        JSONArray mem = o.optJSONArray("mem");
                        if (mem != null && mem.length() > 0) {
                            List<String> ml = new ArrayList<>();
                            for (int k = 0; k < mem.length(); k++) ml.add(mem.optString(k));
                            m.put("mem", ml);
                            target = "rooms".equals(coll) ? "prooms" : "pmsgs";
                            priv = true;
                        }
                    }
                    if ("contracts".equals(coll) || "reports".equals(coll)) {
                        m.put("who", (long) o.optInt("who"));
                        m.put("date", o.optString("date"));
                    }
                    if ("profiles".equals(coll)) m.put("who", (long) id); // 본인 문서만 고칠 수 있게 하는 표식
                    Cloud.fs().collection(target).document(String.valueOf(id)).set(m);
                    if (priv || "msgs".equals(coll) || "profiles".equals(coll)) { // 기록(audit)을 남기지 않는 컬렉션
                        pushed.put(key, s);
                        continue;
                    }
                    Map<String, Object> au = new HashMap<>();
                    au.put("c", coll);
                    au.put("id", (long) id);
                    au.put("by", (long) actor);
                    au.put("u", System.currentTimeMillis());
                    au.put("j", s);
                    Cloud.fs().collection("audit").add(au);
                    pushed.put(key, s);
                }
                if ("users".equals(coll) && !o.optString("phone").isEmpty()) {
                    String sig = phoneSig(o);
                    if (!sig.equals(pushedPhone.get(key))) {
                        Map<String, Object> p = new HashMap<>();
                        p.put("uid", (long) id);
                        p.put("admin", has(o, Perm.STAFF_MANAGE));
                        p.put("perf", has(o, Perm.PERF_VIEW));
                        p.put("report", has(o, Perm.REPORT_VIEW));
                        p.put("active", o.optBoolean("active", true));
                        p.put("name", o.optString("name"));
                        Cloud.fs().collection("phones").document(o.optString("phone")).set(p);
                        pushedPhone.put(key, sig);
                    }
                }
            }
        }
    }

    // ---------- 로그인 유지 ----------
    void setSession(int id) {
        sp.edit().putInt("session", id).apply();
    }

    int sessionId() {
        return sp.getInt("session", 0);
    }

    JSONObject sessionUser() {
        int id = sessionId();
        JSONObject u = id == 0 ? null : user(id);
        return u != null && u.optBoolean("active", true) ? u : null;
    }

    void setCaps(boolean perf) {
        sp.edit().putBoolean("perf", perf).apply();
    }

    void setReportCap(boolean report) {
        sp.edit().putBoolean("report", report).apply();
    }

    boolean cachedReport() {
        return sp.getBoolean("report", false);
    }

    boolean cachedPerf() {
        return sp.getBoolean("perf", false);
    }

    /** 서버에 처음 로그인한 관리자의 직원 정보가 아직 없으면 만든다. */
    void ensureUser(int uid, String name, String phone, boolean admin, boolean perf) {
        if (user(uid) != null) return;
        try {
            JSONObject u = new JSONObject();
            u.put("id", uid);
            u.put("name", name);
            u.put("phone", phone);
            u.put("active", true);
            List<String> perms = new ArrayList<>();
            if (admin) perms.addAll(java.util.Arrays.asList(Perm.KEYS));
            else if (perf) perms.add(Perm.PERF_VIEW);
            u.put("perms", new JSONArray(perms));
            users().put(u);
            pushedPhone.put("users/" + uid, phoneSig(u));
            save();
        } catch (JSONException ignored) {
        }
    }

    // ---------- 직원 ----------
    boolean hasUsers() {
        return users().length() > 0;
    }

    JSONArray users() {
        return db.optJSONArray("users");
    }

    JSONObject user(int id) {
        JSONArray a = users();
        for (int i = 0; i < a.length(); i++) if (a.optJSONObject(i).optInt("id") == id) return a.optJSONObject(i);
        return null;
    }

    String userName(int id) {
        JSONObject u = user(id);
        return u == null ? "(알 수 없음)" : u.optString("name");
    }

    boolean nameExists(String name) {
        JSONArray a = users();
        for (int i = 0; i < a.length(); i++) if (a.optJSONObject(i).optString("name").equals(name)) return true;
        return false;
    }

    boolean phoneExists(String e164) {
        JSONArray a = users();
        for (int i = 0; i < a.length(); i++) if (a.optJSONObject(i).optString("phone").equals(e164)) return true;
        return false;
    }

    JSONObject addUser(String name, String phone, List<String> perms) {
        try {
            JSONObject u = new JSONObject();
            u.put("id", nextId());
            u.put("name", name);
            u.put("phone", phone);
            u.put("active", true);
            u.put("perms", new JSONArray(perms));
            users().put(u);
            save();
            return u;
        } catch (JSONException e) {
            return null;
        }
    }

    static boolean has(JSONObject user, String perm) {
        JSONArray p = user.optJSONArray("perms");
        if (p == null) return false;
        for (int i = 0; i < p.length(); i++) if (perm.equals(p.optString(i))) return true;
        return false;
    }

    int adminCount() {
        int n = 0;
        JSONArray a = users();
        for (int i = 0; i < a.length(); i++) {
            JSONObject u = a.optJSONObject(i);
            if (u.optBoolean("active", true) && has(u, Perm.STAFF_MANAGE)) n++;
        }
        return n;
    }

    // ---------- 업무 ----------
    JSONArray tasks() {
        return db.optJSONArray("tasks");
    }

    JSONObject task(int id) {
        JSONArray a = tasks();
        for (int i = 0; i < a.length(); i++) if (a.optJSONObject(i).optInt("id") == id) return a.optJSONObject(i);
        return null;
    }

    JSONObject addTask(String title, String type, String client, String phone, String addr, String due,
                       String memo, int assignee, int creator) {
        try {
            JSONObject t = new JSONObject();
            t.put("id", nextId());
            t.put("title", title);
            t.put("type", type);
            t.put("client", client);
            t.put("phone", phone);
            t.put("addr", addr);
            t.put("due", due);
            t.put("memo", memo);
            t.put("assignee", assignee);
            t.put("creator", creator);
            t.put("status", "지시됨");
            t.put("created", now());
            t.put("history", new JSONArray());
            log(t, creator, "업무 지시 → " + userName(assignee));
            tasks().put(t);
            save();
            return t;
        } catch (JSONException e) {
            return null;
        }
    }

    void log(JSONObject t, int who, String text) {
        try {
            JSONObject h = new JSONObject();
            h.put("t", now());
            h.put("who", who);
            h.put("text", text);
            t.getJSONArray("history").put(h);
        } catch (JSONException ignored) {
        }
    }

    /** 업무 일정(기한)을 다시 잡는다. 일정 달력은 기한을 그대로 읽어서 같이 바뀐다. */
    void reschedule(JSONObject t, int who, String due) {
        try {
            String old = t.optString("due");
            t.put("due", due);
            log(t, who, "일정 변경 " + (old.isEmpty() ? "(없음)" : old) + " → " + (due.isEmpty() ? "(없음)" : due));
            save();
        } catch (JSONException ignored) {
        }
    }

    void setStatus(JSONObject t, int who, String status, String msg) {
        try {
            if (status.equals(t.optString("status")) && !"완료".equals(status)) return; // 같은 상태를 또 눌러도 이력이 쌓이지 않게
            t.put("status", status);
            if ("완료".equals(status)) {
                t.put("doneMsg", msg);
                t.put("doneAt", now());
            }
            log(t, who, "상태 → " + status + (msg == null || msg.isEmpty() ? "" : " : " + msg));
            save();
        } catch (JSONException ignored) {
        }
    }

    // ---------- 공지 ----------
    JSONArray notices() {
        return db.optJSONArray("notices");
    }

    void addNotice(String title, String body, boolean pinned, int author) {
        try {
            JSONObject n = new JSONObject();
            n.put("id", nextId());
            n.put("title", title);
            n.put("body", body);
            n.put("pinned", pinned);
            n.put("author", author);
            n.put("t", now());
            n.put("readBy", new JSONArray());
            notices().put(n);
            save();
        } catch (JSONException ignored) {
        }
    }

    boolean isRead(JSONObject n, int uid) {
        JSONArray r = n.optJSONArray("readBy");
        for (int i = 0; r != null && i < r.length(); i++) if (r.optInt(i) == uid) return true;
        return false;
    }

    void markRead(JSONObject n, int uid) {
        if (isRead(n, uid)) return;
        n.optJSONArray("readBy").put(uid);
        save();
    }

    // ---------- 프로젝트 ----------
    JSONArray projects() {
        return db.optJSONArray("projects");
    }

    void addProject(String title, String due, String memo, int owner, int creator) {
        addProject(title, due, memo, owner, creator, null);
    }

    void addProject(String title, String due, String memo, int owner, int creator, List<String> items) {
        try {
            JSONObject p = new JSONObject();
            p.put("id", nextId());
            p.put("title", title);
            p.put("due", due);
            p.put("memo", memo);
            p.put("owner", owner);
            p.put("pct", 0);
            p.put("check", false);
            p.put("created", now());
            p.put("notes", new JSONArray());
            if (items != null && !items.isEmpty()) {
                JSONArray ia = new JSONArray();
                for (String t : items) ia.put(new JSONObject().put("t", t).put("done", false));
                p.put("items", ia);
            }
            projects().put(p);
            save();
        } catch (JSONException ignored) {
        }
    }

    void updateProject(JSONObject p, int who, int pct, boolean check, String memo) {
        try {
            p.put("pct", pct);
            p.put("check", check);
            p.put("memo", memo);
            JSONObject h = new JSONObject();
            h.put("t", now());
            h.put("who", who);
            h.put("text", pct + "% · " + (check ? "점검 필요 · " : "") + memo);
            p.getJSONArray("notes").put(h);
            save();
        } catch (JSONException ignored) {
        }
    }

    // ---------- 신규 계약 ----------
    JSONArray contracts() {
        return db.optJSONArray("contracts");
    }

    void addContract(String date, String client, String product, String linkType, String company,
                     String kind, int qty, int who) {
        try {
            JSONObject c = new JSONObject();
            c.put("id", nextId());
            c.put("date", date);
            c.put("client", client);
            c.put("product", product);
            c.put("linkType", linkType);
            c.put("company", company);
            c.put("kind", kind);
            c.put("qty", qty);
            c.put("who", who);
            c.put("created", now());
            contracts().put(c);
            save();
        } catch (JSONException ignored) {
        }
    }

    // ---------- 일정 ----------
    JSONArray events() {
        return db.optJSONArray("events");
    }

    void addEvent(String date, String title, int who) {
        try {
            JSONObject e = new JSONObject();
            e.put("id", nextId());
            e.put("date", date);
            e.put("title", title);
            e.put("who", who);
            events().put(e);
            save();
        } catch (JSONException ignored) {
        }
    }

    List<JSONObject> list(JSONArray a) {
        List<JSONObject> out = new ArrayList<>();
        for (int i = 0; i < a.length(); i++) if (!a.optJSONObject(i).optBoolean("deleted")) out.add(a.optJSONObject(i));
        return out;
    }

    // ---------- 가맹점·재고·채팅·계약 공통 ----------
    JSONArray arr(String coll) {
        return db.optJSONArray(coll);
    }

    JSONObject byId(String coll, int id) {
        JSONArray a = arr(coll);
        for (int i = 0; i < a.length(); i++) if (a.optJSONObject(i).optInt("id") == id) return a.optJSONObject(i);
        return null;
    }

    /** 새 문서를 만들어 목록에 넣고 돌려준다. 값을 채운 뒤 save()를 부르면 서버에 올라간다. */
    JSONObject create(String coll) {
        try {
            JSONObject o = new JSONObject();
            o.put("id", nextId());
            o.put("created", now());
            arr(coll).put(o);
            return o;
        } catch (JSONException e) {
            return null;
        }
    }

    /** 재고 이력 한 줄(입고·출고·계약 출고·정정)을 그 재고 문서의 log 에 남긴다 — 웹과 같은 형식 {d, by, k, q, m}.
     *  수량을 바꾸기 '전에' 부른다. 이력 기능 전에 등록된 재고는 그때 수량을 첫 입고로 먼저 남긴다. */
    void slog(JSONObject r, String k, int q, String m) {
        try {
            if (!r.has("log")) {
                JSONArray l0 = new JSONArray();
                JSONObject first = new JSONObject();
                first.put("d", r.optString("created"));
                first.put("by", 0);
                first.put("k", "입고");
                first.put("q", r.optInt("qty", 1));
                first.put("m", "이력 기능 전 등록");
                l0.put(first);
                r.put("log", l0);
            }
            JSONArray l = r.getJSONArray("log");
            JSONObject e = new JSONObject();
            e.put("d", now());
            e.put("by", actor);
            e.put("k", k);
            e.put("q", q);
            e.put("m", m == null ? "" : m);
            l.put(e);
            while (l.length() > 60) l.remove(0);
        } catch (JSONException ignored) {
        }
    }

    /** 재고 한 줄을 출고 처리(수량 여러 개짜리는 1개만 떼어 낸다). 쓰인 줄을 돌려준다. */
    JSONObject takeStock(JSONObject row, int merchant, int contract) {
        try {
            JSONObject use = row;
            JSONObject mer = byId("merchants", merchant);
            String mn = mer == null ? "" : mer.optString("name");
            if (row.optString("serial").isEmpty() && row.optInt("qty", 1) > 1) {
                slog(row, "계약 출고", -1, mn + " (1개 떼어 냄)");
                row.put("qty", row.optInt("qty", 1) - 1);
                use = create("stock");
                use.put("log", new JSONArray());
                use.put("model", row.optString("model"));
                use.put("serial", "");
                use.put("safe", row.optInt("safe"));
                use.put("deleted", false);
            }
            if (use != row) {
                JSONObject rc = costDoc(row.optInt("id"), false);
                if (rc != null) {
                    JSONObject nc = create("costs");
                    nc.put("stock", use.optInt("id"));
                    nc.put("buy", rc.optLong("buy"));
                    nc.put("sell", rc.optLong("sell"));
                }
            }
            if (use == row) slog(use, "계약 출고", -1, mn);
            use.put("qty", 1);
            use.put("status", "출고중");
            use.put("merchant", merchant);
            use.put("contract", contract);
            return use;
        } catch (JSONException e) {
            return row;
        }
    }

    // ---------- 프로필(사진·상태메시지), 재고 단가 ----------
    /** 직원 한 명의 프로필 문서(없으면 null). 문서 번호는 직원 번호와 같다. */
    JSONObject profile(int uid) {
        return byId("profiles", uid);
    }

    /** 내 프로필 문서를 돌려준다(없으면 만든다). */
    JSONObject myProfile(int uid) {
        JSONObject p = profile(uid);
        if (p != null) return p;
        try {
            p = new JSONObject();
            p.put("id", uid);
            arr("profiles").put(p);
        } catch (JSONException ignored) {
        }
        return p;
    }

    /** 재고 한 줄의 단가 문서: {stock, buy(입고), sell(출고)}. */
    JSONObject costDoc(int stockId, boolean create) {
        JSONArray a = arr("costs");
        for (int i = 0; i < a.length(); i++) if (a.optJSONObject(i).optInt("stock") == stockId) return a.optJSONObject(i);
        if (!create) return null;
        JSONObject c = create("costs");
        try {
            c.put("stock", stockId);
            c.put("buy", 0L);
            c.put("sell", 0L);
        } catch (JSONException ignored) {
        }
        return c;
    }
}
