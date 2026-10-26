package kr.todanjeon.workapp;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

final class Ui {
    static final int NAVY = Color.rgb(20, 22, 26);
    static final int GOLD = Color.rgb(205, 170, 82);
    static final int DEEP = Color.rgb(143, 107, 20);
    static final int DARK = Color.rgb(31, 27, 18);
    static final int TINT = Color.rgb(247, 239, 217);
    static final int CARD = Color.rgb(247, 248, 250);
    static final int FIELD = Color.rgb(242, 244, 246);
    static final int GREEN = Color.rgb(11, 122, 85);
    static final int RED = Color.rgb(179, 38, 30);
    static final int AMBER = Color.rgb(138, 82, 0);
    static final int GRAY = Color.rgb(107, 112, 128);
    static final int BG = Color.WHITE;
    static final int INK = Color.rgb(20, 22, 26);

    static int dp(Context c, int v) {
        return Math.round(v * c.getResources().getDisplayMetrics().density);
    }

    static GradientDrawable round(int color, int radiusDp, Context c) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(c, radiusDp));
        return g;
    }

    static TextView text(Context c, String s, int sp, int color, boolean bold) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    static Button button(Context c, String s, int bg, int fg) {
        Button b = new Button(c);
        b.setText(s);
        b.setTextColor(fg);
        b.setAllCaps(false);
        b.setTextSize(15);
        b.setBackground(round(bg, 16, c));
        b.setStateListAnimator(null);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setPadding(dp(c, 12), dp(c, 8), dp(c, 12), dp(c, 8));
        return b;
    }

    static EditText field(Context c, String hint, boolean pin) {
        EditText e = new EditText(c);
        e.setHint(hint);
        e.setSingleLine(true);
        e.setTextSize(16);
        e.setTextColor(INK);
        e.setHintTextColor(GRAY);
        e.setBackground(round(FIELD, 14, c));
        e.setPadding(dp(c, 16), dp(c, 14), dp(c, 16), dp(c, 14));
        LinearLayout.LayoutParams ep = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ep.topMargin = dp(c, 8);
        e.setLayoutParams(ep);
        if (pin) e.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        return e;
    }

    static LinearLayout.LayoutParams lp(Context c, int topDp) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.topMargin = dp(c, topDp);
        return p;
    }

    static LinearLayout card(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setBackground(round(CARD, 20, c));
        l.setPadding(dp(c, 16), dp(c, 16), dp(c, 16), dp(c, 16));
        return l;
    }

    static LinearLayout cardH(Context c) {
        LinearLayout l = card(c);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(Gravity.CENTER_VERTICAL);
        return l;
    }

    static TextView chip(Context c, String s, int bg, int fg) {
        TextView t = text(c, s, 12, fg, true);
        t.setBackground(round(bg, 10, c));
        t.setPadding(dp(c, 10), dp(c, 5), dp(c, 10), dp(c, 5));
        return t;
    }

    /** 안 본 개수: 빨간 동그라미 안 숫자 (앱 전체에서 같은 모양) */
    static TextView dot(Context c, int n, int bg) {
        TextView t = text(c, n > 99 ? "99+" : String.valueOf(n), 11, android.graphics.Color.WHITE, true);
        t.setGravity(Gravity.CENTER);
        t.setIncludeFontPadding(false);
        t.setMinWidth(dp(c, 20));
        t.setMinHeight(dp(c, 20));
        t.setPadding(dp(c, 5), 0, dp(c, 5), 0);
        t.setBackground(round(bg, 10, c));
        return t;
    }

    static TextView tile(Context c, String s, int bg, int fg) {
        TextView t = text(c, s, 13, fg, true);
        t.setGravity(Gravity.CENTER);
        t.setBackground(round(bg, 14, c));
        t.setLayoutParams(new LinearLayout.LayoutParams(dp(c, 44), dp(c, 44)));
        return t;
    }

    static TextView typeTile(Context c, String type) {
        switch (type) {
            case "신규 설치":
                return tile(c, "설치", TINT, DEEP);
            case "AS":
                return tile(c, "AS", Color.rgb(227, 246, 238), GREEN);
            case "방문AS":
                return tile(c, "방문", Color.rgb(227, 246, 238), GREEN);
            case "원격AS":
                return tile(c, "원격", Color.rgb(227, 240, 252), Color.rgb(30, 100, 180));
            case "영업 방문":
                return tile(c, "영업", Color.rgb(241, 236, 251), Color.rgb(106, 63, 196));
            case "서류 접수":
                return tile(c, "서류", Color.rgb(255, 241, 219), AMBER);
            case "카드사 서류":
                return tile(c, "카드", Color.rgb(255, 241, 219), AMBER);
            default:
                return tile(c, "기타", Color.rgb(238, 240, 244), Color.rgb(74, 79, 94));
        }
    }

    static TextView circle(Context c, String name, int sizeDp, int bg, int fg) {
        TextView t = text(c, name.isEmpty() ? "?" : name.substring(0, 1), sizeDp > 44 ? 20 : 16, fg, true);
        t.setGravity(Gravity.CENTER);
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL);
        g.setColor(bg);
        t.setBackground(g);
        t.setLayoutParams(new LinearLayout.LayoutParams(dp(c, sizeDp), dp(c, sizeDp)));
        return t;
    }

    static void toast(Context c, String s) {
        Toast.makeText(c, s, Toast.LENGTH_SHORT).show();
    }

    /** true 면 방금 확인 버튼의 검사에서 막힌 것 — 팝업을 닫지 않는다(Dlg). */
    static boolean rejected = false;

    /** 입력이 빠졌을 때 알림. 팝업은 그대로 열어 둔다. */
    static void warn(Context c, String s) {
        rejected = true;
        toast(c, s);
    }

    static void center(View v) {
        if (v instanceof TextView) ((TextView) v).setGravity(Gravity.CENTER);
    }

    private Ui() {
    }
}
